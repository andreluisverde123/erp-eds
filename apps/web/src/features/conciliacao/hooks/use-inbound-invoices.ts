import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getInboundInvoice, getPurchaseOrderSuggestions, listInboundInvoices } from '../api';
import type { InboundInvoiceQuery } from '../types';

export function useInboundInvoices(query: InboundInvoiceQuery) {
  return useQuery({
    queryKey: ['inbound-invoices', 'list', query],
    queryFn: () => listInboundInvoices(query),
    placeholderData: keepPreviousData,
  });
}

export function useInboundInvoice(id: string | undefined) {
  return useQuery({
    queryKey: ['inbound-invoices', 'detail', id],
    queryFn: () => getInboundInvoice(id as string),
    enabled: Boolean(id),
  });
}

/// As sugestões dependem do estado das ordens de compra (quanto já foi
/// conciliado nelas), então não são cacheadas junto do detalhe da nota: uma
/// conciliação feita em outra aba muda o saldo em aberto das candidatas.
export function usePurchaseOrderSuggestions(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: ['inbound-invoices', 'suggestions', id],
    queryFn: () => getPurchaseOrderSuggestions(id as string),
    enabled: Boolean(id) && enabled,
  });
}
