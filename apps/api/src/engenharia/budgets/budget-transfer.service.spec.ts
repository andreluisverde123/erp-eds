import { BadRequestException, ConflictException } from '@nestjs/common';
import ExcelJS from 'exceljs';

import { Prisma } from '../../../generated/prisma/client';
import { auditContextStorage } from '../../common/audit-context';
import type { AuditLoggerService } from '../../common/services/audit-logger.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { StorageService } from '../../storage/storage.module';
import { BUDGET_SHEET_HEADERS } from './budget-import-sheet';
import { BudgetTransferService } from './budget-transfer.service';
import type { BudgetsService } from './budgets.service';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const USUARIO = '33333333-3333-4333-8333-333333333333';
const ORCAMENTO = 'bbbbbbbb-0000-4000-8000-000000000001';
const D = (valor: string | number) => new Prisma.Decimal(valor);
const dia = (valor: string) => new Date(`${valor}T00:00:00.000Z`);

async function planilha(linhas: (string | number | null)[][]): Promise<Buffer> {
  const pasta = new ExcelJS.Workbook();
  const aba = pasta.addWorksheet('Orçamento');
  aba.addRow([...BUDGET_SHEET_HEADERS]);
  linhas.forEach((linha) => aba.addRow(linha));
  return Buffer.from(await pasta.xlsx.writeBuffer());
}

function makeService(opcoes: { nosExistentes?: number } = {}) {
  /// O que só vale se a transação terminar sem erro — é assim que o dublê
  /// mostra que a prévia não deixa nada gravado.
  const confirmado = { nodes: [] as Record<string, unknown>[], items: [] as Record<string, unknown>[], components: [] as unknown[], referenceComponents: [] as unknown[] };
  let pendente = { nodes: [] as Record<string, unknown>[], items: [] as Record<string, unknown>[], components: [] as unknown[], referenceComponents: [] as unknown[] };
  const contextoNaTransacao: unknown[] = [];

  const dataset = {
    id: 'ds-sicro',
    source: 'SICRO',
    competence: '2026-04',
    referenceDate: dia('2026-04-01'),
    uf: 'SP',
    locality: 'São Paulo',
    regime: 'NAO_DESONERADO',
    versionLabel: '',
  };

  const tx = {
    budget: { findFirstOrThrow: jest.fn(async () => ({ referenceDate: dia('2026-09-01'), _count: { nodes: opcoes.nosExistentes ?? 0 } })) },
    catalogItem: {
      findMany: jest.fn(async ({ where }: { where: { code: { in: string[] } } }) =>
        [{ id: 'tapume', code: 'MAT-0001', name: 'Tapume', unit: 'M2', type: 'MATERIAL', active: true }].filter((i) => where.code.in.includes(i.code)),
      ),
    },
    composition: {
      findMany: jest.fn(async ({ where }: { where: { code: { in: string[] } } }) =>
        [
          {
            id: 'comp',
            code: 'COMP-0001',
            name: 'Alvenaria',
            unit: 'M2',
            active: true,
            items: [{ catalogItemId: 'bloco', coefficient: D('25'), unitPrice: D('1.5'), catalogItem: { code: 'MAT-0002', name: 'Bloco', type: 'MATERIAL', unit: 'UN' } }],
          },
        ].filter((c) => where.code.in.includes(c.code)),
      ),
    },
    catalogItemPrice: {
      findMany: jest.fn(async ({ where }: { where: { referenceDate: { lte: Date } } }) =>
        [
          { id: 'p-tapume', catalogItemId: 'tapume', unitPrice: D('40'), unit: 'M2', referenceDate: dia('2026-08-01') },
          { id: 'p-tapume-futuro', catalogItemId: 'tapume', unitPrice: D('99'), unit: 'M2', referenceDate: dia('2026-09-10') },
        ]
          .filter((p) => p.referenceDate <= where.referenceDate.lte)
          .sort((a, b) => b.referenceDate.getTime() - a.referenceDate.getTime()),
      ),
    },
    referenceDataset: { findUnique: jest.fn(async ({ where }: { where: { id: string } }) => (where.id === dataset.id ? dataset : null)) },
    referenceItem: { findMany: jest.fn(async () => []) },
    referenceComposition: {
      findMany: jest.fn(async ({ where }: { where: { code: { in: string[] } } }) =>
        where.code.in.includes('0307731')
          ? [{ id: 'rc', code: '0307731', description: 'Aparelho de apoio', unit: 'dm³', unitCost: D('170.38'), components: [] }]
          : [],
      ),
    },
    budgetNode: { createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => pendente.nodes.push(...data)) },
    budgetItem: { createMany: jest.fn(async ({ data }: { data: Record<string, unknown>[] }) => pendente.items.push(...data)) },
    budgetItemComponent: { createMany: jest.fn(async ({ data }: { data: unknown[] }) => pendente.components.push(...data)) },
    budgetItemReferenceComponent: { createMany: jest.fn(async ({ data }: { data: unknown[] }) => pendente.referenceComponents.push(...data)) },
  };

  const prisma = {
    ...tx,
    company: { findFirstOrThrow: jest.fn(async () => ({ legalName: 'EDS', tradeName: null, cnpj: null, stateRegistration: null, email: null, phone: null, addressLine: null, addressNumber: null, addressComplement: null, city: null, state: null, zipCode: null, logoUrl: null })) },
    $transaction: jest.fn(async (fn: (t: unknown) => Promise<unknown>) => {
      pendente = { nodes: [], items: [], components: [], referenceComponents: [] };
      contextoNaTransacao.push(auditContextStorage.getStore());
      const resultado = await fn(tx);
      confirmado.nodes.push(...pendente.nodes);
      confirmado.items.push(...pendente.items);
      confirmado.components.push(...pendente.components);
      confirmado.referenceComponents.push(...pendente.referenceComponents);
      return resultado;
    }),
  };

  const budgets = {
    lockEditable: jest.fn(async () => ({ id: ORCAMENTO, code: 'ORC-0001', status: 'DRAFT' })),
    findOne: jest.fn(async () => ({
      code: 'ORC-0001',
      version: 1,
      name: 'Orçamento',
      description: null,
      referenceDate: '2026-09-01',
      status: 'DRAFT',
      closedAt: null,
      isOfficial: false,
      constructionSite: { code: 'OBRA-01', name: 'Aurora' },
      directCost: '0.00',
      bdiPercent: '0.0000',
      bdiNote: null,
      bdiValue: '0.00',
      finalPrice: '0.00',
      nodes: [],
      items: [],
    })),
  };
  const auditLogger = { log: jest.fn(async () => undefined) };
  const service = new BudgetTransferService(
    prisma as unknown as PrismaService,
    budgets as unknown as BudgetsService,
    auditLogger as unknown as AuditLoggerService,
    {} as StorageService,
  );
  return { service, prisma, budgets, auditLogger, confirmado, contextoNaTransacao };
}

const VALIDA: (string | number | null)[][] = [
  ['1', 'GRUPO', null, 'Preliminares', null, null, null],
  ['1.1', 'MANUAL', null, 'Placa de obra', 'M2', 6, 350],
  ['1.2', 'INSUMO', 'MAT-0001', null, null, 10, null],
  ['2', 'GRUPO', null, 'Estrutura', null, null, null],
  ['2.1', 'GRUPO', null, 'Apoios', null, null, null],
  ['2.1.1', 'COMPOSICAO', 'COMP-0001', null, null, 2, null],
  // O Excel apagou os zeros à esquerda do código do SICRO.
  ['2.1.2', 'REFERENCIA', 307731, null, null, 1, null],
];

describe('Importação de orçamento por planilha', () => {
  it('prévia: executa a importação inteira e DESFAZ — resumo certo, nada gravado, sem auditoria', async () => {
    const { service, confirmado, auditLogger, contextoNaTransacao } = makeService();
    const arquivo = await planilha(VALIDA);

    const previa = await auditContextStorage.run({ userId: USUARIO, companyId: EMPRESA }, () =>
      service.preview(EMPRESA, ORCAMENTO, arquivo, { referenceDatasetId: 'ds-sicro' }),
    );

    expect(previa.errors).toEqual([]);
    expect(previa.canImport).toBe(true);
    // 6 × 350 + 10 × 40 (preço de 01/08; o de 10/09 é futuro) + 2 × 37,50 + 1 × 170,38
    expect(previa.summary).toMatchObject({
      groupCount: 3,
      itemCount: 4,
      byType: { MANUAL: 1, INSUMO: 1, COMPOSICAO: 1, REFERENCIA: 1 },
      directCost: '2745.38',
    });
    expect(confirmado.nodes).toEqual([]);
    expect(confirmado.items).toEqual([]);
    expect(auditLogger.log).not.toHaveBeenCalled();
    // Fora do contexto de auditoria: a extensão não registra o que foi desfeito.
    expect(contextoNaTransacao).toEqual([undefined]);
  });

  it('confirmação: grava a EAP com os pais certos, os itens nos grupos e audita uma vez', async () => {
    const { service, confirmado, auditLogger } = makeService();
    const arquivo = await planilha(VALIDA);
    const { fileHash } = await service.preview(EMPRESA, ORCAMENTO, arquivo, { referenceDatasetId: 'ds-sicro' });

    await service.import(EMPRESA, USUARIO, ORCAMENTO, arquivo, { referenceDatasetId: 'ds-sicro', fileHash });

    const [preliminares, estrutura, apoios] = confirmado.nodes;
    expect(confirmado.nodes.map((n) => [n.name, n.parentId, n.position])).toEqual([
      ['Preliminares', null, 0],
      ['Estrutura', null, 1],
      ['Apoios', estrutura!.id, 0],
    ]);
    expect(confirmado.items.map((i) => [i.source, i.budgetNodeId, i.position, String(i.unitCost)])).toEqual([
      ['MANUAL', preliminares!.id, 0, '350'],
      ['CATALOG_ITEM', preliminares!.id, 1, '40'],
      ['COMPOSITION', apoios!.id, 0, '37.5'],
      ['REFERENCE', apoios!.id, 1, '170.38'],
    ]);
    expect(confirmado.items[1]).toMatchObject({ referencePriceId: 'p-tapume' });
    expect(confirmado.items[3]).toMatchObject({ referenceSource: 'SICRO', referenceCode: '0307731', referenceCompetence: '2026-04' });
    expect(auditLogger.log).toHaveBeenCalledTimes(1);
    expect(auditLogger.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: ORCAMENTO, changes: { importedSheet: expect.objectContaining({ groups: 3, items: 4 }) } }),
    );
  });

  it('linha que não resolve: erro com a linha, nada gravado — nem as linhas boas', async () => {
    const { service, confirmado } = makeService();
    const arquivo = await planilha([
      ['1', 'GRUPO', null, 'G', null, null, null],
      ['1.1', 'MANUAL', null, 'Boa', 'UN', 1, 1],
      ['1.2', 'INSUMO', 'MAT-9999', null, null, 1, 5],
      ['1.3', 'REFERENCIA', '104658', null, null, 1, null],
    ]);
    const previa = await service.preview(EMPRESA, ORCAMENTO, arquivo, {});
    expect(previa.errors).toEqual([
      { row: 4, message: '1.2: insumo MAT-9999 não encontrado.' },
      { row: 5, message: '1.3: escolha, na importação, a base referencial das linhas REFERENCIA.' },
    ]);
    expect(previa.canImport).toBe(false);

    await expect(
      service.import(EMPRESA, USUARIO, ORCAMENTO, arquivo, { fileHash: previa.fileHash }),
    ).rejects.toThrow(/2 erro\(s\) e nada foi importado/);
    expect(confirmado.items).toEqual([]);
  });

  it('modelo inválido: recusado antes de abrir transação', async () => {
    const { service, prisma } = makeService();
    const pasta = new ExcelJS.Workbook();
    pasta.addWorksheet('Orçamento').addRow(['Item', 'Qtd']);
    const arquivo = Buffer.from(await pasta.xlsx.writeBuffer());
    const previa = await service.preview(EMPRESA, ORCAMENTO, arquivo, {});
    expect(previa.errors[0]!.message).toMatch(/não segue o modelo/);
    await expect(service.import(EMPRESA, USUARIO, ORCAMENTO, arquivo, { fileHash: previa.fileHash })).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('confirmação exige a planilha da prévia', async () => {
    const { service } = makeService();
    const arquivo = await planilha(VALIDA);
    await expect(service.import(EMPRESA, USUARIO, ORCAMENTO, arquivo, {})).rejects.toThrow(/Analise a planilha/);
    await expect(service.import(EMPRESA, USUARIO, ORCAMENTO, arquivo, { fileHash: 'f'.repeat(64) })).rejects.toThrow(/não é a mesma/);
  });

  it('orçamento com EAP: recusado', async () => {
    const { service } = makeService({ nosExistentes: 2 });
    await expect(service.preview(EMPRESA, ORCAMENTO, await planilha(VALIDA), {})).rejects.toThrow(ConflictException);
  });

  it('trava o orçamento FOR UPDATE (rascunho) antes de ler qualquer coisa', async () => {
    const { service, budgets } = makeService();
    await service.preview(EMPRESA, ORCAMENTO, await planilha(VALIDA), { referenceDatasetId: 'ds-sicro' });
    expect(budgets.lockEditable).toHaveBeenCalledWith(expect.anything(), EMPRESA, ORCAMENTO, 'UPDATE');
  });
});

describe('Exportação e modelo', () => {
  it('XLSX e PDF com nome de arquivo pelo código e versão', async () => {
    const { service } = makeService();
    const xlsx = await service.export(EMPRESA, ORCAMENTO, 'xlsx');
    expect(xlsx.fileName).toBe('ORC-0001-v1.xlsx');
    expect(xlsx.buffer.subarray(0, 2).toString()).toBe('PK');
    const pdf = await service.export(EMPRESA, ORCAMENTO, 'pdf');
    expect(pdf).toMatchObject({ fileName: 'ORC-0001-v1.pdf', contentType: 'application/pdf' });
    expect(pdf.buffer.subarray(0, 4).toString()).toBe('%PDF');
  });

  it('o modelo de importação é um XLSX', async () => {
    const { service } = makeService();
    expect((await service.template()).subarray(0, 2).toString()).toBe('PK');
  });
});
