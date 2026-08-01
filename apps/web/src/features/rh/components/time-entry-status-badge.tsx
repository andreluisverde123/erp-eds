import { Badge } from '@repo/ui';

import { getTimeEntryStatusBadgeVariant, getTimeEntryStatusLabel } from '../time-entry-status';
import type { TimeEntryStatus } from '../types';

export function TimeEntryStatusBadge({ status }: { status: TimeEntryStatus }) {
  return (
    <Badge variant={getTimeEntryStatusBadgeVariant(status)}>
      {getTimeEntryStatusLabel(status)}
    </Badge>
  );
}
