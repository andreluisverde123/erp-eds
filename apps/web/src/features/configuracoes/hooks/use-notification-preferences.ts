import { useQuery } from '@tanstack/react-query';

import { listNotificationPreferences } from '../api';

export function useNotificationPreferences() {
  return useQuery({
    queryKey: ['notification-preferences'],
    queryFn: () => listNotificationPreferences(),
  });
}
