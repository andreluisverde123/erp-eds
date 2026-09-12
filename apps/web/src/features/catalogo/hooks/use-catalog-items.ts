import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createCatalogItem,
  deleteCatalogItem,
  listCatalogCategories,
  listCatalogItems,
  listMeasurementUnits,
  updateCatalogItem,
} from '../api';
import type { CatalogItemInput, CatalogItemQuery } from '../types';

export function useCatalogItems(query: CatalogItemQuery) {
  return useQuery({
    queryKey: ['catalog-items', query],
    queryFn: () => listCatalogItems(query),
  });
}

/// As unidades vêm da API, e não da lista do front, de propósito: é a MESMA
/// lista que o validador usa, então a tela nunca oferece um código que o
/// servidor recusa. `staleTime` alto porque a lista é fixa no build.
export function useMeasurementUnits() {
  return useQuery({
    queryKey: ['catalog-units'],
    queryFn: listMeasurementUnits,
    staleTime: Infinity,
  });
}

export function useCatalogCategories() {
  return useQuery({ queryKey: ['catalog-categories'], queryFn: listCatalogCategories });
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['catalog-items'] });
    // A categoria é derivada do que existe cadastrado — criar um insumo com
    // categoria nova precisa fazê-la aparecer no filtro.
    queryClient.invalidateQueries({ queryKey: ['catalog-categories'] });
  };
}

export function useCreateCatalogItem() {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: CatalogItemInput) => createCatalogItem(input),
    onSuccess: invalidate,
  });
}

export function useUpdateCatalogItem(id: string) {
  const invalidate = useInvalidate();
  return useMutation({
    mutationFn: (input: Partial<CatalogItemInput>) => updateCatalogItem(id, input),
    onSuccess: invalidate,
  });
}

export function useDeleteCatalogItem() {
  const invalidate = useInvalidate();
  return useMutation({ mutationFn: (id: string) => deleteCatalogItem(id), onSuccess: invalidate });
}
