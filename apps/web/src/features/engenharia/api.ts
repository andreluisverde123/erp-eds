import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  ConstructionSite,
  ConstructionSiteDetail,
  ConstructionSiteInput,
  ConstructionSiteQuery,
  CostCenter,
  CostCenterInput,
  CostCenterQuery,
  PaginatedResult,
} from './types';

export function listConstructionSites(
  query: ConstructionSiteQuery,
): Promise<PaginatedResult<ConstructionSite>> {
  return apiClient.get(`/construction-sites${toQueryString(query)}`);
}

export function getConstructionSite(id: string): Promise<ConstructionSiteDetail> {
  return apiClient.get(`/construction-sites/${id}`);
}

export function createConstructionSite(
  input: ConstructionSiteInput,
): Promise<ConstructionSiteDetail> {
  return apiClient.post('/construction-sites', input);
}

export function updateConstructionSite(
  id: string,
  input: Partial<ConstructionSiteInput>,
): Promise<ConstructionSiteDetail> {
  return apiClient.patch(`/construction-sites/${id}`, input);
}

export function deleteConstructionSite(id: string): Promise<void> {
  return apiClient.delete(`/construction-sites/${id}`);
}

export function listCostCenters(query: CostCenterQuery): Promise<PaginatedResult<CostCenter>> {
  return apiClient.get(`/cost-centers${toQueryString(query)}`);
}

export function createCostCenter(input: CostCenterInput): Promise<CostCenter> {
  return apiClient.post('/cost-centers', input);
}

export function updateCostCenter(id: string, input: Partial<CostCenterInput>): Promise<CostCenter> {
  return apiClient.patch(`/cost-centers/${id}`, input);
}

export function deleteCostCenter(id: string): Promise<void> {
  return apiClient.delete(`/cost-centers/${id}`);
}
