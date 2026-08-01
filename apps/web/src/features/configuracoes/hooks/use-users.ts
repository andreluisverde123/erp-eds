import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listUsers } from '../api';
import type { UserQuery } from '../types';

export function useUsers(query: UserQuery) {
  return useQuery({
    queryKey: ['configuracoes-users', 'list', query],
    queryFn: () => listUsers(query),
    placeholderData: keepPreviousData,
  });
}
