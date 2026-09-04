import { useState } from 'react';
import {
  CalendarDays,
  ClipboardList,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  ShoppingCart,
  Trash2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Alert, AlertTitle, Button, Card, CardContent, Separator } from '@repo/ui';

import { ConfirmDialog } from '@/components/confirm-dialog';

import { AttachmentsPanel } from '@/features/anexos/components/attachments-panel';
import { useAuth } from '@/features/auth/context';
import { RecordHistoryPanel } from '@/features/history/components/record-history-panel';

import { AddRequestItemsDrawer } from '@/features/compras/components/add-request-items-drawer';
import { GeneratePurchaseOrderDrawer } from '@/features/compras/components/generate-purchase-order-drawer';
import { QuotePurchaseRequestDrawer } from '@/features/compras/components/quote-purchase-request-drawer';
import { PurchaseRequestItemsTable } from '@/features/compras/components/purchase-request-items-table';
import { PurchaseRequestStatusBadge } from '@/features/compras/components/purchase-request-status-badge';
import { PurchaseOrderFinancialBadge } from '@/features/compras/components/purchase-order-financial-status';
import { PurchaseOrderStatusBadge } from '@/features/compras/components/purchase-order-status-badge';
import { usePurchaseRequest } from '@/features/compras/hooks/use-purchase-request';
import {
  useDeletePurchaseRequest,
  useDownloadPurchaseRequestPdf,
  useUpdatePurchaseRequestStatus,
} from '@/features/compras/hooks/use-purchase-request-mutations';
import { usePurchaseOrders } from '@/features/compras/hooks/use-purchase-orders';
import { getAllowedTransitions } from '@/features/compras/purchase-request-status';
import type { PurchaseRequestDetail, PurchaseRequestStatus } from '@/features/compras/types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const TRANSITION_LABELS: Partial<Record<PurchaseRequestStatus, string>> = {
  PENDING: 'Enviar para Aprovação',
  QUOTING: 'Marcar em Cotação',
  APPROVED: 'Aprovar',
  CANCELLED: 'Cancelar Solicitação',
};

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Wallet;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-sm font-semibold text-foreground">{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}

/// De onde veio o total, em etapas — a mesma leitura que a gaveta de cotação
/// mostra enquanto se digita, aqui em modo consulta.
///
/// As linhas de desconto só aparecem quando existem: sem elas, "subtotal" e
/// "total" seriam o mesmo número escrito duas vezes.
function QuoteTotalsSummary({ request }: { request: PurchaseRequestDetail }) {
  const { totals } = request;
  const semCotacao = totals.itemsSubtotal === 0 && totals.total === 0;

  if (semCotacao) return null;

  const temDesconto = totals.itemsDiscount > 0 || totals.generalDiscount > 0;

  return (
    <div className="ml-auto flex w-full max-w-xs flex-col gap-1.5 border-t border-border pt-3">
      {temDesconto && (
        <>
          <TotalsLine label="Subtotal dos itens" value={formatCurrency(totals.itemsSubtotal)} />
          {totals.itemsDiscount > 0 && (
            <>
              <TotalsLine
                label="Descontos nos itens"
                value={`- ${formatCurrency(totals.itemsDiscount)}`}
              />
              <TotalsLine
                label="Subtotal após descontos"
                value={formatCurrency(totals.subtotalAfterItemDiscounts)}
              />
            </>
          )}
          {totals.generalDiscount > 0 && (
            <TotalsLine
              label={
                request.discountType === 'PERCENT'
                  ? `Desconto geral (${Number(request.discountValue).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%)`
                  : 'Desconto geral'
              }
              value={`- ${formatCurrency(totals.generalDiscount)}`}
            />
          )}
        </>
      )}
      <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
        <span className="text-sm font-medium text-foreground">Total cotado</span>
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {formatCurrency(totals.total)}
        </span>
      </div>
    </div>
  );
}

function TotalsLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export function SolicitacaoDetailPage() {
  const { user } = useAuth();
  /// `compras.request` = quem PEDE (Engenharia): abre, edita o rascunho, envia
  /// para Compras ou desiste. `compras.manage` = quem COMPRA: cota, aprova,
  /// emite a ordem e exclui. A API aplica exatamente a mesma divisão.
  const canRequest = user?.permissions.includes('compras.request') ?? false;
  const canManage = user?.permissions.includes('compras.manage') ?? false;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: request, isLoading, isError } = usePurchaseRequest(id);
  const { data: ordersData } = usePurchaseOrders({ purchaseRequestId: id, limit: 20 });

  const updateStatusMutation = useUpdatePurchaseRequestStatus(id ?? '');
  const deleteMutation = useDeletePurchaseRequest();
  const pdfMutation = useDownloadPurchaseRequestPdf();

  const [cancelDialogOpen, setCancelDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [generateOrderOpen, setGenerateOrderOpen] = useState(false);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [addItemsOpen, setAddItemsOpen] = useState(false);

  if (!id) {
    return <Navigate to="/engenharia/solicitacoes" replace />;
  }

  if (isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ClipboardList className="size-9 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Solicitação não encontrada.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/engenharia/solicitacoes')}>
          Voltar para Solicitações
        </Button>
      </div>
    );
  }

  if (isLoading || !request) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Carregando solicitação...
      </div>
    );
  }

  const isDraft = request.status === 'DRAFT';
  // Do rascunho o solicitante mesmo tira a solicitação (envia ou desiste);
  // marcar em cotação e aprovar são do setor de Compras. Espelha a checagem
  // do `updateStatus` na API — aqui é só para não mostrar botão que dá 403.
  const canTransition = isDraft ? canRequest || canManage : canManage;

  const allowedTransitions = canTransition
    ? getAllowedTransitions(request.status).filter((status) => status !== 'CANCELLED')
    : [];
  const canCancel = canTransition && getAllowedTransitions(request.status).includes('CANCELLED');
  const canEdit = isDraft && canRequest;
  // A cotação é o momento em que Compras informa os valores que saíram do
  // formulário do solicitante — vale enquanto a solicitação não foi aprovada.
  const canQuote = canManage && (request.status === 'PENDING' || request.status === 'QUOTING');
  // INCLUIR item numa solicitação já enviada. Vale só antes da aprovação: a
  // alçada é avaliada na aprovação, sobre o conteúdo daquele momento — a API
  // aplica a mesma regra, aqui é só para não mostrar botão que dará 409.
  const canAddItems =
    canRequest && (request.status === 'PENDING' || request.status === 'QUOTING');
  const temOrdens = (ordersData?.data.length ?? 0) > 0;

  async function handleTransition(status: PurchaseRequestStatus) {
    await updateStatusMutation.mutateAsync(status);
  }

  async function confirmCancel() {
    await updateStatusMutation.mutateAsync('CANCELLED');
    setCancelDialogOpen(false);
  }

  async function confirmDelete() {
    await deleteMutation.mutateAsync(request!.id);
    navigate('/engenharia/solicitacoes');
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">
              {request.code}
            </h1>
            <PurchaseRequestStatusBadge status={request.status} fulfillment={request.fulfillment} />
          </div>
          <p className="text-sm text-muted-foreground">{request.constructionSite.name}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Gerar PDF é ação secundária e SEMPRE disponível: imprimir não
              depende de status nem de permissão nova — quem pode ver a
              solicitação pode imprimi-la, igual ao PDF da ordem de compra. */}
          <Button
            variant="outline"
            disabled={pdfMutation.isPending}
            onClick={() => pdfMutation.mutate({ id: request.id, code: request.code })}
          >
            <FileText />
            {pdfMutation.isPending ? 'Gerando PDF...' : 'Gerar PDF'}
          </Button>

          {canEdit && (
            <Button
              variant="outline"
              onClick={() => navigate(`/engenharia/solicitacoes/${id}/editar`)}
            >
              <Pencil />
              Editar
            </Button>
          )}

          {canAddItems && (
            <Button variant="outline" onClick={() => setAddItemsOpen(true)}>
              <Plus />
              Incluir Itens
            </Button>
          )}

          {canQuote && (
            <Button variant="outline" onClick={() => setQuoteOpen(true)}>
              <Wallet />
              Informar Cotação
            </Button>
          )}

          {allowedTransitions.map((status) => (
            <Button
              key={status}
              variant="outline"
              disabled={updateStatusMutation.isPending}
              onClick={() => handleTransition(status)}
            >
              {TRANSITION_LABELS[status]}
            </Button>
          ))}

          {/* A MESMA ação da primeira ordem — mesma permissão, mesmo fluxo,
              mesmo endpoint. O rótulo é que muda, porque "Gerar Ordem de
              Compra" numa solicitação que já tem duas faria a pessoa achar que
              vai substituir alguma.

              Some quando não há mais saldo: um botão que só sabe recusar é
              pior que um botão ausente. O estado fica explicado na tabela de
              itens, onde todas as linhas aparecem como atendidas. */}
          {canManage &&
            request.status === 'APPROVED' &&
            request.fulfillment.status !== 'FULFILLED' && (
              <Button onClick={() => setGenerateOrderOpen(true)}>
                <ShoppingCart />
                {temOrdens ? 'Gerar nova Ordem de Compra' : 'Gerar Ordem de Compra'}
              </Button>
            )}

          {canCancel && (
            <Button variant="outline" onClick={() => setCancelDialogOpen(true)}>
              <XCircle />
              Cancelar
            </Button>
          )}

          {/* Excluir de vez é do setor de Compras. O solicitante desiste da
              própria solicitação cancelando, o que preserva o histórico. */}
          {canManage && (
            <Button variant="outline" onClick={() => setDeleteDialogOpen(true)}>
              <Trash2 />
              Excluir
            </Button>
          )}
        </div>
      </div>

      {/* Falha na geração não pode virar um botão que "não fez nada". A causa
          técnica (401, timeout, 500) fica no console; aqui vai o que o
          usuário pode fazer a respeito. */}
      {pdfMutation.isError && (
        <Alert variant="destructive">
          <AlertTitle>
            Não foi possível gerar o PDF desta solicitação. Tente novamente em instantes.
          </AlertTitle>
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Zerado significa "ainda não cotado", não "de graça" — mostrar
            R$ 0,00 nesse caso lia como erro de cálculo. */}
        <SummaryStat
          icon={Wallet}
          label="Valor cotado"
          value={
            request.estimatedTotal > 0
              ? formatCurrency(request.estimatedTotal)
              : 'Aguardando cotação'
          }
        />
        {/* ATENDIMENTO, e não a contagem crua de itens: a pergunta que quem
            abre esta tela faz é "quanto ainda falta comprar?", e ela se
            responde em LINHAS.
            
            Não em reais de propósito: o preço da ordem é o negociado e diverge
            do cotado, então "R$ X de R$ Y" compararia duas grandezas
            diferentes e daria um percentual que ninguém consegue conferir. */}
        <SummaryStat
          icon={ListChecks}
          label="Atendimento"
          value={`${request.fulfillment.fulfilledItems} de ${request.fulfillment.totalItems} ${
            request.fulfillment.totalItems === 1 ? 'item atendido' : 'itens atendidos'
          }`}
        />
        <SummaryStat icon={CalendarDays} label="Criada em" value={formatDate(request.createdAt)} />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <h2 className="text-base font-semibold text-foreground">Informações gerais</h2>
          {/* A obra é o destino da solicitação e vem primeiro. O centro de
              custo é complemento e pode não ter sido informado — nesse caso o
              rótulo continua visível dizendo quem vai preenchê-lo, em vez de
              a linha sumir e deixar a dúvida. */}
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4">
            <InfoRow label="Obra" value={request.constructionSite.name} />
            <InfoRow
              label="Centro de custo"
              value={request.costCenter?.name ?? 'A definir na Ordem de Compra'}
            />
            <InfoRow label="Solicitante" value={request.requestedBy.name} />
            <InfoRow label="Data" value={formatDate(request.createdAt)} />
          </div>
          {request.notes && (
            <>
              <Separator />
              <InfoRow label="Observações" value={request.notes} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">Itens</h2>
          <PurchaseRequestItemsTable items={request.items} />
          <QuoteTotalsSummary request={request} />
        </CardContent>
      </Card>

      {ordersData && ordersData.data.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-4">
            <h2 className="text-base font-semibold text-foreground">Ordens de compra geradas</h2>
            <div className="flex flex-col gap-2">
              {ordersData.data.map((order) => (
                <div
                  key={order.id}
                  className="flex items-center justify-between rounded-lg border border-border px-4 py-3"
                >
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground">{order.code}</span>
                    <span className="text-xs text-muted-foreground">
                      {order.supplier.tradeName ?? order.supplier.legalName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {formatCurrency(Number(order.totalAmount))}
                    </span>
                    <PurchaseOrderStatusBadge status={order.status} />
                    {/* Onde a compra parou no financeiro. Vem junto da mesma
                        consulta que já listava as ordens — quem pediu o
                        material passa a ver se o fornecedor foi pago sem
                        precisar de acesso ao módulo Financeiro. */}
                    <PurchaseOrderFinancialBadge status={order.financialStatus} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">Anexos</h2>
          <AttachmentsPanel
            entityType="PurchaseRequest"
            entityId={request.id}
            canManage={canManage}
            emptyMessage="Nenhum anexo — cotação, proposta do fornecedor, nota."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">Histórico</h2>
          <RecordHistoryPanel entityType="PurchaseRequest" entityId={request.id} />
        </CardContent>
      </Card>

      <GeneratePurchaseOrderDrawer
        open={generateOrderOpen}
        onOpenChange={setGenerateOrderOpen}
        purchaseRequestId={request.id}
        hasPreviousOrders={temOrdens}
        onCreated={() => setGenerateOrderOpen(false)}
      />

      <AddRequestItemsDrawer
        open={addItemsOpen}
        onOpenChange={setAddItemsOpen}
        purchaseRequestId={request.id}
        requestCode={request.code}
      />

      <QuotePurchaseRequestDrawer open={quoteOpen} onOpenChange={setQuoteOpen} request={request} />

      <ConfirmDialog
        open={cancelDialogOpen}
        onOpenChange={setCancelDialogOpen}
        title="Cancelar solicitação"
        description={`Tem certeza que deseja cancelar "${request.code}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Cancelar solicitação"
        variant="destructive"
        isLoading={updateStatusMutation.isPending}
        onConfirm={confirmCancel}
      />

      <ConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="Excluir solicitação"
        description={`Tem certeza que deseja excluir "${request.code}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteMutation.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
