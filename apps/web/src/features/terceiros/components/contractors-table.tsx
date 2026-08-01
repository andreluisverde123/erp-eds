import { memo } from 'react';

import { Handshake, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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

import { ContractorStatusBadge } from './contractor-status-badge';
import type { Contractor } from '../types';

interface ContractorsTableProps {
  contractors: Contractor[];
  onEdit: (contractor: Contractor) => void;
  onDelete: (contractor: Contractor) => void;
}

export const ContractorsTable = memo(function ContractorsTable({
  contractors,
  onEdit,
  onDelete,
}: ContractorsTableProps) {
  if (contractors.length === 0) {
    return (
      <EmptyState
        icon={Handshake}
        title="Nenhuma empresa terceirizada encontrada"
        description="Ajuste os filtros ou cadastre uma nova empresa."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Razão Social</TableHead>
          <TableHead>Nome Fantasia</TableHead>
          <TableHead>CNPJ</TableHead>
          <TableHead>Responsável</TableHead>
          <TableHead>Telefone</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {contractors.map((contractor) => (
          <TableRow key={contractor.id}>
            <TableCell className="font-medium text-foreground">{contractor.legalName}</TableCell>
            <TableCell className="text-muted-foreground">{contractor.tradeName ?? '—'}</TableCell>
            <TableCell className="text-muted-foreground">{contractor.document}</TableCell>
            <TableCell className="text-muted-foreground">
              {contractor.responsibleName ?? '—'}
            </TableCell>
            <TableCell className="text-muted-foreground">{contractor.phone ?? '—'}</TableCell>
            <TableCell>
              <ContractorStatusBadge status={contractor.status} />
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
                  <DropdownMenuItem onClick={() => onEdit(contractor)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(contractor)}>
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
