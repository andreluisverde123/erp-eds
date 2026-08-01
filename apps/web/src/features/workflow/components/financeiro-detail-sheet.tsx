import { ChevronDown } from 'lucide-react';
import { Button, Separator, Sheet, SheetContent, SheetDescription, SheetTitle } from '@repo/ui';

import { RecordHistoryPanel } from '@/features/history/components/record-history-panel';

import { useFinanceiroPipelineDetail } from '../hooks/use-financeiro-pipeline';
import { useRegisterBaixa, useValidateInvoice } from '../hooks/use-advance-stage-actions';
import {
  FINANCEIRO_STAGE_OPTIONS,
  getFinanceiroStageBadgeVariant,
  getFinanceiroStageLabel,
} from '../financeiro-stage';
import { StageBadge } from './stage-badge';
import { WorkflowTimeline } from './workflow-timeline';
import { WorkflowCommentsPanel } from './workflow-comments-panel';
import { WorkflowAttachmentsPanel } from './workflow-attachments-panel';
import type { TimelineEntry } from '../types';

const NON_TERMINAL_STAGES = FINANCEIRO_STAGE_OPTIONS.filter(
  (option) => option.value !== 'CANCELADO',
);

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function describeEvent(event: TimelineEntry): string {
  if (event.synthetic) {
    const changes = event.changes as { stage?: string } | null;
    return `Estágio atual: ${changes?.stage ?? '—'}`;
  }
  const authorName = event.actor?.name ?? 'Sistema';
  const label = event.entityType === 'AccountPayable' ? 'Conta a pagar' : 'Nota fiscal';
  const changes = event.changes as { status?: { to?: string } } | null;
  if (changes?.status?.to) {
    return `${label}: status alterado para "${changes.status.to}" por ${authorName}`;
  }
  return `${label} atualizada por ${authorName}`;
}

interface FinanceiroDetailSheetProps {
  invoiceId: string | null;
  onOpenChange: (open: boolean) => void;
}

export function FinanceiroDetailSheet({ invoiceId, onOpenChange }: FinanceiroDetailSheetProps) {
  return (
    <Sheet open={Boolean(invoiceId)} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-xl">
        {invoiceId && <FinanceiroDetailBody key={invoiceId} invoiceId={invoiceId} />}
      </SheetContent>
    </Sheet>
  );
}

function FinanceiroDetailBody({ invoiceId }: { invoiceId: string }) {
  const { data, isLoading } = useFinanceiroPipelineDetail(invoiceId);
  const validateMutation = useValidateInvoice(invoiceId);
  const baixaMutation = useRegisterBaixa(invoiceId);

  if (isLoading || !data) {
    return <div className="p-6 text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <>
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-2.5">
          <SheetTitle>NF {data.number}</SheetTitle>
          <StageBadge
            label={getFinanceiroStageLabel(data.stage)}
            variant={getFinanceiroStageBadgeVariant(data.stage)}
          />
        </div>
        <SheetDescription>{data.supplier.tradeName ?? data.supplier.legalName}</SheetDescription>
      </div>

      <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
        {data.status === 'RECEIVED' && (
          <Button
            size="sm"
            className="self-start"
            disabled={validateMutation.isPending}
            onClick={() => validateMutation.mutate()}
          >
            {validateMutation.isPending ? 'Validando...' : 'Validar Nota Fiscal'}
          </Button>
        )}

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
          <p className="text-sm text-muted-foreground">
            {data.responsavel?.name ?? '—'}
            {data.responsavel && <span className="text-xs"> (via requisição de origem)</span>}
          </p>
        </div>

        {data.accountsPayable.length > 0 && (
          <>
            <Separator />
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-semibold text-foreground">Contas a pagar vinculadas</h3>
              {data.accountsPayable.map((accountPayable) => {
                const paidAmount = accountPayable.payments
                  .filter((payment) => payment.status === 'PAID')
                  .reduce((sum, payment) => sum + Number(payment.amount), 0);
                const remaining = Number(accountPayable.amount) - paidAmount;

                return (
                  <details
                    key={accountPayable.id}
                    className="group rounded-md border border-border px-3 py-2"
                  >
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                      <div className="flex flex-col">
                        <span className="text-sm font-medium text-foreground">
                          {formatCurrency(Number(accountPayable.amount))}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {accountPayable.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        {(accountPayable.status === 'OPEN' ||
                          accountPayable.status === 'PARTIAL') && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={baixaMutation.isPending}
                            onClick={(event) => {
                              event.preventDefault();
                              baixaMutation.mutate({
                                accountPayableId: accountPayable.id,
                                amount: remaining,
                              });
                            }}
                          >
                            {baixaMutation.isPending ? 'Registrando...' : 'Registrar Baixa'}
                          </Button>
                        )}
                        <ChevronDown className="size-3.5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
                      </div>
                    </summary>
                    <div className="mt-3">
                      <RecordHistoryPanel
                        entityType="AccountPayable"
                        entityId={accountPayable.id}
                      />
                    </div>
                  </details>
                );
              })}
            </div>
          </>
        )}

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Comentários</h3>
          <WorkflowCommentsPanel entityType="Invoice" entityId={invoiceId} />
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Anexos</h3>
          <WorkflowAttachmentsPanel entityType="Invoice" entityId={invoiceId} />
        </div>

        <Separator />

        <div>
          <h3 className="mb-3 text-sm font-semibold text-foreground">Histórico</h3>
          <RecordHistoryPanel entityType="Invoice" entityId={invoiceId} />
        </div>
      </div>
    </>
  );
}
