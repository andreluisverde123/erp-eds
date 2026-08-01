import { Badge } from '@repo/ui';

import { getOrderStatusBadgeVariant, getOrderStatusLabel } from '../purchase-order-status';
import type { PurchaseOrderStatus } from '../types';

export function PurchaseOrderStatusBadge({ status }: { status: PurchaseOrderStatus }) {
  return <Badge variant={getOrderStatusBadgeVariant(status)}>{getOrderStatusLabel(status)}</Badge>;
}
