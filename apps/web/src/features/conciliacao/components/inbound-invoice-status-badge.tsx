import { Badge } from '@repo/ui';

import {
  getInboundInvoiceStatusBadgeVariant,
  getInboundInvoiceStatusLabel,
} from '../inbound-invoice-status';
import type { InboundInvoiceStatus } from '../types';

export function InboundInvoiceStatusBadge({ status }: { status: InboundInvoiceStatus }) {
  return (
    <Badge variant={getInboundInvoiceStatusBadgeVariant(status)}>
      {getInboundInvoiceStatusLabel(status)}
    </Badge>
  );
}
