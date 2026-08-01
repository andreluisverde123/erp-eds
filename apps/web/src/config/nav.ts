import {
  BarChart3,
  Building2,
  ClipboardList,
  Clock,
  CreditCard,
  Factory,
  Fingerprint,
  FileSpreadsheet,
  FileText,
  LayoutDashboard,
  Settings,
  ShoppingCart,
  Truck,
  UserRound,
  Users,
  Wallet,
  Workflow,
  type LucideIcon,
} from 'lucide-react';

export interface NavLink {
  title: string;
  path: string;
  icon: LucideIcon;
  /// Se definido, o item só aparece na sidebar para usuários com esta
  /// permissão (ver SidebarNav) — o backend já exige o mesmo código em
  /// cada endpoint do módulo, isto é só para não anunciar na UI uma tela
  /// que o usuário não pode abrir.
  permission?: string;
}

export interface NavGroup {
  label: string;
  items: NavLink[];
}

export type NavEntry = ({ type: 'link' } & NavLink) | ({ type: 'group' } & NavGroup);

export const navEntries: NavEntry[] = [
  {
    type: 'link',
    title: 'Dashboard',
    path: '/dashboard',
    icon: LayoutDashboard,
    permission: 'dashboard.view',
  },
  {
    type: 'group',
    label: 'Engenharia',
    items: [
      { title: 'Obras', path: '/engenharia/obras', icon: Building2, permission: 'engenharia.view' },
      {
        title: 'Solicitações',
        path: '/engenharia/solicitacoes',
        icon: ClipboardList,
        permission: 'compras.view',
      },
      // O código da permissão continua `terceiros.*` (é chave, não rótulo) —
      // só a nomenclatura que o usuário lê virou "Terceirizados".
      {
        title: 'Terceirizados',
        path: '/engenharia/terceirizados',
        icon: Users,
        permission: 'terceiros.view',
      },
    ],
  },
  {
    type: 'group',
    label: 'Compras',
    items: [
      { title: 'Pendentes', path: '/compras/pendentes', icon: Clock, permission: 'compras.view' },
      {
        title: 'Ordens de Compra',
        path: '/compras/ordens-de-compra',
        icon: ShoppingCart,
        permission: 'compras.view',
      },
      {
        title: 'Fornecedores',
        path: '/compras/fornecedores',
        icon: Truck,
        permission: 'compras.view',
      },
    ],
  },
  {
    type: 'group',
    label: 'Financeiro',
    items: [
      {
        title: 'Contas a Pagar',
        path: '/financeiro/contas-a-pagar',
        icon: Wallet,
        permission: 'financeiro.view',
      },
      {
        title: 'Notas Fiscais',
        path: '/financeiro/notas-fiscais',
        icon: FileText,
        permission: 'financeiro.view',
      },
      {
        title: 'Pagamentos',
        path: '/financeiro/pagamentos',
        icon: CreditCard,
        permission: 'financeiro.view',
      },
    ],
  },
  {
    type: 'group',
    label: 'RH',
    items: [
      { title: 'Funcionários', path: '/rh/funcionarios', icon: UserRound, permission: 'rh.view' },
      { title: 'Ponto', path: '/rh/ponto', icon: Fingerprint, permission: 'rh.view' },
      { title: 'Produção', path: '/rh/producao', icon: Factory, permission: 'rh.view' },
      { title: 'Holerites', path: '/rh/holerites', icon: FileSpreadsheet, permission: 'rh.view' },
    ],
  },
  {
    type: 'link',
    title: 'Relatórios',
    path: '/relatorios',
    icon: BarChart3,
    permission: 'relatorios.view',
  },
  {
    type: 'link',
    title: 'Processos',
    path: '/workflow',
    icon: Workflow,
    permission: 'dashboard.view',
  },
  {
    type: 'link',
    title: 'Configurações',
    path: '/configuracoes',
    icon: Settings,
    permission: 'admin.manage_users',
  },
];

export const navLinks: NavLink[] = navEntries.flatMap((entry) =>
  entry.type === 'link' ? [entry] : entry.items,
);

export interface BreadcrumbCrumb {
  title: string;
  path?: string;
}

export function getBreadcrumbTrail(pathname: string): BreadcrumbCrumb[] {
  for (const entry of navEntries) {
    if (entry.type === 'link' && entry.path === pathname) {
      return [{ title: entry.title }];
    }

    if (entry.type === 'group') {
      const item = entry.items.find((link) => link.path === pathname);
      if (item) {
        return [{ title: entry.label }, { title: item.title }];
      }
    }
  }

  // Rotas aninhadas (ex.: detalhe de obra em /engenharia/obras/:id) não têm
  // match exato — usa o link "pai" mais específico cujo path é prefixo da
  // rota atual, mantendo o breadcrumb coerente em vez de cair pro fallback.
  const parentLink = navLinks
    .filter((link) => pathname.startsWith(`${link.path}/`))
    .sort((a, b) => b.path.length - a.path.length)[0];

  if (parentLink) {
    const group = navEntries.find(
      (entry) =>
        entry.type === 'group' && entry.items.some((item) => item.path === parentLink.path),
    );
    const trail: BreadcrumbCrumb[] = [];
    if (group?.type === 'group') trail.push({ title: group.label });
    trail.push({ title: parentLink.title, path: parentLink.path });
    return trail;
  }

  return [{ title: 'Dashboard' }];
}
