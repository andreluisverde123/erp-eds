import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertTriangle, ArrowLeft, FileCheck2, FileText } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { Navigate, useNavigate, useParams } from 'react-router';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  LoadingState,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { InvoicePanel } from '@/features/conciliacao/components/invoice-panel';
import { PurchaseOrderPanel } from '@/features/conciliacao/components/purchase-order-panel';
import { ReconcileForm } from '@/features/conciliacao/components/reconcile-form';
import { useReconcileInboundInvoice } from '@/features/conciliacao/hooks/use-inbound-invoice-mutations';
import {
  useCostCenters,
  useInboundInvoice,
  useOpenPurchaseOrders,
  usePurchaseOrderSuggestions,
} from '@/features/conciliacao/hooks/use-inbound-invoices';
import { formatAmount, formatDate } from '@/features/conciliacao/format';
import {
  getPaymentMethodLabel,
  getPaymentTermsLabel,
} from '@/features/conciliacao/inbound-invoice-status';
import {
  RECONCILE_FORM_DEFAULTS,
  reconcileFormSchema,
  type ReconcileFormValues,
} from '@/features/conciliacao/reconcile-form-schema';
import type { PurchaseOrderSuggestion } from '@/features/conciliacao/types';
import type { ReconcileMode } from '@/features/conciliacao/components/purchase-order-panel';

const LIST_PATH = '/financeiro/conciliacao';

export function ConciliacaoDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { data: invoice, isLoading, isError } = useInboundInvoice(id);
  const isPending = invoice?.status === 'PENDING';

  // Sugestões só fazem sentido enquanto há o que conciliar; numa nota já
  // conciliada a tela mostra o vínculo que existe, não candidatas.
  const { data: suggestions, isLoading: isLoadingSuggestions } = usePurchaseOrderSuggestions(
    id,
    Boolean(isPending),
  );

  // As duas listas só são buscadas enquanto há o que conciliar.
  const { data: openOrders } = useOpenPurchaseOrders(Boolean(isPending));
  const { data: costCenters } = useCostCenters(Boolean(isPending));

  const reconcileMutation = useReconcileInboundInvoice(id ?? '');

  /// Com ordem de compra (compra planejada) ou sem (balcão). A escolha muda
  /// o que é exigido: ordem num caso, centro de custo no outro.
  const [mode, setMode] = useState<ReconcileMode>('order');
  const [costCenterId, setCostCenterId] = useState<string | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  /// Qual ordem teve a divergência aceita — não um booleano solto. A
  /// divergência aceita era daquela ordem; guardar o id faz o aceite deixar
  /// de valer sozinho quando o usuário troca de OC, sem precisar de um efeito
  /// para zerá-lo (e sem o risco de o aceite de uma vazar para a seguinte).
  const [divergenceAcceptedFor, setDivergenceAcceptedFor] = useState<string | null>(null);

  const form = useForm<ReconcileFormValues>({
    resolver: zodResolver(reconcileFormSchema),
    defaultValues: RECONCILE_FORM_DEFAULTS,
  });

  // `useWatch` e não `form.watch()`: o React Compiler pula a memoização de
  // componentes que usam o segundo, e é a convenção já adotada no resto do
  // sistema (ver purchase-request-items-grid, employee-allocation-form).
  const selectedId = useWatch({ control: form.control, name: 'purchaseOrderId' });

  // Pré-seleciona a sugestão principal — e SÓ ela. Quando o sistema não tem
  // uma candidata claramente melhor, o campo fica vazio de propósito: escolher
  // por conta própria numa dúvida seria empurrar o usuário a confirmar um
  // palpite do sistema.
  useEffect(() => {
    if (!suggestions || selectedId) return;
    const primary = suggestions.find((suggestion) => suggestion.isPrimary);
    if (primary) form.setValue('purchaseOrderId', primary.id);
  }, [suggestions, selectedId, form]);

  if (!id) {
    return <Navigate to={LIST_PATH} replace />;
  }

  if (isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <FileText className="size-9 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Nota fiscal não encontrada.</p>
        <Button variant="outline" size="sm" onClick={() => navigate(LIST_PATH)}>
          Voltar para Conciliação
        </Button>
      </div>
    );
  }

  if (isLoading || !invoice) {
    return <LoadingState message="Carregando nota fiscal..." />;
  }

  // Numa nota já conciliada não há sugestões: a ordem vinculada vira a única
  // "candidata", montada a partir do detalhe. `openAmount` recebe o valor da
  // própria nota para que o painel exiba "valores conferem" — o que já foi
  // conciliado não está mais em aberto, e mostrar divergência num registro
  // fechado seria alarme falso.
  const linkedAsCandidate: PurchaseOrderSuggestion[] =
    !isPending && invoice.purchaseOrder
      ? [
          {
            id: invoice.purchaseOrder.id,
            code: invoice.purchaseOrder.code,
            issueDate: invoice.purchaseOrder.issueDate,
            totalAmount: invoice.purchaseOrder.totalAmount,
            reconciledAmount: '0',
            openAmount: invoice.totalAmount,
            supplier: invoice.purchaseOrder.supplier,
            costCenter: invoice.purchaseOrder.costCenter,
            constructionSite: invoice.purchaseOrder.constructionSite,
            items: invoice.purchaseOrder.purchaseRequest.items,
            score: 1,
            amountDifference: '0',
            daysApart: 0,
            withinTolerance: true,
            isPrimary: false,
          },
        ]
      : [];

  const panelSuggestions = isPending ? (suggestions ?? []) : linkedAsCandidate;
  const panelSelectedId = isPending ? selectedId || null : (invoice.purchaseOrder?.id ?? null);

  const selected = suggestions?.find((suggestion) => suggestion.id === selectedId) ?? null;
  const difference = selected ? Number(invoice.totalAmount) - Number(selected.openAmount) : 0;
  const hasDivergence = selected ? Math.abs(difference) >= 0.01 : false;
  const divergenceAccepted = Boolean(selectedId) && divergenceAcceptedFor === selectedId;
  const canSubmit =
    mode === 'no-order'
      ? Boolean(costCenterId)
      : Boolean(selectedId) && (!hasDivergence || divergenceAccepted);

  async function onSubmit(values: ReconcileFormValues) {
    setSubmitError(null);
    try {
      await reconcileMutation.mutateAsync({
        // Sem ordem: manda só o centro de custo. A API exige um dos dois.
        purchaseOrderId: mode === 'no-order' ? undefined : values.purchaseOrderId,
        costCenterId: mode === 'no-order' ? (costCenterId ?? undefined) : undefined,
        paymentMethod: values.paymentMethod,
        paymentTerms: values.paymentTerms,
        dueDate: values.dueDate || undefined,
        notes: values.notes || undefined,
        acceptDivergence: divergenceAccepted || undefined,
      });
      navigate(LIST_PATH);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível conciliar a nota. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground"
          onClick={() => navigate(LIST_PATH)}
        >
          <ArrowLeft />
          Voltar
        </Button>

        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {isPending ? 'Conciliar Nota Fiscal' : 'Conciliação da Nota Fiscal'}
          </h1>
          <p className="text-sm text-muted-foreground">
            Nº {invoice.number}
            {invoice.series && ` / série ${invoice.series}`} · {invoice.supplierName} ·{' '}
            {formatAmount(invoice.totalAmount)}
          </p>
        </div>
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-6" noValidate>
          {/* Comparação lado a lado. Empilha no mobile — confrontar dois
              números em colunas de 160px não ajudaria ninguém. */}
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <InvoicePanel invoice={invoice} />
            <PurchaseOrderPanel
              suggestions={panelSuggestions}
              openOrders={openOrders ?? []}
              costCenters={costCenters ?? []}
              mode={mode}
              onModeChange={setMode}
              selectedId={panelSelectedId}
              onSelect={(value) => form.setValue('purchaseOrderId', value)}
              costCenterId={costCenterId}
              onCostCenterChange={setCostCenterId}
              isLoading={isLoadingSuggestions}
              invoiceAmount={invoice.totalAmount}
              readOnly={!isPending}
            />
          </div>

          {isPending ? (
            <>
              {mode === 'order' && hasDivergence && (
                <Alert variant="destructive">
                  <AlertTriangle />
                  <AlertTitle>
                    Divergência de {formatAmount(Math.abs(difference).toFixed(2))}
                  </AlertTitle>
                  <AlertDescription>
                    <div className="flex flex-col gap-3">
                      <span>
                        A nota ({formatAmount(invoice.totalAmount)}) não bate com o saldo em aberto
                        da ordem {selected?.code} ({formatAmount(selected?.openAmount)}). Conciliar
                        assim mesmo registra a nota como divergente e gera a conta a pagar pelo
                        valor da NOTA.
                      </span>
                      <label className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-destructive"
                          checked={divergenceAccepted}
                          onChange={(event) =>
                            setDivergenceAcceptedFor(event.target.checked ? selectedId : null)
                          }
                        />
                        Confirmo a divergência e quero prosseguir
                      </label>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              <ReconcileForm form={form} />

              {submitError && (
                <Alert variant="destructive">
                  <AlertTitle>{submitError}</AlertTitle>
                </Alert>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => navigate(LIST_PATH)}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={!canSubmit || reconcileMutation.isPending}>
                  <FileCheck2 />
                  {reconcileMutation.isPending ? 'Conciliando...' : 'Confirmar conciliação'}
                </Button>
              </div>
            </>
          ) : (
            /* Nota já resolvida: a tela vira registro. Mantém a comparação
               visível — é a rastreabilidade que o vínculo permanente promete. */
            <Card>
              <CardHeader>
                <CardTitle>Registro da conciliação</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Conciliada em" value={formatDate(invoice.reconciledAt)} />
                <Field label="Conciliada por" value={invoice.reconciledBy?.name ?? '—'} />
                <Field
                  label="Forma de pagamento"
                  value={invoice.paymentMethod ? getPaymentMethodLabel(invoice.paymentMethod) : '—'}
                />
                <Field
                  label="Condição"
                  value={invoice.paymentTerms ? getPaymentTermsLabel(invoice.paymentTerms) : '—'}
                />
                <Field label="Ordem de compra" value={invoice.purchaseOrder?.code ?? '—'} />
                <Field label="Nota no financeiro" value={invoice.invoice?.number ?? '—'} />
                {invoice.notes && (
                  <div className="sm:col-span-2 lg:col-span-4">
                    <Field label="Observações" value={invoice.notes} />
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </form>
      </Form>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}
