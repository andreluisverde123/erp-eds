import { useQuery } from '@tanstack/react-query';

import { getCompany } from '../api';

export function useCompany() {
  return useQuery({ queryKey: ['company'], queryFn: () => getCompany() });
}
