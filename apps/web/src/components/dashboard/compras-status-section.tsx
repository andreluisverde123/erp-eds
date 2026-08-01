import { CheckCircle2, FileEdit, Hourglass, Search, type LucideIcon } from 'lucide-react';

import { usePurchaseRequests } from '@/features/compras/hooks/use-purchase-requests';
import { getRequestStatusLabel } from '@/features/compras/purchase-request-status';
import type { PurchaseRequestStatus } from '@/features/compras/types';

import { StatCard } from './stat-card';

interface TrackedStatus {
  status: PurchaseRequestStatus;
  icon: LucideIcon;
  hint: string;
  /// A listagem filtra por status pelo próprio seletor, não pela URL — só
  /// "Pendente" tem rota própria (/compras/pendentes). Os demais caem na
  /// listagem completa em vez de num filtro que a tela ignoraria.
  to: string;
}

/// Etapas que valem acompanhamento no dia a dia. Canceladas ficam de fora: são
/// histórico, não trabalho em andamento.
const TRACKED_STATUSES: TrackedStatus[] = [
  {
    status: 'DRAFT',
    icon: FileEdit,
    hint: 'Ainda não enviadas',
    to: '/engenharia/solicitacoes',
  },
  {
    status: 'PENDING',
    icon: Hourglass,
    hint: 'Aguardando o setor de Compras',
    to: '/compras/pendentes',
  },
  {
    status: 'QUOTING',
    icon: Search,
    hint: 'Em cotação com fornecedores',
    to: '/engenharia/solicitacoes',
  },
  {
    status: 'APPROVED',
    icon: CheckCircle2,
    hint: 'Liberadas para ordem de compra',
    to: '/engenharia/solicitacoes',
  },
];

function StatusCard({ status, icon, hint, to }: TrackedStatus) {
  // Uma consulta por etapa, só pelo total da paginação (limit: 1) — o contador
  // sai da meta, sem trazer as linhas.
  const { data } = usePurchaseRequests({ status, limit: 1 });

  return (
    <StatCard
      title={getRequestStatusLabel(status)}
      value={data ? String(data.meta.total) : undefined}
      icon={icon}
      hint={hint}
      to={to}
    />
  );
}

/// "Status das compras" pedido pela Engenharia: em que etapa estão as
/// solicitações que a obra originou, sem passar por relatório. Usa o MESMO
/// cartão de "Seus números" (ver `StatCard`) para as duas grades lerem como um
/// bloco só.
export function ComprasStatusSection() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-foreground/80">Status das compras</h2>
        <p className="text-sm text-foreground/60">
          Em que etapa estão as solicitações abertas pela sua equipe.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {TRACKED_STATUSES.map((tracked) => (
          <StatusCard key={tracked.status} {...tracked} />
        ))}
      </div>
    </div>
  );
}
