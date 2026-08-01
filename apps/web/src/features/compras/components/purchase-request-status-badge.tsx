import { Badge } from '@repo/ui';

import { getRequestStatusBadgeVariant, getRequestStatusLabel } from '../purchase-request-status';
import type { PurchaseRequestStatus } from '../types';

export function PurchaseRequestStatusBadge({ status }: { status: PurchaseRequestStatus }) {
  return (
    <Badge variant={getRequestStatusBadgeVariant(status)}>{getRequestStatusLabel(status)}</Badge>
  );
}
