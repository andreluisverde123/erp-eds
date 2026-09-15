import { createHash } from 'node:crypto';

import { Prisma } from '../../../../generated/prisma/client';
import type {
  ParsedReferenceComponent,
  ParsedReferenceComposition,
  ParsedReferenceDataset,
  ParsedReferenceItem,
  ReferenceSourceCode,
} from './reference-types';

/// ESTRUTURA × PREÇO de uma base referencial. Módulo puro.
///
/// ## Por que separar
///
/// Numa mesma competência, a estrutura de SINAPI e SICRO é a mesma em todas as
/// UFs e regimes: códigos, descrições, unidades, coeficientes e as linhas de
/// cada composição. O que muda por UF e regime é o PREÇO do insumo e o CUSTO da
/// composição. Guardar a base inteira por UF e regime repetiria a estrutura 81
/// vezes no SINAPI (27 UFs × 3 regimes) — cerca de 32 MB cada, 2,6 GB por
/// competência. Guardando a estrutura uma vez e o preço por UF e regime, cada
/// base nova custa só a tabela de preços.
///
/// ## Recalcular em vez de guardar
///
/// O preço e o custo de cada LINHA de composição não são guardados: são
/// recalculados do preço da UF, pela mesma regra da publicação oficial —
/// verificado contra os arquivos completos (SINAPI 08/2026, 56.281 linhas em
/// SP e RJ; SICRO 04/2026, 51.930 linhas em SP e RJ):
///
/// - SINAPI: preço do insumo ou custo da subcomposição; custo da linha =
///   TRUNC(coeficiente × preço; 2).
/// - SICRO: material e mão de obra pelo preço do insumo; equipamento pelo
///   custo horário produtivo e improdutivo; atividade auxiliar pelo custo da
///   composição; tempo fixo pelo custo da composição de transporte; transporte
///   sem custo; custo da linha arredondado em 4 casas.
///
/// O que a regra não reproduz (um insumo publicado com preço 0 sem estar na
/// tabela de insumos, por exemplo) vira EXCEÇÃO guardada junto do preço da
/// composição. Assim a composição lida de volta é EXATAMENTE a publicada — é o
/// que `mergeComposition` garante e o teste confere linha a linha.

/// Metadados de linha que variam com a UF (custos). O resto é estrutura.
const COMPONENT_PRICE_KEYS = new Set(['productiveHourlyCost', 'unproductiveHourlyCost']);
/// Metadados de composição que são estrutura. O resto (custos, FIC, %AS) é da UF.
const COMPOSITION_STRUCTURE_KEYS = new Set(['teamProduction', 'productionUnit', 'notes']);

export interface ItemStructure {
  code: string;
  description: string;
  unit: string;
  category: string | null;
  hash: string;
}

export interface ItemPrice {
  unitPrice: string | null;
  metadata: Record<string, unknown>;
}

export interface ComponentStructure {
  position: number;
  section: string | null;
  kind: ParsedReferenceComponent['kind'];
  code: string;
  description: string;
  unit: string | null;
  coefficient: string | null;
  situation: string | null;
  metadata: Record<string, unknown>;
}

export interface CompositionStructure {
  code: string;
  description: string;
  unit: string;
  group: string | null;
  metadata: Record<string, unknown>;
  components: ComponentStructure[];
  hash: string;
}

/// O que difere do recalculado numa linha, por posição.
export interface ComponentOverride {
  unitPrice?: string | null;
  totalCost?: string | null;
  situation?: string | null;
}

export interface CompositionPrice {
  unitCost: string | null;
  situation: string | null;
  metadata: Record<string, unknown>;
  overrides: Record<string, ComponentOverride>;
}

export interface NormalizedDataset {
  items: { structure: ItemStructure; price: ItemPrice }[];
  compositions: { structure: CompositionStructure; price: CompositionPrice }[];
  overrideCount: number;
}

/// Onde a linha de composição busca o preço, dentro de UMA base (UF + regime).
export interface PriceLookup {
  item(code: string): { unitPrice: string | null; metadata: Record<string, unknown> } | undefined;
  compositionCost(code: string): string | null | undefined;
}

export interface PricedComponent extends ComponentStructure {
  unitPrice: string | null;
  totalCost: string | null;
}

function hashOf(valor: unknown): string {
  return createHash('sha1').update(JSON.stringify(valor)).digest('hex');
}

function pick(metadata: Record<string, unknown>, manter: (chave: string) => boolean) {
  return Object.fromEntries(Object.entries(metadata ?? {}).filter(([chave]) => manter(chave)));
}

export function itemStructureOf(item: ParsedReferenceItem): ItemStructure {
  const base = { code: item.code, description: item.description, unit: item.unit, category: item.category };
  return { ...base, hash: hashOf(base) };
}

export function compositionStructureOf(composicao: ParsedReferenceComposition): CompositionStructure {
  const base = {
    code: composicao.code,
    description: composicao.description,
    unit: composicao.unit,
    group: composicao.group,
    metadata: pick(composicao.metadata, (chave) => COMPOSITION_STRUCTURE_KEYS.has(chave)),
    components: composicao.components.map((linha) => ({
      position: linha.position,
      section: linha.section,
      kind: linha.kind,
      code: linha.code,
      description: linha.description,
      unit: linha.unit,
      coefficient: linha.coefficient,
      situation: linha.situation,
      metadata: pick(linha.metadata, (chave) => !COMPONENT_PRICE_KEYS.has(chave)),
    })),
  };
  return { ...base, hash: hashOf(base) };
}

const decimal = (valor: string | null | undefined) =>
  valor === null || valor === undefined || valor === '' ? null : new Prisma.Decimal(valor);

function mesmoValor(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = decimal(a);
  const y = decimal(b);
  if (x === null || y === null) return x === y;
  return x.equals(y);
}

/// O preço e o custo de cada linha, recalculados da base. Sem exceções.
export function priceComponents(
  source: ReferenceSourceCode,
  componentes: ComponentStructure[],
  precos: PriceLookup,
): PricedComponent[] {
  return componentes.map((linha) => {
    const coeficiente = decimal(linha.coefficient);
    let preco: string | null;
    let total: Prisma.Decimal | null = null;

    if (source === 'SINAPI') {
      preco =
        linha.kind === 'COMPOSITION'
          ? linha.situation === 'SEM CUSTO'
            ? null
            : (precos.compositionCost(linha.code) ?? null)
          : (precos.item(linha.code)?.unitPrice ?? null);
      if (preco !== null && coeficiente !== null) {
        total = coeficiente.times(preco).toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
      }
    } else {
      if (linha.kind === 'AUXILIARY') preco = precos.compositionCost(linha.code) ?? null;
      else if (linha.kind === 'FIXED_TIME') {
        const transporte = linha.metadata.transportComposition;
        preco = typeof transporte === 'string' ? (precos.compositionCost(transporte) ?? null) : null;
      } else if (linha.kind === 'TRANSPORT') preco = null;
      else preco = precos.item(linha.code)?.unitPrice ?? null;

      if (preco !== null && coeficiente !== null) {
        const equipamento = linha.kind === 'EQUIPMENT' ? precos.item(linha.code)?.metadata : undefined;
        const produtivo = decimal(equipamento?.productiveHourlyCost as string | undefined);
        const improdutivo = decimal(equipamento?.unproductiveHourlyCost as string | undefined);
        const usoOperativo = decimal(linha.metadata.operativeUse as string | undefined);
        const usoImprodutivo = decimal(linha.metadata.unproductiveUse as string | undefined);
        const base =
          linha.kind === 'EQUIPMENT' && produtivo && improdutivo && usoOperativo && usoImprodutivo
            ? usoOperativo.times(produtivo).plus(usoImprodutivo.times(improdutivo))
            : new Prisma.Decimal(preco);
        total = coeficiente.times(base).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
      }
    }

    return { ...linha, unitPrice: preco, totalCost: total === null ? null : total.toString() };
  });
}

/// A composição como publicada: estrutura + preços da base + exceções.
export function mergeComposition(
  source: ReferenceSourceCode,
  componentes: ComponentStructure[],
  precos: PriceLookup,
  overrides: Record<string, ComponentOverride>,
): PricedComponent[] {
  return priceComponents(source, componentes, precos).map((linha) => {
    const excecao = overrides[String(linha.position)];
    if (!excecao) return linha;
    return {
      ...linha,
      ...('unitPrice' in excecao ? { unitPrice: excecao.unitPrice ?? null } : {}),
      ...('totalCost' in excecao ? { totalCost: excecao.totalCost ?? null } : {}),
      ...('situation' in excecao ? { situation: excecao.situation ?? null } : {}),
    };
  });
}

/// Os preços de UMA base lida pelo parser, como `PriceLookup`.
export function lookupOf(parsed: Pick<ParsedReferenceDataset, 'items' | 'compositions'>): PriceLookup {
  const itens = new Map(parsed.items.map((item) => [item.code, item]));
  const custos = new Map(parsed.compositions.map((composicao) => [composicao.code, composicao.unitCost]));
  return {
    item: (codigo) => itens.get(codigo),
    compositionCost: (codigo) => custos.get(codigo),
  };
}

/// Separa a base lida em estrutura e preço, com as exceções mínimas para a
/// composição voltar idêntica à publicada.
export function normalizeDataset(parsed: ParsedReferenceDataset): NormalizedDataset {
  const precos = lookupOf(parsed);
  let overrideCount = 0;

  const compositions = parsed.compositions.map((composicao) => {
    const structure = compositionStructureOf(composicao);
    const recalculadas = priceComponents(parsed.source, structure.components, precos);
    const overrides: Record<string, ComponentOverride> = {};

    composicao.components.forEach((publicada, indice) => {
      const recalculada = recalculadas[indice]!;
      const excecao: ComponentOverride = {};
      if (!mesmoValor(publicada.unitPrice, recalculada.unitPrice)) excecao.unitPrice = publicada.unitPrice;
      if (!mesmoValor(publicada.totalCost, recalculada.totalCost)) excecao.totalCost = publicada.totalCost;
      if (Object.keys(excecao).length > 0) {
        overrides[String(publicada.position)] = excecao;
        overrideCount += 1;
      }
    });

    return {
      structure,
      price: {
        unitCost: composicao.unitCost,
        situation: composicao.situation,
        metadata: pick(composicao.metadata, (chave) => !COMPOSITION_STRUCTURE_KEYS.has(chave)),
        overrides,
      },
    };
  });

  return {
    items: parsed.items.map((item) => ({
      structure: itemStructureOf(item),
      price: { unitPrice: item.unitPrice, metadata: item.metadata },
    })),
    compositions,
    overrideCount,
  };
}
