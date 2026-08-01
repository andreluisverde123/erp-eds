import { Search } from 'lucide-react';
import { Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@repo/ui';

import { PURCHASE_REQUEST_STATUS_OPTIONS } from '../purchase-request-status';
import type { PurchaseRequestStatus } from '../types';

export const ALL_STATUS = 'ALL';
/// Filtro por destino da solicitação. Era por obra; virou centro de custo
/// quando a obra saiu do formulário — filtrar por obra escondia justamente as
/// solicitações de Escritório, Fazenda e afins.
export const ALL_COST_CENTERS = 'ALL';

interface CostCenterOption {
  id: string;
  name: string;
}

interface PurchaseRequestsFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: PurchaseRequestStatus | typeof ALL_STATUS;
  onStatusChange: (value: PurchaseRequestStatus | typeof ALL_STATUS) => void;
  hideStatusFilter?: boolean;
  costCenterId: string;
  onCostCenterIdChange: (value: string) => void;
  costCenters: CostCenterOption[];
  dateFrom: string;
  onDateFromChange: (value: string) => void;
  dateTo: string;
  onDateToChange: (value: string) => void;
}

export function PurchaseRequestsFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  hideStatusFilter = false,
  costCenterId,
  onCostCenterIdChange,
  costCenters,
  dateFrom,
  onDateFromChange,
  dateTo,
  onDateToChange,
}: PurchaseRequestsFiltersProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
      <div className="relative sm:max-w-[240px] sm:flex-1">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por número ou centro de custo"
          className="pl-8"
        />
      </div>

      <Select value={costCenterId} onValueChange={onCostCenterIdChange}>
        <SelectTrigger className="sm:w-[220px]">
          <SelectValue placeholder="Centro de custo" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_COST_CENTERS}>Todos os centros de custo</SelectItem>
          {costCenters.map((costCenter) => (
            <SelectItem key={costCenter.id} value={costCenter.id}>
              {costCenter.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {!hideStatusFilter && (
        <Select
          value={status}
          onValueChange={(value) => onStatusChange(value as PurchaseRequestStatus)}
        >
          <SelectTrigger className="sm:w-[170px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_STATUS}>Todos os status</SelectItem>
            {PURCHASE_REQUEST_STATUS_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <div className="flex items-center gap-2">
        <Input
          type="date"
          value={dateFrom}
          onChange={(event) => onDateFromChange(event.target.value)}
          className="sm:w-[150px]"
          aria-label="Data inicial"
        />
        <span className="text-sm text-muted-foreground">até</span>
        <Input
          type="date"
          value={dateTo}
          onChange={(event) => onDateToChange(event.target.value)}
          className="sm:w-[150px]"
          aria-label="Data final"
        />
      </div>
    </div>
  );
}
