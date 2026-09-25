import { useState } from 'react';
import { FileText, MoreHorizontal, Paperclip, Plus, Receipt, Search, XCircle } from 'lucide-react';
import {
  Alert,
  AlertTitle,
  Badge,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
} from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useAuth } from '@/features/auth/context';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ApiError } from '@/lib/api-client';

import {
  useCancelServiceInvoice,
  useServiceInvoices,
} from '@/features/terceiros/service-invoices/hooks';
import { ServiceInvoiceFilesSheet } from '@/features/terceiros/service-invoices/service-invoice-files-sheet';
import { ServiceInvoiceFormDrawer } from '@/features/terceiros/service-invoices/service-invoice-form-drawer';
import {
  SITUATION_LABEL,
  type ServiceInvoice,
  type ServiceInvoiceSituation,
} from '@/features/terceiros/service-invoices/types';

const PAGE_SIZE = 10;
const ALL = 'ALL';

const SITUATION_VARIANT: Record<
  ServiceInvoiceSituation,
  'pending' | 'info' | 'success' | 'warning' | 'secondary'
> = {
  AGUARDANDO_LIBERACAO: 'pending',
  LIBERADA: 'info',
  PAGA_PARCIAL: 'warning',
  PAGA: 'success',
  CANCELADA: 'secondary',
};

function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

/// NOTAS DE SERVIÇO — pedido do cliente: "quem lança terceirizado e nota é a
/// engenharia (nós que contratamos); o financeiro só vai pagar o que foi
/// autorizado". Aqui a Engenharia lança a nota do serviço (com ou sem
/// contrato) e acompanha: aguardando liberação → liberada → paga. Só as notas
/// de serviço; as demais contas da empresa não aparecem.
export function NotasServicoSection() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [situation, setSituation] = useState<ServiceInvoiceSituation | typeof ALL>(ALL);
  const debouncedSearch = useDebouncedValue(search);

  const [lancando, setLancando] = useState(false);
  const [arquivosDe, setArquivosDe] = useState<ServiceInvoice | null>(null);
  const [cancelando, setCancelando] = useState<ServiceInvoice | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erroCancelar, setErroCancelar] = useState<string | null>(null);

  const { user } = useAuth();
  const canManage = user?.permissions.includes('terceiros.manage') ?? false;

  const { data, isLoading, isError } = useServiceInvoices({
    page,
    limit: PAGE_SIZE,
    search: debouncedSearch || undefined,
    situation: situation === ALL ? undefined : situation,
  });
  const cancelar = useCancelServiceInvoice();

  async function confirmarCancelamento() {
    if (!cancelando) return;
    setErroCancelar(null);
    try {
      await cancelar.mutateAsync(cancelando.id);
      setCancelando(null);
    } catch (error) {
      setErroCancelar(
        error instanceof ApiError ? error.message : 'Não foi possível cancelar a nota.',
      );
    }
  }

  const meta = data?.meta;
  const rangeStart = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const rangeEnd = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold tracking-tight text-foreground">Notas de serviço</h2>
          <p className="text-sm text-muted-foreground">
            Serviços de terceirizados, com ou sem contrato. A nota lançada aqui vai para a liberação
            do responsável e depois para o pagamento pelo Financeiro.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setLancando(true)}>
            <Plus />
            Lançar nota
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-[260px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Terceirizado, nº da nota ou serviço"
            className="pl-8"
          />
        </div>
        <Select
          value={situation}
          onValueChange={(value) => {
            setSituation(value as ServiceInvoiceSituation);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-[220px]">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todas as situações</SelectItem>
            {(Object.keys(SITUATION_LABEL) as ServiceInvoiceSituation[]).map((s) => (
              <SelectItem key={s} value={s}>
                {SITUATION_LABEL[s]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {aviso && (
        <Alert variant="destructive">
          <AlertTitle>{aviso}</AlertTitle>
        </Alert>
      )}

      {isError && <ErrorState message="Não foi possível carregar as notas. Tente novamente." />}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={8} rows={PAGE_SIZE} message="Carregando notas..." />
      )}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Receipt}
          title="Nenhuma nota de serviço"
          description="Lance aqui a nota de um serviço terceirizado, como um conserto ou uma mão de obra avulsa."
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Terceirizado</TableHead>
                <TableHead>Serviço</TableHead>
                <TableHead>Obra / centro</TableHead>
                <TableHead>Nota</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((nota) => (
                <TableRow key={nota.id}>
                  <TableCell className="font-medium text-foreground">
                    {nota.contractor.tradeName ?? nota.contractor.legalName}
                    {nota.launchedBy && (
                      <span className="block text-xs font-normal text-muted-foreground">
                        lançada por {nota.launchedBy.name.split(' ')[0]}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{nota.description ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {nota.constructionSite?.name ?? nota.costCenter?.name ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {nota.documentNumber ?? '—'}
                  </TableCell>
                  <TableCell className="text-right text-foreground tabular-nums">
                    {formatCurrency(nota.amount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(nota.dueDate)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={SITUATION_VARIANT[nota.situation]}>
                      {SITUATION_LABEL[nota.situation]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="sm"
                      className={nota.attachmentsCount === 0 ? 'text-muted-foreground' : ''}
                      onClick={() => setArquivosDe(nota)}
                    >
                      {nota.attachmentsCount === 0 ? <Paperclip /> : <FileText />}
                      {nota.attachmentsCount === 0 ? 'Anexar' : nota.attachmentsCount}
                    </Button>
                  </TableCell>
                  <TableCell>
                    {canManage && nota.situation === 'AGUARDANDO_LIBERACAO' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8">
                            <MoreHorizontal className="size-4" />
                            <span className="sr-only">Ações</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            variant="destructive"
                            onClick={() => {
                              setErroCancelar(null);
                              setCancelando(nota);
                            }}
                          >
                            <XCircle />
                            Cancelar nota
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {meta && meta.total > 0 && (
            <Pagination>
              <p className="text-sm text-muted-foreground">
                Mostrando {rangeStart}–{rangeEnd} de {meta.total} notas
              </p>
              <div className="flex items-center gap-2">
                <PaginationPrevious
                  disabled={meta.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                />
                <PaginationNext
                  disabled={meta.page >= meta.totalPages}
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                />
              </div>
            </Pagination>
          )}
        </>
      )}

      <ServiceInvoiceFormDrawer open={lancando} onOpenChange={setLancando} onWarning={setAviso} />

      <ServiceInvoiceFilesSheet
        nota={arquivosDe}
        onOpenChange={(open) => !open && setArquivosDe(null)}
        canManage={canManage}
      />

      <ConfirmDialog
        open={cancelando !== null}
        onOpenChange={(open) => !open && setCancelando(null)}
        title={`Cancelar a nota ${cancelando?.documentNumber ?? ''}?`}
        description={
          erroCancelar ??
          'A nota sai da fila de liberação e não será paga. Use quando foi lançada por engano.'
        }
        confirmLabel="Cancelar nota"
        loadingLabel="Cancelando..."
        isLoading={cancelar.isPending}
        onConfirm={() => void confirmarCancelamento()}
      />
    </div>
  );
}
