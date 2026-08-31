import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CalendarDays, Copy, FilePlus2, Loader2 } from 'lucide-react';
import { useNavigate, useSearchParams } from 'react-router';
import { Alert, AlertTitle, Button, EmptyState, ErrorState, Skeleton, cn } from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { copyReport, createReport, listReports, listSites } from '../api';
import {
  REPORT_STATUS_CLASS,
  REPORT_STATUS_LABEL,
  formatReportDate,
  toDateInputValue,
  weekdayPreview,
} from '../components/report-status';
import { SiteCard } from '../components/site-card';
import type { DiarioReport, DiarioSite } from '../types';

type Etapa = 'obra' | 'data';
type Origem = { tipo: 'zero' } | { tipo: 'copia'; sourceId: string | null };

/// Criação do RDO, em duas etapas curtas: obra e data.
///
/// Duas etapas, e não um formulário só, porque a primeira decisão elimina a
/// maior parte do ruído da segunda — escolhida a obra, os relatórios que dá
/// para copiar já são só os dela. E porque uma tela de celular comporta uma
/// pergunta de cada vez muito melhor do que três.
export function DiarioNovoRelatorioPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const obraPreSelecionada = searchParams.get('obra');
  const [obraId, setObraId] = useState<string | null>(obraPreSelecionada);
  // Vindo da tela da obra a escolha já está feita; vindo da Home, não.
  const [etapa, setEtapa] = useState<Etapa>(obraPreSelecionada ? 'data' : 'obra');
  const [data, setData] = useState(() => toDateInputValue(new Date()));
  const [origem, setOrigem] = useState<Origem>({ tipo: 'zero' });

  const obras = useQuery({ queryKey: ['diario', 'obras'], queryFn: listSites });
  const obra = obras.data?.find((item) => item.id === obraId) ?? null;

  const criar = useMutation({
    mutationFn: () =>
      origem.tipo === 'copia' && origem.sourceId
        ? copyReport(origem.sourceId, { reportDate: data })
        : createReport({ constructionSiteId: obraId!, reportDate: data }),
    onSuccess: (relatorio) => {
      // A Home mostra "último RDO" por obra e os relatórios recentes; as duas
      // ficam desatualizadas no instante em que este aqui nasce.
      void queryClient.invalidateQueries({ queryKey: ['diario'] });
      navigate(`/relatorios/${relatorio.id}`, { replace: true });
    },
  });

  function voltar() {
    if (etapa === 'data' && !obraPreSelecionada) {
      setEtapa('obra');
      setOrigem({ tipo: 'zero' });
      return;
    }
    navigate('/');
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <button
        type="button"
        onClick={voltar}
        className="-ml-2 mb-2 inline-flex h-10 items-center gap-1.5 px-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        {etapa === 'data' && !obraPreSelecionada ? 'Obras' : 'Início'}
      </button>

      <h1 className="text-xl font-semibold text-foreground">Novo relatório</h1>

      {etapa === 'obra' ? (
        <EscolhaDaObra
          obras={obras.data}
          carregando={obras.isPending}
          erro={obras.isError}
          onEscolher={(escolhida) => {
            setObraId(escolhida.id);
            setEtapa('data');
          }}
          onTentarDeNovo={() => void obras.refetch()}
        />
      ) : (
        <EscolhaDaData
          obra={obra}
          data={data}
          origem={origem}
          enviando={criar.isPending}
          erro={criar.error}
          onData={setData}
          onOrigem={setOrigem}
          onCriar={() => criar.mutate()}
        />
      )}
    </div>
  );
}

function EscolhaDaObra({
  obras,
  carregando,
  erro,
  onEscolher,
  onTentarDeNovo,
}: {
  obras: DiarioSite[] | undefined;
  carregando: boolean;
  erro: boolean;
  onEscolher: (obra: DiarioSite) => void;
  onTentarDeNovo: () => void;
}) {
  return (
    <>
      <p className="mt-0.5 text-sm text-muted-foreground">Em qual obra é este relatório?</p>

      {carregando && (
        <div className="mt-4 space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {erro && (
        <>
          <ErrorState className="mt-4" message="Não foi possível carregar as obras." />
          <Button variant="secondary" className="mt-3 h-12 w-full" onClick={onTentarDeNovo}>
            Tentar novamente
          </Button>
        </>
      )}

      {obras?.length === 0 && (
        <EmptyState
          icon={Building2}
          title="Nenhuma obra vinculada"
          description="Sem vínculo com uma obra não há relatório a criar. Fale com a coordenação."
          className="mt-4 px-6"
        />
      )}

      {obras && obras.length > 0 && (
        <ul className="mt-4 space-y-3">
          {obras.map((obra) => (
            <li key={obra.id}>
              <SiteCard site={obra} onSelect={() => onEscolher(obra)} />
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function EscolhaDaData({
  obra,
  data,
  origem,
  enviando,
  erro,
  onData,
  onOrigem,
  onCriar,
}: {
  obra: DiarioSite | null;
  data: string;
  origem: Origem;
  enviando: boolean;
  erro: unknown;
  onData: (valor: string) => void;
  onOrigem: (origem: Origem) => void;
  onCriar: () => void;
}) {
  const anteriores = useQuery({
    queryKey: ['diario', 'relatorios', { siteId: obra?.id }],
    queryFn: () => listReports({ siteId: obra!.id, page: 1, limit: 20 }),
    enabled: Boolean(obra) && origem.tipo === 'copia',
  });

  const faltaEscolherOrigem = origem.tipo === 'copia' && !origem.sourceId;
  const mensagem =
    erro instanceof ApiError ? erro.message : erro ? 'Não foi possível criar o relatório.' : null;

  return (
    <>
      <p className="mt-0.5 truncate text-sm text-muted-foreground">
        {obra ? obra.name : 'Carregando obra…'}
      </p>

      <section className="mt-5">
        <label
          htmlFor="report-date"
          className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
        >
          Data do relatório
        </label>
        {/* `<input type="date">` nativo de propósito: no celular ele abre o
            seletor do próprio sistema, que a pessoa já sabe usar e que funciona
            com a tela molhada e uma mão só. Um calendário desenhado em HTML
            seria menor, mais lento e estranho ao aparelho. */}
        <input
          id="report-date"
          type="date"
          value={data}
          onChange={(event) => onData(event.target.value)}
          className={cn(
            'mt-2 h-12 w-full rounded-lg border border-input bg-background px-3 text-base',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          )}
        />
        <p className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
          <CalendarDays className="size-4" />
          {weekdayPreview(data) || 'Escolha uma data'}
        </p>
      </section>

      <section className="mt-6">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Como começar?
        </h2>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <OpcaoDeOrigem
            icone={FilePlus2}
            titulo="Do zero"
            selecionada={origem.tipo === 'zero'}
            onClick={() => onOrigem({ tipo: 'zero' })}
          />
          <OpcaoDeOrigem
            icone={Copy}
            titulo="Copiar anterior"
            selecionada={origem.tipo === 'copia'}
            onClick={() => onOrigem({ tipo: 'copia', sourceId: null })}
          />
        </div>
      </section>

      {origem.tipo === 'copia' && (
        <EscolhaDoRelatorioDeOrigem
          relatorios={anteriores.data?.data}
          carregando={anteriores.isPending}
          selecionado={origem.sourceId}
          onSelecionar={(sourceId) => onOrigem({ tipo: 'copia', sourceId })}
        />
      )}

      {mensagem && (
        <Alert variant="destructive" className="mt-5">
          <AlertTitle>{mensagem}</AlertTitle>
        </Alert>
      )}

      <Button
        size="lg"
        className="mt-6 h-12 w-full text-base"
        disabled={!obra || !data || faltaEscolherOrigem || enviando}
        onClick={onCriar}
      >
        {enviando ? <Loader2 className="size-5 animate-spin" /> : null}
        {enviando ? 'Criando…' : 'Criar relatório'}
      </Button>

      {faltaEscolherOrigem && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Escolha o relatório que será copiado.
        </p>
      )}
    </>
  );
}

function OpcaoDeOrigem({
  icone: Icone,
  titulo,
  selecionada,
  onClick,
}: {
  icone: typeof Copy;
  titulo: string;
  selecionada: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selecionada}
      className={cn(
        'flex h-24 flex-col items-center justify-center gap-2 rounded-xl border text-sm font-medium',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selecionada
          ? 'border-primary bg-primary/5 text-primary'
          : 'border-border bg-background text-foreground',
      )}
    >
      <Icone className="size-5" />
      {titulo}
    </button>
  );
}

/// Lista dos relatórios anteriores DA MESMA OBRA. A obra do relatório copiado
/// é derivada da origem no backend — não há como escolher aqui um RDO de outra
/// obra, e mesmo que houvesse, a API recusaria.
function EscolhaDoRelatorioDeOrigem({
  relatorios,
  carregando,
  selecionado,
  onSelecionar,
}: {
  relatorios: DiarioReport[] | undefined;
  carregando: boolean;
  selecionado: string | null;
  onSelecionar: (id: string) => void;
}) {
  if (carregando) {
    return (
      <div className="mt-4 space-y-2.5">
        <Skeleton className="h-16 w-full rounded-xl" />
        <Skeleton className="h-16 w-full rounded-xl" />
      </div>
    );
  }

  if (!relatorios || relatorios.length === 0) {
    return (
      <p className="mt-4 rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground">
        Esta obra ainda não tem relatórios para copiar. Comece do zero.
      </p>
    );
  }

  const [ultimo, ...demais] = relatorios;

  return (
    <div className="mt-4 space-y-4">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Último relatório
        </h3>
        <RelatorioDeOrigem
          relatorio={ultimo!}
          selecionado={selecionado === ultimo!.id}
          onSelecionar={onSelecionar}
        />
      </div>

      {demais.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Escolher outro
          </h3>
          <ul className="space-y-2.5">
            {demais.map((relatorio) => (
              <li key={relatorio.id}>
                <RelatorioDeOrigem
                  relatorio={relatorio}
                  selecionado={selecionado === relatorio.id}
                  onSelecionar={onSelecionar}
                />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function RelatorioDeOrigem({
  relatorio,
  selecionado,
  onSelecionar,
}: {
  relatorio: DiarioReport;
  selecionado: boolean;
  onSelecionar: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onSelecionar(relatorio.id)}
      aria-pressed={selecionado}
      className={cn(
        'flex w-full items-center gap-3 rounded-xl border p-3.5 text-left',
        'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selecionado ? 'border-primary bg-primary/5' : 'border-border bg-background',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-semibold tabular-nums text-foreground">
            RDO #{relatorio.number}
          </p>
          <span
            className={cn(
              'rounded-full px-2 py-0.5 text-[10px] font-medium',
              REPORT_STATUS_CLASS[relatorio.status],
            )}
          >
            {REPORT_STATUS_LABEL[relatorio.status]}
          </span>
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {formatReportDate(relatorio.reportDate)} · {relatorio.createdBy.name}
        </p>
      </div>
      <span
        aria-hidden
        className={cn(
          'size-5 shrink-0 rounded-full border-2',
          selecionado ? 'border-primary bg-primary' : 'border-border',
        )}
      />
    </button>
  );
}
