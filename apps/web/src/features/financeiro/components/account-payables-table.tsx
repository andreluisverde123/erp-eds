import { memo } from 'react';

import { CreditCard, MoreHorizontal, Wallet } from 'lucide-react';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { AccountPayableStatusBadge } from './account-payable-status-badge';
import type { AccountPayable } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

interface AccountPayablesTableProps {
  accounts: AccountPayable[];
  onRegisterPayment: (account: AccountPayable) => void;
}

export const AccountPayablesTable = memo(function AccountPayablesTable({
  accounts,
  onRegisterPayment,
}: AccountPayablesTableProps) {
  if (accounts.length === 0) {
    return (
      <EmptyState
        icon={Wallet}
        title="Nenhuma conta a pagar encontrada"
        description="Ajuste os filtros ou valide uma nota fiscal."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Fornecedor</TableHead>
          <TableHead>Documento</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Vencimento</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {accounts.map((account) => {
          const canPay = account.status === 'OPEN' || account.status === 'PARTIAL';

          return (
            <TableRow key={account.id}>
              <TableCell className="font-medium text-foreground">
                {account.invoice.supplier.tradeName ?? account.invoice.supplier.legalName}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {account.invoice.number}
                {account.invoice.series && <span>/{account.invoice.series}</span>}
              </TableCell>
              <TableCell className="text-right text-muted-foreground">
                {formatCurrency(Number(account.amount))}
              </TableCell>
              <TableCell className="text-muted-foreground">{formatDate(account.dueDate)}</TableCell>
              <TableCell>
                <AccountPayableStatusBadge status={account.status} />
              </TableCell>
              <TableCell>
                {canPay && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Ações</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onRegisterPayment(account)}>
                        <CreditCard />
                        Registrar Pagamento
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});
