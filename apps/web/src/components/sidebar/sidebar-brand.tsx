import { cn } from '@repo/ui';

import { CompanyLogo } from '@/components/company-logo';

/// Recolhida, a barra corta o logo num quadrado de 20px — funciona porque a
/// assinatura da EDS tem a marca à esquerda do desenho. Expandida, o logo
/// ocupa a largura que a própria proporção pedir, em vez de uma largura fixa
/// que o esticava.
export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex h-16 shrink-0 items-center px-[22px]">
      <div className={cn('shrink-0 overflow-hidden', collapsed ? 'size-5' : 'h-5 max-w-[130px]')}>
        <CompanyLogo />
      </div>
    </div>
  );
}
