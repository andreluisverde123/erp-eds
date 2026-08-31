import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Copy, Loader2, PencilLine } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button, ErrorState, Skeleton, cn } from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { getReport, updateReport, type ReportPatch } from '../api';
import { REPORT_STATUS_CLASS, formatReportDate } from '../components/report-status';
import { AutosaveIndicator } from '../components/autosave-indicator';
import { ReportSectionCard } from '../components/report-section-card';
import { DeleteReport } from '../components/delete-report';
import { ExportReportPdf } from '../components/export-report-pdf';
import { FinalizeReport } from '../components/finalize-report';
import { SiteDataSection } from '../components/site-data-section';
import { ActivitiesSection } from '../components/sections/activities-section';
import { EquipmentSection } from '../components/sections/equipment-section';
import { LaborSection } from '../components/sections/labor-section';
import { MaterialsSection } from '../components/sections/materials-section';
import { MediaSection } from '../components/media/media-section';
import { OccurrencesSection } from '../components/sections/occurrences-section';
import { WeatherSection } from '../components/sections/weather-section';
import { WorkScheduleSection } from '../components/sections/work-schedule-section';
import { useReportDraft } from '../hooks/use-report-draft';
import type { DiarioReportDetail } from '../types';

/// Busca o relatório e cuida dos estados de carregamento e erro. A edição vive
/// no componente abaixo.
export function DiarioRdoPage() {
  const { id } = useParams<{ id: string }>();

  const consulta = useQuery({
    queryKey: ['diario', 'relatorios', id],
    queryFn: () => getReport(id!),
    enabled: Boolean(id),
    // Um 404 aqui significa "este relatório não é de uma obra sua" — repetir a
    // chamada não mudaria a resposta.
    retry: (tentativas, erro) =>
      erro instanceof ApiError && erro.status === 404 ? false : tentativas < 1,
  });

  if (consulta.isPending) {
    return <CarregandoRdo />;
  }

  if (consulta.isError || !consulta.data) {
    const naoEncontrado = consulta.error instanceof ApiError && consulta.error.status === 404;
    return (
      <div className="mx-auto max-w-2xl px-4 py-4">
        <VoltarParaRelatorios />
        <ErrorState
          message={
            naoEncontrado
              ? 'Relatório não encontrado ou não vinculado ao seu acesso.'
              : 'Não foi possível carregar o relatório.'
          }
        />
        {!naoEncontrado && (
          <Button
            variant="secondary"
            className="mt-3 h-12 w-full"
            onClick={() => void consulta.refetch()}
          >
            Tentar novamente
          </Button>
        )}
      </div>
    );
  }

  // `key` no id: abrir outro relatório MONTA outro editor, em vez de tentar
  // reaproveitar o anterior e sincronizar o texto por efeito. É a forma que o
  // React recomenda para "reiniciar o estado quando a entrada muda" — e a que
  // não corre o risco de sobrescrever o que está sendo digitado.
  return <RdoEditor key={consulta.data.id} relatorio={consulta.data} />;
}

function RdoEditor({ relatorio }: { relatorio: DiarioReportDetail }) {
  const queryClient = useQueryClient();
  const editavel = relatorio.editable;

  // UM caminho de gravação para TODOS os campos escalares — observações,
  // jornada e clima. Antes eram dois (autosave para observações, mutação
  // direta para o resto), e a divergência produzia PATCH por tecla nos
  // `<textarea>` de jornada e clima, requisições concorrentes em toques
  // rápidos e erro de validação invisível na tela.
  const draft = useReportDraft({
    initial: {
      notes: relatorio.notes,
      scheduleNotes: relatorio.scheduleNotes,
      weatherNotes: relatorio.weatherNotes,
      workStartTime: relatorio.workSchedule.startTime,
      workBreakStartTime: relatorio.workSchedule.breakStartTime,
      workBreakEndTime: relatorio.workSchedule.breakEndTime,
      workEndTime: relatorio.workSchedule.endTime,
      morningWeather: relatorio.morningWeather,
      afternoonWeather: relatorio.afternoonWeather,
    },
    enabled: editavel,
    onSave: async (patch) => {
      const atualizado = await updateReport(relatorio.id, patch as ReportPatch);
      // Escreve direto no cache em vez de invalidar: um refetch traria o texto
      // de volta do servidor e brigaria com o que está sendo digitado.
      queryClient.setQueryData(['diario', 'relatorios', relatorio.id], atualizado);
      // A Home mostra "último RDO" por obra — essa, sim, precisa recarregar.
      void queryClient.invalidateQueries({ queryKey: ['diario', 'home'] });
    },
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <VoltarParaRelatorios />

      <header>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold tabular-nums text-foreground">
              RDO #{relatorio.number}
            </h1>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                REPORT_STATUS_CLASS[relatorio.status],
              )}
            >
              {relatorio.statusLabel}
            </span>
          </div>

          <ExportReportPdf report={relatorio} />
        </div>

        <p className="mt-1 truncate text-sm font-medium text-foreground">
          {relatorio.constructionSite.name}
        </p>
        {/* Data e dia da semana vêm prontos do backend — o navegador não
            recalcula nem um nem outro. */}
        <p className="text-sm text-muted-foreground">
          {formatReportDate(relatorio.reportDate)} · {relatorio.weekday}
        </p>

        {relatorio.copiedFrom && (
          <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
            <Copy className="size-3" />
            Copiado do RDO #{relatorio.copiedFrom.number}
          </p>
        )}

        {/* O indicador fica no CABEÇALHO, e não dentro de uma seção: agora que
            horário, clima e observações salvam sozinhos, "salvou?" é uma
            pergunta sobre o relatório inteiro, e a resposta precisa estar
            visível de qualquer seção aberta. */}
        {editavel && (
          <AutosaveIndicator
            state={draft.state}
            savedAt={draft.savedAt}
            error={draft.error}
            onRetry={draft.flush}
          />
        )}
      </header>

      <div className="mt-5 space-y-3">
        <SiteDataSection site={relatorio.constructionSite} schedule={relatorio.schedule} />

        <WorkScheduleSection report={relatorio} draft={draft} disabled={!editavel} />
        <WeatherSection report={relatorio} draft={draft} disabled={!editavel} />
        <LaborSection report={relatorio} disabled={!editavel} />
        <EquipmentSection report={relatorio} disabled={!editavel} />
        <ActivitiesSection report={relatorio} disabled={!editavel} />
        <OccurrencesSection report={relatorio} disabled={!editavel} />
        <MaterialsSection report={relatorio} disabled={!editavel} />

        <ReportSectionCard
          titulo="Observações gerais"
          icone={PencilLine}
          descricao="O que mais precisa constar no dia."
          resumo={relatorio.summary.hasNotes ? 'Preenchidas' : null}
          concluida={relatorio.summary.hasNotes}
          aberta
        >
          <textarea
            value={draft.values.notes ?? ''}
            onChange={(evento) => draft.setField('notes', evento.target.value)}
            readOnly={!editavel}
            rows={5}
            maxLength={5000}
            placeholder="Registre aqui o que mais precisa constar no dia."
            aria-label="Observações do relatório"
            className={cn(
              // `text-base` (16px) não é escolha estética: abaixo disso o
              // Safari do iOS dá zoom no campo ao focar, e a tela inteira sai
              // do lugar no meio da digitação.
              'w-full resize-y rounded-lg border border-input bg-background p-3 text-base',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              !editavel && 'cursor-not-allowed opacity-70',
            )}
          />
        </ReportSectionCard>

        <MediaSection report={relatorio} disabled={!editavel} type="PHOTO" />
        <MediaSection report={relatorio} disabled={!editavel} type="VIDEO" />
      </div>

      {/* Depois de todas as seções: finalizar é a última coisa do dia. */}
      <FinalizeReport report={relatorio} />
      <DeleteReport report={relatorio} />
    </div>
  );
}

function VoltarParaRelatorios() {
  return (
    <Link
      to="/relatorios"
      className="-ml-2 mb-2 inline-flex h-10 items-center gap-1.5 px-2 text-sm text-muted-foreground"
    >
      <ArrowLeft className="size-4" />
      Relatórios
    </Link>
  );
}

function CarregandoRdo() {
  return (
    <div className="mx-auto max-w-2xl space-y-3 px-4 py-4">
      <Skeleton className="h-10 w-24" />
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-4 w-52" />
      <Skeleton className="h-32 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <Skeleton className="h-16 w-full rounded-xl" />
      <span className="sr-only">
        <Loader2 />
        Carregando o relatório…
      </span>
    </div>
  );
}
