import { useQuery } from '@tanstack/react-query';

import { listEntityHistory } from '../api';

export function useEntityHistory(entityType: string, entityId: string | undefined) {
  return useQuery({
    queryKey: ['history', entityType, entityId],
    queryFn: () => listEntityHistory(entityType, entityId as string),
    enabled: Boolean(entityId),
  });
}
