import { Badge } from '@repo/ui';

import { getContractorStatusBadgeVariant, getContractorStatusLabel } from '../contractor-status';
import type { ContractorStatus } from '../types';

export function ContractorStatusBadge({ status }: { status: ContractorStatus }) {
  return (
    <Badge variant={getContractorStatusBadgeVariant(status)}>
      {getContractorStatusLabel(status)}
    </Badge>
  );
}
