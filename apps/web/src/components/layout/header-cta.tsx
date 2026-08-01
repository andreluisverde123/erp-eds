import { Link } from 'react-router';
import { Button } from '@repo/ui';

import { useAuth } from '@/features/auth/context';

/// Botão de ação primária do header — contextual ao perfil do usuário (ver
/// pedido do módulo de padronização visual). Só um item aparece por vez,
/// escolhido pela primeira permissão de módulo que o usuário possuir.
const CONTEXTUAL_CTAS = [
  // Agora casa com a API: abrir solicitação passou a ser `compras.request` (a
  // Engenharia tem), e o botão leva direto ao formulário. Antes ele aparecia
  // por `engenharia.manage` e o envio batia em 403, porque criar exigia
  // `compras.manage`.
  {
    permission: 'compras.request',
    label: 'Nova Solicitação',
    path: '/engenharia/solicitacoes/nova',
  },
  {
    permission: 'compras.manage',
    label: 'Nova Ordem de Compra',
    path: '/compras/ordens-de-compra',
  },
  {
    permission: 'financeiro.manage',
    label: 'Nova Conta a Pagar',
    path: '/financeiro/contas-a-pagar',
  },
  { permission: 'rh.manage', label: 'Novo Funcionário', path: '/rh/funcionarios' },
  { permission: 'admin.manage_users', label: 'Novo Usuário', path: '/configuracoes?tab=usuarios' },
];

export function HeaderCta() {
  const { user } = useAuth();

  const cta = CONTEXTUAL_CTAS.find((entry) => user?.permissions.includes(entry.permission));

  if (!cta) return null;

  return (
    <Button asChild size="sm" className="h-[38px] shrink-0 rounded-md px-4 text-xs font-semibold">
      <Link to={cta.path}>{cta.label}</Link>
    </Button>
  );
}
