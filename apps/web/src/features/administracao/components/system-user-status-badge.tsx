import { Badge } from '@repo/ui';

import { getUserStatusBadgeVariant, getUserStatusLabel } from '../user-status';
import type { UserStatus } from '../types';

export function SystemUserStatusBadge({ status }: { status: UserStatus }) {
  return <Badge variant={getUserStatusBadgeVariant(status)}>{getUserStatusLabel(status)}</Badge>;
}
