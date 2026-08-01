import { memo } from 'react';

import { FileSpreadsheet, FileText, MoreHorizontal, Trash2 } from 'lucide-react';
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

import { openFileInNewTab } from '@/lib/download-file';

import { PayslipStatusBadge } from './payslip-status-badge';
import { PayslipUploadButton } from './payslip-upload-button';
import type { Payslip } from '../types';
import { MONTH_OPTIONS } from '../payslip-form-schema';

function formatCompetencia(year: number, month: number): string {
  const label =
    MONTH_OPTIONS.find((option) => Number(option.value) === month)?.label ?? String(month);
  return `${label}/${year}`;
}

interface PayslipsTableProps {
  payslips: Payslip[];
  onDelete: (payslip: Payslip) => void;
}

export const PayslipsTable = memo(function PayslipsTable({
  payslips,
  onDelete,
}: PayslipsTableProps) {
  if (payslips.length === 0) {
    return (
      <EmptyState
        icon={FileSpreadsheet}
        title="Nenhum holerite encontrado"
        description="Ajuste os filtros ou cadastre um novo holerite."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Funcionário</TableHead>
          <TableHead>Competência</TableHead>
          <TableHead>Arquivo PDF</TableHead>
          <TableHead>Status</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {payslips.map((payslip) => {
          const { attachment } = payslip;
          return (
            <TableRow key={payslip.id}>
              <TableCell className="font-medium text-foreground">{payslip.employee.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatCompetencia(payslip.referenceYear, payslip.referenceMonth)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {attachment ? (
                  <button
                    type="button"
                    onClick={() => openFileInNewTab(attachment.fileUrl)}
                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                  >
                    <FileText className="size-3.5" />
                    {attachment.fileName}
                  </button>
                ) : (
                  'Nenhum arquivo'
                )}
              </TableCell>
              <TableCell>
                <PayslipStatusBadge status={payslip.status} />
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end gap-1">
                  <PayslipUploadButton payslipId={payslip.id} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Ações</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" onClick={() => onDelete(payslip)}>
                        <Trash2 />
                        Excluir
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
});
