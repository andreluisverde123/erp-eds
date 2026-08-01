import { Badge } from '@repo/ui';

import {
  getAccountPayableStatusBadgeVariant,
  getAccountPayableStatusLabel,
} from '../account-payable-status';
import type { AccountPayableStatus } from '../types';

export function AccountPayableStatusBadge({ status }: { status: AccountPayableStatus }) {
  return (
    <Badge variant={getAccountPayableStatusBadgeVariant(status)}>
      {getAccountPayableStatusLabel(status)}
    </Badge>
  );
}
