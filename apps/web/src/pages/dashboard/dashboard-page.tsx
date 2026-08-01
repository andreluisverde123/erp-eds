import { QuickActions } from '@/components/dashboard/quick-actions';
import { StatsCards } from '@/components/dashboard/stats-cards';
import { ComprasStatusSection } from '@/components/dashboard/compras-status-section';
import { ObrasHomeSection } from '@/components/dashboard/obras-home-section';
import { ContractExpiryAlertCard } from '@/features/terceiros/components/contract-expiry-alert-card';
import { useAuth } from '@/features/auth/context';

/// A Home é a mesma tela para todo mundo, mas cada bloco só aparece para quem
/// tem a permissão do módulo correspondente — o perfil monta o próprio painel.
/// Antes ela era fixa e mostrava, por exemplo, "Contas a Pagar" para a
/// Engenharia, que não trabalha com isso e nem abre a tela do Financeiro.
export function DashboardPage() {
  const { user } = useAuth();
  const can = (permission: string) => user?.permissions.includes(permission) ?? false;

  return (
    <div className="flex flex-col gap-6">
      <ContractExpiryAlertCard />

      <QuickActions />

      <StatsCards />

      {can('compras.view') && <ComprasStatusSection />}

      {can('engenharia.view') && <ObrasHomeSection />}
    </div>
  );
}
