import { Link } from 'react-router';

import { useAuth } from '@/features/auth/context';

import {
  IconeNovaObra,
  IconeNovaSolicitacao,
  IconeNovoFuncionario,
  IconeNovoTerceirizado,
} from './quick-action-icons';

/// Cada atalho declara a permissão que o habilita — sem isso a Home oferecia a
/// Engenharia atalhos de módulos que ela não abre, e o clique terminava numa
/// tela sem acesso.
const actions = [
  {
    label: 'Nova Solicitação',
    Icone: IconeNovaSolicitacao,
    to: '/engenharia/solicitacoes/nova',
    permission: 'compras.request',
  },
  {
    label: 'Nova Obra',
    Icone: IconeNovaObra,
    to: '/engenharia/obras',
    permission: 'engenharia.manage',
  },
  {
    label: 'Novo Funcionário',
    Icone: IconeNovoFuncionario,
    to: '/rh/funcionarios',
    permission: 'rh.manage',
  },
  {
    label: 'Novo Terceirizado',
    Icone: IconeNovoTerceirizado,
    to: '/engenharia/terceirizados',
    permission: 'terceiros.manage',
  },
];

export function QuickActions() {
  const { user } = useAuth();
  const visibleActions = actions.filter((action) => user?.permissions.includes(action.permission));

  if (visibleActions.length === 0) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-foreground/80">Ações rápidas</h2>
        <p className="text-sm text-foreground/60">
          Atalhos para as tarefas mais comuns do dia a dia.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {visibleActions.map(({ label, Icone, to }) => (
          <Link
            key={label}
            to={to}
            className="flex flex-col items-start justify-between gap-8 rounded-md bg-muted p-4 text-left transition-colors hover:bg-accent"
          >
            {/* `text-primary` é o que dá cor ao `currentColor` de dentro do
                ícone. É também o que faz estes atalhos acompanharem a marca
                de demonstração sem nenhum código a mais. */}
            <Icone className="size-[18px] text-primary" />
            <span className="text-sm font-medium text-foreground">{label}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
