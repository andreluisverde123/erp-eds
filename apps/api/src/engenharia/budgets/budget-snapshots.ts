import { Prisma } from '../../../generated/prisma/client';
import type {
  BudgetCompositionPricing,
  BudgetItemSource,
  CatalogItemType,
  ReferenceRegime,
  ReferenceSource,
} from '../../../generated/prisma/client';
import { unitCostProblem } from './budget-cost';
import { priceCompositionAt, type PriceAtReferenceDate } from './composition-pricing';

/// O SNAPSHOT de cada origem: o que a linha do orçamento copia no momento da
/// inclusão. Módulo puro — quem busca composição, insumo, preço ou base é o
/// service; aqui só se decide o que é copiado e o que impede a inclusão.
///
/// Usado pela inclusão de um item (`BudgetsService.addItem`) e pela
/// importação de planilha, que monta centenas de linhas de uma vez. As duas
/// entradas produzem exatamente o mesmo snapshot.

/// Um motivo de recusa com mensagem para o usuário. O service transforma em
/// 400; a importação, em erro da linha.
export class SnapshotProblem extends Error {}

export interface ItemSnapshot {
  source: BudgetItemSource;
  compositionId?: string | null;
  catalogItemId?: string | null;
  referencePriceId?: string | null;
  sourceCode: string | null;
  catalogItemType?: CatalogItemType | null;
  description: string;
  unit: string;
  unitCost: Prisma.Decimal;
  compositionPricing?: BudgetCompositionPricing | null;
  referenceDatasetId?: string | null;
  referenceItemId?: string | null;
  referenceCompositionId?: string | null;
  referenceSource?: ReferenceSource | null;
  referenceKind?: 'ITEM' | 'COMPOSITION' | null;
  referenceCode?: string | null;
  referenceCompetence?: string | null;
  referenceUf?: string | null;
  referenceLocality?: string | null;
  referenceRegime?: ReferenceRegime | null;
  referenceVersionLabel?: string | null;
}

export interface Snapshot {
  item: ItemSnapshot;
  components: Omit<Prisma.BudgetItemComponentCreateManyInput, 'budgetItemId'>[];
  referenceComponents: Omit<Prisma.BudgetItemReferenceComponentCreateManyInput, 'budgetItemId'>[];
}

export interface OwnCompositionSource {
  id: string;
  code: string;
  name: string;
  unit: string;
  active: boolean;
  items: {
    catalogItemId: string;
    coefficient: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    catalogItem: { code: string; name: string; type: CatalogItemType; unit: string };
  }[];
}

/// Composição própria, precificada NA DATA-BASE (`composition-pricing.ts`).
export function compositionSnapshot(
  composicao: OwnCompositionSource,
  vigentes: Map<string, PriceAtReferenceDate>,
): Snapshot {
  if (!composicao.active) {
    throw new SnapshotProblem('Esta composição está desativada e não pode entrar no orçamento.');
  }
  if (composicao.items.length === 0) {
    throw new SnapshotProblem('Esta composição não tem insumos e não tem custo a orçar.');
  }

  const precificada = priceCompositionAt(
    composicao.items.map((linha) => ({ ...linha, unit: linha.catalogItem.unit })),
    vigentes,
  );

  return {
    item: {
      source: 'COMPOSITION',
      compositionId: composicao.id,
      sourceCode: composicao.code,
      description: composicao.name,
      unit: composicao.unit,
      unitCost: precificada.unitCost,
      compositionPricing: precificada.pricing,
    },
    components: precificada.lines.map((linha, posicao) => ({
      catalogItemId: linha.line.catalogItemId,
      code: linha.line.catalogItem.code,
      name: linha.line.catalogItem.name,
      type: linha.line.catalogItem.type,
      unit: linha.line.catalogItem.unit,
      coefficient: linha.line.coefficient,
      unitPrice: linha.unitPrice,
      position: posicao,
      priceOrigin: linha.priceOrigin,
      referencePriceId: linha.referencePriceId,
    })),
    referenceComponents: [],
  };
}

export interface CatalogItemSource {
  id: string;
  code: string;
  name: string;
  unit: string;
  type: CatalogItemType;
  active: boolean;
}

/// Insumo próprio com o custo escolhido. `referencePriceId` só quando o custo
/// é EXATAMENTE o preço vigente na data-base (rastreio, como no ORC-04).
export function catalogItemSnapshot(
  insumo: CatalogItemSource,
  custo: Prisma.Decimal,
  vigente: PriceAtReferenceDate | undefined,
): Snapshot {
  if (!insumo.active) {
    throw new SnapshotProblem('Este insumo está desativado e não pode entrar no orçamento.');
  }
  return {
    item: {
      source: 'CATALOG_ITEM',
      catalogItemId: insumo.id,
      sourceCode: insumo.code,
      catalogItemType: insumo.type,
      description: insumo.name,
      unit: insumo.unit,
      unitCost: custo,
      referencePriceId:
        vigente && vigente.unit === insumo.unit && vigente.unitPrice.equals(custo) ? vigente.id : null,
    },
    components: [],
    referenceComponents: [],
  };
}

export interface ReferenceDatasetSource {
  id: string;
  source: ReferenceSource;
  competence: string;
  referenceDate: Date;
  uf: string;
  locality: string | null;
  regime: ReferenceRegime;
  versionLabel: string;
}

export interface ReferenceEntrySource {
  kind: 'ITEM' | 'COMPOSITION';
  id: string;
  code: string;
  description: string;
  unit: string;
  /// Preço do insumo ou custo da composição, como a base publicou.
  price: Prisma.Decimal | null;
  components: {
    position: number;
    section: string | null;
    kind: Prisma.BudgetItemReferenceComponentCreateManyInput['kind'];
    code: string;
    description: string;
    unit: string | null;
    coefficient: Prisma.Decimal | null;
    unitPrice: Prisma.Decimal | null;
    totalCost: Prisma.Decimal | null;
    situation: string | null;
    metadata: Prisma.JsonValue;
  }[];
}

/// Insumo ou composição de base referencial (SINAPI, SICRO).
///
/// O custo é o PUBLICADO, congelado. A competência da base precisa ser
/// anterior ou igual à data-base: um orçamento de 10/08 não usa a tabela de
/// setembro.
export function referenceSnapshot(
  entrada: ReferenceEntrySource,
  dataset: ReferenceDatasetSource,
  budgetReferenceDate: Date,
): Snapshot {
  if (dataset.referenceDate.getTime() > budgetReferenceDate.getTime()) {
    const [ano, mes] = dataset.competence.split('-');
    throw new SnapshotProblem(
      `A base ${dataset.source} ${mes}/${ano} é posterior à data-base do orçamento e não pode ser usada nele.`,
    );
  }
  if (entrada.price === null) {
    throw new SnapshotProblem(
      entrada.kind === 'ITEM'
        ? `O insumo ${entrada.code} não tem preço nesta referência (${dataset.source} ${dataset.uf}).`
        : `A composição ${entrada.code} não tem custo nesta referência (${dataset.source} ${dataset.uf}).`,
    );
  }
  const problema = unitCostProblem(entrada.price);
  if (problema) throw new SnapshotProblem(problema);

  return {
    item: {
      source: 'REFERENCE',
      sourceCode: entrada.code,
      description: entrada.description,
      unit: entrada.unit,
      unitCost: entrada.price,
      referenceDatasetId: dataset.id,
      referenceItemId: entrada.kind === 'ITEM' ? entrada.id : null,
      referenceCompositionId: entrada.kind === 'COMPOSITION' ? entrada.id : null,
      referenceSource: dataset.source,
      referenceKind: entrada.kind,
      referenceCode: entrada.code,
      referenceCompetence: dataset.competence,
      referenceUf: dataset.uf,
      referenceLocality: dataset.locality,
      referenceRegime: dataset.regime,
      referenceVersionLabel: dataset.versionLabel,
    },
    components: [],
    referenceComponents: entrada.components.map((linha) => ({
      position: linha.position,
      section: linha.section,
      kind: linha.kind,
      code: linha.code,
      description: linha.description,
      unit: linha.unit,
      coefficient: linha.coefficient,
      unitPrice: linha.unitPrice,
      totalCost: linha.totalCost,
      situation: linha.situation,
      metadata: (linha.metadata ?? {}) as Prisma.InputJsonValue,
    })),
  };
}
