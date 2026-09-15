import { useState } from 'react';
import { ArrowLeft, Search } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import {
  Badge,
  Button,
  ErrorState,
  Input,
  Pagination,
  PaginationNext,
  PaginationPrevious,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@repo/ui';

import {
  useReferenceComposition,
  useReferenceCompositions,
  useReferenceDataset,
  useReferenceItems,
} from '@/features/bases-referencia/hooks';
import { REFERENCE_KIND_LABELS, REFERENCE_SOURCE_LABELS } from '@/features/bases-referencia/labels';
import { formatCompetence, formatQuantity, formatUnitCost, REFERENCE_REGIME_LABELS } from '@/features/orcamentos/format';
import { useDebouncedValue } from '@/hooks/use-debounced-value';

const PAGE_SIZE = 50;

/// Consulta de UMA base: insumos e composições, com busca por código ou
/// descrição paginada no servidor, e a composição analítica.
export function BaseDeReferenciaDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { data: base, isError } = useReferenceDataset(id);
  const [aba, setAba] = useState<'compositions' | 'items'>('compositions');
  const [busca, setBusca] = useState('');
  const termo = useDebouncedValue(busca);
  const [paginaComposicoes, setPaginaComposicoes] = useState(1);
  const [paginaInsumos, setPaginaInsumos] = useState(1);
  const [analitica, setAnalitica] = useState<string | null>(null);

  const composicoes = useReferenceCompositions(id, { page: paginaComposicoes, limit: PAGE_SIZE, search: termo || undefined }, aba === 'compositions');
  const insumos = useReferenceItems(id, { page: paginaInsumos, limit: PAGE_SIZE, search: termo || undefined }, aba === 'items');

  const voltar = (
    <Button variant="ghost" size="sm" className="w-fit" onClick={() => navigate('/engenharia/bases-de-referencia')}>
      <ArrowLeft />
      Bases de Referência
    </Button>
  );

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <ErrorState message="Base de referência não encontrada." />
      </div>
    );
  }

  const paginacao = (meta: { page: number; totalPages: number; total: number } | undefined, mudar: (p: number) => void) =>
    meta && (
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{meta.total.toLocaleString('pt-BR')} resultado(s)</span>
        {meta.totalPages > 1 && (
          <Pagination>
            <PaginationPrevious onClick={() => mudar(Math.max(1, meta.page - 1))} aria-disabled={meta.page === 1} />
            <PaginationNext onClick={() => mudar(Math.min(meta.totalPages, meta.page + 1))} aria-disabled={meta.page === meta.totalPages} />
          </Pagination>
        )}
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {voltar}
      {base && (
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {base.source} {formatCompetence(base.competence)} — {base.uf}
          </h1>
          <p className="text-sm text-muted-foreground">
            {REFERENCE_SOURCE_LABELS[base.source]} · {base.locality ?? base.uf} · {REFERENCE_REGIME_LABELS[base.regime]}
            {base.versionLabel ? ` · ${base.versionLabel}` : ''} · {base.itemCount.toLocaleString('pt-BR')} insumos ·{' '}
            {base.compositionCount.toLocaleString('pt-BR')} composições
          </p>
        </div>
      )}

      <div className="relative sm:max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={busca}
          onChange={(evento) => {
            setBusca(evento.target.value);
            setPaginaComposicoes(1);
            setPaginaInsumos(1);
          }}
          placeholder="Buscar por código ou descrição"
          aria-label="Buscar na base"
          className="pl-8"
        />
      </div>

      <Tabs value={aba} onValueChange={(valor) => setAba(valor as 'compositions' | 'items')}>
        <TabsList>
          <TabsTrigger value="compositions">Composições</TabsTrigger>
          <TabsTrigger value="items">Insumos</TabsTrigger>
        </TabsList>

        <TabsContent value="compositions" className="flex flex-col gap-3 pt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead className="text-right">Custo unitário</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(composicoes.data?.data ?? []).map((composicao) => (
                <TableRow key={composicao.id}>
                  <TableCell className="font-mono text-xs">{composicao.code}</TableCell>
                  <TableCell>
                    <button type="button" className="text-left hover:underline" onClick={() => setAnalitica(composicao.id)}>
                      {composicao.description}
                    </button>
                    {composicao.group && <p className="text-xs text-muted-foreground">{composicao.group}</p>}
                  </TableCell>
                  <TableCell>{composicao.unit}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {composicao.unitCost ? formatUnitCost(composicao.unitCost) : <Badge variant="secondary">Sem custo</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {paginacao(composicoes.data?.meta, setPaginaComposicoes)}
        </TabsContent>

        <TabsContent value="items" className="flex flex-col gap-3 pt-2">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Descrição</TableHead>
                <TableHead>Unidade</TableHead>
                <TableHead>Categoria</TableHead>
                <TableHead className="text-right">Preço</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(insumos.data?.data ?? []).map((insumo) => (
                <TableRow key={insumo.id}>
                  <TableCell className="font-mono text-xs">{insumo.code}</TableCell>
                  <TableCell>{insumo.description}</TableCell>
                  <TableCell>{insumo.unit}</TableCell>
                  <TableCell className="text-muted-foreground">{insumo.category ?? '—'}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {insumo.unitPrice ? formatUnitCost(insumo.unitPrice) : <Badge variant="secondary">Sem preço</Badge>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {paginacao(insumos.data?.meta, setPaginaInsumos)}
        </TabsContent>
      </Tabs>

      <ComposicaoAnalitica datasetId={id} compositionId={analitica} onClose={() => setAnalitica(null)} />
    </div>
  );
}

function ComposicaoAnalitica({
  datasetId,
  compositionId,
  onClose,
}: {
  datasetId: string;
  compositionId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useReferenceComposition(datasetId, compositionId);
  const metadados = (data?.metadata ?? {}) as Record<string, string | null>;

  return (
    <Sheet open={Boolean(compositionId)} onOpenChange={(aberto) => !aberto && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-3xl">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{data ? `${data.code} — ${data.description}` : 'Composição analítica'}</SheetTitle>
          <SheetDescription>
            {data
              ? `${data.dataset.source} ${formatCompetence(data.dataset.competence)} · ${data.dataset.uf} · ${REFERENCE_REGIME_LABELS[data.dataset.regime]} · ${data.unit} · ${data.unitCost ? formatUnitCost(data.unitCost) : 'sem custo'}`
              : ''}
          </SheetDescription>
        </div>
        <div className="flex flex-col gap-3 px-6 py-5">
          {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
          {data && (
            <>
              {(metadados.teamProduction || metadados.fic) && (
                <p className="text-xs text-muted-foreground">
                  {metadados.teamProduction ? `Produção da equipe: ${formatQuantity(metadados.teamProduction)} ${metadados.productionUnit ?? ''}. ` : ''}
                  {metadados.fic ? `FIC: ${metadados.fic}. ` : ''}
                  {data.dataset.source === 'SICRO' ? 'O custo de transporte (seção F) não está incluído no custo unitário direto.' : ''}
                </p>
              )}
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Código</TableHead>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Un.</TableHead>
                      <TableHead className="text-right">Coeficiente</TableHead>
                      <TableHead className="text-right">Preço</TableHead>
                      <TableHead className="text-right">Custo</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.components.map((linha) => (
                      <TableRow key={linha.id}>
                        <TableCell className="text-xs">
                          {linha.section ? `${linha.section} · ` : ''}
                          {REFERENCE_KIND_LABELS[linha.kind] ?? linha.kind}
                        </TableCell>
                        <TableCell className="font-mono text-xs">{linha.code}</TableCell>
                        <TableCell className="text-xs">
                          {linha.description}
                          {linha.situation && <span className="block text-muted-foreground">{linha.situation}</span>}
                        </TableCell>
                        <TableCell className="text-xs">{linha.unit ?? ''}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{linha.coefficient ? formatQuantity(linha.coefficient) : '—'}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{linha.unitPrice ? formatUnitCost(linha.unitPrice) : '—'}</TableCell>
                        <TableCell className="text-right text-xs tabular-nums">{linha.totalCost ? formatUnitCost(linha.totalCost) : '—'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
