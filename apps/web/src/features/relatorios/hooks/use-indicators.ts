import { useQuery } from '@tanstack/react-query';

import {
  getComprasIndicators,
  getEngenhariaIndicators,
  getFinanceiroIndicators,
  getRhIndicators,
  getTerceirosIndicators,
} from '../api';

export function useComprasIndicators() {
  return useQuery({
    queryKey: ['relatorios', 'indicators', 'compras'],
    queryFn: () => getComprasIndicators(),
  });
}

export function useFinanceiroIndicators() {
  return useQuery({
    queryKey: ['relatorios', 'indicators', 'financeiro'],
    queryFn: () => getFinanceiroIndicators(),
  });
}

export function useEngenhariaIndicators() {
  return useQuery({
    queryKey: ['relatorios', 'indicators', 'engenharia'],
    queryFn: () => getEngenhariaIndicators(),
  });
}

export function useRhIndicators() {
  return useQuery({
    queryKey: ['relatorios', 'indicators', 'rh'],
    queryFn: () => getRhIndicators(),
  });
}

export function useTerceirosIndicators() {
  return useQuery({
    queryKey: ['relatorios', 'indicators', 'terceiros'],
    queryFn: () => getTerceirosIndicators(),
  });
}
