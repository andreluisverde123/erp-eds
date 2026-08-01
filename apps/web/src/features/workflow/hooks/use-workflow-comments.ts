import { useQuery } from '@tanstack/react-query';

import { listWorkflowComments } from '../api';
import type { WorkflowEntityType } from '../types';

export function useWorkflowComments(entityType: WorkflowEntityType, entityId: string) {
  return useQuery({
    queryKey: ['workflow', 'comments', entityType, entityId],
    queryFn: () => listWorkflowComments(entityType, entityId),
  });
}
