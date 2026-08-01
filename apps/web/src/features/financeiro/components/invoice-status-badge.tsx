import { Badge } from '@repo/ui';

import { getInvoiceStatusBadgeVariant, getInvoiceStatusLabel } from '../invoice-status';
import type { InvoiceStatus } from '../types';

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <Badge variant={getInvoiceStatusBadgeVariant(status)}>{getInvoiceStatusLabel(status)}</Badge>
  );
}
