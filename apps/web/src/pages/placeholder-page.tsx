import type { LucideIcon } from 'lucide-react';
import { Construction } from 'lucide-react';

interface PlaceholderPageProps {
  title: string;
  icon?: LucideIcon;
}

export function PlaceholderPage({ title, icon: Icon = Construction }: PlaceholderPageProps) {
  return (
    <div className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground">{title}</h1>
      <p className="text-sm text-muted-foreground">
        Módulo de {title.toLowerCase()} — estrutura visual pronta, aguardando implementação.
      </p>

      <div className="mt-6 flex min-h-[60vh] flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-card/50 text-center">
        <Icon className="size-9 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Conteúdo de {title} será implementado aqui.</p>
      </div>
    </div>
  );
}
