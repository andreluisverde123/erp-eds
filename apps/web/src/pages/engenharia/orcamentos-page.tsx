import { useState } from 'react';
import { Calculator, Plus, Search } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  Badge,
  Button,
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

import { useAuth } from '@/features/auth/context';
import { formatDateOnly } from '@/features/catalogo/reference-date';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { BudgetFormDrawer } from '@/features/orcamentos/components/budget-form-drawer';
import { BUDGET_STATUS_LABELS, formatMoney } from '@/features/orcamentos/format';
import { useBudgets } from '@/features/orcamentos/hooks/use-budgets';
import type { BudgetStatus } from '@/features/orcamentos/types';

const PAGE_SIZE = 10;
const TODOS = 'ALL';

/// Orçamentos de obra. Fica em Engenharia, ao lado de Obras e Composições:
/// é onde o orçamento nasce.
export function OrcamentosPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.permissions.includes('orcamentos.manage') ?? false;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(TODOS);
  const busca = useDebouncedValue(search);
  const [criando, setCriando] = useState(false);

  const { data, isLoading, isError } = useBudgets({
    page,
    limit: PAGE_SIZE,
    search: busca || undefined,
    status: status === TODOS ? undefined : (status as BudgetStatus),
  });

  const meta = data?.meta;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Orçamentos</h1>
          <p className="text-sm text-muted-foreground">
            Orçamento de custo por obra, com EAP própria. Fechado, vira documento histórico.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setCriando(true)}>
            <Plus />
            Novo Orçamento
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-[280px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(evento) => {
              setSearch(evento.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nome, código ou obra"
            className="pl-8"
          />
        </div>
        <Select
          value={status}
          onValueChange={(valor) => {
            setStatus(valor);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-[170px]" aria-label="Situação">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as situações</SelectItem>
            <SelectItem value="DRAFT">Rascunho</SelectItem>
            <SelectItem value="CLOSED">Fechado</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError && <ErrorState message="Não foi possível carregar os orçamentos. Tente novamente." />}
      {!isError && isLoading && !data && <TableSkeleton columns={8} rows={PAGE_SIZE} message="Carregando orçamentos..." />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Calculator}
          title="Nenhum orçamento encontrado"
          description="Ajuste os filtros ou crie o primeiro orçamento de uma obra."
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Obra</TableHead>
                <TableHead>Data-base</TableHead>
                <TableHead>Versão</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Custo direto</TableHead>
                <TableHead className="text-right">Preço final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((orcamento) => (
                <TableRow key={orcamento.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">{orcamento.code}</TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-foreground hover:underline"
                      onClick={() => navigate(`/engenharia/orcamentos/${orcamento.id}`)}
                    >
                      {orcamento.name}
                    </button>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {orcamento.constructionSite.code} — {orcamento.constructionSite.name}
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDateOnly(orcamento.referenceDate)}</TableCell>
                  <TableCell>v{orcamento.version}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={orcamento.status === 'CLOSED' ? 'success' : 'secondary'}>
                        {BUDGET_STATUS_LABELS[orcamento.status]}
                      </Badge>
                      {orcamento.isOfficial && <Badge variant="outline">Oficial</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(orcamento.directCost ?? orcamento.totalCost)}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(orcamento.finalPrice ?? orcamento.totalCost)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-end">
              <Pagination>
                <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} aria-disabled={meta.page === 1} />
                <PaginationNext
                  onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))}
                  aria-disabled={meta.page === meta.totalPages}
                />
              </Pagination>
            </div>
          )}
        </>
      )}

      {canManage && (
        <BudgetFormDrawer
          open={criando}
          onOpenChange={setCriando}
          onSaved={(salvo) => navigate(`/engenharia/orcamentos/${salvo.id}`)}
        />
      )}
    </div>
  );
}
