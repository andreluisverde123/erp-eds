import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { listPayslips } from '../api';
import type { PayslipQuery } from '../types';

export function usePayslips(query: PayslipQuery) {
  return useQuery({
    queryKey: ['payslips', 'list', query],
    queryFn: () => listPayslips(query),
    placeholderData: keepPreviousData,
  });
}
