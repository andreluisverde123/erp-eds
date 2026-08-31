import { CloudSun } from 'lucide-react';
import { cn } from '@repo/ui';

import { WEATHER_LABEL, WEATHER_OPTIONS } from '../report-content';
import type { ReportDraft } from '../../hooks/use-report-draft';
import type { DiarioReportDetail, WeatherCondition } from '../../types';
import { ReportSectionCard } from '../report-section-card';

/// Condições climáticas por período.
///
/// Botões, e não um `<select>`: cinco opções cabem numa fileira, o ícone
/// identifica cada uma antes da leitura, e escolher passa a ser um toque em
/// vez de abrir um menu e procurar. É a diferença entre registrar o clima e
/// deixar para depois.
export function WeatherSection({
  report,
  draft,
  disabled,
}: {
  report: DiarioReportDetail;
  draft: ReportDraft;
  disabled: boolean;
}) {
  const manha = draft.values.morningWeather as WeatherCondition | null;
  const tarde = draft.values.afternoonWeather as WeatherCondition | null;
  return (
    <ReportSectionCard
      titulo="Condições climáticas"
      icone={CloudSun}
      descricao="Tempo na manhã e na tarde."
      resumo={resumo(manha, tarde)}
      concluida={report.summary.hasWeather}
      aberta={!report.summary.hasWeather}
    >
      <Periodo
        rotulo="Manhã"
        valor={manha}
        disabled={disabled}
        // Um toque é uma escolha completa: grava na hora.
        onEscolher={(condicao) => draft.setFieldNow('morningWeather', condicao)}
      />
      <div className="mt-4">
        <Periodo
          rotulo="Tarde"
          valor={tarde}
          disabled={disabled}
          onEscolher={(condicao) => draft.setFieldNow('afternoonWeather', condicao)}
        />
      </div>

      <label
        htmlFor="clima-observacao"
        className="mt-4 block text-xs font-medium text-muted-foreground"
      >
        Observação do clima
      </label>
      <textarea
        id="clima-observacao"
        rows={2}
        maxLength={500}
        value={draft.values.weatherNotes ?? ''}
        disabled={disabled}
        // Texto: debounce. Antes disparava um PATCH por tecla.
        onChange={(evento) => draft.setField('weatherNotes', evento.target.value)}
        placeholder="Ex.: chuva forte entre 14h e 15h."
        className={cn(
          'mt-1 w-full resize-y rounded-lg border border-input bg-background p-3 text-base',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          disabled && 'cursor-not-allowed opacity-70',
        )}
      />
    </ReportSectionCard>
  );
}

function Periodo({
  rotulo,
  valor,
  disabled,
  onEscolher,
}: {
  rotulo: string;
  valor: WeatherCondition | null;
  disabled: boolean;
  onEscolher: (condicao: WeatherCondition | null) => void;
}) {
  return (
    <fieldset disabled={disabled}>
      <legend className="text-xs font-medium text-muted-foreground">{rotulo}</legend>
      <div className="mt-1.5 grid grid-cols-5 gap-1.5">
        {WEATHER_OPTIONS.map((opcao) => {
          const selecionada = valor === opcao.value;
          return (
            <button
              key={opcao.value}
              type="button"
              aria-pressed={selecionada}
              aria-label={`${rotulo}: ${opcao.label}`}
              // Tocar de novo na opção já escolhida limpa o campo. Sem isso,
              // um toque errado no clima não teria como ser desfeito.
              onClick={() => onEscolher(selecionada ? null : opcao.value)}
              className={cn(
                'flex h-16 flex-col items-center justify-center gap-1 rounded-lg border px-1 text-[10px] font-medium',
                'transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selecionada
                  ? 'border-primary bg-primary/5 text-primary'
                  : 'border-border bg-background text-muted-foreground',
                disabled && 'opacity-70',
              )}
            >
              <opcao.icon className="size-5" />
              <span className="truncate">{opcao.label}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/// Lê do RASCUNHO, e não do relatório: o resumo do cabeçalho precisa refletir
/// o toque na hora em que ele acontece, não quando o PATCH volta.
function resumo(manha: WeatherCondition | null, tarde: WeatherCondition | null): string | null {
  const manhaLabel = manha ? WEATHER_LABEL[manha] : null;
  const tardeLabel = tarde ? WEATHER_LABEL[tarde] : null;
  if (manhaLabel && tardeLabel) return `${manhaLabel} · ${tardeLabel}`;
  if (manhaLabel) return `Manhã: ${manhaLabel}`;
  if (tardeLabel) return `Tarde: ${tardeLabel}`;
  return null;
}
