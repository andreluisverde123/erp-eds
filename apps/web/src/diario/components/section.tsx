import type { ReactNode } from 'react';

/// Cabeçalho de seção da Home. Rótulo pequeno em caixa alta e uma ação
/// opcional à direita — o padrão que se repete em "Minhas obras" e "RDOs
/// recentes" sem cada uma reinventar o próprio espaçamento.
export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="px-4 py-3">
      <div className="mb-2.5 flex items-baseline justify-between gap-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
