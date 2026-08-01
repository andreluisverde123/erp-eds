import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  deleteAttachment,
  listAttachments,
  uploadAttachment,
  type AttachmentEntityType,
} from '../api';

function queryKey(entityType: AttachmentEntityType, entityId: string) {
  return ['attachments', entityType, entityId] as const;
}

export function useAttachments(entityType: AttachmentEntityType, entityId: string) {
  return useQuery({
    queryKey: queryKey(entityType, entityId),
    queryFn: () => listAttachments(entityType, entityId),
  });
}

export function useUploadAttachment(entityType: AttachmentEntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadAttachment(entityType, entityId, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey(entityType, entityId) }),
  });
}

export function useDeleteAttachment(entityType: AttachmentEntityType, entityId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteAttachment(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKey(entityType, entityId) }),
  });
}
