import { Badge } from '@repo/ui';

import { getUserStatusBadgeVariant, getUserStatusLabel } from '../user-status';

export function UserStatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <Badge variant={getUserStatusBadgeVariant(isActive)}>{getUserStatusLabel(isActive)}</Badge>
  );
}
