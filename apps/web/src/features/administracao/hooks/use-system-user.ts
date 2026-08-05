import { useQuery } from '@tanstack/react-query';

import { getSystemUser } from '../api';

export function useSystemUser(id: string | undefined) {
  return useQuery({
    queryKey: ['admin-users', 'detail', id],
    queryFn: () => getSystemUser(id as string),
    enabled: Boolean(id),
  });
}
