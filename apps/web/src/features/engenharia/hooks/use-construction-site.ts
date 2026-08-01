import { useQuery } from '@tanstack/react-query';

import { getConstructionSite } from '../api';

export function useConstructionSite(id: string | undefined) {
  return useQuery({
    queryKey: ['construction-sites', 'detail', id],
    queryFn: () => getConstructionSite(id!),
    enabled: Boolean(id),
  });
}
