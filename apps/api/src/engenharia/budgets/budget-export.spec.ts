import ExcelJS from 'exceljs';

import { renderDocumentPdf } from '../../common/pdf/pdf-renderer';
import {
  buildBudgetDocument,
  buildBudgetExportLines,
  buildBudgetWorkbook,
  exportFileName,
  originLabel,
  type BudgetExportSource,
} from './budget-export';

const orcamento: BudgetExportSource = {
  code: 'ORC-0001',
  version: 2,
  name: 'Residencial Aurora — estrutura',
  description: null,
  referenceDate: '2026-09-01',
  status: 'CLOSED',
  closedAt: new Date('2026-09-10T15:00:00Z'),
  isOfficial: true,
  constructionSite: { code: 'OBRA-01', name: 'Residencial Aurora' },
  directCost: '2600.00',
  bdiPercent: '25.0000',
  bdiNote: 'AC 4%, lucro 8%',
  bdiValue: '650.00',
  finalPrice: '3250.00',
  nodes: [
    { id: 'n1', code: '1', depth: 1, name: 'Estrutura', subtotal: '2600.00' },
    { id: 'n11', code: '1.1', depth: 2, name: 'Piso', subtotal: '2600.00' },
  ],
  items: [
    {
      id: 'i2',
      budgetNodeId: 'n11',
      code: '1.1.2',
      position: 1,
      source: 'MANUAL',
      sourceCode: null,
      description: 'Limpeza',
      unit: 'VB',
      quantity: '1.0000',
      unitCost: '100.0000',
      totalCost: '100.00',
      reference: null,
    },
    {
      id: 'i1',
      budgetNodeId: 'n11',
      code: '1.1.1',
      position: 0,
      source: 'REFERENCE',
      sourceCode: '104658',
      description: 'PISO PODOTÁTIL',
      unit: 'M2',
      quantity: '12.0192',
      unitCost: '208.0000',
      totalCost: '2500.00',
      reference: { source: 'SINAPI', code: '104658', competence: '2026-08', uf: 'SP', regime: 'NAO_DESONERADO', versionLabel: '' },
    },
  ],
};

describe('Exportação do orçamento', () => {
  it('rastreia a origem: SINAPI/SICRO com competência, UF e regime', () => {
    expect(originLabel(orcamento.items[1]!)).toBe('SINAPI 104658 · 08/2026 · SP · Não desonerado');
    expect(originLabel({ ...orcamento.items[0]!, source: 'COMPOSITION', sourceCode: 'COMP-0001' })).toBe('Composição COMP-0001');
  });

  it('linhas na ordem da EAP: grupo, itens do grupo pela posição, subgrupos', () => {
    expect(buildBudgetExportLines(orcamento).map((l) => [l.kind, l.code, l.total])).toEqual([
      ['GROUP', '1', '2600.00'],
      ['GROUP', '1.1', '2600.00'],
      ['ITEM', '1.1.1', '2500.00'],
      ['ITEM', '1.1.2', '100.00'],
    ]);
    expect(exportFileName(orcamento)).toBe('ORC-0001-v2');
  });

  it('XLSX traz cabeçalho, EAP, totais, BDI e a referência', async () => {
    const buffer = await buildBudgetWorkbook(orcamento, new Date('2026-09-14T12:00:00Z'));
    const pasta = new ExcelJS.Workbook();
    await pasta.xlsx.load(buffer as unknown as ArrayBuffer);
    const aba = pasta.getWorksheet('Orçamento')!;
    const valores: unknown[][] = [];
    aba.eachRow((linha) => valores.push(Array.from((linha.values as unknown[]).slice(1), (valor) => valor ?? null)));
    const texto = JSON.stringify(valores);

    expect(texto).toContain('Orçamento ORC-0001 — v2');
    expect(texto).toContain('OBRA-01 — Residencial Aurora');
    expect(texto).toContain('01/09/2026');
    expect(texto).toContain('Fechado');
    expect(valores).toContainEqual(['1.1.1', 'PISO PODOTÁTIL', 'SINAPI 104658 · 08/2026 · SP · Não desonerado', 'M2', 12.0192, 208, 2500]);
    expect(valores).toContainEqual([null, null, null, null, null, 'Custo direto', 2600]);
    expect(valores).toContainEqual([null, null, null, null, null, 'BDI (25,00%)', 650]);
    expect(valores).toContainEqual([null, null, null, null, null, 'Preço final', 3250]);
  });

  it('PDF: documento com os totais e gera arquivo', async () => {
    // Intl separa "R$" do número com espaço inseparável.
    const R = (valor: string) => `R$\u00a0${valor}`;
    const documento = buildBudgetDocument(
      orcamento,
      { companyName: 'EDS Engenharia', companyFields: [], companyLogo: null },
      new Date('2026-09-14T12:00:00Z'),
    );
    expect(documento.code).toBe('ORC-0001 v2');
    expect(documento.total).toMatchObject({
      label: 'Preço final',
      value: R('3.250,00'),
      lines: [
        { label: 'Custo direto', value: R('2.600,00') },
        { label: 'BDI (25,00%)', value: R('650,00') },
      ],
    });
    expect(documento.rows.map((r) => r.origin)).toContain('SINAPI 104658 · 08/2026 · SP · Não desonerado');
    expect(documento.rows[0]!.description).toBe('ESTRUTURA');
    expect(documento.notes).toEqual({ title: 'Observação do BDI', text: 'AC 4%, lucro 8%' });
    expect(documento.columns.reduce((soma, c) => soma + c.width, 0)).toBeCloseTo(1);

    const { buffer } = await renderDocumentPdf(documento);
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
  });
});
