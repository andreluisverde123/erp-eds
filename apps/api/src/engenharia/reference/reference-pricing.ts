import { Prisma } from '../../../generated/prisma/client';
import {
  mergeComposition,
  type ComponentOverride,
  type ComponentStructure,
  type PricedComponent,
  type PriceLookup,
} from './parsing/reference-normalizer';

type Client = Pick<
  Prisma.TransactionClient,
  'referenceCompositionPrice' | 'referenceItemPrice' | 'referenceDataset'
>;

/// A composição de referência PRECIFICADA numa base (UF + regime): estrutura
/// da edição + custo e preços da base + exceções. É o que a consulta
/// analítica e o orçamento mostram — idêntico ao publicado.
///
/// Busca só os preços dos códigos que aparecem nas linhas (duas consultas),
/// não a tabela inteira da base.
export async function loadPricedComposition(client: Client, datasetId: string, compositionId: string) {
  const preco = await client.referenceCompositionPrice.findUnique({
    where: { datasetId_compositionId: { datasetId, compositionId } },
    include: {
      dataset: true,
      composition: { include: { components: { orderBy: { position: 'asc' } } } },
    },
  });
  if (!preco) return null;

  const estrutura: ComponentStructure[] = preco.composition.components.map((linha) => ({
    position: linha.position,
    section: linha.section,
    kind: linha.kind,
    code: linha.code,
    description: linha.description,
    unit: linha.unit,
    coefficient: linha.coefficient?.toString() ?? null,
    situation: linha.situation,
    metadata: (linha.metadata ?? {}) as Record<string, unknown>,
  }));

  const codigosDeInsumo = new Set<string>();
  const codigosDeComposicao = new Set<string>();
  for (const linha of estrutura) {
    codigosDeInsumo.add(linha.code);
    codigosDeComposicao.add(linha.code);
    const transporte = linha.metadata.transportComposition;
    if (typeof transporte === 'string') codigosDeComposicao.add(transporte);
  }

  const [itens, custos] = await Promise.all([
    client.referenceItemPrice.findMany({
      where: { datasetId, item: { code: { in: [...codigosDeInsumo] } } },
      select: { unitPrice: true, metadata: true, item: { select: { code: true } } },
    }),
    client.referenceCompositionPrice.findMany({
      where: { datasetId, composition: { code: { in: [...codigosDeComposicao] } } },
      select: { unitCost: true, composition: { select: { code: true } } },
    }),
  ]);

  const precoPorCodigo = new Map(
    itens.map((linha) => [
      linha.item.code,
      { unitPrice: linha.unitPrice?.toString() ?? null, metadata: (linha.metadata ?? {}) as Record<string, unknown> },
    ]),
  );
  const custoPorCodigo = new Map(custos.map((linha) => [linha.composition.code, linha.unitCost?.toString() ?? null]));
  const lookup: PriceLookup = {
    item: (codigo) => precoPorCodigo.get(codigo),
    compositionCost: (codigo) => custoPorCodigo.get(codigo),
  };

  const components: PricedComponent[] = mergeComposition(
    preco.dataset.source,
    estrutura,
    lookup,
    (preco.componentOverrides ?? {}) as Record<string, ComponentOverride>,
  );

  return {
    dataset: preco.dataset,
    composition: preco.composition,
    unitCost: preco.unitCost,
    situation: preco.situation,
    metadata: preco.metadata,
    components,
  };
}

export type PricedReferenceComposition = NonNullable<Awaited<ReturnType<typeof loadPricedComposition>>>;

/// O insumo de referência com o preço numa base.
export async function loadPricedItem(client: Client, datasetId: string, itemId: string) {
  return client.referenceItemPrice.findUnique({
    where: { datasetId_itemId: { datasetId, itemId } },
    include: { dataset: true, item: true },
  });
}

/// Decimal de texto para apresentação com escala fixa.
export function fixed(valor: string | null | undefined, casas: number): string | null {
  return valor === null || valor === undefined ? null : new Prisma.Decimal(valor).toFixed(casas);
}
