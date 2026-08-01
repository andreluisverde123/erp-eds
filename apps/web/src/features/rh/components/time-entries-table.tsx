import { memo } from 'react';

import { Fingerprint, MoreHorizontal, Trash2 } from 'lucide-react';
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

import { TimeEntryStatusBadge } from './time-entry-status-badge';
import type { TimeEntry } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function formatTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

interface TimeEntriesTableProps {
  timeEntries: TimeEntry[];
  onDelete: (timeEntry: TimeEntry) => void;
}

export const TimeEntriesTable = memo(function TimeEntriesTable({
  timeEntries,
  onDelete,
}: TimeEntriesTableProps) {
  if (timeEntries.length === 0) {
    return (
      <EmptyState
        icon={Fingerprint}
        title="Nenhum apontamento encontrado"
        description="Ajuste os filtros ou registre um novo ponto."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Funcionário</TableHead>
          <TableHead>Data</TableHead>
          <TableHead>Entrada</TableHead>
          <TableHead>Saída</TableHead>
          <TableHead className="text-right">Horas</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {timeEntries.map((timeEntry) => (
          <TableRow key={timeEntry.id}>
            <TableCell className="font-medium text-foreground">{timeEntry.employee.name}</TableCell>
            <TableCell className="text-muted-foreground">{formatDate(timeEntry.date)}</TableCell>
            <TableCell className="text-muted-foreground">{formatTime(timeEntry.checkIn)}</TableCell>
            <TableCell className="text-muted-foreground">
              {formatTime(timeEntry.checkOut)}
            </TableCell>
            <TableCell className="text-right text-muted-foreground">
              {timeEntry.hoursWorked ? `${timeEntry.hoursWorked}h` : '—'}
            </TableCell>
            <TableCell>
              <TimeEntryStatusBadge status={timeEntry.status} />
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
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(timeEntry)}>
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
