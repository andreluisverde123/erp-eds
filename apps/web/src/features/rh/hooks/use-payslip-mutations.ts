import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createPayslip, deletePayslip, uploadPayslipAttachment } from '../api';
import type { PayslipInput } from '../types';

export function useCreatePayslip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PayslipInput) => createPayslip(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payslips'] }),
  });
}

export function useDeletePayslip() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePayslip(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payslips'] }),
  });
}

export function useUploadPayslipAttachment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, file }: { id: string; file: File }) => uploadPayslipAttachment(id, file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['payslips'] }),
  });
}
