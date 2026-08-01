import { Check, CheckCircle2, Clock, PlusCircle } from 'lucide-react';
import { cn } from '@repo/ui';

import type { TimelineEntry } from '../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

interface StageOption {
  value: string;
  label: string;
}

function StageProgress({ stages, currentStage }: { stages: StageOption[]; currentStage: string }) {
  const currentIndex = stages.findIndex((stage) => stage.value === currentStage);
  const isTerminal = currentIndex === -1;

  return (
    <div className="flex items-start">
      {stages.map((stage, index) => {
        const state = isTerminal
          ? 'future'
          : index < currentIndex
            ? 'done'
            : index === currentIndex
              ? 'current'
              : 'future';

        return (
          <div
            key={stage.value}
            className={cn('flex items-center', index < stages.length - 1 && 'flex-1')}
          >
            <div className="flex flex-col items-center gap-1.5">
              <div
                className={cn(
                  'flex size-7 shrink-0 items-center justify-center rounded-full border-2 text-xs font-semibold',
                  state === 'done' && 'border-success bg-success text-success-foreground',
                  state === 'current' && 'border-primary bg-primary text-primary-foreground',
                  state === 'future' && 'border-border bg-background text-muted-foreground',
                )}
              >
                {state === 'done' ? <Check className="size-3.5" /> : index + 1}
              </div>
              <span
                className={cn(
                  'w-16 text-center text-xs whitespace-nowrap',
                  state === 'current' ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}
              >
                {stage.label}
              </span>
            </div>
            {index < stages.length - 1 && (
              <div
                className={cn(
                  'mx-1 h-0.5 flex-1',
                  index < currentIndex ? 'bg-success' : 'bg-border',
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function EventList({
  events,
  describeEvent,
}: {
  events: TimelineEntry[];
  describeEvent: (event: TimelineEntry) => string;
}) {
  if (events.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem histórico registrado.</p>;
  }

  return (
    <ol className="flex flex-col gap-4">
      {events.map((event) => (
        <li key={event.id} className="flex gap-3">
          <div
            className={cn(
              'flex size-7 shrink-0 items-center justify-center rounded-full',
              event.synthetic
                ? 'border border-dashed border-border bg-transparent text-muted-foreground'
                : 'bg-muted text-muted-foreground',
            )}
          >
            {event.synthetic ? (
              <Clock className="size-4" strokeWidth={1.75} />
            ) : event.action === 'CREATE' ? (
              <PlusCircle className="size-4" strokeWidth={1.75} />
            ) : (
              <CheckCircle2 className="size-4" strokeWidth={1.75} />
            )}
          </div>
          <div className="flex flex-col gap-0.5 pt-0.5">
            <p
              className={cn(
                'text-sm',
                event.synthetic ? 'text-muted-foreground italic' : 'text-foreground',
              )}
            >
              {describeEvent(event)}
            </p>
            <p className="text-xs text-muted-foreground">{formatDateTime(event.createdAt)}</p>
          </div>
        </li>
      ))}
    </ol>
  );
}

interface WorkflowTimelineProps {
  stages: StageOption[];
  currentStage: string;
  events: TimelineEntry[];
  describeEvent: (event: TimelineEntry) => string;
}

/// Primitivo genérico: barra de progresso por etapa (com estado
/// concluída/atual/futura) + lista de eventos reais/sintetizados abaixo.
/// Reaproveitado pelos 3 pipelines (Compras/Financeiro/RH), cada um só passa
/// sua própria lista de etapas e uma função de descrição de evento.
export function WorkflowTimeline({
  stages,
  currentStage,
  events,
  describeEvent,
}: WorkflowTimelineProps) {
  return (
    <div className="flex flex-col gap-6">
      <StageProgress stages={stages} currentStage={currentStage} />
      <EventList events={events} describeEvent={describeEvent} />
    </div>
  );
}
