import { useQuery } from '@tanstack/react-query';

import { getContractsExpiringSummary } from '../api';

export function useContractsExpiringSummary(options: { enabled?: boolean } = {}) {
  return useQuery({
    queryKey: ['contracts', 'expiring-summary'],
    queryFn: () => getContractsExpiringSummary(),
    enabled: options.enabled ?? true,
  });
}
