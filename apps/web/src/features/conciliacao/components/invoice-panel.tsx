import { FileCode2, FileDown } from 'lucide-react';
import {
  Button,
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

/// Lado esquerdo da comparação: o que a nota fiscal diz. Tudo aqui é o
/// documento recebido — nada foi conferido ainda.
export function InvoicePanel({ invoice }: { invoice: InboundInvoiceDetail }) {
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Fornecedor" value={invoice.supplierName} />
          <Field label="CNPJ" value={formatDocument(invoice.supplierDocument)} />
          <Field label="Valor total" value={formatAmount(invoice.totalAmount)} />
          <Field label="Data de emissão" value={formatDate(invoice.issueDate)} />
        </div>

        {!invoice.supplier && (
          <p className="rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
            Este CNPJ não corresponde a nenhum fornecedor cadastrado, por isso o sistema não
            consegue sugerir ordens de compra. Cadastre o fornecedor em Compras para habilitar as
            sugestões.
          </p>
        )}

        <Separator />

        <div className="flex flex-col gap-2">
          <span className="text-xs font-medium text-muted-foreground">Itens</span>
          {invoice.items.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              A nota foi lançada sem itens — a conferência é pelo valor total.
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
                    <TableCell className="text-foreground">{item.description}</TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatQuantity(item.quantity)}
                      {item.unit && ` ${item.unit}`}
                    </TableCell>
                    <TableCell className="tabular-nums text-muted-foreground">
                      {formatAmount(item.unitPrice)}
                    </TableCell>
                    <TableCell className="tabular-nums text-foreground">
                      {formatAmount(item.totalPrice)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>

        <Separator />

        {/* XML e PDF: a estrutura existe (colunas no banco, botões aqui), mas
            nesta versão nada os preenche — não há captura automática. Ficam
            desabilitados em vez de escondidos para que o financeiro veja que
            o anexo é esperado e ainda não chegou. */}
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" disabled={!invoice.xmlPath}>
            <FileCode2 />
            XML
          </Button>
          <Button variant="outline" size="sm" disabled={!invoice.pdfPath}>
            <FileDown />
            PDF
          </Button>
          {!invoice.xmlPath && !invoice.pdfPath && (
            <span className="text-xs text-muted-foreground">
              Sem arquivos anexados (entrada manual).
            </span>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
