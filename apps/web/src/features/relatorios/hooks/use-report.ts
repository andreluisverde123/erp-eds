import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { getReport } from '../api';
import type { ReportQuery, ReportType } from '../types';

export function useReport<T>(type: ReportType, query: ReportQuery) {
  return useQuery({
    queryKey: ['relatorios', 'report', type, query],
    queryFn: () => getReport<T>(type, query),
    placeholderData: keepPreviousData,
  });
}
