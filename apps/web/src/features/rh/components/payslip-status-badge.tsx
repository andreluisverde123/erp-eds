import { Badge } from '@repo/ui';

import { getPayslipStatusBadgeVariant, getPayslipStatusLabel } from '../payslip-status';
import type { PayslipStatus } from '../types';

export function PayslipStatusBadge({ status }: { status: PayslipStatus }) {
  return (
    <Badge variant={getPayslipStatusBadgeVariant(status)}>{getPayslipStatusLabel(status)}</Badge>
  );
}
