import { Bookmark, Search } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import { useSavedFilters } from '@/hooks/use-saved-filters';

import { CONSTRUCTION_STATUS_OPTIONS } from '../construction-site-status';
import type { ConstructionStatus } from '../types';

export const ALL_STATUS = 'ALL';

interface ObrasFilterValues {
  search: string;
  city: string;
  status: ConstructionStatus | typeof ALL_STATUS;
}

interface ConstructionSitesFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  status: ConstructionStatus | typeof ALL_STATUS;
  onStatusChange: (value: ConstructionStatus | typeof ALL_STATUS) => void;
  city: string;
  onCityChange: (value: string) => void;
}

export function ConstructionSitesFilters({
  search,
  onSearchChange,
  status,
  onStatusChange,
  city,
  onCityChange,
}: ConstructionSitesFiltersProps) {
  const { presets, savePreset, applyPreset, deletePreset } =
    useSavedFilters<ObrasFilterValues>('eds:saved-filters:obras');

  function handleSaveCurrentFilters() {
    const name = window.prompt('Nome do filtro:');
    if (!name) return;
    savePreset(name, { search, city, status });
  }

  function handleApplyPreset(name: string) {
    const preset = applyPreset(name);
    if (!preset) return;
    onSearchChange(preset.search);
    onCityChange(preset.city);
    onStatusChange(preset.status);
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1 sm:max-w-xs">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Buscar por nome, código ou cliente"
          className="pl-8"
        />
      </div>

      <Input
        value={city}
        onChange={(event) => onCityChange(event.target.value)}
        placeholder="Filtrar por cidade"
        className="sm:max-w-[180px]"
      />

      <Select value={status} onValueChange={(value) => onStatusChange(value as ConstructionStatus)}>
        <SelectTrigger className="sm:w-[180px]">
          <SelectValue placeholder="Status" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_STATUS}>Todos os status</SelectItem>
          {CONSTRUCTION_STATUS_OPTIONS.map((option) => (
            <SelectItem key={option.value} value={option.value}>
              {option.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="sm:w-auto">
            <Bookmark />
            Filtros salvos
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {presets.length === 0 && (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Nenhum filtro salvo ainda.</p>
          )}
          {presets.map((preset) => (
            <DropdownMenuItem
              key={preset.name}
              className="justify-between"
              onClick={() => handleApplyPreset(preset.name)}
            >
              {preset.name}
              <button
                type="button"
                onClick={(event) => {
                  event.stopPropagation();
                  deletePreset(preset.name);
                }}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remover
              </button>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleSaveCurrentFilters}>
            Salvar filtro atual...
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
