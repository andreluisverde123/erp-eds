import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { classifySicroFile, parseSicroReports } from './sicro-parser';

/// Recortes dos relatórios OFICIAIS do SICRO (DNIT), São Paulo, abril/2026:
/// mesmos arquivos, mesmos títulos e cabeçalhos, e as linhas reais das
/// composições 0307731, 0308308 e da auxiliar 1108059.
const PASTA = join(__dirname, '__fixtures__');
const ARQUIVOS = readdirSync(PASTA)
  .filter((nome) => nome.startsWith('SP 04-2026'))
  .map((name) => ({ name, buffer: readFileSync(join(PASTA, name)) }));

describe('Classificação dos relatórios do SICRO pelo nome', () => {
  it('reconhece tipo, UF, competência e a versão com desoneração', () => {
    expect(classifySicroFile('SP 04-2026 Relatório Analítico de Composições de Custos.xlsx')).toMatchObject({
      kind: 'ANALYTIC',
      uf: 'SP',
      competence: '2026-04',
      withDesoneration: false,
    });
    expect(classifySicroFile('SP 04-2026 Relatório Sintético de Mão de Obra - com desoneração.xlsx')).toMatchObject({
      kind: 'LABOR',
      withDesoneration: true,
    });
    expect(classifySicroFile('planilha qualquer.xlsx').kind).toBeNull();
  });
});

describe('Parser SICRO (relatórios oficiais)', () => {
  it('lê UF, localidade e competência do conteúdo; regime é sem desoneração', async () => {
    const base = await parseSicroReports(ARQUIVOS);
    expect(base.errors).toEqual([]);
    expect(base).toMatchObject({
      source: 'SICRO',
      competence: '2026-04',
      uf: 'SP',
      locality: 'São Paulo',
      regime: 'NAO_DESONERADO',
    });
    expect(base.metadata.transportNotIncluded).toBe(true);
  });

  it('ignora, avisando, a versão com desoneração', async () => {
    const base = await parseSicroReports(ARQUIVOS);
    expect(base.warnings.map((w) => w.code)).toContain('ARQUIVO_COM_DESONERACAO_IGNORADO');
  });

  it('insumos de material, mão de obra e equipamento (custo produtivo por hora)', async () => {
    const base = await parseSicroReports(ARQUIVOS);
    expect(base.items.find((i) => i.code === 'M0798')).toMatchObject({ unit: 'dm³', category: 'MATERIAL', unitPrice: '133.6712' });
    expect(base.items.find((i) => i.code === 'P9821')).toMatchObject({ category: 'MÃO DE OBRA', unitPrice: '32.4459' });
    expect(base.items.find((i) => i.code === 'E9050')).toMatchObject({
      unit: 'h',
      category: 'EQUIPAMENTO',
      unitPrice: '435.3667',
    });
  });

  it('composição analítica por seções A–F, custo unitário direto e metadados do relatório', async () => {
    const base = await parseSicroReports(ARQUIVOS);
    const apoio = base.compositions.find((c) => c.code === '0308308')!;
    expect(apoio.unitCost).toBe('4938.72');
    expect(apoio.metadata).toMatchObject({ fic: '0.033', teamProduction: '2', productionUnit: 'un', subtotal: '4937.8913' });
    expect(apoio.components.map((c) => [c.section, c.kind, c.code])).toEqual([
      ['A', 'EQUIPMENT', 'E9050'],
      ['B', 'LABOR', 'P9801'],
      ['B', 'LABOR', 'P9830'],
      ['C', 'MATERIAL', 'M2758'],
      ['D', 'AUXILIARY', '1108059'],
      ['E', 'FIXED_TIME', 'M2758'],
      ['F', 'TRANSPORT', 'M2758'],
    ]);
    // Transporte (F) não tem custo no relatório e não entra no custo direto.
    expect(apoio.components.at(-1)).toMatchObject({ unitPrice: null, totalCost: null });
  });

  it('falta de relatório obrigatório vira erro', async () => {
    const base = await parseSicroReports(ARQUIVOS.filter((a) => !a.name.includes('Analítico')));
    expect(base.errors.map((e) => e.code)).toContain('ARQUIVO_AUSENTE');
  });

  it('relatórios de referências diferentes não se misturam', async () => {
    const trocado = ARQUIVOS.map((a) =>
      a.name.includes('Sintético de Materiais') ? { ...a, name: a.name.replace('SP 04-2026', 'SP 05-2026') } : a,
    );
    const base = await parseSicroReports(trocado);
    expect(base.errors.map((e) => e.code)).toContain('ARQUIVOS_DE_REFERENCIAS_DIFERENTES');
  });
});
