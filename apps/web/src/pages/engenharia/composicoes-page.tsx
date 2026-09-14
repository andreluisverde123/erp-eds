import { useState } from 'react';
import { Layers, MoreHorizontal, Pencil, Plus, Power, Search, SquareArrowOutUpRight, Trash2 } from 'lucide-react';
import { useNavigate } from 'react-router';
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

import { CompositionFormDrawer } from '@/features/composicoes/components/composition-form-drawer';
import { formatCost } from '@/features/composicoes/format';
import {
  useCompositions,
  useDeleteComposition,
  useUpdateComposition,
} from '@/features/composicoes/hooks/use-compositions';
import type { CompositionSummary } from '@/features/composicoes/types';

/// Composições de custo: quanto custa produzir uma unidade de cada serviço.
///
/// Fica em Engenharia, ao lado de Insumos, pelo mesmo motivo: o orçamento
/// ainda não existe, e um grupo "Orçamentos" prometeria telas que não estão lá.
const PAGE_SIZE = 10;
const TODAS = 'ALL';

export function ComposicoesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.permissions.includes('composicoes.manage') ?? false;

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(TODAS);
  const buscaComPausa = useDebouncedValue(search);

  const { data, isLoading, isError } = useCompositions({
    page,
    limit: PAGE_SIZE,
    search: buscaComPausa || undefined,
    active: active === TODAS ? undefined : active,
  });
  const updateMutation = useUpdateComposition();
  const deleteMutation = useDeleteComposition();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<CompositionSummary | undefined>();
  const [excluindo, setExcluindo] = useState<CompositionSummary | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const abrir = (composicao: CompositionSummary) =>
    navigate(`/engenharia/composicoes/${composicao.id}`);

  async function alternarSituacao(composicao: CompositionSummary) {
    setErro(null);
    try {
      await updateMutation.mutateAsync({
        id: composicao.id,
        input: { active: !composicao.active },
      });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível alterar a situação.');
    }
  }

  async function confirmarExclusao() {
    if (!excluindo) return;
    setErro(null);
    try {
      await deleteMutation.mutateAsync(excluindo.id);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível excluir a composição.');
    }
    setExcluindo(null);
  }

  const meta = data?.meta;
  const de = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const ate = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Composições</h1>
          <p className="text-sm text-muted-foreground">
            Quanto custa produzir uma unidade de cada serviço, a partir dos insumos, coeficientes e
            preços.
          </p>
        </div>
        {canManage && (
          <Button
            onClick={() => {
              setEditando(undefined);
              setDrawerOpen(true);
            }}
          >
            <Plus />
            Nova Composição
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[260px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(evento) => {
              setSearch(evento.target.value);
              setPage(1);
            }}
            placeholder="Buscar por nome ou código"
            className="pl-8"
          />
        </div>

        <Select
          value={active}
          onValueChange={(valor) => {
            setActive(valor);
            setPage(1);
          }}
        >
          <SelectTrigger className="sm:w-[160px]" aria-label="Situação">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODAS}>Ativas e inativas</SelectItem>
            <SelectItem value="true">Ativas</SelectItem>
            <SelectItem value="false">Inativas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}

      {isError && (
        <ErrorState message="Não foi possível carregar as composições. Tente novamente." />
      )}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={6} rows={PAGE_SIZE} message="Carregando composições..." />
      )}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Layers}
          title="Nenhuma composição encontrada"
          description="Ajuste os filtros ou cadastre a primeira composição."
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Itens</TableHead>
                <TableHead className="text-right">Custo unitário</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((composicao) => (
                <TableRow key={composicao.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {composicao.code}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-foreground hover:underline"
                      onClick={() => abrir(composicao)}
                    >
                      {composicao.name}
                    </button>
                    {composicao.description && (
                      <p className="text-xs text-muted-foreground">{composicao.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{composicao.unit}</TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {composicao.itemCount}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCost(composicao.unitCost)}
                    <span className="ml-1 text-xs text-muted-foreground">/ {composicao.unit}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant={composicao.active ? 'success' : 'secondary'}>
                      {composicao.active ? 'Ativa' : 'Inativa'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="size-8">
                          <MoreHorizontal className="size-4" />
                          <span className="sr-only">Ações</span>
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => abrir(composicao)}>
                          <SquareArrowOutUpRight />
                          Abrir
                        </DropdownMenuItem>
                        {canManage && (
                          <>
                            <DropdownMenuItem
                              onClick={() => {
                                setEditando(composicao);
                                setDrawerOpen(true);
                              }}
                            >
                              <Pencil />
                              Editar
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => alternarSituacao(composicao)}>
                              <Power />
                              {composicao.active ? 'Desativar' : 'Ativar'}
                            </DropdownMenuItem>
                            <DropdownMenuItem onClick={() => setExcluindo(composicao)}>
                              <Trash2 />
                              Excluir
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">
                {de}–{ate} de {meta.total}
              </span>
              <Pagination>
                <PaginationPrevious
                  onClick={() => setPage((atual) => Math.max(1, atual - 1))}
                  aria-disabled={meta.page === 1}
                />
                <PaginationNext
                  onClick={() => setPage((atual) => Math.min(meta.totalPages, atual + 1))}
                  aria-disabled={meta.page === meta.totalPages}
                />
              </Pagination>
            </div>
          )}
        </>
      )}

      <CompositionFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        composition={editando}
        // Composição nova não tem item nenhum: o próximo passo é incluí-los,
        // e é na página dela que isso acontece.
        onSaved={(salva) => {
          if (!editando) navigate(`/engenharia/composicoes/${salva.id}`);
        }}
      />

      <ConfirmDialog
        open={Boolean(excluindo)}
        onOpenChange={(aberto) => !aberto && setExcluindo(null)}
        title="Excluir composição"
        description={`Excluir "${excluindo?.name}"? Ela sai da lista. Para só tirá-la de uso, desative-a.`}
        confirmLabel="Excluir"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmarExclusao}
      />
    </div>
  );
}
