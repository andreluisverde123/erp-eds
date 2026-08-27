import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  Checkbox,
  Input,
  NumberInput,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useUpdatePurchaseRequestQuote } from '../hooks/use-purchase-request-mutations';
import {
  calculateLine,
  calculateTotals,
  centsToNumber,
  discountFromItem,
  isQuotedRow,
  NO_DISCOUNT,
  type Discount,
} from '../quote-totals';
import type { DiscountInput, PurchaseRequestDetail, PurchaseRequestItem } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

const formatCents = (cents: number) => formatCurrency(centsToNumber(cents));

/// O estado editável de UMA linha.
interface QuoteRow {
  available: boolean;
  price: string;
  unavailabilityNote: string;
  discount: Discount;
}

function initialRows(items: PurchaseRequestItem[]): Record<string, QuoteRow> {
  return Object.fromEntries(
    items.map((item) => [
      item.id,
      {
        available: !item.unavailable,
        price: item.estimatedUnitPrice ?? '',
        unavailabilityNote: item.unavailabilityNote ?? '',
        discount: discountFromItem(item),
      },
    ]),
  );
}

/// Converte um desconto da tela para o formato da API. Vazio ou zero vira
/// `undefined` — ausência, não "desconto de zero".
function toDiscountInput(discount: Discount): DiscountInput | undefined {
  const value = Number(discount.value);
  return Number.isFinite(value) && value > 0 ? { type: discount.type, value } : undefined;
}

interface QuotePurchaseRequestDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: PurchaseRequestDetail;
}

/// Onde o valor unitário é informado desde que saiu do formulário de
/// solicitação: quem abre o pedido não conhece o preço, Compras cota depois.
/// A grade aqui é do que a COTAÇÃO decide — preço, desconto e disponibilidade.
/// Descrição, unidade e quantidade são do solicitante e aparecem como leitura.
///
/// COTAÇÃO PARCIAL. Um fornecedor raramente tem a lista inteira: desmarcar
/// "Disponível" apaga preço, desconto e total daquela linha e a tira da conta,
/// em um clique e sem confirmação.
///
/// DESCONTO EM DOIS NÍVEIS. Por item, na própria linha; geral, no resumo
/// financeiro do rodapé. Os dois são digitados onde o número que eles afetam
/// já está — nenhuma tela nova, nenhum modal, nada para abrir.
export function QuotePurchaseRequestDrawer({
  open,
  onOpenChange,
  request,
}: QuotePurchaseRequestDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Mais largo que o padrão `sm:max-w-lg` das outras gavetas porque a
          grade tem sete colunas: apertá-las quebraria a leitura em diagonal,
          que é o que faz esta tela ser rápida. */}
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-5xl">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Informar cotação</SheetTitle>
          <SheetDescription>
            Preencha o valor unitário negociado e o desconto, quando houver. Desmarque "Disponível"
            no item que o fornecedor não tiver — ele fica fora do total e continua na solicitação.
          </SheetDescription>
        </div>

        <QuotePurchaseRequestBody
          key={open ? request.id : 'closed'}
          request={request}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function QuotePurchaseRequestBody({
  request,
  onDone,
}: {
  request: PurchaseRequestDetail;
  onDone: () => void;
}) {
  const items = request.items;
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [rows, setRows] = useState<Record<string, QuoteRow>>(() => initialRows(items));
  const [generalDiscount, setGeneralDiscount] = useState<Discount>(() =>
    Number(request.discountValue) > 0
      ? { type: request.discountType, value: request.discountValue }
      : { ...NO_DISCOUNT, type: request.discountType },
  );

  const quoteMutation = useUpdatePurchaseRequestQuote(request.id);

  function patchRow(id: string, patch: Partial<QuoteRow>) {
    setRows((current) => ({ ...current, [id]: { ...current[id]!, ...patch } }));
  }

  const linhas = items.map((item) => {
    const row = rows[item.id]!;
    return calculateLine(item.quantity, row.price, row.available, row.discount);
  });
  const totals = calculateTotals(linhas, generalDiscount);

  const cotados = items.filter((item) => {
    const row = rows[item.id]!;
    return isQuotedRow(row.available, row.price);
  });
  const indisponiveis = items.filter((item) => !rows[item.id]!.available);

  async function handleSubmit() {
    setSubmitError(null);
    try {
      await quoteMutation.mutateAsync({
        // Manda a grade INTEIRA, não só o que foi preenchido: o servidor
        // precisa saber que uma linha voltou a disponível, teve o preço
        // apagado ou perdeu o desconto — e isso é ausência de valor, não
        // ausência de linha.
        items: items.map((item) => {
          const row = rows[item.id]!;

          if (!row.available) {
            return {
              id: item.id,
              unavailable: true,
              ...(row.unavailabilityNote.trim() !== '' && {
                unavailabilityNote: row.unavailabilityNote.trim(),
              }),
            };
          }

          const cotado = row.price.trim() !== '';
          return {
            id: item.id,
            unavailable: false,
            ...(cotado && { estimatedUnitPrice: Number(row.price) }),
            // Desconto só acompanha item com preço — sem base, o servidor
            // recusaria, e com razão.
            ...(cotado &&
              toDiscountInput(row.discount) && { discount: toDiscountInput(row.discount) }),
          };
        }),
        ...(toDiscountInput(generalDiscount) && { discount: toDiscountInput(generalDiscount) }),
      });
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a cotação. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
        {submitError && (
          <Alert variant="destructive">
            <AlertTitle>{submitError}</AlertTitle>
          </Alert>
        )}

        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="!pl-4">Item</TableHead>
                <TableHead className="w-24 text-right">Qtd.</TableHead>
                <TableHead className="w-32 text-right">Valor unit. (R$)</TableHead>
                <TableHead className="w-28 text-right">Subtotal</TableHead>
                <TableHead className="w-40 text-right">Desconto</TableHead>
                <TableHead className="w-28 text-right">Total</TableHead>
                <TableHead className="w-24 !pr-4 text-center">Disponível</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, index) => {
                const row = rows[item.id]!;
                const linha = linhas[index]!;
                const cotado = isQuotedRow(row.available, row.price);

                return (
                  <TableRow
                    key={item.id}
                    className={cn('hover:bg-transparent', !row.available && 'opacity-55')}
                  >
                    <TableCell className="!pl-4 align-top">
                      <span className="font-medium text-foreground">{item.description}</span>
                      {/* A observação só existe quando o item está fora, e
                          nasce onde a atenção já está — sem modal e sem
                          coluna vazia nas outras linhas. */}
                      {!row.available && (
                        <Input
                          value={row.unavailabilityNote}
                          onChange={(event) =>
                            patchRow(item.id, { unavailabilityNote: event.target.value })
                          }
                          maxLength={200}
                          placeholder="Motivo (opcional): sem estoque, fora de linha..."
                          aria-label={`Motivo da indisponibilidade de ${item.description}`}
                          className="mt-1.5 h-8 text-xs"
                        />
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right text-muted-foreground">
                      {Number(item.quantity).toLocaleString('pt-BR')} {item.unit}
                    </TableCell>
                    <TableCell className="p-1 align-top">
                      {row.available ? (
                        <NumberInput
                          value={row.price}
                          onChange={(value) => patchRow(item.id, { price: value })}
                          placeholder="0,00"
                          aria-label={`Valor unitário de ${item.description}`}
                          className="h-9 text-right"
                        />
                      ) : (
                        // Um traço em vez de um campo desabilitado: a linha
                        // não está bloqueada, ela não tem preço nenhum.
                        <span className="block px-3 py-2 text-right text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right tabular-nums text-muted-foreground">
                      {cotado ? formatCents(linha.gross) : '—'}
                    </TableCell>
                    <TableCell className="p-1 align-top">
                      {/* Desconto só onde há base para descontar. Sem preço,
                          o campo nem aparece — em vez de aceitar um número
                          que o servidor vai recusar. */}
                      {cotado ? (
                        <DiscountField
                          discount={row.discount}
                          onChange={(discount) => patchRow(item.id, { discount })}
                          label={`Desconto de ${item.description}`}
                        />
                      ) : (
                        <span className="block px-3 py-2 text-right text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell className="align-top text-right tabular-nums font-medium text-foreground">
                      {cotado ? formatCents(linha.net) : '—'}
                    </TableCell>
                    <TableCell className="!pr-4 align-top text-center">
                      {/* Marcado = disponível, o padrão. Mesmo gesto que o
                          seletor de itens da ordem de compra usa para incluir
                          e excluir linha: um clique, sem confirmação. */}
                      <Checkbox
                        checked={row.available}
                        onCheckedChange={(checked) =>
                          patchRow(item.id, {
                            available: checked === true,
                            // Voltar a disponível descarta motivo e desconto —
                            // os dois pertencem a um estado que deixou de
                            // valer.
                            ...(checked === true
                              ? { unavailabilityNote: '' }
                              : { discount: NO_DISCOUNT }),
                          })
                        }
                        aria-label={`${item.description} disponível no fornecedor`}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>

        <FinancialSummary
          totals={totals}
          generalDiscount={generalDiscount}
          onGeneralDiscountChange={setGeneralDiscount}
          cotados={cotados.length}
          itens={items.length}
          indisponiveis={indisponiveis.length}
        />
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        {/* Uma cotação em que nada foi cotado não tem o que aprovar — é a
            única exigência que sobrou depois que o preço virou opcional. */}
        <Button
          type="button"
          disabled={quoteMutation.isPending || cotados.length === 0}
          onClick={handleSubmit}
        >
          {quoteMutation.isPending ? 'Salvando...' : 'Salvar cotação'}
        </Button>
      </div>
    </>
  );
}

/// Um campo de desconto: o número e a unidade em que ele foi informado.
///
/// O botão R$/% é a própria etiqueta do valor — sempre visível, um clique para
/// virar. Um `Select` custaria dois cliques para a mesma escolha binária, e um
/// campo sem unidade visível obrigaria a adivinhar se "10" são dez reais ou
/// dez por cento.
function DiscountField({
  discount,
  onChange,
  label,
}: {
  discount: Discount;
  onChange: (discount: Discount) => void;
  label: string;
}) {
  const percent = discount.type === 'PERCENT';

  return (
    <div className="flex items-center gap-1">
      <NumberInput
        value={discount.value}
        onChange={(value) => onChange({ ...discount, value })}
        // Porcentagem é digitação livre ("10" é dez, não 0,10); dinheiro usa a
        // máscara de caixa registradora do resto do sistema.
        mode={percent ? 'decimal' : 'currency'}
        placeholder={percent ? '0' : '0,00'}
        aria-label={`${label} (${percent ? 'em porcentagem' : 'em reais'})`}
        className="h-9 text-right"
      />
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-10 shrink-0 px-0 font-medium tabular-nums"
        onClick={() => onChange({ ...discount, type: percent ? 'AMOUNT' : 'PERCENT' })}
        aria-label={`${label}: alternar entre reais e porcentagem. Atualmente em ${
          percent ? 'porcentagem' : 'reais'
        }`}
      >
        {percent ? '%' : 'R$'}
      </Button>
    </div>
  );
}

/// De onde veio o total, em etapas — para ninguém precisar fazer a conta na
/// mão para conferir.
///
/// As linhas de desconto só aparecem quando existem: "- R$ 0,00" é ruído, e um
/// subtotal repetido como total confunde mais do que informa.
function FinancialSummary({
  totals,
  generalDiscount,
  onGeneralDiscountChange,
  cotados,
  itens,
  indisponiveis,
}: {
  totals: ReturnType<typeof calculateTotals>;
  generalDiscount: Discount;
  onGeneralDiscountChange: (discount: Discount) => void;
  cotados: number;
  itens: number;
  indisponiveis: number;
}) {
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-muted px-4 py-3">
      <SummaryLine label="Subtotal dos itens" value={formatCents(totals.itemsSubtotal)} />

      {totals.itemsDiscount > 0 && (
        <>
          <SummaryLine
            label="Descontos nos itens"
            value={`- ${formatCents(totals.itemsDiscount)}`}
          />
          <SummaryLine
            label="Subtotal após descontos"
            value={formatCents(totals.subtotalAfterItemDiscounts)}
          />
        </>
      )}

      {/* O desconto geral é digitado NA LINHA em que ele aparece, e ao lado do
          subtotal sobre o qual incide — que é a pergunta que ele levanta. */}
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-muted-foreground">
          Desconto geral
          <span className="ml-1 text-[11px] text-muted-foreground/70">
            sobre o subtotal {totals.itemsDiscount > 0 ? 'após descontos' : 'dos itens'}
          </span>
        </span>
        <div className="flex items-center gap-3">
          <div className="w-40">
            <DiscountField
              discount={generalDiscount}
              onChange={onGeneralDiscountChange}
              label="Desconto geral da cotação"
            />
          </div>
          <span className="w-28 text-right text-xs tabular-nums text-muted-foreground">
            {totals.generalDiscount > 0 ? `- ${formatCents(totals.generalDiscount)}` : '—'}
          </span>
        </div>
      </div>

      <div className="mt-1 flex items-end justify-between border-t border-border pt-2.5">
        <div className="flex flex-col">
          <span className="text-xs font-medium text-muted-foreground">Total cotado</span>
          <span className="text-xs text-muted-foreground">
            {cotados} de {itens} {itens === 1 ? 'item cotado' : 'itens cotados'}
            {indisponiveis > 0 && ` · ${indisponiveis} não disponível(is)`}
          </span>
        </div>
        <span className="text-base font-semibold tabular-nums text-foreground">
          {formatCents(totals.total)}
        </span>
      </div>
    </div>
  );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
    </div>
  );
}
