import { useMutation, useQueryClient } from '@tanstack/react-query';

import { updateNotificationPreference } from '../api';
import type { NotificationPreferenceInput } from '../types';

export function useUpdateNotificationPreference() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ eventKey, input }: { eventKey: string; input: NotificationPreferenceInput }) =>
      updateNotificationPreference(eventKey, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notification-preferences'] }),
  });
}
