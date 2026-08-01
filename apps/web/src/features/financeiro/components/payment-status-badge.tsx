import { Badge } from '@repo/ui';

import { getPaymentStatusBadgeVariant, getPaymentStatusLabel } from '../payment-status';
import type { PaymentRecordStatus } from '../types';

export function PaymentStatusBadge({ status }: { status: PaymentRecordStatus }) {
  return (
    <Badge variant={getPaymentStatusBadgeVariant(status)}>{getPaymentStatusLabel(status)}</Badge>
  );
}
