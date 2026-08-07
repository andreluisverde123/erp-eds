import { Injectable, Logger } from '@nestjs/common';

import type { FiscalImportResult, Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  NfeParseError,
  parseFiscalDocument,
  type ParsedEvent,
  type ParsedInvoice,
} from './nfe-parser';

/// Quantos documentos processar por rodada. A carga inicial tem milhares;
/// fatiar mantém a transação curta e deixa a API responsiva enquanto isso.
const BATCH_SIZE = 200;

export interface ImportOutcome {
  processed: number;
  imported: number;
  cancelled: number;
  skipped: number;
  failed: number;
  durationMs: number;
}

/// Transforma os XMLs baixados em notas prontas para conciliação.
///
/// Roda SEPARADO do download de propósito: um XML com estrutura inesperada não
/// pode impedir que os outros documentos continuem chegando e sendo guardados.
/// O download garante a posse do documento legal; a importação interpreta.
@Injectable()
export class FiscalImportService {
  private readonly logger = new Logger(FiscalImportService.name);
  private readonly emAndamento = new Set<string>();

  constructor(private readonly prisma: PrismaService) {}

  async processPending(companyId: string): Promise<ImportOutcome> {
    const inicio = Date.now();
    const vazio: ImportOutcome = {
      processed: 0,
      imported: 0,
      cancelled: 0,
      skipped: 0,
      failed: 0,
      durationMs: 0,
    };

    if (this.emAndamento.has(companyId)) {
      return { ...vazio, durationMs: Date.now() - inicio };
    }
    this.emAndamento.add(companyId);

    try {
      const documentos = await this.prisma.fiscalDocument.findMany({
        where: { companyId, status: 'FORWARDED' },
        // Ordem de NSU é a ordem de chegada — e importa: o resumo tem NSU
        // menor que o documento completo da MESMA nota. Processar fora de
        // ordem faria o resumo chegar por último e tentar rebaixar a nota.
        orderBy: { nsu: 'asc' },
        take: BATCH_SIZE,
      });

      const resultado = { ...vazio };
      for (const documento of documentos) {
        const parcial = await this.processarUm(companyId, documento);
        resultado.processed += 1;
        resultado[parcial] += 1;
      }
      resultado.durationMs = Date.now() - inicio;

      if (resultado.processed > 0) {
        this.logger.log(
          `Importação: ${resultado.processed} documento(s) — ${resultado.imported} nota(s), ` +
            `${resultado.cancelled} cancelamento(s), ${resultado.skipped} sem efeito, ` +
            `${resultado.failed} com erro (${resultado.durationMs}ms).`,
        );
      }
      return resultado;
    } finally {
      this.emAndamento.delete(companyId);
    }
  }

  private async processarUm(
    companyId: string,
    documento: { id: string; nsu: string; schema: string; xml: Uint8Array },
  ): Promise<'imported' | 'cancelled' | 'skipped' | 'failed'> {
    const inicio = Date.now();
    let inboundInvoiceId: string | null = null;
    let itemsCount = 0;
    let result: FiscalImportResult;
    let errorMessage: string | null = null;

    try {
      const parsed = parseFiscalDocument(Buffer.from(documento.xml).toString('utf8'), documento.schema);

      if (parsed.kind === 'event') {
        result = await this.aplicarEvento(companyId, parsed.data);
        if (result === 'CANCELLED') {
          inboundInvoiceId = await this.idPorChave(companyId, parsed.data.accessKey);
        }
      } else {
        const aplicado = await this.aplicarNota(companyId, documento.id, parsed.data);
        result = aplicado.result;
        inboundInvoiceId = aplicado.id;
        itemsCount = aplicado.itemsCount;
      }
    } catch (error) {
      result = 'FAILED';
      // Mensagem própria para erro de parsing (que diz o que está errado no
      // documento) e genérica para o resto — nunca o XML, nunca o stack.
      errorMessage =
        error instanceof NfeParseError
          ? error.message
          : `Falha ao importar: ${error instanceof Error ? error.message : String(error)}`.slice(
              0,
              500,
            );
      this.logger.error(`NSU ${documento.nsu} (${documento.schema}): ${errorMessage}`);
    }

    const status = result === 'FAILED' ? 'ERROR' : 'PROCESSED';
    await this.prisma.$transaction([
      this.prisma.fiscalDocument.update({
        where: { id: documento.id },
        data: { status, processedAt: new Date(), errorMessage },
      }),
      this.prisma.fiscalImportLog.create({
        data: {
          companyId,
          fiscalDocumentId: documento.id,
          sourceSchema: documento.schema,
          sourceNsu: documento.nsu,
          result,
          itemsCount,
          durationMs: Date.now() - inicio,
          errorMessage,
          inboundInvoiceId,
        },
      }),
    ]);

    if (result === 'IMPORTED') return 'imported';
    if (result === 'CANCELLED') return 'cancelled';
    if (result === 'FAILED') return 'failed';
    return 'skipped';
  }

  /// Cria ou ATUALIZA a nota, com a regra que decide todo o comportamento:
  ///
  /// a mesma chave de acesso nunca é rejeitada como duplicata — ela é o
  /// identificador da nota, e a nota chega em DUAS partes. O resumo cria o
  /// registro com o cabeçalho; o documento completo, que vem depois, preenche
  /// itens e impostos. Um resumo que chegue DEPOIS da completa (reprocessamento,
  /// ordem invertida) não rebaixa o que já está lá.
  private async aplicarNota(
    companyId: string,
    fiscalDocumentId: string,
    nota: ParsedInvoice,
  ): Promise<{ result: FiscalImportResult; id: string | null; itemsCount: number }> {
    const existente = await this.prisma.inboundInvoice.findFirst({
      where: { companyId, accessKey: nota.accessKey },
      select: { id: true, hasFullDocument: true, status: true, totalAmount: true },
    });

    // Nota já completa recebendo um resumo: nada a fazer. Sobrescrever
    // apagaria os itens que o documento completo trouxe.
    if (existente?.hasFullDocument && !nota.isComplete) {
      return { result: 'SKIPPED', id: existente.id, itemsCount: 0 };
    }

    // Conciliada é terminal para o que virou dinheiro: o financeiro já casou
    // esta nota com uma ordem de compra e gerou conta a pagar.
    //
    // Mas o documento completo chega HORAS depois do resumo, e quem conciliava
    // dentro dessa janela ficava com uma nota SEM itens para sempre — o NSU não
    // volta e a SEFAZ não reenvia. Por isso o completo ainda ENRIQUECE a nota
    // conciliada (itens, impostos, endereço do emitente), que é informação que
    // o resumo não tinha como dar e que não altera valor nenhum.
    //
    // Duas condições, as duas necessárias: só o documento completo entra por
    // aqui — resumo nunca toca nota conciliada — e o total precisa bater. Se
    // divergir, não é atraso de entrega: é nota diferente da que virou dívida,
    // e reconciliar isso é decisão do financeiro, não do importador.
    const conciliada =
      existente && existente.status !== 'PENDING' && existente.status !== 'CANCELLED'
        ? existente
        : null;

    if (conciliada) {
      if (!nota.isComplete) {
        return { result: 'SKIPPED', id: conciliada.id, itemsCount: 0 };
      }
      if (!conciliada.totalAmount.equals(nota.totalAmount)) {
        this.logger.warn(
          `Nota ${nota.accessKey} já conciliada por ${conciliada.totalAmount.toFixed(2)}, ` +
            `mas o documento completo traz ${nota.totalAmount}. Itens e impostos não foram ` +
            `aplicados — conferir manualmente.`,
        );
        return { result: 'SKIPPED', id: conciliada.id, itemsCount: 0 };
      }
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { companyId, document: nota.supplierDocument, deletedAt: null },
      select: { id: true },
    });

    const dados = {
      supplierName: nota.supplierName,
      supplierDocument: nota.supplierDocument,
      supplierId: supplier?.id ?? null,
      number: nota.number,
      series: nota.series,
      issueDate: nota.issueDate,
      totalAmount: nota.totalAmount,
      supplierTradeName: nota.supplierTradeName,
      supplierIe: nota.supplierIe,
      supplierAddress: nota.supplierAddress,
      supplierCity: nota.supplierCity,
      supplierState: nota.supplierState,
      supplierZipCode: nota.supplierZipCode,
      productsAmount: nota.productsAmount,
      freightAmount: nota.freightAmount,
      discountAmount: nota.discountAmount,
      icmsAmount: nota.icmsAmount,
      ipiAmount: nota.ipiAmount,
      pisAmount: nota.pisAmount,
      cofinsAmount: nota.cofinsAmount,
      additionalInfo: nota.additionalInfo,
      protocolNumber: nota.protocolNumber,
      hasFullDocument: nota.isComplete,
      source: 'SEFAZ' as const,
      ...(nota.cancelled
        ? { status: 'CANCELLED' as const, cancelledAt: new Date() }
        : {}),
    };

    const id = await this.prisma.$transaction(async (tx) => {
      if (existente) {
        await tx.inboundInvoice.update({
          where: { id: existente.id },
          // Na nota conciliada, só o que o resumo não tinha. Na pendente, o
          // documento completo é a versão boa e substitui o cabeçalho inteiro.
          data: conciliada
            ? apenasEnriquecimento(dados)
            : limparNulos(dados, nota.isComplete),
        });
        // Só o documento completo mexe nos itens. Substituir em vez de
        // acrescentar: reprocessar o mesmo XML não pode duplicar linhas.
        if (nota.isComplete) {
          await tx.inboundInvoiceItem.deleteMany({ where: { inboundInvoiceId: existente.id } });
          await this.criarItens(tx, existente.id, nota);
        }
        return existente.id;
      }

      const criada = await tx.inboundInvoice.create({
        data: { companyId, accessKey: nota.accessKey, ...dados },
        select: { id: true },
      });
      if (nota.isComplete) await this.criarItens(tx, criada.id, nota);
      return criada.id;
    });

    void fiscalDocumentId;
    return {
      result: nota.cancelled ? 'CANCELLED' : 'IMPORTED',
      id,
      itemsCount: nota.items.length,
    };
  }

  private async criarItens(
    tx: Prisma.TransactionClient,
    inboundInvoiceId: string,
    nota: ParsedInvoice,
  ) {
    if (nota.items.length === 0) return;
    await tx.inboundInvoiceItem.createMany({
      data: nota.items.map((item) => ({
        inboundInvoiceId,
        itemNumber: item.itemNumber,
        code: item.code,
        description: item.description,
        unit: item.unit,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        totalPrice: item.totalPrice,
        ncm: item.ncm,
        cfop: item.cfop,
        cst: item.cst,
      })),
    });
  }

  /// Cancelamento chega como documento SEPARADO, normalmente depois da nota.
  /// Os demais eventos (ciência, confirmação, carta de correção) não alteram a
  /// nota nesta etapa — são registrados no log e seguem.
  private async aplicarEvento(
    companyId: string,
    evento: ParsedEvent,
  ): Promise<FiscalImportResult> {
    if (!evento.isCancellation || !evento.accessKey) return 'SKIPPED';

    const atualizadas = await this.prisma.inboundInvoice.updateMany({
      // Não cancela o que já foi conciliado: ali existe conta a pagar, e
      // desfazer isso é decisão do financeiro, não do importador.
      where: { companyId, accessKey: evento.accessKey, status: 'PENDING' },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    });

    if (atualizadas.count === 0) return 'SKIPPED';

    this.logger.warn(`Nota ${evento.accessKey} cancelada pelo emitente (evento 110111).`);
    return 'CANCELLED';
  }

  private async idPorChave(companyId: string, accessKey: string | null): Promise<string | null> {
    if (!accessKey) return null;
    const nota = await this.prisma.inboundInvoice.findFirst({
      where: { companyId, accessKey },
      select: { id: true },
    });
    return nota?.id ?? null;
  }
}

/// O que o documento completo acrescenta a uma nota JÁ CONCILIADA: dados do
/// emitente, impostos discriminados e o protocolo de autorização.
///
/// Ficam de fora, de propósito, os campos que o financeiro tinha na tela quando
/// conciliou — `totalAmount`, `supplierId`, `number`, `series`, `issueDate` — e
/// também `status`/`cancelledAt`. A nota conciliada já é conta a pagar; nada
/// vindo da SEFAZ depois pode reescrever dívida ou cancelar por fora. Cancelar
/// nota conciliada já era recusado em `aplicarEvento`, e continua sendo.
const CAMPOS_DE_ENRIQUECIMENTO = [
  'supplierName',
  'supplierTradeName',
  'supplierIe',
  'supplierAddress',
  'supplierCity',
  'supplierState',
  'supplierZipCode',
  'productsAmount',
  'freightAmount',
  'discountAmount',
  'icmsAmount',
  'ipiAmount',
  'pisAmount',
  'cofinsAmount',
  'additionalInfo',
  'protocolNumber',
  'hasFullDocument',
] as const;

function apenasEnriquecimento<T extends Record<(typeof CAMPOS_DE_ENRIQUECIMENTO)[number], unknown>>(
  dados: T,
): Partial<T> {
  return Object.fromEntries(
    CAMPOS_DE_ENRIQUECIMENTO.map((campo) => [campo, dados[campo]]),
  ) as Partial<T>;
}

/// Ao ATUALIZAR com um resumo, não sobrescreve com `null` o que o documento
/// completo já preencheu. Um resumo reprocessado apagaria endereço, impostos e
/// nome fantasia de uma nota que estava inteira.
function limparNulos<T extends Record<string, unknown>>(dados: T, isComplete: boolean): Partial<T> {
  if (isComplete) return dados;
  return Object.fromEntries(
    Object.entries(dados).filter(([, valor]) => valor !== null),
  ) as Partial<T>;
}
