import { usePendingAlerts } from '../use-pending-alerts';
import { PendingAlertsCard } from './pending-alerts-card';

/// O bloco de pendências da Home.
///
/// Separa QUEM BUSCA de QUEM DESENHA: o hook consulta as origens e aplica as
/// permissões, o card só recebe linhas prontas. É o que permite testar as
/// regras de "quem vê o quê" sem montar a tela, e acrescentar uma origem nova
/// sem tocar no desenho.
export function PendingAlerts() {
  return <PendingAlertsCard alerts={usePendingAlerts()} />;
}
