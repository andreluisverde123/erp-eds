import { type ReactNode } from 'react';
import { Building2, ClipboardList, ShoppingCart, Wallet } from 'lucide-react';

import { useAuth } from '@/features/auth/context';
import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { usePurchaseRequests } from '@/features/compras/hooks/use-purchase-requests';
import { usePurchaseOrders } from '@/features/compras/hooks/use-purchase-orders';
import { useAccountPayableSummary } from '@/features/financeiro/hooks/use-account-payable-summary';

import { StatCard } from './stat-card';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/// Cada indicador busca o próprio dado e só é montado quando o usuário tem a
/// permissão do módulo — é o gate que impede a Home de disparar chamadas que
/// voltariam 403 e, principalmente, de mostrar número de um módulo que não é
/// daquele perfil (Engenharia via "Contas a Pagar" na Home mesmo sem acesso
/// ao Financeiro).
function ObrasAtivasCard() {
  const { data } = useConstructionSites({ status: 'IN_PROGRESS', limit: 1 });

  return (
    <StatCard
      title="Obras Ativas"
      value={data ? String(data.meta.total) : undefined}
      icon={Building2}
      hint="Ver obras"
      to="/engenharia/obras"
    />
  );
}

function SolicitacoesPendentesCard() {
  const { data } = usePurchaseRequests({ status: 'PENDING', limit: 1 });

  return (
    <StatCard
      title="Solicitações Pendentes"
      value={data ? String(data.meta.total) : undefined}
      icon={ClipboardList}
      hint="Ver solicitações"
      to="/compras/pendentes"
    />
  );
}

function OrdensDeCompraCard() {
  const { data } = usePurchaseOrders({ status: 'OPEN', limit: 1 });

  return (
    <StatCard
      title="Ordens de Compra Abertas"
      value={data ? String(data.meta.total) : undefined}
      icon={ShoppingCart}
      hint="Ver ordens de compra"
      to="/compras/ordens-de-compra"
    />
  );
}

function ContasAPagarCard() {
  const { data } = useAccountPayableSummary();

  return (
    <StatCard
      title="Contas a Pagar"
      value={data ? formatCurrency(data.totalOpen) : undefined}
      icon={Wallet}
      hint="Ver contas a pagar"
      to="/financeiro/contas-a-pagar"
      sensitive
    />
  );
}

export function StatsCards() {
  const { user } = useAuth();
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;

  const cards: ReactNode[] = [];
  if (can('engenharia.view')) cards.push(<ObrasAtivasCard key="obras" />);
  if (can('compras.view')) {
    cards.push(<SolicitacoesPendentesCard key="solicitacoes" />);
    cards.push(<OrdensDeCompraCard key="ordens" />);
  }
  if (can('financeiro.view')) cards.push(<ContasAPagarCard key="contas" />);

  if (cards.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-foreground/80">Seus números</h2>
        <p className="text-sm text-foreground/60">
          Visão geral rápida do momento atual da operação.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">{cards}</div>
    </div>
  );
}
