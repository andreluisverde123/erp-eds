import ExcelJS from 'exceljs';

import {
  BUDGET_SHEET_HEADERS,
  buildBudgetTemplate,
  decimalDaCelula,
  parseBudgetSheet,
  readBudgetSheet,
} from './budget-import-sheet';

const cabecalho = [...BUDGET_SHEET_HEADERS];

describe('Planilha de importação de orçamento', () => {
  it('lê grupos e itens válidos, com o pai de cada um', () => {
    const { rows, errors } = parseBudgetSheet([
      cabecalho,
      ['1', 'GRUPO', null, 'Serviços preliminares', null, null, null],
      ['1.1', 'MANUAL', null, 'Placa de obra', 'm2', 6, 350],
      ['1.2', 'Insumo', 'mat-0001', null, null, '120,5', null],
      ['2', 'GRUPO', null, 'Alvenaria', null, null, null],
      ['2.1', 'GRUPO', null, 'Vedação', null, null, null],
      ['2.1.1', 'COMPOSIÇÃO', 'COMP-0001', null, null, 250.5, null],
      ['2.1.2', 'REFERENCIA', 104658, null, null, '1.234,5', null],
    ]);
    expect(errors).toEqual([]);
    expect(rows.map((r) => [r.eapCode, r.type, r.parentCode])).toEqual([
      ['1', 'GRUPO', null],
      ['1.1', 'MANUAL', '1'],
      ['1.2', 'INSUMO', '1'],
      ['2', 'GRUPO', null],
      ['2.1', 'GRUPO', '2'],
      ['2.1.1', 'COMPOSICAO', '2.1'],
      ['2.1.2', 'REFERENCIA', '2.1'],
    ]);
    expect(rows[1]).toMatchObject({ unit: 'M2', quantity: '6', unitCost: '350' });
    expect(rows[2]).toMatchObject({ originCode: 'mat-0001', quantity: '120.5', unitCost: null });
    expect(rows[6]).toMatchObject({ originCode: '104658', quantity: '1234.5' });
  });

  it('recusa planilha fora do modelo', () => {
    const { errors } = parseBudgetSheet([['Item', 'Descrição', 'Qtd']]);
    expect(errors[0]!.message).toMatch(/não segue o modelo/);
  });

  it('aponta cada problema com a linha da planilha', () => {
    const { errors } = parseBudgetSheet([
      cabecalho,
      ['1', 'GRUPO', null, 'Grupo', null, null, null],
      ['1.1', 'MANUAL', null, 'Sem unidade', null, 0, 10],
      ['1.2', 'MANUAL', null, 'Unidade inválida', 'metro', 1, '1,23456'],
      ['1.3', 'COMPOSICAO', 'COMP-0001', null, null, 1, 50],
      ['3.1', 'MANUAL', null, 'Pai inexistente', 'UN', 1, 1],
      ['1.1', 'MANUAL', null, 'Repetido', 'UN', 1, 1],
      ['4', 'MANUAL', null, 'Item na raiz', 'UN', 1, 1],
      ['1.x', 'GRUPO', null, 'Código ruim', null, null, null],
      ['1.4', 'OUTRO', null, 'Tipo ruim', null, null, null],
    ]);
    expect(errors.map((e) => e.row)).toEqual([3, 4, 5, 6, 7, 8, 9, 10]);
    expect(errors[0]!.message).toMatch(/quantidade deve ser maior que zero.*informe a unidade/);
    expect(errors[1]!.message).toMatch(/4 casas.*unidade "metro" não existe/);
    expect(errors[2]!.message).toMatch(/custo de composição vem da composição/);
    expect(errors[3]!.message).toMatch(/grupo 3 precisa vir numa linha ANTERIOR/);
    expect(errors[4]!.message).toMatch(/repetido/);
    expect(errors[5]!.message).toMatch(/dentro de um grupo/);
  });

  it('planilha só com grupos não tem o que importar', () => {
    const { errors } = parseBudgetSheet([cabecalho, ['1', 'GRUPO', null, 'Vazio', null, null, null]]);
    expect(errors[0]!.message).toMatch(/nenhum item/);
  });

  it('números: do Excel, "1234.5" e "1.234,5"; texto que não é número é recusado', () => {
    expect(decimalDaCelula(0.0001)).toBe('0.0001');
    expect(decimalDaCelula('1234.5')).toBe('1234.5');
    expect(decimalDaCelula('1.234,5')).toBe('1234.5');
    expect(decimalDaCelula('R$ 12,30')).toBe('12.30');
    expect(decimalDaCelula('')).toBeNull();
    expect(decimalDaCelula('doze')).toBeUndefined();
  });

  it('o modelo gerado pelo ERP é lido pelo próprio ERP', async () => {
    const lido = await readBudgetSheet(await buildBudgetTemplate());
    expect(lido.errors).toEqual([]);
    expect(lido.rows.map((r) => r.type)).toEqual(['GRUPO', 'MANUAL', 'INSUMO', 'GRUPO', 'COMPOSICAO', 'REFERENCIA']);
  });

  it('arquivo que não é xlsx vira erro, não exceção', async () => {
    const lido = await readBudgetSheet(Buffer.from('não sou planilha'));
    expect(lido.errors[0]!.message).toMatch(/não é uma planilha/);
  });

  it('lê a aba "Orçamento" mesmo que não seja a primeira', async () => {
    const pasta = new ExcelJS.Workbook();
    pasta.addWorksheet('Capa').addRow(['qualquer coisa']);
    const aba = pasta.addWorksheet('Orçamento');
    aba.addRow(cabecalho);
    aba.addRow(['1', 'GRUPO', null, 'G', null, null, null]);
    aba.addRow(['1.1', 'MANUAL', null, 'Item', 'UN', 2, 3]);
    const lido = await readBudgetSheet(Buffer.from(await pasta.xlsx.writeBuffer()));
    expect(lido.errors).toEqual([]);
    expect(lido.rows).toHaveLength(2);
  });
});
