import { Injectable, Logger } from '@nestjs/common';

import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { hasValidDocumentLength, onlyDigits } from '../../common/utils/document.util';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { ParsedInvoice } from './nfe-parser';

/// Resolve o emitente da NF-e contra o cadastro de fornecedores: acha o que já
/// existe, cria o que não existe, e devolve o id para a nota apontar.
///
/// O CNPJ é a identidade, e o escopo é a EMPRESA — a unique do banco é
/// `(companyId, document)`, não `document`. Duas construtoras que compram do
/// mesmo fornecedor têm dois cadastros, cada uma com o seu, e nenhuma enxerga
/// o da outra. Toda consulta aqui carrega o `companyId`; nenhuma é global.
///
/// NUNCA ALTERA fornecedor que já existe. Quem já está no cadastro foi
/// conferido por alguém (ou por uma nota anterior), e uma nota nova não tem
/// autoridade para reescrever endereço ou telefone por cima. O efeito
/// combinado com a chegada em duas partes está documentado em `resolve`.
@Injectable()
export class SupplierResolverService {
  private readonly logger = new Logger(SupplierResolverService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /// Devolve o id do fornecedor, ou `null` quando não dá para resolver.
  ///
  /// NUNCA LANÇA. Guardar a nota não pode depender de entender o emitente:
  /// antes desta mudança a busca do fornecedor era só uma leitura, e agora é
  /// uma escrita que pode falhar. Se ela derrubasse a importação, o documento
  /// iria para `ERROR` — e `processPending` só varre `FORWARDED`, ou seja, a
  /// nota sairia da fila e ninguém a veria. Falhando para `null`, a nota entra
  /// exatamente como entrava antes (sem vínculo) e a conciliação ainda a
  /// resolve por CNPJ na hora de conciliar.
  ///
  /// SOBRE O CADASTRO INCOMPLETO: a nota chega em duas partes. O resumo vem
  /// primeiro e só tem razão social e IE; o documento completo, horas depois,
  /// traz endereço, telefone e e-mail. Como o fornecedor é criado na primeira
  /// vez que o emitente aparece, e como fornecedor existente nunca é alterado,
  /// o cadastro nascido de um resumo PERMANECE com razão social, CNPJ e IE
  /// apenas — o endereço que chegou depois fica na nota (`InboundInvoice`),
  /// não no cadastro. É a regra pedida, e o preço dela: quem quiser o cadastro
  /// completo completa à mão, na tela de Fornecedores.
  async resolve(companyId: string, nota: ParsedInvoice): Promise<string | null> {
    const document = onlyDigits(nota.supplierDocument ?? '');

    if (!hasValidDocumentLength(document)) {
      this.logger.warn(
        `Nota ${nota.accessKey}: emitente com documento inválido ` +
          `("${nota.supplierDocument}") — nota importada sem vínculo de fornecedor.`,
      );
      return null;
    }

    try {
      const existente = await this.findByDocument(companyId, document);
      if (existente) return existente;

      return await this.create(companyId, document, nota);
    } catch (error) {
      // Rede de segurança final: qualquer coisa não prevista vira nota sem
      // vínculo, nunca nota perdida.
      this.logger.error(
        `Nota ${nota.accessKey}: falha ao resolver o fornecedor ${document} — ` +
          `${error instanceof Error ? error.message : String(error)}. ` +
          `Nota importada sem vínculo.`,
      );
      return null;
    }
  }

  /// Só fornecedor ATIVO conta. O soft delete manga o documento
  /// ("<doc>__deleted__<uuid>"), então um fornecedor excluído nem apareceria
  /// nesta busca nem ocuparia o CNPJ na unique — uma nota nova do mesmo
  /// emitente cria um cadastro novo, que é o comportamento correto: para o
  /// usuário, aquele fornecedor não está mais no cadastro.
  private async findByDocument(companyId: string, document: string): Promise<string | null> {
    const supplier = await this.prisma.supplier.findFirst({
      where: { companyId, document, deletedAt: null },
      select: { id: true },
    });
    return supplier?.id ?? null;
  }

  private async create(
    companyId: string,
    document: string,
    nota: ParsedInvoice,
  ): Promise<string | null> {
    try {
      const criado = await this.prisma.supplier.create({
        // Só o que veio no XML. Campo ausente fica nulo — inventar "Não
        // informado" transformaria a falta de dado em dado.
        data: {
          companyId,
          document,
          legalName: nota.supplierName,
          tradeName: nota.supplierTradeName,
          stateRegistration: nota.supplierIe,
          address: nota.supplierStreet,
          addressNumber: nota.supplierNumber,
          addressComplement: nota.supplierComplement,
          neighborhood: nota.supplierNeighborhood,
          city: nota.supplierCity,
          state: nota.supplierState,
          zipCode: nota.supplierZipCode,
          phone: nota.supplierPhone,
          email: nota.supplierEmail,
          origin: 'NFE',
          originAccessKey: nota.accessKey,
        },
        select: { id: true },
      });

      await this.registrarAuditoria(companyId, criado.id, document, nota);

      this.logger.log(
        `Fornecedor ${nota.supplierName} (${document}) cadastrado automaticamente ` +
          `a partir da nota ${nota.accessKey}.`,
      );
      return criado.id;
    } catch (error) {
      // Duas importações simultâneas do mesmo emitente (o job e o botão
      // "Importar agora", ou duas instâncias da API): as duas passam pela
      // busca sem achar nada e as duas tentam criar. A unique do banco decide
      // quem cria; a perdedora encontra o vencedor e usa. É isto que mantém a
      // idempotência real — não a checagem anterior, que é só o caminho feliz.
      if (isUniqueConstraintError(error)) {
        return this.findByDocument(companyId, document);
      }
      throw error;
    }
  }

  /// A trilha auditável do cadastro automático.
  ///
  /// `userId` fica nulo porque não houve usuário: quem criou foi o importador,
  /// rodando em job. A extensão de auditoria genérica
  /// (`common/prisma/audit-extension.ts`) não cobre este caso — ela depende do
  /// contexto da requisição HTTP, que não existe aqui — então o registro é
  /// explícito, no mesmo padrão que a conciliação já usa.
  ///
  /// Falha de auditoria não desfaz o cadastro: o fornecedor existe, a nota
  /// precisa dele, e perder a linha de log é menos grave que perder o vínculo.
  private async registrarAuditoria(
    companyId: string,
    supplierId: string,
    document: string,
    nota: ParsedInvoice,
  ): Promise<void> {
    try {
      await this.auditLogger.log({
        companyId,
        userId: null,
        action: 'CREATE',
        entityType: 'Supplier',
        entityId: supplierId,
        changes: {
          origin: 'NFE',
          document,
          legalName: nota.supplierName,
          accessKey: nota.accessKey,
          invoiceNumber: nota.number,
          source: 'fiscal-import',
        },
      });
    } catch (error) {
      this.logger.error(
        `Fornecedor ${supplierId} criado, mas a auditoria falhou: ` +
          `${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }
}
