import type {
  BudgetItemReference,
  BudgetItemSource,
  BudgetStatus,
  CompositionPricing,
  ReferenceRegime,
} from './types';

/// Valor monetário do orçamento: SEMPRE em centavos. O servidor já manda
/// arredondado; aqui é só a máscara.
export function formatMoney(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/// Quantidade sem zeros inúteis: "120,5" em vez de "120,5000".
export function formatQuantity(value: string): string {
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 });
}

/// Custo unitário: até 4 casas, mínimo 2.
export function formatUnitCost(value: string): string {
  return Number(value).toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  });
}

/// "25.0000" → "25%"; "22.1234" → "22,1234%".
export function formatPercent(value: string): string {
  return `${Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 4 })}%`;
}

/// "2026-08" → "08/2026".
export function formatCompetence(value: string): string {
  const [ano, mes] = value.split('-');
  return `${mes}/${ano}`;
}

export const BUDGET_STATUS_LABELS: Record<BudgetStatus, string> = {
  DRAFT: 'Rascunho',
  CLOSED: 'Fechado',
};

export const BUDGET_ITEM_SOURCE_LABELS: Record<BudgetItemSource, string> = {
  COMPOSITION: 'Composição',
  CATALOG_ITEM: 'Insumo',
  MANUAL: 'Manual',
  REFERENCE: 'Base de referência',
};

export const REFERENCE_REGIME_LABELS: Record<ReferenceRegime, string> = {
  NAO_DESONERADO: 'Não desonerado',
  DESONERADO: 'Desonerado',
  SEM_ENCARGOS: 'Sem encargos',
};

export const COMPOSITION_PRICING_LABELS: Record<CompositionPricing, string> = {
  HISTORICAL: 'Preços da data-base',
  FALLBACK: 'Preços da composição',
  MIXED: 'Preços mistos',
};

/// "SINAPI 104658 · 08/2026 · SP · Não desonerado".
export function referenceLabel(reference: BudgetItemReference): string {
  return [
    `${reference.source}${reference.code ? ` ${reference.code}` : ''}`,
    reference.competence ? formatCompetence(reference.competence) : null,
    reference.uf,
    reference.regime ? REFERENCE_REGIME_LABELS[reference.regime] : null,
    reference.versionLabel || null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/// "SINAPI · 08/2026 · SP · Não desonerado" de uma base.
export function datasetLabel(dataset: {
  source: string;
  competence: string;
  uf: string;
  regime: ReferenceRegime;
  versionLabel: string;
}): string {
  return [
    dataset.source,
    formatCompetence(dataset.competence),
    dataset.uf,
    REFERENCE_REGIME_LABELS[dataset.regime],
    dataset.versionLabel || null,
  ]
    .filter(Boolean)
    .join(' · ');
}
