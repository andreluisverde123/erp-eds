import { useEffect, useRef, useState } from 'react';
import { Building2, Upload } from 'lucide-react';
import { Button, FileDropzone } from '@repo/ui';

import { ApiError, apiClient } from '@/lib/api-client';

import { useUploadCompanyLogo } from '../hooks/use-company-mutations';
import type { Company } from '../types';

const FALLBACK = <Building2 className="size-7 text-muted-foreground/60" strokeWidth={1.5} />;

/// O logo agora exige o header Authorization (não é mais servido
/// publicamente) — um `<img src>` direto não consegue mandar esse header,
/// então busca como blob e usa um object URL local como source. Remontado
/// via `key={logoUrl}` no lugar de resetar estado num efeito quando o logo
/// muda ou é removido.
function LogoImage({ logoUrl }: { logoUrl: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentUrl: string | null = null;

    apiClient.getBlob(logoUrl).then((blob) => {
      if (cancelled) return;
      currentUrl = URL.createObjectURL(blob);
      setObjectUrl(currentUrl);
    });

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [logoUrl]);

  if (!objectUrl) return FALLBACK;
  return <img src={objectUrl} alt="Logo da empresa" className="size-full object-contain" />;
}

export function CompanyLogoUploader({ company }: { company: Company }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const uploadMutation = useUploadCompanyLogo();

  function uploadFile(file: File) {
    uploadMutation.mutate(file, {
      onError: (error) => {
        window.alert(error instanceof ApiError ? error.message : 'Não foi possível enviar o logo.');
      },
    });
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    uploadFile(file);
  }

  return (
    <div className="flex items-center gap-4">
      <div className="flex size-16 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted">
        {company.logoUrl ? <LogoImage key={company.logoUrl} logoUrl={company.logoUrl} /> : FALLBACK}
      </div>

      <FileDropzone
        onFiles={(files) => files[0] && uploadFile(files[0])}
        disabled={uploadMutation.isPending}
        className="flex flex-col gap-1.5 rounded-md"
      >
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={handleFileChange}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={uploadMutation.isPending}
          onClick={() => inputRef.current?.click()}
        >
          <Upload />
          {uploadMutation.isPending ? 'Enviando...' : 'Alterar logo'}
        </Button>
        <p className="text-xs text-muted-foreground">
          PNG, JPEG ou WebP — clique ou arraste o arquivo aqui.
        </p>
      </FileDropzone>
    </div>
  );
}
