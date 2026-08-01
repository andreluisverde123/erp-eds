import { Link } from 'react-router';
import { Clock } from 'lucide-react';
import { Badge } from '@repo/ui';

import { useAuth } from '@/features/auth/context';

import { useContractsExpiringSummary } from '../hooks/use-contracts-expiring-summary';

const VISIBLE_TO_PERMISSIONS = ['terceiros.view'];

/// Card de alerta na Home — só visível a Engenharia/Administrativo (ver
/// pedido do módulo Terceiros) e só quando há contratos vencendo em 30 dias.
export function ContractExpiryAlertCard() {
  const { user } = useAuth();
  const canSeeAlert = VISIBLE_TO_PERMISSIONS.some((permission) =>
    user?.permissions.includes(permission),
  );

  const { data: summary } = useContractsExpiringSummary({ enabled: canSeeAlert });

  if (!canSeeAlert || !summary || summary.count === 0) {
    return null;
  }

  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted p-2">
      <div className="flex items-center gap-2 px-2">
        <span className="relative flex size-[11px] shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 [animation-duration:2.8s] [animation-timing-function:cubic-bezier(0.4,0,0.6,1)]" />
          <img src="/dot-pedidos.svg" alt="" className="relative size-[11px]" />
        </span>
        <span className="text-sm font-semibold text-foreground/85">
          Pendências de terceirizados
        </span>
        <Badge variant="pending">{summary.count}</Badge>
      </div>

      <Link
        to="/engenharia/terceirizados?tab=contratos"
        className="flex items-center gap-3 rounded-md border border-border bg-card px-[18px] py-5"
      >
        <div className="flex shrink-0 items-center justify-center rounded-full bg-[#f5f5f2] p-2.5">
          <img src="/doc-pedidos.svg" alt="" className="size-3" />
        </div>
        <div className="flex flex-1 flex-col gap-1">
          <p className="text-sm font-semibold text-foreground/85">
            {summary.count === 1
              ? 'Existe 1 contrato vencendo'
              : `Existem ${summary.count} contratos vencendo`}
          </p>
          <p className="text-[13px] text-muted-foreground">
            <span className="font-bold text-foreground/70">Vencem em até 30 dias</span> e precisam
            da sua atenção.
          </p>
        </div>
      </Link>

      <div className="flex items-center gap-1 px-2">
        <Clock className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-xs text-muted-foreground">Atualizado agora mesmo</span>
      </div>
    </div>
  );
}
