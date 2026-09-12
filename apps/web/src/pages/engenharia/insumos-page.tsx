import { useCallback, useState } from 'react';
import { Package, Plus, Search } from 'lucide-react';
import {
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
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { CatalogItemFormDrawer } from '@/features/catalogo/components/catalog-item-form-drawer';
import {
  useCatalogCategories,
  useCatalogItems,
  useDeleteCatalogItem,
} from '@/features/catalogo/hooks/use-catalog-items';
import type { CatalogItem } from '@/features/catalogo/types';

/// Cadastro de insumos.
///
/// Fica em **Engenharia** e não num grupo "Orçamentos": o módulo de orçamento
/// ainda não existe, e criar o grupo agora prometeria uma tela que não está
/// lá. Engenharia é quem conhece o material da obra e quem mantém o cadastro —
/// Compras consulta.
const PAGE_SIZE = 10;
const TODOS = 'ALL';

export function InsumosPage() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState(TODOS);
  const [active, setActive] = useState(TODOS);
  const buscaComPausa = useDebouncedValue(search);

  function trocarE<T>(setter: (valor: T) => void) {
    return (valor: T) => {
      setter(valor);
      setPage(1);
    };
  }

  const { data, isLoading, isError } = useCatalogItems({
    page,
    limit: PAGE_SIZE,
    search: buscaComPausa || undefined,
    category: category === TODOS ? undefined : category,
    active: active === TODOS ? undefined : active,
  });
  const { data: categorias } = useCatalogCategories();
  const deleteMutation = useDeleteCatalogItem();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editando, setEditando] = useState<CatalogItem | undefined>();
  const [excluindo, setExcluindo] = useState<CatalogItem | null>(null);

  const abrirEdicao = useCallback((item: CatalogItem) => {
    setEditando(item);
    setDrawerOpen(true);
  }, []);

  async function confirmarExclusao() {
    if (!excluindo) return;
    await deleteMutation.mutateAsync(excluindo.id);
    setExcluindo(null);
  }

  const meta = data?.meta;
  const de = meta ? (meta.page - 1) * meta.limit + 1 : 0;
  const ate = meta ? Math.min(meta.page * meta.limit, meta.total) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Insumos</h1>
          <p className="text-sm text-muted-foreground">
            Cadastro de materiais da empresa. Identifica o insumo — preço vem das compras.
          </p>
        </div>
        <Button
          onClick={() => {
            setEditando(undefined);
            setDrawerOpen(true);
          }}
        >
          <Plus />
          Novo Insumo
        </Button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="relative sm:max-w-[260px] sm:flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(evento) => trocarE(setSearch)(evento.target.value)}
            placeholder="Buscar por nome ou código"
            className="pl-8"
          />
        </div>

        <Select value={category} onValueChange={trocarE(setCategory)}>
          <SelectTrigger className="sm:w-[180px]" aria-label="Categoria">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Todas as categorias</SelectItem>
            {categorias?.map((nome) => (
              <SelectItem key={nome} value={nome}>
                {nome}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={active} onValueChange={trocarE(setActive)}>
          <SelectTrigger className="sm:w-[160px]" aria-label="Situação">
            <SelectValue placeholder="Situação" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={TODOS}>Ativos e inativos</SelectItem>
            <SelectItem value="true">Ativos</SelectItem>
            <SelectItem value="false">Inativos</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isError && <ErrorState message="Não foi possível carregar os insumos. Tente novamente." />}

      {!isError && isLoading && !data && (
        <TableSkeleton columns={5} rows={PAGE_SIZE} message="Carregando insumos..." />
      )}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Package}
          title="Nenhum insumo encontrado"
          description="Ajuste os filtros ou cadastre o primeiro material."
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
                <TableHead>Categoria</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {item.code}
                  </TableCell>
                  <TableCell>
                    <p className="font-medium text-foreground">{item.name}</p>
                    {item.description && (
                      <p className="text-xs text-muted-foreground">{item.description}</p>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{item.unit}</TableCell>
                  <TableCell className="text-muted-foreground">{item.category ?? '—'}</TableCell>
                  <TableCell>
                    <Badge variant={item.active ? 'success' : 'secondary'}>
                      {item.active ? 'Ativo' : 'Inativo'}
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
                        <DropdownMenuItem onClick={() => abrirEdicao(item)}>
                          <Pencil />
                          Editar
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setExcluindo(item)}>
                          <Trash2 />
                          Excluir
                        </DropdownMenuItem>
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

      <CatalogItemFormDrawer open={drawerOpen} onOpenChange={setDrawerOpen} item={editando} />

      <ConfirmDialog
        open={Boolean(excluindo)}
        onOpenChange={(aberto) => !aberto && setExcluindo(null)}
        title="Excluir insumo"
        description={`Excluir "${excluindo?.name}"? As solicitações que já usaram este insumo continuam intactas.`}
        confirmLabel="Excluir"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmarExclusao}
      />
    </div>
  );
}
