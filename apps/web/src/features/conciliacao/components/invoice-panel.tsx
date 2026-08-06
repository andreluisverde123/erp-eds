import { AlertTriangle, FileClock } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Separator,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { InboundInvoiceStatusBadge } from './inbound-invoice-status-badge';
import { formatAmount, formatDate, formatDocument, formatQuantity } from '../format';
import type { InboundInvoiceDetail } from '../types';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

/// Uma linha de total só aparece quando tem valor. Frete e desconto zerados
/// são a maioria das notas de obra — exibir "R$ 0,00" em toda nota faria o
/// financeiro parar de ler o bloco.
function Total({
  label,
  value,
  destaque,
}: {
  label: string;
  value: string | null;
  destaque?: boolean;
}) {
  if (value === null || Number(value) === 0) return null;
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          destaque
            ? 'text-sm font-semibold tabular-nums text-foreground'
            : 'text-sm tabular-nums text-muted-foreground'
        }
      >
        {formatAmount(value)}
      </span>
    </div>
  );
}

/// Lado esquerdo da comparação: o que a nota fiscal diz.
///
/// O XML original NUNCA aparece aqui — ele fica guardado internamente, com
/// valor legal, e o financeiro vê apenas a informação estruturada. Um XML na
/// tela seria pedir que uma pessoa lesse o que o sistema já leu por ela.
export function InvoicePanel({ invoice }: { invoice: InboundInvoiceDetail }) {
  const emitente = invoice.supplierTradeName ?? invoice.supplierName;
  const localizacao = [invoice.supplierCity, invoice.supplierState].filter(Boolean).join(' / ');

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <CardTitle>Nota Fiscal</CardTitle>
            <CardDescription>
              Nº {invoice.number}
              {invoice.series && ` / série ${invoice.series}`}
            </CardDescription>
          </div>
          <InboundInvoiceStatusBadge status={invoice.status} />
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {/* Só o resumo chegou: a SEFAZ entrega o documento completo cerca de
            um dia depois. Sem este aviso, a ausência de itens pareceria uma
            nota sem produtos — ou um defeito do sistema. */}
        {!invoice.hasFullDocument && invoice.status !== 'CANCELLED' && (
          <Alert>
            <FileClock />
            <AlertTitle>Documento completo ainda não disponível</AlertTitle>
            <AlertDescription>
              A SEFAZ entregou até agora só o resumo desta nota. Os itens e impostos chegam
              automaticamente na próxima sincronização, normalmente em até um dia.
            </AlertDescription>
          </Alert>
        )}

        {invoice.status === 'CANCELLED' && (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Nota cancelada pelo emitente</AlertTitle>
            <AlertDescription>
              {invoice.cancelledAt
                ? `Cancelamento registrado em ${formatDate(invoice.cancelledAt)}. `
                : ''}
              Esta nota não deve ser conciliada nem gerar conta a pagar.
            </AlertDescription>
          </Alert>
        )}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fornecedor" value={emitente} />
          <Field label="CNPJ" value={formatDocument(invoice.supplierDocument)} />
          {invoice.supplierTradeName && <Field label="Razão social" value={invoice.supplierName} />}
          {invoice.supplierIe && <Field label="Inscrição estadual" value={invoice.supplierIe} />}
          {invoice.supplierAddress && <Field label="Endereço" value={invoice.supplierAddress} />}
          {localizacao && <Field label="Cidade / UF" value={localizacao} />}
          <Field label="Data de emissão" value={formatDate(invoice.issueDate)} />
          {invoice.accessKey && (
            <div className="flex flex-col gap-1 sm:col-span-2">
              <span className="text-xs text-muted-foreground">Chave de acesso</span>
              {/* `break-all` porque são 44 dígitos sem espaço: sem isso a
                  chave estoura a largura do card em telas estreitas. */}
              <span className="font-mono text-xs break-all text-foreground">
                {invoice.accessKey}
              </span>
            </div>
          )}
        </div>

        <Separator />

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-muted-foreground">Totais</span>
          <Total label="Produtos" value={invoice.productsAmount} />
          <Total label="Frete" value={invoice.freightAmount} />
          <Total label="Desconto" value={invoice.discountAmount} />
          <Total label="ICMS" value={invoice.icmsAmount} />
          <Total label="IPI" value={invoice.ipiAmount} />
          <Total label="PIS" value={invoice.pisAmount} />
          <Total label="COFINS" value={invoice.cofinsAmount} />
          <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border pt-2">
            <span className="text-sm font-medium text-foreground">Valor total</span>
            <span className="text-base font-semibold tabular-nums text-foreground">
              {formatAmount(invoice.totalAmount)}
            </span>
          </div>
        </div>

        <Separator />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">
            Itens{invoice.items.length > 0 && ` (${invoice.items.length})`}
          </span>
          {invoice.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {invoice.hasFullDocument
                ? 'Esta nota não tem itens detalhados.'
                : 'Os itens chegam junto com o documento completo.'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Descrição</TableHead>
                  <TableHead>Qtd.</TableHead>
                  <TableHead>Unit.</TableHead>
                  <TableHead>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invoice.items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-foreground">
                      <span className="block">{item.description}</span>
                      {/* Classificação fiscal em linha secundária: o
                          financeiro confere primeiro descrição e valor; NCM e
                          CFOP importam na conferência fiscal, não na
                          conciliação com a ordem de compra. */}
                      <span className="mt-0.5 block text-xs text-muted-foreground">
                        {[
                          item.code && `cód. ${item.code}`,
                          item.ncm && `NCM ${item.ncm}`,
                          item.cfop && `CFOP ${item.cfop}`,
                          item.cst && `CST ${item.cst}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </TableCell>
                    <TableCell className="align-top tabular-nums text-muted-foreground">
                      {formatQuantity(item.quantity)}
                      {item.unit && ` ${item.unit}`}
                    </TableCell>
                    <TableCell className="align-top tabular-nums text-muted-foreground">
                      {formatAmount(item.unitPrice)}
                    </TableCell>
                    <TableCell className="align-top tabular-nums text-foreground">
                      {formatAmount(item.totalPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        {invoice.additionalInfo && (
          <>
            <Separator />
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-muted-foreground">
                Informações adicionais
              </span>
              <p className="text-sm leading-relaxed whitespace-pre-line text-muted-foreground">
                {invoice.additionalInfo}
              </p>
            </div>
          </>
        )}

        {invoice.protocolNumber && (
          <p className="text-xs text-muted-foreground">
            Protocolo de autorização SEFAZ: {invoice.protocolNumber}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
