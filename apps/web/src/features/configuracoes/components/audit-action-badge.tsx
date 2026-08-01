import { Badge } from '@repo/ui';

import { getAuditActionBadgeVariant, getAuditActionLabel } from '../audit-action';
import type { AuditAction } from '../types';

export function AuditActionBadge({ action }: { action: AuditAction }) {
  return <Badge variant={getAuditActionBadgeVariant(action)}>{getAuditActionLabel(action)}</Badge>;
}
