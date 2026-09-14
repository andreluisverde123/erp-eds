import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  addBudgetItem,
  addBudgetNode,
  closeBudget,
  createBudget,
  deleteBudget,
  getBudget,
  importBudget,
  listBudgetReferenceDatasetOptions,
  listBudgets,
  listBudgetVersions,
  listConstructionSiteOptions,
  moveBudgetNode,
  removeBudgetItem,
  removeBudgetNode,
  reviseBudget,
  setOfficialBudget,
  updateBudget,
  updateBudgetItem,
  updateBudgetNode,
} from '../api';
import type {
  Budget,
  BudgetBdiInput,
  BudgetInput,
  BudgetItemInput,
  BudgetItemUpdate,
  BudgetQuery,
} from '../types';

export function useBudgets(query: BudgetQuery) {
  return useQuery({ queryKey: ['budgets', query], queryFn: () => listBudgets(query) });
}

export function useBudget(id: string) {
  return useQuery({ queryKey: ['budget', id], queryFn: () => getBudget(id), enabled: Boolean(id) });
}

export function useBudgetVersions(id: string) {
  return useQuery({
    queryKey: ['budget', id, 'versions'],
    queryFn: () => listBudgetVersions(id),
    enabled: Boolean(id),
  });
}

export function useBudgetReferenceDatasetOptions(budgetId: string, enabled = true) {
  return useQuery({
    queryKey: ['budget', budgetId, 'reference-dataset-options'],
    queryFn: () => listBudgetReferenceDatasetOptions(budgetId),
    enabled: enabled && Boolean(budgetId),
  });
}

export function useConstructionSiteOptions(enabled = true) {
  return useQuery({
    queryKey: ['budgets', 'construction-site-options'],
    queryFn: listConstructionSiteOptions,
    enabled,
  });
}

/// Toda escrita devolve o orçamento inteiro, com EAP e totais recalculados:
/// ele vira o cache do detalhe. A listagem é recarregada porque mostra o total.
function useRefresh() {
  const queryClient = useQueryClient();
  return (budgetId: string, orcamento?: Budget | void) => {
    if (orcamento) queryClient.setQueryData(['budget', budgetId], orcamento);
    else queryClient.invalidateQueries({ queryKey: ['budget', budgetId] });
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
  };
}

export function useCreateBudget() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: BudgetInput) => createBudget(input),
    onSuccess: (orcamento) => refresh(orcamento.id, orcamento),
  });
}

export function useUpdateBudget(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: Partial<BudgetInput>) => updateBudget(budgetId, input),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useUpdateBudgetBdi(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: BudgetBdiInput) => updateBudget(budgetId, input),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useDeleteBudget() {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (id: string) => deleteBudget(id),
    onSuccess: (_, id) => refresh(id),
  });
}

export function useCloseBudget(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => closeBudget(budgetId),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

/// A revisão devolve a NOVA versão; a lista de versões das duas muda.
export function useReviseBudget(budgetId: string) {
  const queryClient = useQueryClient();
  const refresh = useRefresh();
  return useMutation({
    mutationFn: () => reviseBudget(budgetId),
    onSuccess: (novaVersao) => {
      refresh(novaVersao.id, novaVersao);
      queryClient.invalidateQueries({ queryKey: ['budget', budgetId] });
    },
  });
}

/// Trocar o oficial muda o selo de outras versões da mesma obra.
export function useSetOfficialBudget(budgetId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => setOfficialBudget(budgetId),
    onSuccess: (orcamento) => {
      queryClient.invalidateQueries({ queryKey: ['budget'] });
      queryClient.invalidateQueries({ queryKey: ['budgets'] });
      queryClient.setQueryData(['budget', budgetId], orcamento);
    },
  });
}

export function useImportBudget(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ file, fileHash, referenceDatasetId }: { file: File; fileHash: string; referenceDatasetId?: string }) =>
      importBudget(budgetId, file, fileHash, referenceDatasetId),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useAddBudgetNode(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: { name: string; parentId?: string }) => addBudgetNode(budgetId, input),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useUpdateBudgetNode(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ nodeId, name }: { nodeId: string; name: string }) =>
      updateBudgetNode(budgetId, nodeId, { name }),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useMoveBudgetNode(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ nodeId, direction }: { nodeId: string; direction: 'UP' | 'DOWN' }) =>
      moveBudgetNode(budgetId, nodeId, direction),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useRemoveBudgetNode(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (nodeId: string) => removeBudgetNode(budgetId, nodeId),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useAddBudgetItem(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (input: BudgetItemInput) => addBudgetItem(budgetId, input),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useUpdateBudgetItem(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: ({ itemId, input }: { itemId: string; input: BudgetItemUpdate }) =>
      updateBudgetItem(budgetId, itemId, input),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}

export function useRemoveBudgetItem(budgetId: string) {
  const refresh = useRefresh();
  return useMutation({
    mutationFn: (itemId: string) => removeBudgetItem(budgetId, itemId),
    onSuccess: (orcamento) => refresh(budgetId, orcamento),
  });
}
