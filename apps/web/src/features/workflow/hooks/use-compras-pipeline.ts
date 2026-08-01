import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getComprasPipelineDetail, listComprasPipeline } from '../api';

export function useComprasPipelineList(page: number) {
  return useQuery({
    queryKey: ['workflow', 'compras', 'list', page],
    queryFn: () => listComprasPipeline(page),
    placeholderData: keepPreviousData,
  });
}

export function useComprasPipelineDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['workflow', 'compras', 'detail', id],
    queryFn: () => getComprasPipelineDetail(id!),
    enabled: Boolean(id),
  });
}
