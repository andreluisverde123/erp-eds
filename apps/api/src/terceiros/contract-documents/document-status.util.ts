import { addDays, startOfDay } from '../../common/utils/date.util';

export type DocumentBadge = 'VALID' | 'EXPIRING' | 'EXPIRED';

export const DOCUMENT_EXPIRING_WINDOW_DAYS = 30;

export function computeDocumentBadge(expiresAt: Date, today: Date = new Date()): DocumentBadge {
  const todayStart = startOfDay(today);
  const end = startOfDay(expiresAt);

  if (end < todayStart) return 'EXPIRED';
  if (end <= addDays(todayStart, DOCUMENT_EXPIRING_WINDOW_DAYS)) return 'EXPIRING';
  return 'VALID';
}
