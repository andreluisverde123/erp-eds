export interface TimelineAuditRow {
  id: string;
  entityType: string;
  action: string;
  changes: unknown;
  createdAt: Date;
  user: { id: string; name: string } | null;
}

export interface TimelineEntry {
  id: string;
  entityType: string;
  action: string;
  changes: unknown;
  createdAt: Date;
  actor: { id: string; name: string } | null;
  synthetic: boolean;
}

/// Junta eventos reais (de AuditLog, já ordenados por createdAt asc) com um
/// evento sintético de fallback quando não há nenhum evento real ainda —
/// isso acontece pra toda entidade que não seja PurchaseRequest, já que
/// PurchaseOrder/Invoice/AccountPayable/Employee só expõem status atual +
/// updatedAt, sem histórico gravado antes desta feature existir.
export function buildTimeline(
  realEvents: TimelineAuditRow[],
  currentStageLabel: string,
  fallbackSinceDate: Date,
): TimelineEntry[] {
  const entries: TimelineEntry[] = realEvents.map((row) => ({
    id: row.id,
    entityType: row.entityType,
    action: row.action,
    changes: row.changes,
    createdAt: row.createdAt,
    actor: row.user,
    synthetic: false,
  }));

  if (entries.length === 0) {
    entries.push({
      id: 'synthetic-current',
      entityType: '',
      action: 'CURRENT_STAGE',
      changes: { stage: currentStageLabel },
      createdAt: fallbackSinceDate,
      actor: null,
      synthetic: true,
    });
  }

  return entries;
}
