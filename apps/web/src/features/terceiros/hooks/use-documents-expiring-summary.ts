import { useQuery } from '@tanstack/react-query';

import { getDocumentsExpiringSummary } from '../api';

export function useDocumentsExpiringSummary() {
  return useQuery({
    queryKey: ['contract-documents', 'expiring-summary'],
    queryFn: () => getDocumentsExpiringSummary(),
  });
}
