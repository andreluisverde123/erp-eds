import type { ConstructionStatus, SiteAssignmentRole } from '../types';

export const SITE_STATUS_LABEL: Record<ConstructionStatus, string> = {
  PLANNING: 'Planejamento',
  IN_PROGRESS: 'Em andamento',
  PAUSED: 'Parada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

/// Cores por situação. `IN_PROGRESS` é a única que ganha destaque: numa lista
/// lida em movimento, se tudo se destaca, nada se destaca.
export const SITE_STATUS_CLASS: Record<ConstructionStatus, string> = {
  PLANNING: 'bg-muted text-muted-foreground',
  IN_PROGRESS: 'bg-success/10 text-success',
  PAUSED: 'bg-pending text-pending-foreground',
  COMPLETED: 'bg-muted text-muted-foreground',
  CANCELLED: 'bg-muted text-muted-foreground',
};

export const ASSIGNMENT_ROLE_LABEL: Record<SiteAssignmentRole, string> = {
  ENGINEER: 'Engenharia',
  INSPECTOR: 'Fiscal',
};

/// Datas chegam da API como string ISO. `toLocaleDateString` com a string
/// crua interpretaria `2026-08-30` como UTC e mostraria o dia 29 em qualquer
/// fuso a oeste de Greenwich — inclusive o do Brasil inteiro.
export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  return new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(date);
}

export function formatShortAddress(site: {
  addressLine: string | null;
  city: string | null;
  state: string | null;
}): string | null {
  const place = [site.city, site.state].filter(Boolean).join('/');
  return [site.addressLine, place].filter(Boolean).join(' — ') || null;
}
