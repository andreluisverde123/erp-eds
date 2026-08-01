import { useQuery } from '@tanstack/react-query';

import { getAccountPayableSummary } from '../api';

export function useAccountPayableSummary() {
  return useQuery({
    queryKey: ['account-payables', 'summary'],
    queryFn: () => getAccountPayableSummary(),
  });
}
