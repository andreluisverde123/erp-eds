import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateSystemSettings } from '../api';
import type { SystemSettingsInput } from '../types';

export function useUpdateSystemSettings() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: SystemSettingsInput) => updateSystemSettings(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-settings'] }),
  });
}
