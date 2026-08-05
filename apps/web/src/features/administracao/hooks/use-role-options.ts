import { useQuery } from '@tanstack/react-query';

import { listRoleOptions } from '../api';

/// Perfis para o Select do formulário e para o filtro da listagem.
export function useRoleOptions() {
  return useQuery({
    queryKey: ['admin-users', 'role-options'],
    queryFn: listRoleOptions,
  });
}
