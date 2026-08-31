import { Clock } from 'lucide-react';
import { cn } from '@repo/ui';

import type { ReportDraft } from '../../hooks/use-report-draft';
import type { DiarioReportDetail } from '../../types';
import { ReportSectionCard } from '../report-section-card';

const CAMPOS = [
  { chave: 'startTime', patch: 'workStartTime', rotulo: 'Início' },
  { chave: 'breakStartTime', patch: 'workBreakStartTime', rotulo: 'Intervalo' },
  { chave: 'breakEndTime', patch: 'workBreakEndTime', rotulo: 'Retorno' },
  { chave: 'endTime', patch: 'workEndTime', rotulo: 'Término' },
] as const;

/// Horário de trabalho.
///
/// Quatro `<input type="time">` nativos: no celular eles abrem o seletor do
/// próprio sistema, que a pessoa já sabe usar e que funciona com a tela
/// molhada e uma mão só. Um relógio desenhado em HTML seria menor, mais lento
/// e estranho ao aparelho.
///
/// Nenhum campo é obrigatório, e essa é a regra: o RDO é preenchido ao longo
/// do dia, e travar a seção esperando o horário de término às 9h da manhã
/// impediria de registrar o resto.
export function WorkScheduleSection({
  report,
  draft,
  disabled,
}: {
  report: DiarioReportDetail;
  /// Os campos leem e escrevem no RASCUNHO, não no relatório do servidor: o
  /// valor digitado precisa continuar na tela enquanto o PATCH viaja, e um
  /// `defaultValue` ligado ao servidor voltava ao valor antigo a cada
  /// recarga do cache.
  draft: ReportDraft;
  disabled: boolean;
}) {
  const preenchidos = CAMPOS.filter((campo) => draft.values[campo.patch]).length;

  return (
    <ReportSectionCard
      titulo="Horário de trabalho"
      icone={Clock}
      descricao="Jornada da equipe no dia."
      resumo={resumo(draft)}
      concluida={report.summary.hasSchedule}
      aberta={preenchidos === 0}
    >
      <dl className="text-sm">
        {CAMPOS.map((campo) => (
          <div
            key={campo.chave}
            className="flex items-center justify-between gap-4 border-b border-border py-2 last:border-b-0"
          >
            <dt>
              <label htmlFor={`horario-${campo.chave}`} className="text-foreground">
                {campo.rotulo}
              </label>
            </dt>
            <dd>
              <input
                id={`horario-${campo.chave}`}
                type="time"
                value={draft.values[campo.patch] ?? ''}
                disabled={disabled}
                // Horário é escolhido de uma vez, não digitado letra a letra:
                // grava na hora, sem esperar o debounce.
                onChange={(evento) => draft.setFieldNow(campo.patch, evento.target.value)}
                className={cn(
                  'h-11 w-32 rounded-lg border border-input bg-background px-3 text-right text-base tabular-nums',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  disabled && 'cursor-not-allowed opacity-70',
                )}
              />
            </dd>
          </div>
        ))}
      </dl>

      <label
        htmlFor="horario-observacao"
        className="mt-3 block text-xs font-medium text-muted-foreground"
      >
        Observação do horário
      </label>
      <textarea
        id="horario-observacao"
        rows={2}
        maxLength={500}
        value={draft.values.scheduleNotes ?? ''}
        disabled={disabled}
        // Texto: passa pelo debounce. Antes este campo disparava um PATCH por
        // tecla digitada.
        onChange={(evento) => draft.setField('scheduleNotes', evento.target.value)}
        placeholder="Ex.: equipe iniciou às 8h devido à chuva."
        className={cn(
          'mt-1 w-full resize-y rounded-lg border border-input bg-background p-3 text-base',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'cursor-not-allowed opacity-70',
        )}
      />
    </ReportSectionCard>
  );
}

/// Lê do RASCUNHO, como o resto da seção. Ler do servidor deixaria o resumo do
/// cabeçalho um passo atrás do que a pessoa acabou de escolher.
function resumo(draft: ReportDraft): string | null {
  const inicio = draft.values.workStartTime;
  const termino = draft.values.workEndTime;
  if (inicio && termino) return `${inicio} às ${termino}`;
  if (inicio) return `Início ${inicio}`;
  if (termino) return `Término ${termino}`;
  return draft.values.scheduleNotes ? 'Com observação' : null;
}
