import { Badge } from '@repo/ui';

import { getStatusBadgeVariant, getStatusLabel } from '../construction-site-status';
import type { ConstructionStatus } from '../types';

export function ConstructionSiteStatusBadge({ status }: { status: ConstructionStatus }) {
  return <Badge variant={getStatusBadgeVariant(status)}>{getStatusLabel(status)}</Badge>;
}
