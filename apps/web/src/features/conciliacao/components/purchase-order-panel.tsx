import { AlertTriangle, CheckCircle2, PackageSearch, Store } from 'lucide-react';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
} from '@repo/ui';

import { formatAmount, formatDate } from '../format';
import type {
  CompatibilityReport,
  CostCenterOption,
  OpenPurchaseOrder,
  PurchaseOrderSuggestion,
} from '../types';
import { CompatibilityChecks } from './compatibility-checks';
import { ItemComparisonTable } from './item-comparison-table';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

/// Compra planejada passa por ordem de compra; compra de balcão não tem
/// ordem nenhuma — o fornecedor emite a nota na loja. Os dois modos existem
/// porque o ERP precisa atender os dois jeitos de comprar da EDS.
export type ReconcileMode = 'order' | 'no-order';

interface PurchaseOrderPanelProps {
  suggestions: PurchaseOrderSuggestion[];
  /// Todas as ordens em aberto, para escolha manual quando não há sugestão.
  openOrders: OpenPurchaseOrder[];
  costCenters: CostCenterOption[];
  mode: ReconcileMode;
  onModeChange: (mode: ReconcileMode) => void;
  selectedId: string | null;
  onSelect: (id: string) => void;
  costCenterId: string | null;
  onCostCenterChange: (id: string) => void;
  isLoading: boolean;
  invoiceAmount: string;
  /// Comparação da ordem escolhida À MÃO — as sugeridas já trazem a delas.
  /// Buscada sob demanda porque só faz sentido para a que foi selecionada.
  manualCompatibility?: CompatibilityReport | null;
  readOnly?: boolean;
}

export function PurchaseOrderPanel({
  suggestions,
  openOrders,
  costCenters,
  mode,
  onModeChange,
  selectedId,
  onSelect,
  costCenterId,
  onCostCenterChange,
  isLoading,
  invoiceAmount,
  manualCompatibility = null,
  readOnly = false,
}: PurchaseOrderPanelProps) {
  const selected = suggestions.find((suggestion) => suggestion.id === selectedId) ?? null;
  // Escolhida manualmente: não está entre as sugestões, então os dados vêm da
  // lista de ordens em aberto.
  const manual = !selected ? (openOrders.find((order) => order.id === selectedId) ?? null) : null;

  const openAmount = selected?.openAmount ?? manual?.openAmount ?? null;
  const difference = openAmount === null ? 0 : Number(invoiceAmount) - Number(openAmount);
  const hasDivergence = openAmount !== null && Math.abs(difference) >= 0.01;

  // As sugestões primeiro (com o rótulo), depois as demais em aberto. Sem o
  // `filter`, uma ordem sugerida apareceria duas vezes na lista.
  const sugeridasIds = new Set(suggestions.map((s) => s.id));
  const outras = openOrders.filter((order) => !sugeridasIds.has(order.id));

  const centro = costCenters.find((c) => c.id === costCenterId) ?? null;

  // A sugerida já vem com a comparação pronta do servidor; a escolhida à mão
  // busca a dela sob demanda. Os dois caminhos desembocam no mesmo relatório.
  const compatibility = selected?.compatibility ?? manualCompatibility;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>{mode === 'order' ? 'Ordem de Compra' : 'Lançamento sem ordem'}</CardTitle>
            <CardDescription>
              {mode === 'order'
                ? (selected?.code ?? manual?.code ?? 'Selecione a ordem correspondente')
                : 'Compra de balcão — informe o centro de custo'}
            </CardDescription>
          </div>
          {selected?.isPrimary && !readOnly && (
            <Badge variant="info">
              <CheckCircle2 />
              Sugestão principal
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {!readOnly && (
          <>
            {/* A escolha entre os dois caminhos fica no topo porque muda tudo
                abaixo dela. Dois botões e não um select: são duas opções
                mutuamente exclusivas e ambas visíveis o tempo todo. */}
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant={mode === 'order' ? 'default' : 'outline'}
                onClick={() => onModeChange('order')}
              >
                <PackageSearch />
                Com ordem de compra
              </Button>
              <Button
                type="button"
                size="sm"
                variant={mode === 'no-order' ? 'default' : 'outline'}
                onClick={() => onModeChange('no-order')}
              >
                <Store />
                Sem ordem (balcão)
              </Button>
            </div>

            {mode === 'order' ? (
              <Select value={selectedId ?? ''} onValueChange={onSelect} disabled={isLoading}>
                <SelectTrigger>
                  <SelectValue
                    placeholder={isLoading ? 'Buscando ordens...' : 'Escolher ordem de compra'}
                  />
                </SelectTrigger>
                <SelectContent>
                  {suggestions.map((suggestion) => (
                    <SelectItem key={suggestion.id} value={suggestion.id}>
                      {suggestion.code} — {formatAmount(suggestion.openAmount)} em aberto
                      {suggestion.isPrimary ? ' (sugerida)' : ''}
                    </SelectItem>
                  ))}
                  {outras.map((order) => (
                    <SelectItem key={order.id} value={order.id}>
                      {order.code} — {formatAmount(order.openAmount)} em aberto ·{' '}
                      {order.supplier.tradeName ?? order.supplier.legalName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Select
                value={costCenterId ?? ''}
                onValueChange={onCostCenterChange}
                disabled={isLoading}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Escolher centro de custo" />
                </SelectTrigger>
                <SelectContent>
                  {costCenters.map((option) => (
                    <SelectItem key={option.id} value={option.id}>
                      {option.code} — {option.name}
                      {option.constructionSite ? ` · ${option.constructionSite.code}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </>
        )}

        {mode === 'order' && !isLoading && suggestions.length === 0 && outras.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center">
            <PackageSearch className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Nenhuma ordem de compra em aberto no sistema.
            </p>
            <p className="text-xs text-muted-foreground">
              Se esta compra foi feita no balcão, use “Sem ordem (balcão)”.
            </p>
          </div>
        )}

        {mode === 'no-order' && costCenters.length === 0 && !isLoading && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center">
            <Store className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">Nenhum centro de custo cadastrado.</p>
            <p className="text-xs text-muted-foreground">
              Cadastre em Engenharia para poder lançar despesas sem ordem de compra.
            </p>
          </div>
        )}

        {mode === 'no-order' && centro && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Centro de custo" value={`${centro.code} — ${centro.name}`} />
              <Field
                label="Obra"
                value={
                  centro.constructionSite
                    ? `${centro.constructionSite.code} — ${centro.constructionSite.name}`
                    : 'Sem obra vinculada'
                }
              />
              <Field label="Valor da nota" value={formatAmount(invoiceAmount)} />
            </div>
            <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
              Sem ordem de compra não há conferência contra pedido aprovado: a conta a pagar nasce
              pelo valor integral da nota, no centro de custo escolhido.
            </p>
          </>
        )}

        {mode === 'order' && (selected || manual) && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Fornecedor"
                value={
                  (selected ?? manual)!.supplier.tradeName ??
                  (selected ?? manual)!.supplier.legalName
                }
              />
              <Field
                label="Centro de Custo"
                value={
                  (selected ?? manual)!.costCenter
                    ? `${(selected ?? manual)!.costCenter!.code} — ${(selected ?? manual)!.costCenter!.name}`
                    : '—'
                }
              />
              <Field
                label="Obra"
                value={
                  (selected ?? manual)!.constructionSite
                    ? `${(selected ?? manual)!.constructionSite!.code} — ${(selected ?? manual)!.constructionSite!.name}`
                    : 'Sem obra vinculada'
                }
              />
              <Field label="Emissão" value={formatDate((selected ?? manual)!.issueDate)} />
              <Field
                label="Valor aprovado"
                value={formatAmount((selected ?? manual)!.totalAmount)}
              />
              <Field label="Saldo em aberto" value={formatAmount(openAmount)} />
            </div>

            {Number((selected ?? manual)!.reconciledAmount) > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatAmount((selected ?? manual)!.reconciledAmount)} já conciliados nesta ordem
                por outras notas.
              </p>
            )}

            <div
              className={
                hasDivergence
                  ? 'flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2'
                  : 'flex items-start gap-2 rounded-md border border-success/40 bg-success/10 px-3 py-2'
              }
            >
              {hasDivergence ? (
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
              ) : (
                <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
              )}
              <div className="flex flex-col gap-0.5">
                <span
                  className={
                    hasDivergence
                      ? 'text-sm font-medium text-destructive'
                      : 'text-sm font-medium text-success'
                  }
                >
                  {hasDivergence
                    ? `Divergência de ${formatAmount(Math.abs(difference).toFixed(2))}`
                    : 'Valores conferem'}
                </span>
                {hasDivergence && (
                  <span className="text-xs text-muted-foreground">
                    A nota é {difference > 0 ? 'maior' : 'menor'} que o saldo em aberto da ordem.
                    Confirme a divergência para prosseguir.
                  </span>
                )}
              </div>
            </div>

            {compatibility && (
              <>
                <Separator />
                <div className="flex flex-col gap-3">
                  <span className="text-xs font-medium text-muted-foreground">Conferência</span>
                  <CompatibilityChecks checks={compatibility.checks} />
                </div>

                {compatibility.itemsComparable && (
                  <>
                    <Separator />
                    <ItemComparisonTable items={compatibility.items} />
                  </>
                )}
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
