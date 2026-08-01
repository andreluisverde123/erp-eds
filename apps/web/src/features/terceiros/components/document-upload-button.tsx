import { useRef } from 'react';
import { Upload } from 'lucide-react';
import { Button, FileDropzone } from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useUploadContractDocumentAttachment } from '../hooks/use-contract-document-mutations';

export function DocumentUploadButton({ documentId }: { documentId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadContractDocumentAttachment();

  function uploadFile(file: File) {
    uploadMutation.mutate(
      { id: documentId, file },
      {
        onError: (error) => {
          window.alert(
            error instanceof ApiError ? error.message : 'Não foi possível enviar o arquivo.',
          );
        },
      },
    );
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    uploadFile(file);
  }

  return (
    <FileDropzone
      onFiles={(files) => files[0] && uploadFile(files[0])}
      disabled={uploadMutation.isPending}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-8"
        disabled={uploadMutation.isPending}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="size-4" />
        <span className="sr-only">Upload do documento (clique ou arraste um arquivo)</span>
      </Button>
    </FileDropzone>
  );
}
