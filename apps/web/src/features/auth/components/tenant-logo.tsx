import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';

import { apiClient } from '@/lib/api-client';

import { useBrand } from '../use-brand';

/// O logo do inquilino exige o header Authorization (não é servido
/// publicamente), então um `<img src>` direto não funciona: busca como blob e
/// usa um object URL local. Mesmo mecanismo do uploader em Configurações.
function RemoteLogo({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let currentUrl: string | null = null;

    apiClient
      .getBlob(path)
      .then((blob) => {
        if (cancelled) return;
        currentUrl = URL.createObjectURL(blob);
        setObjectUrl(currentUrl);
      })
      .catch(() => {
        // Logo removido do storage ou sem permissão: cai no ícone genérico em
        // vez de deixar um quadrado quebrado na barra lateral.
      });

    return () => {
      cancelled = true;
      if (currentUrl) URL.revokeObjectURL(currentUrl);
    };
  }, [path]);

  if (!objectUrl) {
    return <Building2 className={className} strokeWidth={1.5} />;
  }
  return <img src={objectUrl} alt={alt} className={className} />;
}

/// Logo da construtora logada. Sem logo cadastrado, mostra um ícone genérico —
/// nunca o logo de outro cliente nem uma marca fixa no código.
export function TenantLogo({ className }: { className?: string }) {
  const { tenantName } = useBrand();
  const { logoUrl } = useTenantLogoPath();

  if (!logoUrl) {
    return <Building2 className={className} strokeWidth={1.5} />;
  }

  return (
    <RemoteLogo key={logoUrl} path={logoUrl} alt={tenantName ?? 'Logo'} className={className} />
  );
}

function useTenantLogoPath() {
  const { logo } = useBrand();
  // Caminho do produto (arquivo estático em /public) não passa pelo fetch
  // autenticado; só o do inquilino, que vem do storage da API.
  return { logoUrl: logo.startsWith('/') ? null : logo };
}
