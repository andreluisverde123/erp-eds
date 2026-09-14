import ExcelJS from 'exceljs';

import { cellDecimal, forEachSheet, numberToDecimalString, zipEntryNames } from './xlsx-rows';

async function pastaGravadaPeloExcelJs(): Promise<Buffer> {
  const pasta = new ExcelJS.Workbook();
  const aba = pasta.addWorksheet('Dados');
  aba.addRow(['Código', 'Descrição', 'Preço']);
  aba.addRow(['A1', 'Cimento', 0.0000001]);
  pasta.addWorksheet('Outra').addRow(['x']);
  return Buffer.from(await pasta.xlsx.writeBuffer());
}

describe('Leitura de XLSX', () => {
  it('lista as entradas do zip na ordem gravada, sem descompactar', async () => {
    const nomes = zipEntryNames(await pastaGravadaPeloExcelJs())!;
    expect(nomes).toContain('xl/workbook.xml');
    expect(nomes.some((nome) => nome.startsWith('xl/worksheets/sheet'))).toBe(true);
    expect(zipEntryNames(Buffer.from('não é zip'))).toBeNull();
  });

  it('lê todas as abas, com nome e textos, qualquer que seja a ordem das entradas', async () => {
    const lidas: { nome: string; linhas: unknown[][] }[] = [];
    await forEachSheet(await pastaGravadaPeloExcelJs(), async (nome, linhas) => {
      const valores: unknown[][] = [];
      for await (const linha of linhas) valores.push(linha.values.slice(1));
      lidas.push({ nome, linhas: valores });
    });
    expect(lidas.map((l) => l.nome)).toEqual(['Dados', 'Outra']);
    expect(lidas[0]!.linhas[1]).toEqual(['A1', 'Cimento', 0.0000001]);
  });

  it('aba não consumida pelo handler não trava a leitura das seguintes', async () => {
    const nomes: string[] = [];
    await forEachSheet(await pastaGravadaPeloExcelJs(), async (nome) => {
      nomes.push(nome);
    });
    expect(nomes).toEqual(['Dados', 'Outra']);
  });

  it('decimal sem notação científica', () => {
    expect(numberToDecimalString(0.0000001)).toBe('0.0000001');
    expect(cellDecimal({ formula: 'A1*2', result: 12.5 })).toBe('12.5');
    expect(cellDecimal('')).toBeNull();
  });
});
