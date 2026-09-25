import { useRef, useState } from 'react';
import { FileText, Upload } from 'lucide-react';
import { Button, FileDropzone, Sheet, SheetContent, SheetDescription, SheetTitle } from '@repo/ui';

import { ApiError } from '@/lib/api-client';
import { openFileInNewTab } from '@/lib/download-file';

import { useServiceInvoiceFiles, useUploadServiceInvoiceFile } from './hooks';
import type { ServiceInvoice } from './types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/// Arquivos de uma nota de serviço: a nota em si e o que mais a Engenharia
/// quiser anexar. São os MESMOS anexos que o Financeiro vê na Programação de
/// Pagamentos. Sem excluir por aqui: depois de enviado, o arquivo é do
/// Financeiro também.
export function ServiceInvoiceFilesSheet({
  nota,
  onOpenChange,
  canManage,
}: {
  nota: ServiceInvoice | null;
  onOpenChange: (open: boolean) => void;
  canManage: boolean;
}) {
  return (
    <Sheet open={nota !== null} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        {nota && (
          <>
            <div className="border-b border-border px-6 py-5">
              <SheetTitle>Arquivos da nota {nota.documentNumber}</SheetTitle>
              <SheetDescription>
                {nota.contractor.tradeName ?? nota.contractor.legalName} · {nota.description}
              </SheetDescription>
            </div>
            <Arquivos nota={nota} canManage={canManage} />
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function Arquivos({ nota, canManage }: { nota: ServiceInvoice; canManage: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [erro, setErro] = useState<string | null>(null);
  const { data: arquivos, isLoading } = useServiceInvoiceFiles(nota.id);
  const upload = useUploadServiceInvoiceFile(nota.id);

  function enviar(file: File | undefined) {
    if (!file) return;
    setErro(null);
    upload.mutate(file, {
      onError: (error) =>
        setErro(error instanceof ApiError ? error.message : 'Não foi possível enviar o arquivo.'),
    });
  }

  return (
    <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
      {canManage && nota.situation !== 'CANCELADA' && (
        <FileDropzone
          onFiles={(files) => enviar(files[0])}
          disabled={upload.isPending}
          className="rounded-md border border-dashed border-border p-4"
        >
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            aria-label="Enviar arquivo"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              enviar(file);
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

      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {isLoading && <p className="text-sm text-muted-foreground">Carregando arquivos...</p>}
      {arquivos && arquivos.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum arquivo ainda. Anexe a nota.</p>
      )}

      {arquivos && arquivos.length > 0 && (
        <ul className="flex flex-col gap-2">
          {arquivos.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                onClick={() => openFileInNewTab(a.fileUrl)}
                className="flex w-full items-center gap-3 rounded-md border border-border px-3 py-2 text-left hover:bg-accent"
              >
                <FileText className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.75} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate text-sm font-medium text-foreground">{a.fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.uploadedBy?.name ?? 'Sistema'} · {formatDateTime(a.createdAt)}
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
