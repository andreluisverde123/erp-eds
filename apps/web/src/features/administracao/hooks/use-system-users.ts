import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listSystemUsers } from '../api';
import type { SystemUserQuery } from '../types';

export function useSystemUsers(query: SystemUserQuery) {
  return useQuery({
    queryKey: ['admin-users', 'list', query],
    queryFn: () => listSystemUsers(query),
    placeholderData: keepPreviousData,
  });
}
