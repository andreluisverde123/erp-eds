import { useState } from 'react';
import { Eye, EyeOff, type LucideIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Card } from '@repo/ui';

const MASKED_VALUE = 'R$ ••••••';

export interface StatCardProps {
  title: string;
  /// `undefined` enquanto a consulta não voltou — vira "—" em vez de piscar
  /// um zero que o usuário leria como informação.
  value: string | undefined;
  icon: LucideIcon;
  hint: string;
  to: string;
  /// Valores em dinheiro nascem visíveis mas podem ser escondidos com um
  /// clique — a Home costuma ficar aberta na frente de terceiros.
  sensitive?: boolean;
}

/// Cartão de indicador da Home. Fica num arquivo próprio porque é o visual
/// compartilhado de TODOS os blocos de números do dashboard ("Seus números" e
/// "Status das compras") — enquanto cada bloco tinha o seu, as duas grades
/// ficavam com peso e altura diferentes lado a lado.
export function StatCard({ title, value, icon: Icon, hint, to, sensitive }: StatCardProps) {
  const [hidden, setHidden] = useState(false);

  return (
    <Card className="gap-4 px-[18px] py-5 transition-colors hover:bg-accent/40">
      <div className="flex items-center justify-between">
        <Icon className="size-[18px] text-muted-foreground" strokeWidth={1.75} />
        {sensitive && (
          <button
            type="button"
            onClick={() => setHidden((prev) => !prev)}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {hidden ? (
              <EyeOff className="size-[18px]" strokeWidth={1.75} />
            ) : (
              <Eye className="size-[18px]" strokeWidth={1.75} />
            )}
            <span className="sr-only">{hidden ? 'Mostrar valor' : 'Ocultar valor'}</span>
          </button>
        )}
      </div>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium text-muted-foreground">{title}</span>
          <span className="text-sm font-semibold text-foreground">
            {value === undefined ? '—' : sensitive && hidden ? MASKED_VALUE : value}
          </span>
        </div>
        <Link
          to={to}
          className="text-xs text-muted-foreground hover:text-foreground hover:underline"
        >
          {hint}
        </Link>
      </div>
    </Card>
  );
}
