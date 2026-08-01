import { useMutation, useQueryClient } from '@tanstack/react-query';

import {
  createPurchaseRequest,
  deletePurchaseRequest,
  updatePurchaseRequest,
  updatePurchaseRequestQuote,
  updatePurchaseRequestStatus,
} from '../api';
import type {
  PurchaseRequestInput,
  PurchaseRequestQuoteInput,
  PurchaseRequestStatus,
} from '../types';

export function useCreatePurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PurchaseRequestInput) => createPurchaseRequest(input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

export function useUpdatePurchaseRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: Partial<PurchaseRequestInput>) => updatePurchaseRequest(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

export function useUpdatePurchaseRequestQuote(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: PurchaseRequestQuoteInput) => updatePurchaseRequestQuote(id, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

export function useUpdatePurchaseRequestStatus(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (status: PurchaseRequestStatus) => updatePurchaseRequestStatus(id, status),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}

export function useDeletePurchaseRequest() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deletePurchaseRequest(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['purchase-requests'] }),
  });
}
