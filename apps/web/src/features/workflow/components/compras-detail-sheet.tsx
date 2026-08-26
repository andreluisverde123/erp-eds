import { ChevronDown } from 'lucide-react';
import { Link } from 'react-router';
import { Button, Separator, Sheet, SheetContent, SheetDescription, SheetTitle } from '@repo/ui';

import { RecordHistoryPanel } from '@/features/history/components/record-history-panel';

import { useComprasPipelineDetail } from '../hooks/use-compras-pipeline';
import { useMarkPurchaseOrderReceived } from '../hooks/use-advance-stage-actions';
import {
  getComprasStageBadgeVariant,
  getComprasStageLabel,
  COMPRAS_STAGE_OPTIONS,
} from '../compras-stage';
import { StageBadge } from './stage-badge';
import { WorkflowTimeline } from './workflow-timeline';
import { WorkflowCommentsPanel } from './workflow-comments-panel';
import { WorkflowAttachmentsPanel } from './workflow-attachments-panel';
import type { TimelineEntry } from '../types';

const NON_TERMINAL_STAGES = COMPRAS_STAGE_OPTIONS.filter((option) => option.value !== 'CANCELADO');

function describeEvent(event: TimelineEntry): string {
  if (event.synthetic) {
    const changes = event.changes as { stage?: string } | null;
    return `Estágio atual: ${changes?.stage ?? '—'}`;
  }
  const authorName = event.actor?.name ?? 'Sistema';
  const label =
    event.entityType === 'PurchaseOrder'
      ? 'Ordem de compra'
      : event.entityType === 'Invoice'
        ? 'Nota fiscal'
        : 'Solicitação';
  if (event.action === 'CREATE') return `${label} criada por ${authorName}`;
  const changes = event.changes as { status?: { from?: string; to?: string } } | null;
  if (changes?.status?.to) {
    return `${label}: status alterado para "${changes.status.to}" por ${authorName}`;
  }
  return `${label} atualizada por ${authorName}`;
}

interface ComprasDetailSheetProps {
  requestId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function ComprasDetailSheet({ requestId, onOpenChange }: ComprasDetailSheetProps) {
  return (
    <Sheet open={Boolean(requestId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {requestId && <ComprasDetailBody key={requestId} requestId={requestId} />}
      </SheetContent>
    </Sheet>
  );
}

function ComprasDetailBody({ requestId }: { requestId: string }) {
  const { data, isLoading } = useComprasPipelineDetail(requestId);
  const markReceivedMutation = useMarkPurchaseOrderReceived(requestId);

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <>
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2.5">
          <SheetTitle>{data.code}</SheetTitle>
          <StageBadge
            label={getComprasStageLabel(data.stage)}
            variant={getComprasStageBadgeVariant(data.stage)}
          />
        </div>
        <SheetDescription>{data.constructionSite.name}</SheetDescription>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Timeline</h3>
          <WorkflowTimeline
            stages={NON_TERMINAL_STAGES}
            currentStage={data.stage}
            events={data.timeline}
            describeEvent={describeEvent}
          />
        </div>

        <Separator />

        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-foreground">Responsável</h3>
          <p className="text-sm text-muted-foreground">{data.requestedBy.name}</p>
        </div>

        {data.purchaseOrders.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Ordens vinculadas</h3>
              {data.purchaseOrders.map((order) => (
                <details key={order.id} className="group rounded-md border border-border px-3 py-2">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground">{order.code}</span>
                      <span className="text-xs text-muted-foreground">{order.status}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {order.status === 'ISSUED' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={markReceivedMutation.isPending}
                          onClick={(event) => {
                            event.preventDefault();
                            markReceivedMutation.mutate(order.id);
                          }}
                        >
                          Marcar como Recebida
                        </Button>
                      )}
                      <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="mt-3">
                    <RecordHistoryPanel entityType="PurchaseOrder" entityId={order.id} />
                  </div>
                </details>
              ))}
            </div>
          </>
        )}

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Comentários</h3>
          <WorkflowCommentsPanel entityType="PurchaseRequest" entityId={requestId} />
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Anexos</h3>
          <WorkflowAttachmentsPanel entityType="PurchaseRequest" entityId={requestId} />
        </div>

        <Separator />

        <Button variant="outline" asChild className="self-start">
          <Link to={`/engenharia/solicitacoes/${requestId}`}>Ver solicitação completa</Link>
        </Button>
      </div>
    </>
  );
}
