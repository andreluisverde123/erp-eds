import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getRhPipelineDetail, listRhPipeline } from '../api';

export function useRhPipelineList(page: number) {
  return useQuery({
    queryKey: ['workflow', 'rh', 'list', page],
    queryFn: () => listRhPipeline(page),
    placeholderData: keepPreviousData,
  });
}

export function useRhPipelineDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['workflow', 'rh', 'detail', id],
    queryFn: () => getRhPipelineDetail(id!),
    enabled: Boolean(id),
  });
}
