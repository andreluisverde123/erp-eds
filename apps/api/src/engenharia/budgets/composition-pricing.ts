import type { Prisma } from '../../../generated/prisma/client';
import { unitCost } from '../compositions/composition-cost';

/// Preço de uma composição PRÓPRIA na data-base do orçamento. Módulo puro.
///
/// A composição (ORC-02) guarda, em cada linha, um preço unitário — o preço
/// que alguém digitou ao montá-la. O histórico de preços (ORC-03) guarda o
/// preço de cada insumo ao longo do tempo. Ao entrar num orçamento, cada linha
/// usa:
///
/// 1. o preço de referência do insumo VIGENTE NA DATA-BASE (o mais recente com
///    data ≤ data-base), se existir e estiver na mesma unidade do insumo —
///    `HISTORICAL`;
/// 2. senão, o preço gravado na própria linha da composição — `FALLBACK`.
///
/// O item inteiro é `HISTORICAL` quando todas as linhas são, `FALLBACK` quando
/// nenhuma é, e `MIXED` no resto. A composição em si não é alterada: o preço
/// escolhido vai para o snapshot do orçamento, com a origem de cada linha.
///
/// Preço de data POSTERIOR à data-base nunca entra: quem busca os vigentes
/// filtra `referenceDate <= data-base`.

export type ComponentPriceOrigin = 'HISTORICAL' | 'FALLBACK';
export type CompositionPricing = 'HISTORICAL' | 'FALLBACK' | 'MIXED';

export interface OwnCompositionLine {
  catalogItemId: string;
  /// Unidade do insumo.
  unit: string;
  coefficient: Prisma.Decimal;
  unitPrice: Prisma.Decimal;
}

export interface PriceAtReferenceDate {
  id: string;
  unitPrice: Prisma.Decimal;
  unit: string;
}

export interface PricedLine<L extends OwnCompositionLine> {
  line: L;
  unitPrice: Prisma.Decimal;
  priceOrigin: ComponentPriceOrigin;
  referencePriceId: string | null;
}

export function priceCompositionAt<L extends OwnCompositionLine>(
  lines: L[],
  vigentes: Map<string, PriceAtReferenceDate>,
): { lines: PricedLine<L>[]; pricing: CompositionPricing; unitCost: Prisma.Decimal } {
  const precificadas = lines.map((line): PricedLine<L> => {
    const vigente = vigentes.get(line.catalogItemId);
    if (vigente && vigente.unit === line.unit) {
      return { line, unitPrice: vigente.unitPrice, priceOrigin: 'HISTORICAL', referencePriceId: vigente.id };
    }
    return { line, unitPrice: line.unitPrice, priceOrigin: 'FALLBACK', referencePriceId: null };
  });

  const historicas = precificadas.filter((linha) => linha.priceOrigin === 'HISTORICAL').length;
  const pricing: CompositionPricing =
    historicas === 0 ? 'FALLBACK' : historicas === precificadas.length ? 'HISTORICAL' : 'MIXED';

  return {
    lines: precificadas,
    pricing,
    unitCost: unitCost(precificadas.map((linha) => ({ coefficient: linha.line.coefficient, unitPrice: linha.unitPrice }))),
  };
}
