import { apiClient } from '@/lib/api-client';

/// Registros que aceitam anexo. Espelha `attachment-entities.ts` no backend —
/// a lista lá é a que manda; esta existe para o TypeScript pegar erro de
/// digitação antes de virar 404.
export type AttachmentEntityType =
  | 'ConstructionSite'
  | 'PurchaseRequest'
  | 'PurchaseOrder'
  | 'Supplier'
  | 'Invoice'
  | 'AccountPayable'
  | 'Payment'
  | 'Employee'
  | 'Contractor'
  | 'ContractorContract';

export interface Attachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
  uploadedBy: { id: string; name: string } | null;
}

export function listAttachments(
  entityType: AttachmentEntityType,
  entityId: string,
): Promise<Attachment[]> {
  return apiClient.get<Attachment[]>(`/attachments/${entityType}/${entityId}`);
}

export function uploadAttachment(
  entityType: AttachmentEntityType,
  entityId: string,
  file: File,
): Promise<Attachment> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.post<Attachment>(`/attachments/${entityType}/${entityId}`, formData);
}

export function deleteAttachment(id: string): Promise<void> {
  return apiClient.delete<void>(`/attachments/${id}`);
}
