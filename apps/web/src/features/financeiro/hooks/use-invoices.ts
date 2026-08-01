import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listInvoices } from '../api';
import type { InvoiceQuery } from '../types';

export function useInvoices(query: InvoiceQuery) {
  return useQuery({
    queryKey: ['invoices', 'list', query],
    queryFn: () => listInvoices(query),
    placeholderData: keepPreviousData,
  });
}
