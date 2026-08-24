import { Fragment, memo, useState } from 'react';

import { ChevronDown, ChevronRight, CreditCard, MoreHorizontal, Wallet } from 'lucide-react';
import {
  Badge,
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

import { AccountPayableOrigin } from './account-payable-origin';
import { AccountPayableStatusBadge } from './account-payable-status-badge';
import { accountPayableLabel, type AccountPayable } from '../types';

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
  // Expandir em vez de abrir uma tela nova — mesmo padrão da Ordem de Compra.
  // A origem da despesa já vem na listagem (a API a monta por relacionamento),
  // então abrir a linha não custa nenhuma requisição.
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  function alternar(id: string) {
    setExpandidas((atual) => {
      const proximo = new Set(atual);
      if (proximo.has(id)) proximo.delete(id);
      else proximo.add(id);
      return proximo;
    });
  }

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
          <TableHead className="w-10" />
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
          const aberta = expandidas.has(account.id);

          return (
            <Fragment key={account.id}>
              <TableRow>
                <TableCell>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-8"
                    onClick={() => alternar(account.id)}
                    aria-label={aberta ? 'Ocultar a origem' : 'Ver a origem da despesa'}
                  >
                    {aberta ? (
                      <ChevronDown className="size-4" />
                    ) : (
                      <ChevronRight className="size-4" />
                    )}
                  </Button>
                </TableCell>
                <TableCell className="font-medium text-foreground">
                  {account.supplier.tradeName ?? account.supplier.legalName}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{accountPayableLabel(account)}</span>
                    {account.origin === 'MANUAL' && (
                      <Badge variant="secondary" className="font-normal">
                        Avulsa
                      </Badge>
                    )}
                  </div>
                  {account.constructionSite && (
                    <span className="block text-xs text-muted-foreground/80">
                      {account.constructionSite.name}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right text-muted-foreground">
                  {formatCurrency(Number(account.amount))}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(account.dueDate)}
                </TableCell>
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

              {aberta && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={7} className="bg-muted/30 p-4">
                    <AccountPayableOrigin traceability={account.traceability} />
                  </TableCell>
                </TableRow>
              )}
            </Fragment>
          );
        })}
      </TableBody>
    </Table>
  );
});
