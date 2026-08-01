import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createWorkflowComment } from '../api';
import type { WorkflowEntityType } from '../types';

export function useWorkflowCommentMutation(entityType: WorkflowEntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (body: string) => createWorkflowComment({ entityType, entityId, body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', 'comments', entityType, entityId] });
    },
  });
}
