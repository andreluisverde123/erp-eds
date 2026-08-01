import { useMutation, useQueryClient } from '@tanstack/react-query';

import { apiClient } from '@/lib/api-client';

import { updateInvoiceStatus } from '@/features/financeiro/api';
import { createPayment } from '@/features/financeiro/api';
import { updateEmployee } from '@/features/rh/api';

import { createWorkflowEvent } from '../api';

/// As 4 ações que a tela de workflow oferece pra estágios que hoje não têm
/// nenhuma tela própria — cada uma chama o endpoint já existente e intocado
/// pra fazer a mutação real, e só depois registra o evento novo (porque os
/// services donos dessas entidades não gravam em AuditLog hoje).

export function useMarkPurchaseOrderReceived(purchaseRequestId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (purchaseOrderId: string) => {
      await apiClient.patch(`/purchase-orders/${purchaseOrderId}`, { status: 'RECEIVED' });
      await createWorkflowEvent({
        entityType: 'PurchaseOrder',
        entityId: purchaseOrderId,
        changes: { status: { to: 'RECEIVED' } },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', 'compras'] });
      queryClient.invalidateQueries({
        queryKey: ['workflow', 'compras', 'detail', purchaseRequestId],
      });
    },
  });
}

export function useValidateInvoice(invoiceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      await updateInvoiceStatus(invoiceId, 'VALIDATED');
      await createWorkflowEvent({
        entityType: 'Invoice',
        entityId: invoiceId,
        changes: { status: { to: 'VALIDATED' } },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', 'financeiro'] });
    },
  });
}

export function useRegisterBaixa(invoiceId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      accountPayableId,
      amount,
    }: {
      accountPayableId: string;
      amount: number;
    }) => {
      await createPayment({
        accountPayableId,
        amount,
        paidAt: new Date().toISOString().slice(0, 10),
        status: 'PAID',
      });
      await createWorkflowEvent({
        entityType: 'AccountPayable',
        entityId: accountPayableId,
        changes: { status: { to: 'PAID' } },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', 'financeiro'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', 'financeiro', 'detail', invoiceId] });
    },
  });
}

export function useRegisterDesligamento(employeeId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (terminationDate: string) => {
      await updateEmployee(employeeId, { status: 'TERMINATED', terminationDate });
      await createWorkflowEvent({
        entityType: 'Employee',
        entityId: employeeId,
        changes: { status: { to: 'TERMINATED' } },
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workflow', 'rh'] });
      queryClient.invalidateQueries({ queryKey: ['workflow', 'rh', 'detail', employeeId] });
    },
  });
}
