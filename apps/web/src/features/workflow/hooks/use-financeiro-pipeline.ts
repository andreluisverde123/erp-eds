import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getFinanceiroPipelineDetail, listFinanceiroPipeline } from '../api';

export function useFinanceiroPipelineList(page: number) {
  return useQuery({
    queryKey: ['workflow', 'financeiro', 'list', page],
    queryFn: () => listFinanceiroPipeline(page),
    placeholderData: keepPreviousData,
  });
}

export function useFinanceiroPipelineDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['workflow', 'financeiro', 'detail', id],
    queryFn: () => getFinanceiroPipelineDetail(id!),
    enabled: Boolean(id),
  });
}
