import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Prisma } from '../../../../generated/prisma/client';
import {
  compositionStructureOf,
  mergeComposition,
  normalizeDataset,
  type PriceLookup,
} from './reference-normalizer';
import type { ParsedReferenceDataset } from './reference-types';
import { parseSicroReports } from './sicro-parser';
import { parseSinapiReference } from './sinapi-parser';

const PASTA = join(__dirname, '__fixtures__');
const SINAPI = readFileSync(join(PASTA, 'SINAPI_Referência_2026_08-amostra.xlsx'));
const SICRO = readdirSync(PASTA)
  .filter((nome) => nome.startsWith('SP 04-2026'))
  .map((name) => ({ name, buffer: readFileSync(join(PASTA, name)) }));

/// Recompõe cada composição a partir da estrutura + preços normalizados e
/// compara com a publicada, linha a linha e valor a valor.
function idaEVolta(parsed: ParsedReferenceDataset) {
  const normalizada = normalizeDataset(parsed);
  const itens = new Map(normalizada.items.map(({ structure, price }) => [structure.code, price]));
  const custos = new Map(normalizada.compositions.map(({ structure, price }) => [structure.code, price.unitCost]));
  const precos: PriceLookup = { item: (codigo) => itens.get(codigo), compositionCost: (codigo) => custos.get(codigo) };
  const iguais = (a: string | null, b: string | null) =>
    a === null || b === null ? a === b : new Prisma.Decimal(a).equals(new Prisma.Decimal(b));

  const divergencias: string[] = [];
  normalizada.compositions.forEach(({ structure, price }, indice) => {
    const publicada = parsed.compositions[indice]!;
    const recomposta = mergeComposition(parsed.source, structure.components, precos, price.overrides);
    publicada.components.forEach((linha, posicao) => {
      const outra = recomposta[posicao]!;
      if (!iguais(linha.unitPrice, outra.unitPrice) || !iguais(linha.totalCost, outra.totalCost) || linha.code !== outra.code) {
        divergencias.push(`${publicada.code}#${linha.position}`);
      }
    });
  });
  return { normalizada, divergencias };
}

describe('Estrutura × preço das bases referenciais', () => {
  it('SINAPI: recompõe todas as linhas exatamente, sem nenhuma exceção', async () => {
    const parsed = await parseSinapiReference(SINAPI, { uf: 'SP', regime: 'NAO_DESONERADO' });
    const { normalizada, divergencias } = idaEVolta(parsed);
    expect(divergencias).toEqual([]);
    expect(normalizada.overrideCount).toBe(0);
  });

  it('SINAPI: a estrutura é a mesma em outra UF e outro regime — só o preço muda', async () => {
    const sp = await parseSinapiReference(SINAPI, { uf: 'SP', regime: 'NAO_DESONERADO' });
    const rj = await parseSinapiReference(SINAPI, { uf: 'RJ', regime: 'DESONERADO' });
    expect(rj.compositions.map((c) => compositionStructureOf(c).hash)).toEqual(
      sp.compositions.map((c) => compositionStructureOf(c).hash),
    );
    expect(normalizeDataset(rj).compositions.find((c) => c.structure.code === '104658')!.price.unitCost).not.toBe(
      normalizeDataset(sp).compositions.find((c) => c.structure.code === '104658')!.price.unitCost,
    );
  });

  it('SICRO: recompõe todas as linhas exatamente, com as exceções guardadas', async () => {
    const parsed = await parseSicroReports(SICRO);
    const { divergencias } = idaEVolta(parsed);
    expect(divergencias).toEqual([]);
  });

  it('SICRO: custo de equipamento sai dos custos horários da UF, não fica na estrutura', async () => {
    const parsed = await parseSicroReports(SICRO);
    const apoio = normalizeDataset(parsed).compositions.find((c) => c.structure.code === '0308308')!;
    const equipamento = apoio.structure.components.find((linha) => linha.kind === 'EQUIPMENT')!;
    expect(equipamento.metadata).toMatchObject({ operativeUse: '1', unproductiveUse: '0' });
    expect(equipamento.metadata).not.toHaveProperty('productiveHourlyCost');
    expect(apoio.price.metadata).toMatchObject({ fic: '0.033' });
    expect(apoio.structure.metadata).toEqual({ teamProduction: '2', productionUnit: 'un' });
  });
});
