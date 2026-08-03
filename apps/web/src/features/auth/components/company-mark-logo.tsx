import { useEffect, useState } from 'react';
import { Building2 } from 'lucide-react';

import { apiClient } from '@/lib/api-client';

import { useBrand } from '../use-brand';

/// O logo enviado em Configurações exige o header Authorization (não é servido
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
        //
        // Sem `setObjectUrl(null)` aqui de propósito: o estado já nasce nulo e
        // a troca de `path` remonta via `key`, então não há valor velho a limpar.
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

/// Marca da construtora no rodapé da barra lateral. Prefere o arquivo que a
/// EDS subiu em Configurações → Empresa; sem nada gravado, cai no ícone
/// genérico em vez de repetir a assinatura já exibida no topo.
export function CompanyMarkLogo({ className }: { className?: string }) {
  const { companyName } = useBrand();
  const { logoUrl } = useUploadedLogoPath();

  if (!logoUrl) {
    return <Building2 className={className} strokeWidth={1.5} />;
  }

  return <RemoteLogo key={logoUrl} path={logoUrl} alt={companyName} className={className} />;
}

function useUploadedLogoPath() {
  const { logo } = useBrand();
  // O logo institucional é arquivo estático em /public e não passa pelo fetch
  // autenticado; só o que foi enviado em Configurações, que vem do storage da
  // API e exige o header Authorization.
  return { logoUrl: logo.startsWith('/') ? null : logo };
}
