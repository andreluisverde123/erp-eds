import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listRoles } from '../api';
import type { RoleQuery } from '../types';

export function useRoles(query: RoleQuery) {
  return useQuery({
    queryKey: ['roles', 'list', query],
    queryFn: () => listRoles(query),
    placeholderData: keepPreviousData,
  });
}
