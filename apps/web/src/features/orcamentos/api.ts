import { apiClient } from '@/lib/api-client';
import { downloadFile } from '@/lib/download-file';
import { toQueryString } from '@/lib/query-string';

import type {
  Budget,
  BudgetBdiInput,
  BudgetImportPreview,
  BudgetInput,
  BudgetItemInput,
  BudgetItemUpdate,
  BudgetQuery,
  BudgetSummary,
  BudgetVersion,
  CatalogOption,
  CompositionOption,
  ConstructionSiteOption,
  PaginatedResult,
  ReferenceDatasetOption,
  ReferenceOption,
} from './types';

export function listBudgets(query: BudgetQuery): Promise<PaginatedResult<BudgetSummary>> {
  return apiClient.get(`/budgets${toQueryString(query)}`);
}

export function getBudget(id: string): Promise<Budget> {
  return apiClient.get(`/budgets/${id}`);
}

export function createBudget(input: BudgetInput): Promise<Budget> {
  return apiClient.post('/budgets', input);
}

export function updateBudget(id: string, input: Partial<BudgetInput> | BudgetBdiInput): Promise<Budget> {
  return apiClient.patch(`/budgets/${id}`, input);
}

export function deleteBudget(id: string): Promise<void> {
  return apiClient.delete(`/budgets/${id}`);
}

export function closeBudget(id: string): Promise<Budget> {
  return apiClient.post(`/budgets/${id}/close`, {});
}

/// Nova versão (rascunho) a partir de um orçamento fechado.
export function reviseBudget(id: string): Promise<Budget> {
  return apiClient.post(`/budgets/${id}/revisions`, {});
}

export function listBudgetVersions(id: string): Promise<BudgetVersion[]> {
  return apiClient.get(`/budgets/${id}/versions`);
}

export function setOfficialBudget(id: string): Promise<Budget> {
  return apiClient.post(`/budgets/${id}/official`, {});
}

export function downloadBudgetExport(budget: Pick<Budget, 'id' | 'code' | 'version'>, format: 'xlsx' | 'pdf') {
  return downloadFile(`/budgets/${budget.id}/export?format=${format}`, `${budget.code}-v${budget.version}.${format}`);
}

export function downloadBudgetImportTemplate() {
  return downloadFile('/budgets/import-template', 'modelo-importacao-orcamento.xlsx');
}

function formularioDeImportacao(file: File, extra: Record<string, string | undefined>): FormData {
  const formulario = new FormData();
  formulario.append('file', file);
  for (const [campo, valor] of Object.entries(extra)) if (valor) formulario.append(campo, valor);
  return formulario;
}

export function previewBudgetImport(
  budgetId: string,
  file: File,
  referenceDatasetId?: string,
): Promise<BudgetImportPreview> {
  return apiClient.upload(`/budgets/${budgetId}/import/preview`, formularioDeImportacao(file, { referenceDatasetId }));
}

export function importBudget(
  budgetId: string,
  file: File,
  fileHash: string,
  referenceDatasetId?: string,
): Promise<Budget> {
  return apiClient.upload(`/budgets/${budgetId}/import`, formularioDeImportacao(file, { referenceDatasetId, fileHash }));
}

export function listConstructionSiteOptions(): Promise<ConstructionSiteOption[]> {
  return apiClient.get('/budgets/construction-site-options');
}

export function searchBudgetCompositionOptions(
  budgetId: string,
  search: string,
): Promise<CompositionOption[]> {
  return apiClient.get(`/budgets/${budgetId}/composition-options${toQueryString({ search })}`);
}

export function searchBudgetCatalogOptions(
  budgetId: string,
  search: string,
): Promise<CatalogOption[]> {
  return apiClient.get(`/budgets/${budgetId}/catalog-options${toQueryString({ search })}`);
}

export function listBudgetReferenceDatasetOptions(budgetId: string): Promise<ReferenceDatasetOption[]> {
  return apiClient.get(`/budgets/${budgetId}/reference-dataset-options`);
}

export function searchBudgetReferenceOptions(
  budgetId: string,
  datasetId: string,
  kind: 'ITEM' | 'COMPOSITION',
  search: string,
): Promise<ReferenceOption[]> {
  return apiClient.get(`/budgets/${budgetId}/reference-options${toQueryString({ datasetId, kind, search })}`);
}

export function addBudgetNode(
  budgetId: string,
  input: { name: string; parentId?: string },
): Promise<Budget> {
  return apiClient.post(`/budgets/${budgetId}/nodes`, input);
}

export function updateBudgetNode(
  budgetId: string,
  nodeId: string,
  input: { name: string },
): Promise<Budget> {
  return apiClient.patch(`/budgets/${budgetId}/nodes/${nodeId}`, input);
}

export function moveBudgetNode(
  budgetId: string,
  nodeId: string,
  direction: 'UP' | 'DOWN',
): Promise<Budget> {
  return apiClient.post(`/budgets/${budgetId}/nodes/${nodeId}/move`, { direction });
}

export function removeBudgetNode(budgetId: string, nodeId: string): Promise<Budget | undefined> {
  return apiClient.delete(`/budgets/${budgetId}/nodes/${nodeId}`);
}

export function addBudgetItem(budgetId: string, input: BudgetItemInput): Promise<Budget> {
  return apiClient.post(`/budgets/${budgetId}/items`, input);
}

export function updateBudgetItem(
  budgetId: string,
  itemId: string,
  input: BudgetItemUpdate,
): Promise<Budget> {
  return apiClient.patch(`/budgets/${budgetId}/items/${itemId}`, input);
}

export function removeBudgetItem(budgetId: string, itemId: string): Promise<Budget | undefined> {
  return apiClient.delete(`/budgets/${budgetId}/items/${itemId}`);
}
