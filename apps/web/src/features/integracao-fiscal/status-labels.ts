import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { ConnectionStatus, SyncStatus, SyncTrigger } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

const CONNECTION_LABEL: Record<ConnectionStatus, string> = {
  OK: 'Conectado',
  SEM_CERTIFICADO: 'Sem certificado',
  CERTIFICADO_EXPIRADO: 'Certificado expirado',
  BLOQUEADO: 'Bloqueado pela SEFAZ',
  ERRO: 'Com erro',
};

/// Só variantes que já existem no Design System. `warning` é âmbar (âmbar cru,
/// o sistema não tem token `--warning`), usado para o que depende de uma ação.
const CONNECTION_VARIANT: Record<ConnectionStatus, BadgeVariant> = {
  OK: 'success',
  SEM_CERTIFICADO: 'secondary',
  CERTIFICADO_EXPIRADO: 'destructive',
  BLOQUEADO: 'warning',
  ERRO: 'destructive',
};

const SYNC_LABEL: Record<SyncStatus, string> = {
  SUCCESS: 'Concluída',
  PARTIAL: 'Parcial',
  EMPTY: 'Sem novidades',
  SKIPPED: 'Ignorada',
  ERROR: 'Erro',
};

/// `EMPTY` é `secondary` e não `destructive` de propósito: "nenhum documento
/// novo" é o resultado NORMAL da maioria das execuções horárias, e pintá-lo de
/// vermelho treinaria o usuário a ignorar o painel.
const SYNC_VARIANT: Record<SyncStatus, BadgeVariant> = {
  SUCCESS: 'success',
  PARTIAL: 'info',
  EMPTY: 'secondary',
  SKIPPED: 'secondary',
  ERROR: 'destructive',
};

const TRIGGER_LABEL: Record<SyncTrigger, string> = {
  SCHEDULED: 'Automática',
  MANUAL: 'Manual',
};

export const getConnectionLabel = (s: ConnectionStatus) => CONNECTION_LABEL[s];
export const getConnectionVariant = (s: ConnectionStatus) => CONNECTION_VARIANT[s];
export const getSyncLabel = (s: SyncStatus) => SYNC_LABEL[s];
export const getSyncVariant = (s: SyncStatus) => SYNC_VARIANT[s];
export const getTriggerLabel = (t: SyncTrigger) => TRIGGER_LABEL[t];

export function formatDateTime(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString('pt-BR') : '—';
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`;
}

/// CNPJ vem só com dígitos do backend.
export function formatCnpj(digits: string): string {
  return digits.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}
