import { useMutation } from '@tanstack/react-query';

import { downloadReportExport } from '../api';
import type { ReportQuery, ReportType } from '../types';

export function useReportExport() {
  return useMutation({
    mutationFn: ({
      type,
      query,
      format,
    }: {
      type: ReportType;
      query: ReportQuery;
      format: 'xlsx' | 'pdf';
    }) => downloadReportExport(type, query, format),
  });
}
