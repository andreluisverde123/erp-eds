import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import ExcelJS from 'exceljs';

import { parseSinapiReference } from './sinapi-parser';

/// A amostra é um recorte do arquivo OFICIAL `SINAPI_Referência_2026_08.xlsx`
/// (CAIXA, competência 08/2026): mesmas abas, mesmas linhas 1–10 de título e
/// cabeçalho, e as linhas reais de duas composições (104658, com custo, e
/// 105006, sem custo) com todas as subcomposições e insumos que elas usam.
const AMOSTRA = readFileSync(join(__dirname, '__fixtures__', 'SINAPI_Referência_2026_08-amostra.xlsx'));

async function semAba(nome: string): Promise<Buffer> {
  const pasta = new ExcelJS.Workbook();
  await pasta.xlsx.load(AMOSTRA as unknown as ArrayBuffer);
  pasta.removeWorksheet(pasta.getWorksheet(nome)!.id);
  return Buffer.from(await pasta.xlsx.writeBuffer());
}

describe('Parser SINAPI (formato oficial 2026)', () => {
  it('lê competência, emissão, UF, localidade e regime', async () => {
    const base = await parseSinapiReference(AMOSTRA, { uf: 'SP', regime: 'NAO_DESONERADO' });
    expect(base.errors).toEqual([]);
    expect(base).toMatchObject({
      source: 'SINAPI',
      competence: '2026-08',
      publishedAt: '2026-09-11',
      uf: 'SP',
      locality: 'SAO PAULO',
      regime: 'NAO_DESONERADO',
    });
    expect(base.metadata.availableUfs).toContain('TO');
    expect(base.items).toHaveLength(21);
    expect(base.compositions).toHaveLength(16);
  });

  it('insumo com preço da UF e origem do preço', async () => {
    const base = await parseSinapiReference(AMOSTRA, { uf: 'SP', regime: 'NAO_DESONERADO' });
    expect(base.items.find((i) => i.code === '36178')).toEqual({
      code: '36178',
      description: 'PISO TATIL / PODOTATIL, LADRILHO HIDRAULICO/CONCRETO, *40 X 40* CM, E= 2,5* CM, PADRAO TATIL ALERTA OU DIRECIONAL, COR NATURAL',
      unit: 'UN',
      category: 'MATERIAL',
      unitPrice: '20.33',
      metadata: { priceOrigin: 'CR' },
    });
  });

  it('composição analítica: código extraído da fórmula, contribuição truncada em 2 casas (TRUNC)', async () => {
    const base = await parseSinapiReference(AMOSTRA, { uf: 'SP', regime: 'NAO_DESONERADO' });
    const piso = base.compositions.find((c) => c.code === '104658')!;
    expect(piso).toMatchObject({ unit: 'M2', unitCost: '208', situation: 'COM CUSTO' });
    expect(piso.components.map((c) => [c.kind, c.code, c.coefficient, c.unitPrice, c.totalCost])).toEqual([
      ['COMPOSITION', '88316', '1.279', '32.18', '41.15'],
      ['COMPOSITION', '88309', '0.639', '37.26', '23.8'],
      // 6,4375 × 20,33 = 130,874375 → 130,87
      ['INPUT', '36178', '6.4375', '20.33', '130.87'],
      ['INPUT', '34357', '0.24', '4.11', '0.98'],
      ['INPUT', '34353', '8.62', '1.3', '11.2'],
    ]);
  });

  it('composição SEM CUSTO fica sem custo (não pode entrar em orçamento) e é avisada', async () => {
    const base = await parseSinapiReference(AMOSTRA, { uf: 'SP', regime: 'NAO_DESONERADO' });
    const rampa = base.compositions.find((c) => c.code === '105006')!;
    expect(rampa.unitCost).toBeNull();
    expect(rampa.situation).toBe('SEM CUSTO');
    const semPreco = rampa.components.find((c) => c.code === '45087')!;
    expect(semPreco).toMatchObject({ situation: 'SEM PREÇO', unitPrice: null, totalCost: null });
    expect(base.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(['COMPOSICAO_SEM_CUSTO', 'ITEM_SEM_CADASTRO']));
  });

  it('o regime escolhe as abas: com desoneração o custo é outro', async () => {
    const base = await parseSinapiReference(AMOSTRA, { uf: 'SP', regime: 'DESONERADO' });
    expect(base.errors).toEqual([]);
    expect(base.compositions.find((c) => c.code === '104658')!.unitCost).toBe('204.51');
  });

  it('UF que a planilha não tem vira erro', async () => {
    const base = await parseSinapiReference(AMOSTRA, { uf: 'XX', regime: 'NAO_DESONERADO' });
    expect(base.errors.map((e) => e.code)).toContain('UF_AUSENTE');
  });

  it('aba obrigatória ausente vira erro (planilha regravada por outra ferramenta também é lida)', async () => {
    const base = await parseSinapiReference(await semAba('Analítico'), { uf: 'SP', regime: 'NAO_DESONERADO' });
    expect(base.errors.map((e) => e.code)).toContain('ABA_AUSENTE');
  });

  it('arquivo que não é planilha é recusado', async () => {
    await expect(parseSinapiReference(Buffer.from('texto'), { uf: 'SP', regime: 'NAO_DESONERADO' })).rejects.toThrow(
      /não é uma planilha/,
    );
  });
});
