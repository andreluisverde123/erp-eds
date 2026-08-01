import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

import { ACCOUNT_PAYABLE_STATUS_OPTIONS } from '../account-payable-status';
import type { AccountPayableStatus } from '../types';

export const ALL_STATUS = 'ALL';
export const ALL_SUPPLIERS = 'ALL';

interface SupplierOption {
  id: string;
  legalName: string;
  tradeName: string | null;
}

interface AccountPayablesFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: AccountPayableStatus | typeof ALL_STATUS;
  onStatusChange: (value: AccountPayableStatus | typeof ALL_STATUS) => void;
  supplierId: string;
  onSupplierIdChange: (value: string) => void;
  suppliers: SupplierOption[];
  dueDateFrom: string;
  onDueDateFromChange: (value: string) => void;
  dueDateTo: string;
  onDueDateToChange: (value: string) => void;
}

export function AccountPayablesFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  supplierId,
  onSupplierIdChange,
  suppliers,
  dueDateFrom,
  onDueDateFromChange,
  dueDateTo,
  onDueDateToChange,
}: AccountPayablesFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:max-w-[220px] sm:flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por nota ou fornecedor"
          className="pl-8"
        />
      </div>

      <Select value={supplierId} onValueChange={onSupplierIdChange}>
        <SelectTrigger className="sm:w-[190px]">
          <SelectValue placeholder="Fornecedor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_SUPPLIERS}>Todos os fornecedores</SelectItem>
          {suppliers.map((supplier) => (
            <SelectItem key={supplier.id} value={supplier.id}>
              {supplier.tradeName ?? supplier.legalName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={status}
        onValueChange={(value) => onStatusChange(value as AccountPayableStatus)}
      >
        <SelectTrigger className="sm:w-[160px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUS}>Todos os status</SelectItem>
          {ACCOUNT_PAYABLE_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={dueDateFrom}
          onChange={(event) => onDueDateFromChange(event.target.value)}
          className="sm:w-[150px]"
          aria-label="Vencimento inicial"
        />
        <span className="text-sm text-muted-foreground">até</span>
        <Input
          type="date"
          value={dueDateTo}
          onChange={(event) => onDueDateToChange(event.target.value)}
          className="sm:w-[150px]"
          aria-label="Vencimento final"
        />
      </div>
    </div>
  );
}
