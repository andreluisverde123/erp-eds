import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ClipboardList, FileDown, Loader2, Plus } from 'lucide-react';
import { Link, useSearchParams } from 'react-router';
import { Button, EmptyState, ErrorState, Skeleton, cn } from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { MAX_RDOS_POR_PDF, exportReportsPdf, listReports, listSites } from '../api';
import { ActionBar } from '../components/action-bar';
import { ReportRow } from '../components/report-row';
import { REPORT_STATUS_LABEL, REPORT_STATUS_ORDER } from '../components/report-status';
import type { DailyReportStatus, DiarioReport, ReportFilters } from '../types';

/// Períodos oferecidos como atalho. Em campo, "esta semana" e "este mês"
/// cobrem quase tudo e custam um toque; "Personalizado" abre os dois campos de
/// data para o que não couber — tipicamente a medição, que fecha num dia
/// combinado com o cliente e não no fim do mês.
const PERIODOS = [
  { id: 'todos', rotulo: 'Todo período' },
  { id: '7', rotulo: 'Últimos 7 dias' },
  { id: '30', rotulo: 'Últimos 30 dias' },
  { id: 'mes', rotulo: 'Este mês' },
  { id: 'mes-anterior', rotulo: 'Mês passado' },
  { id: 'personalizado', rotulo: 'Personalizado' },
] as const;

type PeriodoId = (typeof PERIODOS)[number]['id'];

/// `AAAA-MM-DD` do calendário do APARELHO. `toISOString` daria o dia em UTC,
/// que às 21h de Brasília já é amanhã.
function dia(data: Date): string {
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  return `${data.getFullYear()}-${mes}-${String(data.getDate()).padStart(2, '0')}`;
}

function intervaloDoPeriodo(
  periodo: PeriodoId,
  personalizado: { de: string; ate: string },
): { dateFrom?: string; dateTo?: string } {
  const hoje = new Date();
  switch (periodo) {
    case '7':
    case '30':
      return {
        dateFrom: dia(
          new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - Number(periodo)),
        ),
      };
    case 'mes':
      return { dateFrom: dia(new Date(hoje.getFullYear(), hoje.getMonth(), 1)) };
    case 'mes-anterior':
      return {
        dateFrom: dia(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
        // Dia 0 do mês corrente é o último do anterior — sem tabela de 28/30/31.
        dateTo: dia(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
      };
    case 'personalizado':
      return { dateFrom: personalizado.de || undefined, dateTo: personalizado.ate || undefined };
    default:
      return {};
  }
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
  const [personalizado, setPersonalizado] = useState({ de: '', ate: '' });

  // Modo de exportação. Guarda os DESMARCADOS, e não os marcados: entrar no
  // modo já seleciona tudo o que o filtro mostra — o caso comum é "o período
  // inteiro" —, e trocar o período traz os relatórios novos já marcados.
  const [exportando, setExportando] = useState(false);
  const [desmarcados, setDesmarcados] = useState<Set<string>>(() => new Set());

  const obras = useQuery({ queryKey: ['diario', 'obras'], queryFn: listSites });

  const filtros: ReportFilters = {
    siteId: obraId,
    status,
    ...intervaloDoPeriodo(periodo, personalizado),
  };

  const consulta = useQuery({
    queryKey: ['diario', 'relatorios', filtros],
    queryFn: () => listReports({ ...filtros, page: 1, limit: 50 }),
  });

  const semFiltro = !obraId && !status && periodo === 'todos';
  const relatorios = consulta.data?.data;
  const selecionados = (relatorios ?? []).filter((relatorio) => !desmarcados.has(relatorio.id));

  function alternar(id: string) {
    setDesmarcados((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

  function sairDaExportacao() {
    setExportando(false);
    setDesmarcados(new Set());
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-foreground">
          {exportando ? 'Exportar relatórios' : 'Relatórios'}
        </h1>
        {!exportando && (relatorios?.length ?? 0) > 0 && (
          <Button variant="outline" size="sm" onClick={() => setExportando(true)}>
            <FileDown className="size-4" />
            Exportar PDF
          </Button>
        )}
      </div>

      {exportando && (
        <p className="mt-1 text-sm text-muted-foreground">
          Escolha o período e desmarque o que não deve ir. Os relatórios saem num PDF só, em ordem
          de data.
        </p>
      )}

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

        {periodo === 'personalizado' && (
          <div className="grid grid-cols-2 gap-3 pt-1">
            <CampoData
              rotulo="De"
              valor={personalizado.de}
              max={personalizado.ate || undefined}
              onChange={(de) => setPersonalizado((atual) => ({ ...atual, de }))}
            />
            <CampoData
              rotulo="Até"
              valor={personalizado.ate}
              min={personalizado.de || undefined}
              onChange={(ate) => setPersonalizado((atual) => ({ ...atual, ate }))}
            />
          </div>
        )}
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
        <>
          {exportando && (
            <div className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                {consulta.data!.meta.total > relatorios.length
                  ? `Mostrando ${relatorios.length} de ${consulta.data!.meta.total}. Reduza o período.`
                  : `${relatorios.length} no período`}
              </span>
              <button
                type="button"
                className="font-medium text-primary"
                onClick={() =>
                  setDesmarcados(
                    selecionados.length > 0
                      ? new Set(relatorios.map((relatorio) => relatorio.id))
                      : new Set(),
                  )
                }
              >
                {selecionados.length > 0 ? 'Desmarcar todos' : 'Marcar todos'}
              </button>
            </div>
          )}

          <ul className={cn('space-y-2.5', exportando ? 'mt-2' : 'mt-4')}>
            {relatorios.map((relatorio) => (
              <ReportRow
                key={relatorio.id}
                report={relatorio}
                showSite={!obraId}
                selecao={
                  exportando
                    ? {
                        marcado: !desmarcados.has(relatorio.id),
                        onAlternar: () => alternar(relatorio.id),
                      }
                    : undefined
                }
              />
            ))}
          </ul>
        </>
      )}

      {exportando && (
        <BarraDeExportacao selecionados={selecionados} onCancelar={sairDaExportacao} />
      )}
    </div>
  );
}

/// A faixa do modo de exportação: quantos vão, cancelar e exportar.
function BarraDeExportacao({
  selecionados,
  onCancelar,
}: {
  selecionados: DiarioReport[];
  onCancelar: () => void;
}) {
  const exportar = useMutation({ mutationFn: () => exportReportsPdf(selecionados) });
  const quantos = selecionados.length;
  const acimaDoTeto = quantos > MAX_RDOS_POR_PDF;

  const mensagem = acimaDoTeto
    ? `Até ${MAX_RDOS_POR_PDF} relatórios por arquivo. Reduza o período ou desmarque alguns.`
    : exportar.error instanceof ApiError
      ? exportar.error.message
      : exportar.error
        ? 'Não foi possível gerar o PDF. Tente novamente.'
        : null;

  return (
    <ActionBar className="space-y-2">
      {mensagem && <p className="text-sm text-destructive">{mensagem}</p>}
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-sm leading-tight">
          <span className="block text-lg font-semibold tabular-nums text-foreground">
            {quantos}
          </span>
          <span className="text-muted-foreground">
            {quantos === 1 ? 'selecionado' : 'selecionados'}
          </span>
        </p>
        <Button variant="ghost" size="lg" className="h-12" onClick={onCancelar}>
          Cancelar
        </Button>
        <Button
          size="lg"
          className="h-12 text-base"
          disabled={quantos === 0 || acimaDoTeto || exportar.isPending}
          onClick={() => exportar.mutate()}
        >
          {exportar.isPending ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <FileDown className="size-5" />
          )}
          {exportar.isPending ? 'Gerando…' : 'Exportar'}
        </Button>
      </div>
    </ActionBar>
  );
}

function CampoData({
  rotulo,
  valor,
  min,
  max,
  onChange,
}: {
  rotulo: string;
  valor: string;
  min?: string;
  max?: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{rotulo}</span>
      {/* Nativo pelo mesmo motivo do "Novo relatório": no celular abre o
          seletor do sistema. `text-base` evita o zoom do Safari ao focar. */}
      <input
        type="date"
        value={valor}
        min={min}
        max={max}
        onChange={(evento) => onChange(evento.target.value)}
        className={cn(
          'mt-1 h-11 w-full rounded-lg border border-input bg-background px-3 text-base',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      />
    </label>
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
