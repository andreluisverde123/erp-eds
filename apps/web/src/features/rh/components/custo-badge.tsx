import { Badge } from '@repo/ui';

import { formatAmount } from '@/features/conciliacao/format';
import type { Custo } from '../types';

/// Como um custo se apresenta na tela.
///
/// A regra que este componente existe para cumprir: **custo desconhecido nunca
/// aparece como R$ 0,00**. Zero é um valor — significa "não custou nada" — e
/// ninguém questiona um zero num relatório. "Custo desconhecido" obriga a
/// olhar.
export function CustoValor({ custo }: { custo: Custo }) {
  if (custo.estado === 'DESCONHECIDO' || custo.valor === null) {
    return <span className="text-sm text-muted-foreground italic">Custo desconhecido</span>;
  }

  return (
    <span className="text-sm font-medium tabular-nums text-foreground">
      {formatAmount(custo.valor)}
    </span>
  );
}

/// O selo de completude, e o que falta quando não está completo.
export function CustoEstado({ custo }: { custo: Custo }) {
  if (custo.estado === 'CONHECIDO') return null;

  return (
    <div className="flex flex-col items-end gap-0.5">
      <Badge variant={custo.estado === 'DESCONHECIDO' ? 'destructive' : 'warning'}>
        {custo.estado === 'DESCONHECIDO' ? 'Sem base' : 'Custo parcial'}
      </Badge>
      {/* Nomear o que falta é o que transforma o aviso em ação. "Custo
          parcial" sozinho não diz a ninguém o que fazer. */}
      {custo.faltando.length > 0 && (
        <span className="text-right text-[11px] leading-tight text-muted-foreground">
          Falta: {custo.faltando.join(' · ')}
        </span>
      )}
    </div>
  );
}
