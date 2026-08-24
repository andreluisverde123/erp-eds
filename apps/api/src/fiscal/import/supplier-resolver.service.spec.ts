import { Logger } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { parseFiscalDocument, type ParsedInvoice } from './nfe-parser';
import { SupplierResolverService } from './supplier-resolver.service';

/// Fila em memória no lugar do banco.
///
/// O que precisa ser fiel é o que a regra depende: a unique
/// `(companyId, document)` e o filtro de soft delete. Um mock que aceite
/// qualquer create passaria mesmo com a idempotência quebrada — é justamente
/// a violação de unique que este dublê precisa saber produzir.
class FakeSupplierTable {
  rows: {
    id: string;
    companyId: string;
    document: string;
    deletedAt: Date | null;
    [key: string]: unknown;
  }[] = [];
  private seq = 0;

  findFirst = jest.fn(
    async ({ where }: { where: { companyId: string; document: string; deletedAt: null } }) => {
      const found = this.rows.find(
        (row) =>
          row.companyId === where.companyId &&
          row.document === where.document &&
          row.deletedAt === null,
      );
      return found ? { id: found.id } : null;
    },
  );

  create = jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
    const companyId = data.companyId as string;
    const document = data.document as string;

    const colide = this.rows.some(
      (row) => row.companyId === companyId && row.document === document,
    );
    if (colide) throw uniqueViolation();

    const row = { id: `sup-${++this.seq}`, deletedAt: null, ...data } as (typeof this.rows)[number];
    this.rows.push(row);
    return { id: row.id };
  });
}

/// A violação de unique como o Prisma REALMENTE a lança. Um `Error` com um
/// campo `code` não serve: `isUniqueConstraintError` testa `instanceof`, e um
/// dublê mais frouxo faria o teste de concorrência passar por engano.
function uniqueViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: Prisma.prismaVersion.client,
    meta: { target: ['companyId', 'document'] },
  });
}

function makeService() {
  const supplier = new FakeSupplierTable();
  const auditLog = jest.fn().mockResolvedValue(undefined);
  const service = new SupplierResolverService(
    { supplier } as unknown as PrismaService,
    { log: auditLog } as unknown as AuditLoggerService,
  );
  return { service, supplier, auditLog };
}

const EMPRESA_A = '11111111-1111-1111-1111-111111111111';
const EMPRESA_B = '22222222-2222-2222-2222-222222222222';

/// Chave de acesso válida (44 dígitos) com o CNPJ do emitente nas posições
/// 6..20, como manda o layout — os testes de fallback dependem disso.
const CHAVE = `3526080912345678000190550010000012341${'0'.repeat(7)}`;

function nota(overrides: Partial<ParsedInvoice> = {}): ParsedInvoice {
  return {
    accessKey: CHAVE,
    number: '1234',
    series: '1',
    issueDate: new Date('2026-08-01T10:00:00-03:00'),
    supplierDocument: '12345678000190',
    supplierName: 'CONSTRUTORA FORNECEDORA LTDA',
    supplierTradeName: 'FORNECEDORA',
    supplierIe: '0771234567',
    supplierAddress: 'RUA DAS OBRAS, 100, SALA 2, CENTRO',
    supplierStreet: 'RUA DAS OBRAS',
    supplierNumber: '100',
    supplierComplement: 'SALA 2',
    supplierNeighborhood: 'CENTRO',
    supplierCity: 'GOIANIA',
    supplierState: 'GO',
    supplierZipCode: '74000000',
    supplierPhone: '6232001000',
    supplierEmail: 'fiscal@fornecedora.com.br',
    totalAmount: '1500.00',
    productsAmount: null,
    freightAmount: null,
    discountAmount: null,
    icmsAmount: null,
    ipiAmount: null,
    pisAmount: null,
    cofinsAmount: null,
    additionalInfo: null,
    protocolNumber: null,
    isComplete: true,
    cancelled: false,
    items: [],
    ...overrides,
  };
}

beforeAll(() => {
  // O serviço loga aviso/erro nos caminhos de falha — que são justamente os
  // que testamos. Silenciar mantém a saída do jest legível.
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
});

afterAll(() => jest.restoreAllMocks());

describe('SupplierResolverService', () => {
  describe('1. NF-e com fornecedor existente', () => {
    it('vincula ao cadastro que já existe, sem criar outro', async () => {
      const { service, supplier, auditLog } = makeService();
      supplier.rows.push({
        id: 'sup-existente',
        companyId: EMPRESA_A,
        document: '12345678000190',
        deletedAt: null,
        legalName: 'RAZÃO SOCIAL CADASTRADA À MÃO',
      });

      const id = await service.resolve(EMPRESA_A, nota());

      expect(id).toBe('sup-existente');
      expect(supplier.create).not.toHaveBeenCalled();
      expect(supplier.rows).toHaveLength(1);
      // Cadastro existente não vira linha de auditoria: nada foi criado.
      expect(auditLog).not.toHaveBeenCalled();
    });

    it('NÃO altera nenhum dado do fornecedor existente', async () => {
      const { service, supplier } = makeService();
      const original = {
        id: 'sup-existente',
        companyId: EMPRESA_A,
        document: '12345678000190',
        deletedAt: null,
        legalName: 'NOME QUE O USUÁRIO DIGITOU',
        email: 'contato-que-o-usuario-cadastrou@empresa.com',
        city: null,
      };
      supplier.rows.push({ ...original });

      await service.resolve(EMPRESA_A, nota());

      // Nem sobrescreve o que existe, nem preenche o que está vazio.
      expect(supplier.rows[0]).toEqual(original);
    });
  });

  describe('2. NF-e com fornecedor inexistente', () => {
    it('cria o fornecedor com os dados do XML e devolve o id', async () => {
      const { service, supplier } = makeService();

      const id = await service.resolve(EMPRESA_A, nota());

      expect(id).toBe('sup-1');
      expect(supplier.rows).toHaveLength(1);
      expect(supplier.rows[0]).toMatchObject({
        companyId: EMPRESA_A,
        document: '12345678000190',
        legalName: 'CONSTRUTORA FORNECEDORA LTDA',
        tradeName: 'FORNECEDORA',
        stateRegistration: '0771234567',
        address: 'RUA DAS OBRAS',
        addressNumber: '100',
        addressComplement: 'SALA 2',
        neighborhood: 'CENTRO',
        city: 'GOIANIA',
        state: 'GO',
        zipCode: '74000000',
        phone: '6232001000',
        email: 'fiscal@fornecedora.com.br',
        origin: 'NFE',
        originAccessKey: CHAVE,
      });
    });

    it('registra a criação automática na auditoria, sem usuário', async () => {
      const { service, auditLog } = makeService();

      await service.resolve(EMPRESA_A, nota());

      expect(auditLog).toHaveBeenCalledTimes(1);
      expect(auditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          companyId: EMPRESA_A,
          userId: null,
          action: 'CREATE',
          entityType: 'Supplier',
          entityId: 'sup-1',
          changes: expect.objectContaining({
            origin: 'NFE',
            document: '12345678000190',
            accessKey: CHAVE,
            source: 'fiscal-import',
          }),
        }),
      );
    });
  });

  describe('3. Reprocessamento da mesma NF-e', () => {
    it('processar a mesma nota três vezes cria um fornecedor só', async () => {
      const { service, supplier } = makeService();

      const primeiro = await service.resolve(EMPRESA_A, nota());
      const segundo = await service.resolve(EMPRESA_A, nota());
      const terceiro = await service.resolve(EMPRESA_A, nota());

      expect(primeiro).toBe(segundo);
      expect(segundo).toBe(terceiro);
      expect(supplier.rows).toHaveLength(1);
      expect(supplier.create).toHaveBeenCalledTimes(1);
    });

    it('o resumo e o documento completo da mesma nota resolvem o mesmo fornecedor', async () => {
      const { service, supplier } = makeService();

      // Ordem real de chegada: resumo primeiro (só razão social e IE),
      // documento completo depois.
      const resumo = await service.resolve(
        EMPRESA_A,
        nota({
          isComplete: false,
          supplierTradeName: null,
          supplierStreet: null,
          supplierNumber: null,
          supplierComplement: null,
          supplierNeighborhood: null,
          supplierCity: null,
          supplierState: null,
          supplierZipCode: null,
          supplierPhone: null,
          supplierEmail: null,
        }),
      );
      const completo = await service.resolve(EMPRESA_A, nota());

      expect(resumo).toBe(completo);
      expect(supplier.rows).toHaveLength(1);
    });

    it('o cadastro criado pelo resumo NÃO é enriquecido pelo documento completo', async () => {
      const { service, supplier } = makeService();

      await service.resolve(
        EMPRESA_A,
        nota({
          isComplete: false,
          supplierTradeName: null,
          supplierStreet: null,
          supplierCity: null,
          supplierPhone: null,
          supplierEmail: null,
        }),
      );
      await service.resolve(EMPRESA_A, nota());

      // Regra do produto: fornecedor existente nunca é alterado. O endereço
      // que chegou no documento completo fica na nota, não no cadastro.
      expect(supplier.rows[0]).toMatchObject({
        legalName: 'CONSTRUTORA FORNECEDORA LTDA',
        stateRegistration: '0771234567',
        tradeName: null,
        address: null,
        city: null,
        phone: null,
        email: null,
      });
    });
  });

  describe('4 e 5. CNPJ com e sem máscara', () => {
    it('CNPJ mascarado no XML é normalizado antes de comparar', async () => {
      const { service, supplier } = makeService();
      supplier.rows.push({
        id: 'sup-existente',
        companyId: EMPRESA_A,
        document: '12345678000190',
        deletedAt: null,
      });

      const id = await service.resolve(EMPRESA_A, nota({ supplierDocument: '12.345.678/0001-90' }));

      expect(id).toBe('sup-existente');
      expect(supplier.create).not.toHaveBeenCalled();
    });

    it('máscara e dígitos puros resolvem o MESMO fornecedor, em qualquer ordem', async () => {
      const { service, supplier } = makeService();

      const comMascara = await service.resolve(
        EMPRESA_A,
        nota({ supplierDocument: '12.345.678/0001-90' }),
      );
      const semMascara = await service.resolve(
        EMPRESA_A,
        nota({ supplierDocument: '12345678000190' }),
      );

      expect(comMascara).toBe(semMascara);
      expect(supplier.rows).toHaveLength(1);
      // Gravado sempre só com dígitos, qualquer que tenha sido a entrada.
      expect(supplier.rows[0]!.document).toBe('12345678000190');
    });

    it('aceita CPF de 11 dígitos (produtor rural emite NF-e)', async () => {
      const { service, supplier } = makeService();

      const id = await service.resolve(
        EMPRESA_A,
        nota({ supplierDocument: '123.456.789-09', supplierName: 'PRODUTOR RURAL' }),
      );

      expect(id).toBe('sup-1');
      expect(supplier.rows[0]!.document).toBe('12345678909');
    });
  });

  describe('6. Tentativa de duplicação', () => {
    it('duas importações simultâneas do mesmo emitente criam um cadastro só', async () => {
      const { service, supplier } = makeService();

      // A corrida real: as duas chamadas passam pela busca antes de qualquer
      // create. Sem o tratamento de P2002, a segunda estouraria.
      const [a, b] = await Promise.all([
        service.resolve(EMPRESA_A, nota()),
        service.resolve(EMPRESA_A, nota()),
      ]);

      expect(a).toBe(b);
      expect(a).not.toBeNull();
      expect(supplier.rows).toHaveLength(1);
      // As duas tentaram criar; só uma venceu a unique.
      expect(supplier.create).toHaveBeenCalledTimes(2);
    });

    it('fornecedor excluído não bloqueia o cadastro do mesmo CNPJ', async () => {
      const { service, supplier } = makeService();
      // O soft delete manga o documento — o CNPJ fica livre na unique.
      supplier.rows.push({
        id: 'sup-excluido',
        companyId: EMPRESA_A,
        document: '12345678000190__deleted__sup-excluido',
        deletedAt: new Date(),
      });

      const id = await service.resolve(EMPRESA_A, nota());

      expect(id).toBe('sup-1');
      expect(id).not.toBe('sup-excluido');
    });
  });

  describe('7. Isolamento entre empresas', () => {
    it('não reutiliza o fornecedor de outra empresa', async () => {
      const { service, supplier } = makeService();
      supplier.rows.push({
        id: 'sup-da-empresa-b',
        companyId: EMPRESA_B,
        document: '12345678000190',
        deletedAt: null,
      });

      const id = await service.resolve(EMPRESA_A, nota());

      expect(id).toBe('sup-1');
      expect(id).not.toBe('sup-da-empresa-b');
      expect(supplier.rows).toHaveLength(2);
    });

    it('o mesmo CNPJ vira um cadastro por empresa, cada um no seu tenant', async () => {
      const { service, supplier } = makeService();

      const naEmpresaA = await service.resolve(EMPRESA_A, nota());
      const naEmpresaB = await service.resolve(EMPRESA_B, nota());

      expect(naEmpresaA).not.toBe(naEmpresaB);
      expect(supplier.rows.map((row) => row.companyId).sort()).toEqual(
        [EMPRESA_A, EMPRESA_B].sort(),
      );
    });

    it('toda consulta é feita dentro do escopo da empresa', async () => {
      const { service, supplier } = makeService();

      await service.resolve(EMPRESA_A, nota());

      for (const chamada of supplier.findFirst.mock.calls) {
        expect(chamada[0].where.companyId).toBe(EMPRESA_A);
      }
      expect(supplier.create.mock.calls[0]![0].data.companyId).toBe(EMPRESA_A);
    });
  });

  describe('8. XML com campos opcionais ausentes', () => {
    it('grava nulo no que o XML não trouxe, sem inventar valor', async () => {
      const { service, supplier } = makeService();

      await service.resolve(
        EMPRESA_A,
        nota({
          supplierTradeName: null,
          supplierIe: null,
          supplierStreet: null,
          supplierNumber: null,
          supplierComplement: null,
          supplierNeighborhood: null,
          supplierCity: null,
          supplierState: null,
          supplierZipCode: null,
          supplierPhone: null,
          supplierEmail: null,
        }),
      );

      expect(supplier.rows[0]).toMatchObject({
        legalName: 'CONSTRUTORA FORNECEDORA LTDA',
        document: '12345678000190',
        tradeName: null,
        stateRegistration: null,
        address: null,
        addressNumber: null,
        addressComplement: null,
        neighborhood: null,
        city: null,
        state: null,
        zipCode: null,
        phone: null,
        email: null,
      });
    });
  });

  describe('9. NF-e inválida', () => {
    it.each([
      ['documento vazio', ''],
      ['só máscara, sem dígito', './-'],
      ['truncado', '1234567'],
      ['dígitos demais', '123456780001901234'],
    ])('não cria fornecedor quando o emitente tem %s', async (_caso, documento) => {
      const { service, supplier, auditLog } = makeService();

      const id = await service.resolve(EMPRESA_A, nota({ supplierDocument: documento }));

      // Nota entra sem vínculo — nunca um cadastro lixo.
      expect(id).toBeNull();
      expect(supplier.create).not.toHaveBeenCalled();
      expect(auditLog).not.toHaveBeenCalled();
    });
  });

  describe('10. Falha durante criação/vinculação do fornecedor', () => {
    it('falha do banco não derruba a importação — devolve null', async () => {
      const { service, supplier } = makeService();
      supplier.create.mockRejectedValueOnce(new Error('connection terminated'));

      const id = await service.resolve(EMPRESA_A, nota());

      expect(id).toBeNull();
    });

    it('falha na BUSCA também é absorvida', async () => {
      const { service, supplier } = makeService();
      supplier.findFirst.mockRejectedValueOnce(new Error('timeout'));

      await expect(service.resolve(EMPRESA_A, nota())).resolves.toBeNull();
    });

    it('falha de auditoria NÃO desfaz o vínculo do fornecedor criado', async () => {
      const { service, supplier, auditLog } = makeService();
      auditLog.mockRejectedValueOnce(new Error('AuditLog indisponível'));

      const id = await service.resolve(EMPRESA_A, nota());

      // O cadastro existe e a nota o alcança; perder a linha de log é menos
      // grave que perder o vínculo.
      expect(id).toBe('sup-1');
      expect(supplier.rows).toHaveLength(1);
    });

    it('P2002 sem fornecedor localizável devolve null em vez de estourar', async () => {
      const { service, supplier } = makeService();
      // Cenário-limite: a unique acusa colisão mas a releitura não acha nada
      // (o vencedor da corrida foi soft-deletado entre as duas operações).
      supplier.create.mockRejectedValueOnce(uniqueViolation());

      await expect(service.resolve(EMPRESA_A, nota())).resolves.toBeNull();
    });
  });

  describe('integração com o parser real', () => {
    it('resolve o emitente a partir de um procNFe de verdade', async () => {
      const { service, supplier } = makeService();
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
    <ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-08-01T10:00:00-03:00</dhEmi></ide>
    <emit>
      <CNPJ>12345678000190</CNPJ>
      <xNome>CONSTRUTORA FORNECEDORA LTDA</xNome>
      <xFant>FORNECEDORA</xFant>
      <IE>0771234567</IE>
      <email>fiscal@fornecedora.com.br</email>
      <enderEmit>
        <xLgr>RUA DAS OBRAS</xLgr><nro>100</nro><xCpl>SALA 2</xCpl>
        <xBairro>CENTRO</xBairro><xMun>GOIANIA</xMun><UF>GO</UF>
        <CEP>74000-000</CEP><fone>(62) 3200-1000</fone>
      </enderEmit>
    </emit>
    <total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

      const parsed = parseFiscalDocument(xml, 'procNFe_v4.00');
      expect(parsed.kind).toBe('invoice');

      await service.resolve(EMPRESA_A, parsed.data as ParsedInvoice);

      expect(supplier.rows[0]).toMatchObject({
        document: '12345678000190',
        legalName: 'CONSTRUTORA FORNECEDORA LTDA',
        tradeName: 'FORNECEDORA',
        stateRegistration: '0771234567',
        address: 'RUA DAS OBRAS',
        addressNumber: '100',
        addressComplement: 'SALA 2',
        neighborhood: 'CENTRO',
        city: 'GOIANIA',
        state: 'GO',
        // CEP e telefone chegam mascarados no XML e são gravados só com dígitos.
        zipCode: '74000000',
        phone: '6232001000',
        email: 'fiscal@fornecedora.com.br',
        origin: 'NFE',
      });
    });
  });
});
