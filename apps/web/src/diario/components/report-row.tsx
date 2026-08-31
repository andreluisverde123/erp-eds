import { ChevronRight, FileText } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@repo/ui';

import type { DiarioReport } from '../types';
import { REPORT_STATUS_CLASS, REPORT_STATUS_LABEL, formatReportDate } from './report-status';

/// Linha de relatório. A linha inteira abre o RDO — quem está de rascunho
/// aberto quer continuar de onde parou, e caçar um botão "Continuar" de 12px
/// com a mão suja é o oposto disso.
export function ReportRow({
  report,
  showSite = true,
}: {
  report: DiarioReport;
  showSite?: boolean;
}) {
  const rascunho = report.status === 'DRAFT';

  return (
    <li>
      <Link
        to={`/relatorios/${report.id}`}
        className={cn(
          'flex items-center gap-3 rounded-xl border border-border bg-background p-3.5',
          'transition-colors active:bg-accent',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <FileText className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {/* Tabular para os números alinharem entre linhas — RDO 9 e RDO 24
                um embaixo do outro sem dançar. */}
            <p className="text-sm font-semibold tabular-nums text-foreground">
              RDO #{report.number}
            </p>
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                REPORT_STATUS_CLASS[report.status],
              )}
            >
              {REPORT_STATUS_LABEL[report.status]}
            </span>
          </div>

          {showSite && (
            <p className="truncate text-xs text-muted-foreground">{report.constructionSite.name}</p>
          )}
          <p className="truncate text-xs text-muted-foreground">
            {formatReportDate(report.reportDate)} · {report.createdBy.name}
          </p>
        </div>

        {rascunho ? (
          <span className="shrink-0 text-xs font-medium text-primary">Continuar</span>
        ) : (
          <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
        )}
      </Link>
    </li>
  );
}
