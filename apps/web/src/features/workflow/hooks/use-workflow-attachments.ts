import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { listWorkflowAttachments, uploadWorkflowAttachment } from '../api';
import type { WorkflowEntityType } from '../types';

export function useWorkflowAttachments(entityType: WorkflowEntityType, entityId: string) {
  return useQuery({
    queryKey: ['workflow', 'attachments', entityType, entityId],
    queryFn: () => listWorkflowAttachments(entityType, entityId),
  });
}

export function useWorkflowAttachmentUpload(entityType: WorkflowEntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadWorkflowAttachment(entityType, entityId, file),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ['workflow', 'attachments', entityType, entityId],
      });
    },
  });
}
