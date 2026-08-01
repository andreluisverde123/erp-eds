import { Badge } from '@repo/ui';

import { getContractBadgeLabel, getContractBadgeVariant } from '../contract-badge';
import type { ContractBadgeStatus } from '../types';

export function ContractStatusBadge({ status }: { status: ContractBadgeStatus }) {
  return <Badge variant={getContractBadgeVariant(status)}>{getContractBadgeLabel(status)}</Badge>;
}
