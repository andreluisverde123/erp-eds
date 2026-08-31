import { Link } from 'react-router';
import { Clock } from 'lucide-react';
import { Badge } from '@repo/ui';

/// Uma pendência: algo parado esperando alguém agir.
export interface PendingAlert {
  /// Estável e único — o React usa como chave, e o card não reordena.
  key: string;
  /// O que está parado, já no plural certo. Ex.: "3 solicitações aguardando
  /// aprovação".
  title: string;
  /// A parte em negrito da segunda linha — normalmente o PRAZO ou o dono da
  /// vez, que é o que faz a pessoa decidir se age agora.
  emphasis: string;
  /// O resto da segunda linha.
  detail: string;
  /// Para onde o clique leva. Sempre a lista já filtrada pelo que o alerta
  /// conta: um alerta que joga a pessoa numa lista de tudo a obriga a
  /// procurar o que ele acabou de dizer que existe.
  to: string;
}

/// O bloco de PENDÊNCIAS da Home.
///
/// **Um bloco, várias origens.** Antes existia um card só para contratos
/// vencendo, e cada nova pendência viraria outro card idêntico ao lado — a
/// Home encheria de caixas com o mesmo rodapé repetido. Aqui as origens
/// entregam linhas e o bloco some inteiro quando não há nada.
///
/// Cada origem decide se PODE ser vista (permissão) antes de virar linha: o
/// bloco não conhece regra de acesso nenhuma, só recebe o que já passou.
export function PendingAlertsCard({ alerts }: { alerts: PendingAlert[] }) {
  if (alerts.length === 0) return null;

  const total = alerts.length;

  return (
    <div className="flex flex-col gap-3 rounded-md bg-muted p-2">
      <div className="flex items-center gap-2 px-2">
        <span className="relative flex size-[11px] shrink-0">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-75 [animation-duration:2.8s] [animation-timing-function:cubic-bezier(0.4,0,0.6,1)]" />
          <img src="/dot-pedidos.svg" alt="" className="relative size-[11px]" />
        </span>
        <span className="text-sm font-semibold text-foreground/85">Pendências</span>
        <Badge variant="pending">{total}</Badge>
      </div>

      {alerts.map((alerta) => (
        <Link
          key={alerta.key}
          to={alerta.to}
          className="flex items-center gap-3 rounded-md border border-border bg-card px-[18px] py-5"
        >
          <div className="flex shrink-0 items-center justify-center rounded-full bg-[#f5f5f2] p-2.5">
            <img src="/doc-pedidos.svg" alt="" className="size-3" />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <p className="text-sm font-semibold text-foreground/85">{alerta.title}</p>
            <p className="text-[13px] text-muted-foreground">
              <span className="font-bold text-foreground/70">{alerta.emphasis}</span>{' '}
              {alerta.detail}
            </p>
          </div>
        </Link>
      ))}

      <div className="flex items-center gap-1 px-2">
        <Clock className="size-3.5 text-muted-foreground" strokeWidth={1.75} />
        <span className="text-xs text-muted-foreground">Atualizado agora mesmo</span>
      </div>
    </div>
  );
}
