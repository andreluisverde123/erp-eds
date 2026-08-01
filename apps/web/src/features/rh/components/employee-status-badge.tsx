import { Badge } from '@repo/ui';

import { getEmployeeStatusBadgeVariant, getEmployeeStatusLabel } from '../employee-status';
import type { EmployeeStatus } from '../types';

export function EmployeeStatusBadge({ status }: { status: EmployeeStatus }) {
  return (
    <Badge variant={getEmployeeStatusBadgeVariant(status)}>{getEmployeeStatusLabel(status)}</Badge>
  );
}
