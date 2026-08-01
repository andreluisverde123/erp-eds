import { useRef } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Button, FileDropzone } from '@repo/ui';

import { openFileInNewTab } from '@/lib/download-file';

import {
  useWorkflowAttachmentUpload,
  useWorkflowAttachments,
} from '../hooks/use-workflow-attachments';
import type { WorkflowEntityType } from '../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export function WorkflowAttachmentsPanel({
  entityType,
  entityId,
}: {
  entityType: WorkflowEntityType;
  entityId: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const { data: attachments, isLoading } = useWorkflowAttachments(entityType, entityId);
  const uploadMutation = useWorkflowAttachmentUpload(entityType, entityId);

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file) uploadMutation.mutate(file);
  }

  return (
    <div className="flex flex-col gap-4">
      <FileDropzone
        onFiles={(files) => files[0] && uploadMutation.mutate(files[0])}
        disabled={uploadMutation.isPending}
        className="rounded-md border border-dashed border-border p-4"
      >
        <input ref={inputRef} type="file" className="hidden" onChange={handleFileChange} />
        <div className="flex flex-col items-center gap-2 text-center">
          <Upload className="size-5 text-muted-foreground" strokeWidth={1.75} />
          <p className="text-sm text-muted-foreground">Arraste um arquivo aqui ou</p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={uploadMutation.isPending}
            onClick={() => inputRef.current?.click()}
          >
            {uploadMutation.isPending ? 'Enviando...' : 'Selecionar arquivo'}
          </Button>
        </div>
      </FileDropzone>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando anexos...</p>}

      {!isLoading && attachments && attachments.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum anexo ainda.</p>
      )}

      {attachments && attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.id}>
              <button
                type="button"
                onClick={() => openFileInNewTab(attachment.fileUrl)}
                className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <div className="flex flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">
                    {attachment.fileName}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {attachment.uploadedBy?.name ?? 'Sistema'} ·{' '}
                    {formatDateTime(attachment.createdAt)}
                    {attachment.sizeBytes ? ` · ${formatSize(attachment.sizeBytes)}` : ''}
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
