import { useQuery } from '@tanstack/react-query';

import { getExecutiveSummary } from '../api';

export function useExecutiveSummary() {
  return useQuery({
    queryKey: ['relatorios', 'dashboard-summary'],
    queryFn: () => getExecutiveSummary(),
  });
}
