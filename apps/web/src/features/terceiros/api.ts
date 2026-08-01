import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  Contract,
  ContractDocument,
  ContractDocumentInput,
  ContractDocumentQuery,
  ContractEmployee,
  ContractEmployeeInput,
  ContractEmployeeQuery,
  ContractExpiringSummary,
  ContractInput,
  ContractQuery,
  Contractor,
  ContractorInput,
  ContractorQuery,
  DocumentExpiringSummary,
  PaginatedResult,
} from './types';

export function listContractors(query: ContractorQuery): Promise<PaginatedResult<Contractor>> {
  return apiClient.get(`/contractors${toQueryString(query)}`);
}

export function createContractor(input: ContractorInput): Promise<Contractor> {
  return apiClient.post('/contractors', input);
}

export function updateContractor(id: string, input: Partial<ContractorInput>): Promise<Contractor> {
  return apiClient.patch(`/contractors/${id}`, input);
}

export function deleteContractor(id: string): Promise<void> {
  return apiClient.delete(`/contractors/${id}`);
}

export function listContracts(query: ContractQuery): Promise<PaginatedResult<Contract>> {
  return apiClient.get(`/contracts${toQueryString(query)}`);
}

export function getContractsExpiringSummary(): Promise<ContractExpiringSummary> {
  return apiClient.get('/contracts/expiring-summary');
}

export function createContract(input: ContractInput): Promise<Contract> {
  return apiClient.post('/contracts', input);
}

export function updateContract(id: string, input: Partial<ContractInput>): Promise<Contract> {
  return apiClient.patch(`/contracts/${id}`, input);
}

export function cancelContract(id: string): Promise<Contract> {
  return apiClient.patch(`/contracts/${id}/status`, { status: 'CANCELLED' });
}

export function deleteContract(id: string): Promise<void> {
  return apiClient.delete(`/contracts/${id}`);
}

export function listContractDocuments(
  query: ContractDocumentQuery,
): Promise<PaginatedResult<ContractDocument>> {
  return apiClient.get(`/contract-documents${toQueryString(query)}`);
}

export function getDocumentsExpiringSummary(): Promise<DocumentExpiringSummary> {
  return apiClient.get('/contract-documents/expiring-summary');
}

export function createContractDocument(input: ContractDocumentInput): Promise<ContractDocument> {
  return apiClient.post('/contract-documents', input);
}

export function deleteContractDocument(id: string): Promise<void> {
  return apiClient.delete(`/contract-documents/${id}`);
}

export function uploadContractDocumentAttachment(
  id: string,
  file: File,
): Promise<ContractDocument> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.upload(`/contract-documents/${id}/attachment`, formData);
}

export function listContractEmployees(
  query: ContractEmployeeQuery,
): Promise<PaginatedResult<ContractEmployee>> {
  return apiClient.get(`/contract-employees${toQueryString(query)}`);
}

export function createContractEmployee(input: ContractEmployeeInput): Promise<ContractEmployee> {
  return apiClient.post('/contract-employees', input);
}

export function updateContractEmployee(
  id: string,
  input: Partial<ContractEmployeeInput>,
): Promise<ContractEmployee> {
  return apiClient.patch(`/contract-employees/${id}`, input);
}

export function deleteContractEmployee(id: string): Promise<void> {
  return apiClient.delete(`/contract-employees/${id}`);
}
