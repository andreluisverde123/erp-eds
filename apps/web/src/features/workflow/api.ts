import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  ComprasPipelineDetail,
  ComprasPipelineListRow,
  FinanceiroPipelineDetail,
  FinanceiroPipelineListRow,
  PaginatedResult,
  RhPipelineDetail,
  RhPipelineListRow,
  WorkflowAttachment,
  WorkflowComment,
  WorkflowEntityType,
} from './types';

export function listComprasPipeline(
  page: number,
): Promise<PaginatedResult<ComprasPipelineListRow>> {
  return apiClient.get(`/workflow/compras${toQueryString({ page, limit: 20 })}`);
}

export function getComprasPipelineDetail(id: string): Promise<ComprasPipelineDetail> {
  return apiClient.get(`/workflow/compras/${id}`);
}

export function listFinanceiroPipeline(
  page: number,
): Promise<PaginatedResult<FinanceiroPipelineListRow>> {
  return apiClient.get(`/workflow/financeiro${toQueryString({ page, limit: 20 })}`);
}

export function getFinanceiroPipelineDetail(id: string): Promise<FinanceiroPipelineDetail> {
  return apiClient.get(`/workflow/financeiro/${id}`);
}

export function listRhPipeline(page: number): Promise<PaginatedResult<RhPipelineListRow>> {
  return apiClient.get(`/workflow/rh${toQueryString({ page, limit: 20 })}`);
}

export function getRhPipelineDetail(id: string): Promise<RhPipelineDetail> {
  return apiClient.get(`/workflow/rh/${id}`);
}

export function createWorkflowEvent(input: {
  entityType: WorkflowEntityType;
  entityId: string;
  changes?: Record<string, unknown>;
}): Promise<{ success: boolean }> {
  return apiClient.post('/workflow/events', input);
}

export function listWorkflowComments(
  entityType: WorkflowEntityType,
  entityId: string,
): Promise<WorkflowComment[]> {
  return apiClient.get(`/workflow/comments${toQueryString({ entityType, entityId })}`);
}

export function createWorkflowComment(input: {
  entityType: WorkflowEntityType;
  entityId: string;
  body: string;
}): Promise<WorkflowComment> {
  return apiClient.post('/workflow/comments', input);
}

export function listWorkflowAttachments(
  entityType: WorkflowEntityType,
  entityId: string,
): Promise<WorkflowAttachment[]> {
  return apiClient.get(`/workflow/attachments/${entityType}/${entityId}`);
}

export function uploadWorkflowAttachment(
  entityType: WorkflowEntityType,
  entityId: string,
  file: File,
): Promise<WorkflowAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.upload(`/workflow/attachments/${entityType}/${entityId}`, formData);
}
