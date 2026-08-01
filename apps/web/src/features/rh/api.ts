import { apiClient } from '@/lib/api-client';
import { toQueryString } from '@/lib/query-string';

import type {
  Employee,
  EmployeeAllocation,
  EmployeeAllocationInput,
  EmployeeAllocationQuery,
  EmployeeInput,
  EmployeeQuery,
  PaginatedResult,
  Payslip,
  PayslipInput,
  PayslipQuery,
  ProductionEntry,
  ProductionEntryInput,
  ProductionEntryQuery,
  TimeEntry,
  TimeEntryInput,
  TimeEntryQuery,
} from './types';

export function listEmployees(query: EmployeeQuery): Promise<PaginatedResult<Employee>> {
  return apiClient.get(`/employees${toQueryString(query)}`);
}

export function listEmployeePositions(): Promise<string[]> {
  return apiClient.get('/employees/positions');
}

export function createEmployee(input: EmployeeInput): Promise<Employee> {
  return apiClient.post('/employees', input);
}

export function updateEmployee(id: string, input: Partial<EmployeeInput>): Promise<Employee> {
  return apiClient.patch(`/employees/${id}`, input);
}

export function deleteEmployee(id: string): Promise<void> {
  return apiClient.delete(`/employees/${id}`);
}

export function listEmployeeAllocations(
  query: EmployeeAllocationQuery,
): Promise<PaginatedResult<EmployeeAllocation>> {
  return apiClient.get(`/employee-allocations${toQueryString(query)}`);
}

export function createEmployeeAllocation(
  input: EmployeeAllocationInput,
): Promise<EmployeeAllocation> {
  return apiClient.post('/employee-allocations', input);
}

export function updateEmployeeAllocation(
  id: string,
  input: Partial<EmployeeAllocationInput>,
): Promise<EmployeeAllocation> {
  return apiClient.patch(`/employee-allocations/${id}`, input);
}

export function deleteEmployeeAllocation(id: string): Promise<void> {
  return apiClient.delete(`/employee-allocations/${id}`);
}

export function listTimeEntries(query: TimeEntryQuery): Promise<PaginatedResult<TimeEntry>> {
  return apiClient.get(`/time-entries${toQueryString(query)}`);
}

export function createTimeEntry(input: TimeEntryInput): Promise<TimeEntry> {
  return apiClient.post('/time-entries', input);
}

export function deleteTimeEntry(id: string): Promise<void> {
  return apiClient.delete(`/time-entries/${id}`);
}

export function listProductionEntries(
  query: ProductionEntryQuery,
): Promise<PaginatedResult<ProductionEntry>> {
  return apiClient.get(`/production-entries${toQueryString(query)}`);
}

export function createProductionEntry(input: ProductionEntryInput): Promise<ProductionEntry> {
  return apiClient.post('/production-entries', input);
}

export function deleteProductionEntry(id: string): Promise<void> {
  return apiClient.delete(`/production-entries/${id}`);
}

export function listPayslips(query: PayslipQuery): Promise<PaginatedResult<Payslip>> {
  return apiClient.get(`/payslips${toQueryString(query)}`);
}

export function createPayslip(input: PayslipInput): Promise<Payslip> {
  return apiClient.post('/payslips', input);
}

export function deletePayslip(id: string): Promise<void> {
  return apiClient.delete(`/payslips/${id}`);
}

export function uploadPayslipAttachment(id: string, file: File): Promise<Payslip> {
  const formData = new FormData();
  formData.append('file', file);
  return apiClient.upload(`/payslips/${id}/attachment`, formData);
}
