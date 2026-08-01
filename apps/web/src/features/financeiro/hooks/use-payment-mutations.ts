import { useMutation, useQueryClient } from '@tanstack/react-query';

import { createPayment } from '../api';
import type { PaymentInput } from '../types';

export function useCreatePayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PaymentInput) => createPayment(input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      // Um pagamento recalcula o status (e o saldo) da conta a pagar.
      queryClient.invalidateQueries({ queryKey: ['account-payables'] });
    },
  });
}
