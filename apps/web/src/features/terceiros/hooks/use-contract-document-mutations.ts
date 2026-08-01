import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createContractDocument,
  deleteContractDocument,
  uploadContractDocumentAttachment,
} from '../api';
import type { ContractDocumentInput } from '../types';

export function useCreateContractDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ContractDocumentInput) => createContractDocument(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract-documents'] }),
  });
}

export function useDeleteContractDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteContractDocument(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract-documents'] }),
  });
}

export function useUploadContractDocumentAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) =>
      uploadContractDocumentAttachment(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['contract-documents'] }),
  });
}
