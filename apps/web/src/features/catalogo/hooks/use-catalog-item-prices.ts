import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getCatalogItemPriceAt,
  listCatalogItemPrices,
  listPurchasePriceCandidates,
  registerManualPrice,
  registerPurchasePrice,
} from '../price-api';
import type { ManualPriceInput } from '../price-types';

/// Os 50 mais recentes. O histórico de um insumo cresce devagar, e a tela diz
/// quantos existem.
const HISTORICO_POR_PAGINA = 50;

export function useCatalogItemPrices(catalogItemId: string) {
  return useQuery({
    queryKey: ['catalog-item-prices', catalogItemId, 'history'],
    queryFn: () => listCatalogItemPrices(catalogItemId, { page: 1, limit: HISTORICO_POR_PAGINA }),
  });
}

export function useCurrentReferencePrice(catalogItemId: string) {
  return useQuery({
    queryKey: ['catalog-item-prices', catalogItemId, 'at-today'],
    queryFn: () => getCatalogItemPriceAt(catalogItemId),
  });
}

export function usePurchasePriceCandidates(catalogItemId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['catalog-item-prices', catalogItemId, 'purchase-candidates'],
    queryFn: () => listPurchasePriceCandidates(catalogItemId),
    enabled,
  });
}

/// Um preço novo muda o histórico, o vigente, a marca "já registrado" das
/// compras — e a SUGESTÃO do editor de composição. Composição já gravada não
/// é tocada: ela guarda o próprio preço.
function useInvalidar(catalogItemId: string) {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['catalog-item-prices', catalogItemId] });
    queryClient.invalidateQueries({ queryKey: ['compositions', 'catalog-options'] });
  };
}

export function useRegisterManualPrice(catalogItemId: string) {
  const invalidar = useInvalidar(catalogItemId);
  return useMutation({
    mutationFn: (input: ManualPriceInput) => registerManualPrice(catalogItemId, input),
    onSuccess: invalidar,
  });
}

export function useRegisterPurchasePrice(catalogItemId: string) {
  const invalidar = useInvalidar(catalogItemId);
  return useMutation({
    mutationFn: (purchaseOrderItemId: string) =>
      registerPurchasePrice(catalogItemId, purchaseOrderItemId),
    onSuccess: invalidar,
  });
}
