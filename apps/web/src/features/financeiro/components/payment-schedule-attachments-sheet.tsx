import { useQueryClient } from '@tanstack/react-query';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@repo/ui';

import { AttachmentsPanel } from '@/features/anexos/components/attachments-panel';

import type { PaymentScheduleRow } from '../types';

function formatCurrency(value: string): string {
  return Number(value).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface PaymentScheduleAttachmentsSheetProps {
  row: PaymentScheduleRow | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}

/// Anexos de uma conta da programação: a nota fiscal, o boleto, o comprovante.
///
/// Dois painéis quando a conta nasceu de nota: o da CONTA (boleto e o que for
/// desta parcela) e o da NOTA FISCAL (vale para todas as parcelas dela). Os
/// endpoints de anexo já existiam para os dois; faltava uma tela no
/// Financeiro que os mostrasse.
export function PaymentScheduleAttachmentsSheet({
  row,
  onOpenChange,
  canManage,
}: PaymentScheduleAttachmentsSheetProps) {
  const queryClient = useQueryClient();

  function fechar(open: boolean) {
    // A contagem de anexos da tabela vem da programação: ao fechar, recarrega.
    if (!open) queryClient.invalidateQueries({ queryKey: ['account-payables', 'schedule'] });
    onOpenChange(open);
  }

  return (
    <Sheet open={row !== null} onOpenChange={fechar}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        {row && (
          <>
            <div className="border-b border-border px-6 py-5">
              <SheetTitle>Anexos</SheetTitle>
              <SheetDescription>
                {row.supplier.tradeName ?? row.supplier.legalName} · {formatCurrency(row.remaining)}
              </SheetDescription>
            </div>

            <div className="flex flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
              {row.invoice && (
                <section className="flex flex-col gap-2">
                  <h3 className="text-sm font-medium text-foreground">
                    Nota fiscal {row.invoice.number}
                  </h3>
                  <AttachmentsPanel
                    entityType="Invoice"
                    entityId={row.invoice.id}
                    canManage={canManage}
                    emptyMessage="Nenhum arquivo da nota ainda. Anexe o PDF (DANFE) ou o XML."
                  />
                </section>
              )}

              <section className="flex flex-col gap-2">
                <h3 className="text-sm font-medium text-foreground">
                  {row.invoice ? 'Desta parcela' : 'Da conta'}
                </h3>
                <AttachmentsPanel
                  entityType="AccountPayable"
                  entityId={row.id}
                  canManage={canManage}
                  emptyMessage={
                    row.invoice
                      ? 'Boleto ou comprovante desta parcela.'
                      : 'Nenhum anexo ainda. Anexe a nota fiscal, o boleto ou o recibo.'
                  }
                />
              </section>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
