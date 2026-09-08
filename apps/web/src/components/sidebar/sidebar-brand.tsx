import { cn } from '@repo/ui';

import { CompanyLogo } from '@/components/company-logo';

/// Recolhida, a barra corta o logo num quadrado de 20px — funciona porque a
/// assinatura da EDS tem a marca à esquerda do desenho. Expandida, o logo
/// ocupa a largura que a própria proporção pedir, em vez de uma largura fixa
/// que o esticava.
///
/// As duas medidas saem de variáveis CSS cujo PADRÃO é o valor de sempre. Elas
/// existem porque 20px por 130px é medida da arte da EDS: numa demonstração
/// com o logo de outra empresa, quase sempre empilhado, essa caixa recorta o
/// nome. Só a marca de demonstração define as variáveis, e ela não existe fora
/// de desenvolvimento — aqui o comportamento é idêntico ao anterior.
export function SidebarBrand({ collapsed = false }: { collapsed?: boolean }) {
  return (
    <div className="flex h-16 shrink-0 items-center px-[22px]">
      <div
        className={cn(
          'shrink-0 overflow-hidden',
          collapsed ? 'size-5' : 'h-[var(--marca-altura,1.25rem)] max-w-[var(--marca-largura,130px)]',
        )}
      >
        <CompanyLogo />
      </div>
    </div>
  );
}
