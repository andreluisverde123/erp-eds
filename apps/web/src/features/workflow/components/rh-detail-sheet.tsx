import { useState } from 'react';
import {
  Button,
  Input,
  Separator,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@repo/ui';

import { RecordHistoryPanel } from '@/features/history/components/record-history-panel';

import { useRhPipelineDetail } from '../hooks/use-rh-pipeline';
import { useRegisterDesligamento } from '../hooks/use-advance-stage-actions';
import { RH_STAGE_OPTIONS, getRhStageBadgeVariant, getRhStageLabel } from '../rh-stage';
import { StageBadge } from './stage-badge';
import { WorkflowTimeline } from './workflow-timeline';
import { WorkflowCommentsPanel } from './workflow-comments-panel';
import { WorkflowAttachmentsPanel } from './workflow-attachments-panel';
import type { TimelineEntry } from '../types';

function describeEvent(event: TimelineEntry): string {
  if (event.synthetic) {
    const changes = event.changes as { stage?: string } | null;
    return `Estágio atual: ${changes?.stage ?? '—'}`;
  }
  const authorName = event.actor?.name ?? 'Sistema';
  const changes = event.changes as { status?: { to?: string } } | null;
  if (changes?.status?.to === 'TERMINATED') {
    return `Desligamento registrado por ${authorName}`;
  }
  return `Funcionário atualizado por ${authorName}`;
}

interface RhDetailSheetProps {
  employeeId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function RhDetailSheet({ employeeId, onOpenChange }: RhDetailSheetProps) {
  return (
    <Sheet open={Boolean(employeeId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {employeeId && <RhDetailBody key={employeeId} employeeId={employeeId} />}
      </SheetContent>
    </Sheet>
  );
}

function RhDetailBody({ employeeId }: { employeeId: string }) {
  const { data, isLoading } = useRhPipelineDetail(employeeId);
  const desligamentoMutation = useRegisterDesligamento(employeeId);
  const [terminationDate, setTerminationDate] = useState(() =>
    new Date().toISOString().slice(0, 10),
  );

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <>
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2.5">
          <SheetTitle>{data.name}</SheetTitle>
          <StageBadge
            label={getRhStageLabel(data.stage)}
            variant={getRhStageBadgeVariant(data.stage)}
          />
        </div>
        <SheetDescription>{data.position}</SheetDescription>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {data.status !== 'TERMINATED' && (
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs text-muted-foreground" htmlFor="termination-date">
                Data do desligamento
              </label>
              <Input
                id="termination-date"
                type="date"
                value={terminationDate}
                onChange={(event) => setTerminationDate(event.target.value)}
                className="w-40"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={desligamentoMutation.isPending}
              onClick={() => desligamentoMutation.mutate(terminationDate)}
            >
              {desligamentoMutation.isPending ? 'Registrando...' : 'Registrar Desligamento'}
            </Button>
          </div>
        )}

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Timeline</h3>
          <WorkflowTimeline
            stages={RH_STAGE_OPTIONS}
            currentStage={data.stage}
            events={data.timeline}
            describeEvent={describeEvent}
          />
        </div>

        <Separator />

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">Responsável</h3>
            <p className="text-sm text-muted-foreground">{data.responsavel?.name ?? '—'}</p>
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-semibold text-foreground">Situação atual</h3>
            <p className="text-sm text-muted-foreground">{data.status}</p>
          </div>
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Comentários</h3>
          <WorkflowCommentsPanel entityType="Employee" entityId={employeeId} />
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Anexos</h3>
          <WorkflowAttachmentsPanel entityType="Employee" entityId={employeeId} />
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Histórico</h3>
          <RecordHistoryPanel entityType="Employee" entityId={employeeId} />
        </div>
      </div>
    </>
  );
}
