/// Preços de referência de um insumo (ORC-03).
///
/// O histórico não se edita: a tela só lista e registra. Os valores chegam como
/// texto com escala fixa ("38.7500") e a data como `AAAA-MM-DD`.

export type CatalogItemPriceSource = 'MANUAL' | 'PURCHASE';

export const PRICE_SOURCE_LABELS: Record<CatalogItemPriceSource, string> = {
  MANUAL: 'Manual',
  PURCHASE: 'Compra',
};

export interface CatalogItemPrice {
  id: string;
  catalogItemId: string;
  unitPrice: string;
  /// A unidade a que o preço se refere: R$ 38,00 é R$ 38,00 / SC.
  unit: string;
  source: CatalogItemPriceSource;
  referenceDate: string;
  note: string | null;
  purchaseOrder: { id: string; code: string } | null;
  createdBy: { name: string } | null;
  createdAt: string;
}

export interface CatalogItemPriceAt {
  asOf: string;
  unit: string;
  price: CatalogItemPrice | null;
}

/// Sem origem, unidade, empresa nem autor: a API recusa esses campos.
export interface ManualPriceInput {
  unitPrice: number;
  referenceDate: string;
  note?: string;
}

/// Uma linha de ordem de compra recebida de onde o preço pode ser registrado.
export interface PurchasePriceCandidate {
  purchaseOrderItemId: string;
  purchaseOrder: { id: string; code: string; supplierName: string };
  description: string;
  quantity: string;
  unit: string;
  listUnitPrice: string;
  /// Com os descontos da linha e o geral rateado. Nulo quando não calculável.
  practicedUnitPrice: string | null;
  referenceDate: string;
  block: string | null;
  blockMessage: string | null;
}
