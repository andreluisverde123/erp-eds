import { Badge } from '@repo/ui';

import { getDocumentBadgeLabel, getDocumentBadgeVariant } from '../document-badge';
import type { DocumentBadgeStatus } from '../types';

export function DocumentStatusBadge({ status }: { status: DocumentBadgeStatus }) {
  return <Badge variant={getDocumentBadgeVariant(status)}>{getDocumentBadgeLabel(status)}</Badge>;
}
