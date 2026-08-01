import { memo } from 'react';

import { FileSignature, MoreHorizontal, Trash2, XCircle } from 'lucide-react';
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

import { ContractStatusBadge } from './contract-status-badge';
import type { Contract } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatDaysRemaining(days: number): string {
  if (days < 0) return `Vencido há ${Math.abs(days)}d`;
  if (days === 0) return 'Vence hoje';
  return `${days}d`;
}

interface ContractsTableProps {
  contracts: Contract[];
  onCancel: (contract: Contract) => void;
  onDelete: (contract: Contract) => void;
}

export const ContractsTable = memo(function ContractsTable({
  contracts,
  onCancel,
  onDelete,
}: ContractsTableProps) {
  if (contracts.length === 0) {
    return (
      <EmptyState
        icon={FileSignature}
        title="Nenhum contrato encontrado"
        description="Ajuste os filtros ou cadastre um novo contrato."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Número</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Obra</TableHead>
          <TableHead className="text-right">Valor</TableHead>
          <TableHead>Início</TableHead>
          <TableHead>Fim</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Dias restantes</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {contracts.map((contract) => (
          <TableRow key={contract.id}>
            <TableCell className="font-medium text-foreground">{contract.code}</TableCell>
            <TableCell className="text-muted-foreground">
              {contract.contractor.tradeName ?? contract.contractor.legalName}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {contract.constructionSite.name}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {formatCurrency(Number(contract.totalValue))}
            </TableCell>
            <TableCell className="text-muted-foreground">
              {formatDate(contract.startDate)}
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(contract.endDate)}</TableCell>
            <TableCell>
              <ContractStatusBadge status={contract.badgeStatus} />
            </TableCell>
            <TableCell className="text-muted-foreground">
              {contract.status === 'CANCELLED' ? '—' : formatDaysRemaining(contract.daysRemaining)}
            </TableCell>
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {contract.status === 'ACTIVE' && (
                    <DropdownMenuItem variant="destructive" onClick={() => onCancel(contract)}>
                      <XCircle />
                      Encerrar
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(contract)}>
                    <Trash2 />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
