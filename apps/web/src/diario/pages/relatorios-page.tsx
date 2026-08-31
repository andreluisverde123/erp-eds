import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardList, Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button, EmptyState, ErrorState, Skeleton, cn } from '@repo/ui';

import { listReports, listSites } from '../api';
import { ReportRow } from '../components/report-row';
import { REPORT_STATUS_LABEL, REPORT_STATUS_ORDER } from '../components/report-status';
import type { DailyReportStatus, ReportFilters } from '../types';

/// Períodos oferecidos como atalho. Um seletor de intervalo com dois
/// calendários é a resposta de desktop; em campo, "esta semana" e "este mês"
/// cobrem quase tudo e custam um toque.
const PERIODOS = [
  { id: 'todos', rotulo: 'Todo período', dias: null },
  { id: '7', rotulo: 'Últimos 7 dias', dias: 7 },
  { id: '30', rotulo: 'Últimos 30 dias', dias: 30 },
] as const;

type PeriodoId = (typeof PERIODOS)[number]['id'];

function inicioDoPeriodo(dias: number): string {
  const data = new Date();
  data.setUTCHours(0, 0, 0, 0);
  data.setUTCDate(data.getUTCDate() - dias);
  return data.toISOString().slice(0, 10);
}

export function DiarioRelatoriosPage() {
  // A obra vem da URL quando se chega pela tela da obra ("Ver relatórios"), e
  // volta para a URL a cada troca de chip. Sem isso o filtro morria no estado
  // local: não havia caminho de "obra" para "os RDOs desta obra", que é o
  // segundo passo do fluxo principal do Diário.
  const [searchParams, setSearchParams] = useSearchParams();
  const obraId = searchParams.get('obra') ?? undefined;

  const setObraId = (id: string | undefined) => {
    setSearchParams(
      (atual) => {
        const proximo = new URLSearchParams(atual);
        if (id) proximo.set('obra', id);
        else proximo.delete('obra');
        return proximo;
      },
      // `replace`: filtrar não é navegar. Sem isso, voltar do RDO passaria por
      // cada chip que a pessoa tocou antes de abrir o relatório.
      { replace: true },
    );
  };

  const [status, setStatus] = useState<DailyReportStatus | undefined>();
  const [periodo, setPeriodo] = useState<PeriodoId>('todos');

  const obras = useQuery({ queryKey: ['diario', 'obras'], queryFn: listSites });

  const dias = PERIODOS.find((item) => item.id === periodo)?.dias ?? null;
  const filtros: ReportFilters = {
    siteId: obraId,
    status,
    dateFrom: dias ? inicioDoPeriodo(dias) : undefined,
  };

  const consulta = useQuery({
    queryKey: ['diario', 'relatorios', filtros],
    queryFn: () => listReports({ ...filtros, page: 1, limit: 50 }),
  });

  const semFiltro = !obraId && !status && periodo === 'todos';
  const relatorios = consulta.data?.data;

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <h1 className="text-xl font-semibold text-foreground">Relatórios</h1>

      {/* Filtros em faixas roláveis horizontalmente, e não em selects: numa
          tela de 375px três selects empilhados custam metade da altura útil, e
          cada um exige abrir um menu para ver as opções. Aqui as opções estão
          à vista e a escolha é um toque. */}
      <div className="mt-3 space-y-2">
        {(obras.data?.length ?? 0) > 1 && (
          <FaixaDeFiltro rotulo="Obra">
            {/* "Todas as obras", e não "Todas": havia dois botões com o mesmo
                rótulo na tela (obra e situação), indistinguíveis para quem usa
                leitor de tela — e ambíguos para qualquer um que lesse fora de
                contexto. */}
            <Chip ativo={!obraId} onClick={() => setObraId(undefined)}>
              Todas as obras
            </Chip>
            {obras.data?.map((obra) => (
              <Chip key={obra.id} ativo={obraId === obra.id} onClick={() => setObraId(obra.id)}>
                {obra.name}
              </Chip>
            ))}
          </FaixaDeFiltro>
        )}

        <FaixaDeFiltro rotulo="Situação">
          <Chip ativo={!status} onClick={() => setStatus(undefined)}>
            Todas as situações
          </Chip>
          {REPORT_STATUS_ORDER.map((valor) => (
            <Chip key={valor} ativo={status === valor} onClick={() => setStatus(valor)}>
              {REPORT_STATUS_LABEL[valor]}
            </Chip>
          ))}
        </FaixaDeFiltro>

        <FaixaDeFiltro rotulo="Período">
          {PERIODOS.map((item) => (
            <Chip key={item.id} ativo={periodo === item.id} onClick={() => setPeriodo(item.id)}>
              {item.rotulo}
            </Chip>
          ))}
        </FaixaDeFiltro>
      </div>

      {consulta.isPending && (
        <div className="mt-4 space-y-2.5">
          <Skeleton className="h-[72px] w-full rounded-xl" />
          <Skeleton className="h-[72px] w-full rounded-xl" />
          <Skeleton className="h-[72px] w-full rounded-xl" />
        </div>
      )}

      {consulta.isError && (
        <>
          <ErrorState className="mt-4" message="Não foi possível carregar os relatórios." />
          <Button
            variant="secondary"
            className="mt-3 h-12 w-full"
            onClick={() => void consulta.refetch()}
          >
            Tentar novamente
          </Button>
        </>
      )}

      {relatorios?.length === 0 &&
        (semFiltro ? (
          <div className="mt-4">
            <EmptyState
              icon={ClipboardList}
              title="Nenhum relatório criado ainda"
              description="O primeiro RDO de uma obra sua começa aqui."
              className="min-h-44 px-6"
            />
            <Button asChild size="lg" className="mt-3 h-12 w-full text-base">
              <Link to="/relatorios/novo">
                <Plus className="size-5" />
                Criar primeiro relatório
              </Link>
            </Button>
          </div>
        ) : (
          <EmptyState
            icon={ClipboardList}
            title="Nada com esses filtros"
            description="Ajuste obra, situação ou período para ver outros relatórios."
            className="mt-4 min-h-44 px-6"
          />
        ))}

      {relatorios && relatorios.length > 0 && (
        <ul className="mt-4 space-y-2.5">
          {relatorios.map((relatorio) => (
            <ReportRow key={relatorio.id} report={relatorio} showSite={!obraId} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FaixaDeFiltro({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    // `role="group"` com rótulo: sem ele os chips chegam ao leitor de tela como
    // uma sequência solta de botões, sem dizer o que cada faixa filtra.
    <div role="group" aria-label={`Filtrar por ${rotulo.toLowerCase()}`}>
      <p className="sr-only">{rotulo}</p>
      {/* `-mx-4 px-4` deixa a faixa sangrar até a borda da tela: o último chip
          encostando na margem sinaliza que há mais para o lado. */}
      <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {children}
      </div>
    </div>
  );
}

function Chip({
  ativo,
  onClick,
  children,
}: {
  ativo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={cn(
        'h-9 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-xs font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        ativo
          ? 'border-primary bg-primary text-primary-foreground'
          : 'border-border bg-background text-muted-foreground',
      )}
    >
      {children}
    </button>
  );
}
