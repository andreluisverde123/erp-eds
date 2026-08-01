import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateCompany, uploadCompanyLogo } from '../api';
import type { CompanyInput } from '../types';

export function useUpdateCompany() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: CompanyInput) => updateCompany(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company'] }),
  });
}

export function useUploadCompanyLogo() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (file: File) => uploadCompanyLogo(file),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['company'] }),
  });
}
