import type { ContractStatus } from '../../../generated/prisma/client';
import { addDays, startOfDay } from '../../common/utils/date.util';

export type ContractBadge = 'ACTIVE' | 'EXPIRING' | 'EXPIRED' | 'CANCELLED';

export const EXPIRING_WINDOW_DAYS = 30;

/// Badge exibido na tela (Vigente/Vencendo/Vencido/Encerrado) — nunca
/// armazenado, sempre derivado de `status` (encerramento manual) + `endDate`.
export function computeContractBadge(
  status: ContractStatus,
  endDate: Date,
  today: Date = new Date(),
): ContractBadge {
  if (status === 'CANCELLED') return 'CANCELLED';

  const todayStart = startOfDay(today);
  const end = startOfDay(endDate);

  if (end < todayStart) return 'EXPIRED';
  if (end <= addDays(todayStart, EXPIRING_WINDOW_DAYS)) return 'EXPIRING';
  return 'ACTIVE';
}

export function computeDaysRemaining(endDate: Date, today: Date = new Date()): number {
  const todayStart = startOfDay(today);
  const end = startOfDay(endDate);
  return Math.round((end.getTime() - todayStart.getTime()) / (1000 * 60 * 60 * 24));
}
