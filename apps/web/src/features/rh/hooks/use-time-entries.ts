import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listTimeEntries } from '../api';
import type { TimeEntryQuery } from '../types';

export function useTimeEntries(query: TimeEntryQuery) {
  return useQuery({
    queryKey: ['time-entries', 'list', query],
    queryFn: () => listTimeEntries(query),
    placeholderData: keepPreviousData,
  });
}
