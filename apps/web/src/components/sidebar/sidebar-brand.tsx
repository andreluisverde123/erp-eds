import { cn } from '@repo/ui';

import { ProductLogo } from '@/components/product-logo';

/// Recolhida, a barra corta o logo num quadrado de 20px — funciona porque os
/// dois produtos têm a marca à esquerda do desenho. Expandida, o logo ocupa a
/// largura que a própria proporção pedir, em vez de uma largura fixa que
/// esticava o logo mais quadrado dos dois.
export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex h-16 shrink-0 items-center px-[22px]">
      <div className={cn('shrink-0 overflow-hidden', collapsed ? 'size-5' : 'h-5 max-w-[130px]')}>
        <ProductLogo />
      </div>
    </div>
  );
}
