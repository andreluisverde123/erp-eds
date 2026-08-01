import { useCallback, useState } from 'react';
import { Columns3, Download, Plus } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
  ErrorState,
  LoadingState,
  Pagination,
  PaginationNext,
  PaginationPrevious,
} from '@repo/ui';

import { BulkActionsBar } from '@/components/bulk-actions-bar';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { BreadcrumbNav } from '@/components/layout/breadcrumb-nav';
import { useBulkDelete } from '@/hooks/use-bulk-delete';
import { useColumnVisibility } from '@/hooks/use-column-visibility';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useRowSelection } from '@/hooks/use-row-selection';
import { exportToCsv } from '@/lib/csv-export';

import { deleteConstructionSite } from '@/features/engenharia/api';
import { ConstructionSiteFormDrawer } from '@/features/engenharia/components/construction-site-form-drawer';
import {
  ALL_STATUS,
  ConstructionSitesFilters,
} from '@/features/engenharia/components/construction-sites-filters';
import { ConstructionSitesTable } from '@/features/engenharia/components/construction-sites-table';
import { OBRAS_COLUMNS } from '@/features/engenharia/obras-columns';
import { getStatusLabel } from '@/features/engenharia/construction-site-status';
import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { useDeleteConstructionSite } from '@/features/engenharia/hooks/use-construction-site-mutations';
import type { ConstructionSite, ConstructionStatus } from '@/features/engenharia/types';

const PAGE_SIZE = 10;

const OBRAS_CSV_COLUMNS = [
  { key: 'code', label: 'Código', value: (site: ConstructionSite) => site.code },
  { key: 'name', label: 'Nome', value: (site: ConstructionSite) => site.name },
  { key: 'clientName', label: 'Cliente', value: (site: ConstructionSite) => site.clientName ?? '' },
  { key: 'city', label: 'Cidade', value: (site: ConstructionSite) => site.city ?? '' },
  { key: 'state', label: 'UF', value: (site: ConstructionSite) => site.state ?? '' },
  {
    key: 'status',
    label: 'Status',
    value: (site: ConstructionSite) => getStatusLabel(site.status),
  },
  {
    key: 'responsibleName',
    label: 'Responsável',
    value: (site: ConstructionSite) => site.responsibleName ?? '',
  },
  {
    key: 'costCenters',
    label: 'Centros de custo',
    value: (site: ConstructionSite) => site._count.costCenters,
  },
];

export function ObrasPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [city, setCity] = useState('');
  const [status, setStatus] = useState<ConstructionStatus | typeof ALL_STATUS>(ALL_STATUS);

  const debouncedSearch = useDebouncedValue(search);
  const debouncedCity = useDebouncedValue(city);

  // Qualquer mudança de filtro reseta a página pra 1 no próprio handler (não
  // num efeito reagindo ao valor debounced) — evita um render extra e o
  // "salto" de página só depois que o debounce assentar.
  function handleSearchChange(value: string) {
    setSearch(value);
    setPage(1);
  }

  function handleCityChange(value: string) {
    setCity(value);
    setPage(1);
  }

  function handleStatusChange(value: ConstructionStatus | typeof ALL_STATUS) {
    setStatus(value);
    setPage(1);
  }

  const { data, isLoading, isError } = useConstructionSites({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    city: debouncedCity || undefined,
    status: status === ALL_STATUS ? undefined : status,
  });

  const deleteMutation = useDeleteConstructionSite();
  const bulkDeleteMutation = useBulkDelete(deleteConstructionSite, 'construction-sites');
  const selection = useRowSelection(data?.data ?? [], (site) => site.id);
  const columnVisibility = useColumnVisibility('eds:columns:obras', OBRAS_COLUMNS);
  const [bulkDeleteDialogOpen, setBulkDeleteDialogOpen] = useState(false);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<ConstructionSite | undefined>();
  const [duplicatingSite, setDuplicatingSite] = useState<ConstructionSite | undefined>();
  const [deletingSite, setDeletingSite] = useState<ConstructionSite | null>(null);

  async function confirmBulkDelete() {
    await bulkDeleteMutation.mutateAsync(Array.from(selection.selectedIds));
    selection.clear();
    setBulkDeleteDialogOpen(false);
  }

  function openCreateDrawer() {
    setEditingSite(undefined);
    setDuplicatingSite(undefined);
    setDrawerOpen(true);
  }

  // useCallback aqui (não só function normal) porque essas duas são passadas
  // direto pra ConstructionSitesTable, que agora é memoizada — uma closure
  // nova a cada render anularia o memo, já que a comparação de props do
  // React.memo é rasa (identidade, não valor).
  const openEditDrawer = useCallback((site: ConstructionSite) => {
    setEditingSite(site);
    setDuplicatingSite(undefined);
    setDrawerOpen(true);
  }, []);

  const openDuplicateDrawer = useCallback((site: ConstructionSite) => {
    setEditingSite(undefined);
    setDuplicatingSite(site);
    setDrawerOpen(true);
  }, []);

  async function confirmDelete() {
    if (!deletingSite) return;
    await deleteMutation.mutateAsync(deletingSite.id);
    setDeletingSite(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  function handleExportCsv() {
    if (!data) return;
    exportToCsv('obras.csv', OBRAS_CSV_COLUMNS, data.data);
  }

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbNav />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Obras</h1>
          <p className="text-sm text-muted-foreground">
            Gerencie as obras e seus centros de custo.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline">
                <Columns3 />
                Colunas
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {columnVisibility.columns.map((column) => (
                <DropdownMenuCheckboxItem
                  key={column.id}
                  checked={columnVisibility.isVisible(column.id)}
                  onCheckedChange={() => columnVisibility.toggleColumn(column.id)}
                  onSelect={(event) => event.preventDefault()}
                >
                  {column.label}
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="outline" onClick={handleExportCsv} disabled={!data}>
            <Download />
            Exportar CSV
          </Button>
          <Button onClick={openCreateDrawer}>
            <Plus />
            Nova Obra
          </Button>
        </div>
      </div>

      <ConstructionSitesFilters
        search={search}
        onSearchChange={handleSearchChange}
        city={city}
        onCityChange={handleCityChange}
        status={status}
        onStatusChange={handleStatusChange}
      />

      {isError && <ErrorState message="Não foi possível carregar as obras. Tente novamente." />}

      {!isError && isLoading && !data && <LoadingState message="Carregando obras..." />}

      {data && (
        <>
          <BulkActionsBar
            selectedCount={selection.selectedCount}
            onClearSelection={selection.clear}
          >
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteDialogOpen(true)}>
              Excluir selecionadas
            </Button>
          </BulkActionsBar>

          <ConstructionSitesTable
            sites={data.data}
            onEdit={openEditDrawer}
            onDelete={setDeletingSite}
            onDuplicate={openDuplicateDrawer}
            isSelected={selection.isSelected}
            onToggleRow={selection.toggle}
            onToggleAll={selection.toggleAll}
            isAllSelected={selection.isAllSelected}
            isIndeterminate={selection.isIndeterminate}
            isColumnVisible={columnVisibility.isVisible}
          />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} obras
              </p>
              <div className="flex items-center gap-2">
                <PaginationPrevious
                  disabled={meta.page <= 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                />
                <PaginationNext
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage((current) => Math.min(meta.totalPages, current + 1))}
                />
              </div>
            </Pagination>
          )}
        </>
      )}

      <ConstructionSiteFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        site={editingSite}
        duplicateFrom={duplicatingSite}
      />

      <ConfirmDialog
        open={Boolean(deletingSite)}
        onOpenChange={(open) => !open && setDeletingSite(null)}
        title="Excluir obra"
        description={`Tem certeza que deseja excluir "${deletingSite?.name}"? Os centros de custo associados também serão removidos.`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />

      <ConfirmDialog
        open={bulkDeleteDialogOpen}
        onOpenChange={setBulkDeleteDialogOpen}
        title="Excluir obras selecionadas"
        description={`Tem certeza que deseja excluir ${selection.selectedCount} ${selection.selectedCount === 1 ? 'obra' : 'obras'}? Os centros de custo associados também serão removidos.`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={bulkDeleteMutation.isPending}
        onConfirm={confirmBulkDelete}
      />
    </div>
  );
}
