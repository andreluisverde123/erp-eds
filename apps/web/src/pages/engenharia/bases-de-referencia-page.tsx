import { useState } from 'react';
import { Database, Upload } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
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
import { ImportReferenceDatasetSheet } from '@/features/bases-referencia/components/import-reference-dataset-sheet';
import { useReferenceDatasets } from '@/features/bases-referencia/hooks';
import { BRAZILIAN_UFS, REFERENCE_SOURCE_LABELS } from '@/features/bases-referencia/labels';
import type { ReferenceRegime, ReferenceSource } from '@/features/bases-referencia/types';
import { formatCompetence, REFERENCE_REGIME_LABELS } from '@/features/orcamentos/format';

const PAGE_SIZE = 20;
const TODAS = 'ALL';

/// Bases de referência (SINAPI, SICRO) importadas. São dados públicos,
/// compartilhados e somente leitura: consultar exige `orcamentos.view`;
/// importar, `orcamentos.manage`.
export function BasesDeReferenciaPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.permissions.includes('orcamentos.manage') ?? false;

  const [page, setPage] = useState(1);
  const [fonte, setFonte] = useState(TODAS);
  const [uf, setUf] = useState(TODAS);
  const [regime, setRegime] = useState(TODAS);
  const [competencia, setCompetencia] = useState('');
  const [importando, setImportando] = useState(false);

  const { data, isLoading, isError } = useReferenceDatasets({
    page,
    limit: PAGE_SIZE,
    source: fonte === TODAS ? undefined : (fonte as ReferenceSource),
    uf: uf === TODAS ? undefined : uf,
    regime: regime === TODAS ? undefined : (regime as ReferenceRegime),
    competence: /^\d{4}-\d{2}$/.test(competencia) ? competencia : undefined,
  });
  const meta = data?.meta;

  const filtro = (rotulo: string, valor: string, mudar: (v: string) => void, opcoes: [string, string][]) => (
    <Select
      value={valor}
      onValueChange={(novo) => {
        mudar(novo);
        setPage(1);
      }}
    >
      <SelectTrigger className="sm:w-[190px]" aria-label={rotulo}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map(([codigo, nome]) => (
          <SelectItem key={codigo} value={codigo}>
            {nome}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Bases de Referência</h1>
          <p className="text-sm text-muted-foreground">
            SINAPI e SICRO importados dos arquivos oficiais, por competência, localização e regime.
          </p>
        </div>
        {canManage && (
          <Button onClick={() => setImportando(true)}>
            <Upload />
            Importar base
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {filtro('Fonte', fonte, setFonte, [
          [TODAS, 'Todas as fontes'],
          ['SINAPI', REFERENCE_SOURCE_LABELS.SINAPI],
          ['SICRO', REFERENCE_SOURCE_LABELS.SICRO],
        ])}
        {filtro('UF', uf, setUf, [[TODAS, 'Todas as UFs'], ...BRAZILIAN_UFS.map((s): [string, string] => [s, s])])}
        {filtro('Regime', regime, setRegime, [
          [TODAS, 'Todos os regimes'],
          ...(Object.keys(REFERENCE_REGIME_LABELS) as ReferenceRegime[]).map((c): [string, string] => [c, REFERENCE_REGIME_LABELS[c]]),
        ])}
        <Input
          type="month"
          value={competencia}
          onChange={(evento) => {
            setCompetencia(evento.target.value);
            setPage(1);
          }}
          aria-label="Competência"
          className="sm:w-[170px]"
        />
      </div>

      {isError && <ErrorState message="Não foi possível carregar as bases. Tente novamente." />}
      {!isError && isLoading && !data && <TableSkeleton columns={7} rows={5} message="Carregando bases..." />}

      {data && data.data.length === 0 && (
        <EmptyState
          icon={Database}
          title="Nenhuma base importada"
          description={canManage ? 'Importe o SINAPI ou o SICRO a partir dos arquivos oficiais.' : 'Ainda não há bases de referência importadas.'}
        />
      )}

      {data && data.data.length > 0 && (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Fonte</TableHead>
                <TableHead>Competência</TableHead>
                <TableHead>Localização</TableHead>
                <TableHead>Regime</TableHead>
                <TableHead className="text-right">Insumos</TableHead>
                <TableHead className="text-right">Composições</TableHead>
                <TableHead>Importada em</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.data.map((base) => (
                <TableRow key={base.id}>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-foreground hover:underline"
                      onClick={() => navigate(`/engenharia/bases-de-referencia/${base.id}`)}
                    >
                      {base.source}
                      {base.versionLabel ? ` (${base.versionLabel})` : ''}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatCompetence(base.competence)}</TableCell>
                  <TableCell>
                    {base.uf}
                    {base.locality ? ` — ${base.locality}` : ''}
                  </TableCell>
                  <TableCell>{REFERENCE_REGIME_LABELS[base.regime]}</TableCell>
                  <TableCell className="text-right tabular-nums">{base.itemCount.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-right tabular-nums">{base.compositionCount.toLocaleString('pt-BR')}</TableCell>
                  <TableCell className="text-muted-foreground">{new Date(base.importedAt).toLocaleDateString('pt-BR')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          {meta && meta.totalPages > 1 && (
            <div className="flex items-center justify-end">
              <Pagination>
                <PaginationPrevious onClick={() => setPage((p) => Math.max(1, p - 1))} aria-disabled={meta.page === 1} />
                <PaginationNext onClick={() => setPage((p) => Math.min(meta.totalPages, p + 1))} aria-disabled={meta.page === meta.totalPages} />
              </Pagination>
            </div>
          )}
        </>
      )}

      {canManage && (
        <ImportReferenceDatasetSheet
          open={importando}
          onOpenChange={setImportando}
          onImported={(id) => navigate(`/engenharia/bases-de-referencia/${id}`)}
        />
      )}
    </div>
  );
}
