import { AlertTriangle, CheckCircle2, PackageSearch } from 'lucide-react';
import {
  Badge,
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { formatAmount, formatDate, formatQuantity } from '../format';
import type { PurchaseOrderSuggestion } from '../types';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

interface PurchaseOrderPanelProps {
  suggestions: PurchaseOrderSuggestion[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  isLoading: boolean;
  /// Valor da nota, para confrontar com o saldo em aberto da ordem.
  invoiceAmount: string;
  /// Somente leitura depois que a nota já foi conciliada.
  readOnly?: boolean;
}

/// Lado direito da comparação: a ordem de compra escolhida. O seletor fica no
/// topo porque trocar a ordem é a ação central desta tela — o usuário aceita a
/// sugestão ou escolhe outra, e o painel inteiro reage.
export function PurchaseOrderPanel({
  suggestions,
  selectedId,
  onSelect,
  isLoading,
  invoiceAmount,
  readOnly = false,
}: PurchaseOrderPanelProps) {
  const selected = suggestions.find((suggestion) => suggestion.id === selectedId) ?? null;

  const difference = selected ? Number(invoiceAmount) - Number(selected.openAmount) : 0;
  const hasDivergence = selected ? Math.abs(difference) >= 0.01 : false;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Ordem de Compra</CardTitle>
            <CardDescription>
              {selected ? `Nº ${selected.code}` : 'Selecione a ordem correspondente'}
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
            </SelectContent>
          </Select>
        )}

        {!isLoading && suggestions.length === 0 && (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center">
            <PackageSearch className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">
              Nenhuma ordem de compra deste fornecedor com saldo em aberto.
            </p>
            <p className="text-xs text-muted-foreground">
              Ordens canceladas ou já totalmente conciliadas não aparecem aqui.
            </p>
          </div>
        )}

        {selected && (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Fornecedor"
                value={selected.supplier.tradeName ?? selected.supplier.legalName}
              />
              <Field
                label="Centro de Custo"
                value={
                  selected.costCenter
                    ? `${selected.costCenter.code} — ${selected.costCenter.name}`
                    : '—'
                }
              />
              <Field
                label="Obra"
                value={
                  selected.constructionSite
                    ? `${selected.constructionSite.code} — ${selected.constructionSite.name}`
                    : 'Sem obra vinculada'
                }
              />
              <Field label="Emissão" value={formatDate(selected.issueDate)} />
              <Field label="Valor aprovado" value={formatAmount(selected.totalAmount)} />
              <Field label="Saldo em aberto" value={formatAmount(selected.openAmount)} />
            </div>

            {/* Entregas parciais são a regra em obra: uma ordem pode receber
                várias notas até fechar o valor aprovado. Mostrar o já
                conciliado explica por que o saldo difere do total. */}
            {Number(selected.reconciledAmount) > 0 && (
              <p className="text-xs text-muted-foreground">
                {formatAmount(selected.reconciledAmount)} já conciliados nesta ordem por outras
                notas.
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

            <Separator />

            <div className="flex flex-col gap-2">
              <span className="text-xs font-medium text-muted-foreground">Itens comprados</span>
              {selected.items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  A requisição de origem não tem itens detalhados.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Descrição</TableHead>
                      <TableHead>Qtd.</TableHead>
                      <TableHead>Unit. estimado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selected.items.map((item, index) => (
                      <TableRow key={`${item.description}-${index}`}>
                        <TableCell className="text-foreground">{item.description}</TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatQuantity(item.quantity)} {item.unit}
                        </TableCell>
                        <TableCell className="tabular-nums text-muted-foreground">
                          {formatAmount(item.estimatedUnitPrice)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
