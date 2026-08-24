import { AlertTriangle, CheckCircle2, HelpCircle } from 'lucide-react';
import { cn } from '@repo/ui';

import type { CheckResult, CompatibilityCheck } from '../types';

const ICON: Record<CheckResult, typeof CheckCircle2> = {
  MATCH: CheckCircle2,
  DIVERGENT: AlertTriangle,
  UNKNOWN: HelpCircle,
};

const TONE: Record<CheckResult, string> = {
  MATCH: 'text-success',
  DIVERGENT: 'text-destructive',
  // Cinza, e não amarelo: não saber não é alerta.
  UNKNOWN: 'text-muted-foreground',
};

/// A conferência da nota contra a ordem, item por item de verificação.
///
/// Os três estados são distintos de propósito. `UNKNOWN` cobre o que o sistema
/// não tem como afirmar — a NF-e não carrega obra, a nota que só chegou como
/// resumo não tem itens, a ordem antiga não tem itens. Pintar isso de vermelho
/// faria o financeiro procurar um problema que não existe; de verde, faria ele
/// confiar numa conferência que não aconteceu.
export function CompatibilityChecks({ checks }: { checks: CompatibilityCheck[] }) {
  return (
    <ul className="flex flex-col gap-2">
      {checks.map((check) => {
        const Icon = ICON[check.result];
        return (
          <li key={check.key} className="flex items-start gap-2">
            <Icon className={cn('mt-0.5 size-4 shrink-0', TONE[check.result])} />
            <div className="flex flex-col gap-0.5">
              <span className="text-sm font-medium text-foreground">{check.label}</span>
              <span className="text-xs text-muted-foreground">{check.detail}</span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
