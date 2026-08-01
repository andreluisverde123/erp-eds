import { useQuery } from '@tanstack/react-query';

import { listPermissions } from '../api';

export function usePermissions() {
  return useQuery({ queryKey: ['permissions'], queryFn: () => listPermissions() });
}
