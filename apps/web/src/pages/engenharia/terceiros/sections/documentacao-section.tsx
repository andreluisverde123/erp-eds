import { useState } from 'react';
import { AlertTriangle, Plus, Search, XCircle } from 'lucide-react';
import {
  Button,
  Card,
  CardContent,
  ErrorState,
  Input,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TableSkeleton,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { ContractDocumentFormDrawer } from '@/features/terceiros/components/contract-document-form-drawer';
import { ContractDocumentsTable } from '@/features/terceiros/components/contract-documents-table';
import { DOCUMENT_BADGE_OPTIONS } from '@/features/terceiros/document-badge';
import { useDeleteContractDocument } from '@/features/terceiros/hooks/use-contract-document-mutations';
import { useContractDocuments } from '@/features/terceiros/hooks/use-contract-documents';
import { useContractors } from '@/features/terceiros/hooks/use-contractors';
import { useDocumentsExpiringSummary } from '@/features/terceiros/hooks/use-documents-expiring-summary';
import type { ContractDocument, DocumentBadgeStatus } from '@/features/terceiros/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

export function DocumentacaoSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [contractorId, setContractorId] = useState(ALL);
  const [badgeStatus, setBadgeStatus] = useState<DocumentBadgeStatus | typeof ALL>(ALL);
  const debouncedSearch = useDebouncedValue(search);

  function resetPageAnd<T>(setter: (value: T) => void) {
    return (value: T) => {
      setter(value);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useContractDocuments({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    contractorId: contractorId === ALL ? undefined : contractorId,
    badgeStatus: badgeStatus === ALL ? undefined : badgeStatus,
  });

  const { data: summary } = useDocumentsExpiringSummary();
  const { data: contractorsData } = useContractors({ limit: 100 });
  const deleteMutation = useDeleteContractDocument();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [deletingDocument, setDeletingDocument] = useState<ContractDocument | null>(null);

  async function confirmDelete() {
    if (!deletingDocument) return;
    await deleteMutation.mutateAsync(deletingDocument.id);
    setDeletingDocument(null);
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Documentação</h2>
          <p className="text-sm text-muted-foreground">
            Documentos obrigatórios das empresas terceirizadas.
          </p>
        </div>
        <Button onClick={() => setDrawerOpen(true)}>
          <Plus />
          Novo Documento
        </Button>
      </div>

      {summary && (summary.expiredCount > 0 || summary.expiringCount > 0) && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {summary.expiredCount > 0 && (
            <Card className="border-destructive/30 bg-destructive/5">
              <CardContent className="flex items-center gap-3">
                <XCircle className="size-8 text-destructive" strokeWidth={1.5} />
                <div>
                  <p className="text-lg font-semibold text-foreground">{summary.expiredCount}</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.expiredCount === 1 ? 'documento vencido' : 'documentos vencidos'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
          {summary.expiringCount > 0 && (
            <Card className="border-amber-500/30 bg-amber-500/5">
              <CardContent className="flex items-center gap-3">
                <AlertTriangle
                  className="size-8 text-amber-600 dark:text-amber-400"
                  strokeWidth={1.5}
                />
                <div>
                  <p className="text-lg font-semibold text-foreground">{summary.expiringCount}</p>
                  <p className="text-sm text-muted-foreground">
                    {summary.expiringCount === 1
                      ? 'documento vencendo nos próximos 30 dias'
                      : 'documentos vencendo nos próximos 30 dias'}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[220px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => resetPageAnd(setSearch)(event.target.value)}
            placeholder="Buscar por documento ou empresa"
            className="pl-8"
          />
        </div>

        <Select value={contractorId} onValueChange={resetPageAnd(setContractorId)}>
          <SelectTrigger className="sm:w-[190px]">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as empresas</SelectItem>
            {contractorsData?.data.map((contractor) => (
              <SelectItem key={contractor.id} value={contractor.id}>
                {contractor.tradeName ?? contractor.legalName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={badgeStatus}
          onValueChange={(value) => resetPageAnd(setBadgeStatus)(value as DocumentBadgeStatus)}
        >
          <SelectTrigger className="sm:w-[160px]">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os status</SelectItem>
            {DOCUMENT_BADGE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError && (
        <ErrorState message="Não foi possível carregar os documentos. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={6} rows={PAGE_SIZE} message="Carregando documentos..." />
      )}

      {data && (
        <>
          <ContractDocumentsTable documents={data.data} onDelete={setDeletingDocument} />

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} documentos
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

      <ContractDocumentFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} />

      <ConfirmDialog
        open={Boolean(deletingDocument)}
        onOpenChange={(open) => !open && setDeletingDocument(null)}
        title="Excluir documento"
        description={`Tem certeza que deseja excluir "${deletingDocument?.name}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
