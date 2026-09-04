import { Badge } from '@repo/ui';

import { getRequestDisplayStatus } from '../purchase-request-status';
import type { FulfillmentStatus, PurchaseRequestStatus } from '../types';

/// A etiqueta da solicitação.
///
/// `fulfillment` é OPCIONAL de propósito: onde ele não chega (uma tela que só
/// tenha o status em mãos), a etiqueta volta a ser a de sempre em vez de
/// quebrar. Onde chega, uma solicitação aprovada com itens pendentes passa a
/// se anunciar como "Parcialmente atendida" — ver `getRequestDisplayStatus`.
export function PurchaseRequestStatusBadge({
  status,
  fulfillment,
}: {
  status: PurchaseRequestStatus;
  fulfillment?: { status: FulfillmentStatus };
}) {
  const { label, variant } = getRequestDisplayStatus(status, fulfillment);

  return <Badge variant={variant}>{label}</Badge>;
}
