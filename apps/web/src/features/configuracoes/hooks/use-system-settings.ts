import { useQuery } from '@tanstack/react-query';

import { getSystemSettings } from '../api';

export function useSystemSettings() {
  return useQuery({ queryKey: ['system-settings'], queryFn: () => getSystemSettings() });
}
