import { useRef, useState } from 'react';
import { FileText, Trash2, Upload } from 'lucide-react';
import { Button, FileDropzone } from '@repo/ui';

import { ApiError } from '@/lib/api-client';
import { openFileInNewTab } from '@/lib/download-file';

import { useAttachments, useDeleteAttachment, useUploadAttachment } from '../hooks/use-attachments';
import type { AttachmentEntityType } from '../api';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatSize(bytes: number | null): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface AttachmentsPanelProps {
  entityType: AttachmentEntityType;
  entityId: string;
  /// Quem não pode editar o módulo continua vendo e baixando os anexos, só
  /// não envia nem exclui.
  canManage?: boolean;
  emptyMessage?: string;
}

/// Painel de anexos reutilizável, ligado ao endpoint genérico `/attachments`.
/// Serve qualquer registro do catálogo — obra, solicitação, ordem, nota,
/// pagamento, funcionário, terceiro, contrato.
export function AttachmentsPanel({
  entityType,
  entityId,
  canManage = true,
  emptyMessage = 'Nenhum anexo ainda.',
}: AttachmentsPanelProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const { data: attachments, isLoading } = useAttachments(entityType, entityId);
  const upload = useUploadAttachment(entityType, entityId);
  const remove = useDeleteAttachment(entityType, entityId);

  function send(file: File | undefined) {
    if (!file) return;
    setError(null);
    upload.mutate(file, {
      // O backend recusa por configuração da empresa (anexos desativados ou
      // acima do limite de tamanho) — a mensagem dele já explica o motivo.
      onError: (cause) =>
        setError(cause instanceof ApiError ? cause.message : 'Não foi possível enviar o arquivo.'),
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {canManage && (
        <FileDropzone
          onFiles={(files) => send(files[0])}
          disabled={upload.isPending}
          className="rounded-md border border-dashed border-border p-4"
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              send(file);
            }}
          />
          <div className="flex flex-col items-center gap-2 text-center">
            <Upload className="size-5 text-muted-foreground" strokeWidth={1.75} />
            <p className="text-sm text-muted-foreground">Arraste um arquivo aqui ou</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={upload.isPending}
              onClick={() => inputRef.current?.click()}
            >
              {upload.isPending ? 'Enviando...' : 'Selecionar arquivo'}
            </Button>
          </div>
        </FileDropzone>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}

      {isLoading && <p className="text-sm text-muted-foreground">Carregando anexos...</p>}

      {!isLoading && attachments?.length === 0 && (
        <p className="text-sm text-muted-foreground">{emptyMessage}</p>
      )}

      {attachments && attachments.length > 0 && (
        <ul className="flex flex-col gap-2">
          {attachments.map((attachment) => (
            <li key={attachment.id} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => openFileInNewTab(attachment.fileUrl)}
                className="flex flex-1 items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
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

              {canManage && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-destructive"
                  title="Excluir anexo"
                  disabled={remove.isPending}
                  onClick={() => remove.mutate(attachment.id)}
                >
                  <Trash2 className="size-4" />
                  <span className="sr-only">Excluir {attachment.fileName}</span>
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
