import { memo } from 'react';

import { FileText, FolderOpen, MoreHorizontal, Trash2 } from 'lucide-react';
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

import { DocumentStatusBadge } from './document-status-badge';
import { DocumentUploadButton } from './document-upload-button';
import type { ContractDocument } from '../types';

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

interface ContractDocumentsTableProps {
  documents: ContractDocument[];
  onDelete: (document: ContractDocument) => void;
}

export const ContractDocumentsTable = memo(function ContractDocumentsTable({
  documents,
  onDelete,
}: ContractDocumentsTableProps) {
  if (documents.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title="Nenhum documento encontrado"
        description="Ajuste os filtros ou cadastre um novo documento."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Documento</TableHead>
          <TableHead>Empresa</TableHead>
          <TableHead>Validade</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Arquivo</TableHead>
          <TableHead className="w-24" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {documents.map((document) => {
          const { attachment } = document;
          return (
            <TableRow key={document.id}>
              <TableCell className="font-medium text-foreground">{document.name}</TableCell>
              <TableCell className="text-muted-foreground">
                {document.contract.contractor.tradeName ?? document.contract.contractor.legalName}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(document.expiresAt)}
              </TableCell>
              <TableCell>
                <DocumentStatusBadge status={document.badgeStatus} />
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
                <div className="flex items-center justify-end gap-1">
                  <DocumentUploadButton documentId={document.id} />
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8">
                        <MoreHorizontal className="size-4" />
                        <span className="sr-only">Ações</span>
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem variant="destructive" onClick={() => onDelete(document)}>
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
