import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listContractDocuments } from '../api';
import type { ContractDocumentQuery } from '../types';

export function useContractDocuments(query: ContractDocumentQuery) {
  return useQuery({
    queryKey: ['contract-documents', 'list', query],
    queryFn: () => listContractDocuments(query),
    placeholderData: keepPreviousData,
  });
}
