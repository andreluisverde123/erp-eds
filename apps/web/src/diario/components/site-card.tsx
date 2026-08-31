import { Building2, CalendarClock, ChevronRight, MapPin } from 'lucide-react';
import { Link } from 'react-router';
import { cn } from '@repo/ui';

import type { DiarioSite } from '../types';
import {
  ASSIGNMENT_ROLE_LABEL,
  SITE_STATUS_CLASS,
  SITE_STATUS_LABEL,
  formatDate,
  formatShortAddress,
} from './site-status';

const CARD_CLASS = cn(
  'flex w-full items-center gap-3 rounded-xl border border-border bg-background p-4 text-left',
  'transition-colors active:bg-accent',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
);

/// Cartão de obra. O cartão INTEIRO é o alvo de toque — não há um "ver mais"
/// de 12px no canto, que é o padrão de desktop que mais falha em campo.
///
/// Dois usos, mesma aparência: navegar até a obra (padrão) e escolher a obra
/// dentro de um fluxo (`onSelect`). A escolha vira `<button>` em vez de link
/// porque selecionar não é navegar — e um leitor de tela precisa saber a
/// diferença.
export function SiteCard({ site, onSelect }: { site: DiarioSite; onSelect?: () => void }) {
  const conteudo = <SiteCardContent site={site} />;

  if (onSelect) {
    return (
      <button type="button" onClick={onSelect} className={CARD_CLASS}>
        {conteudo}
      </button>
    );
  }

  return (
    <Link to={`/obras/${site.id}`} className={CARD_CLASS}>
      {conteudo}
    </Link>
  );
}

function SiteCardContent({ site }: { site: DiarioSite }) {
  const address = formatShortAddress(site);

  return (
    <>
      <div className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Building2 className="size-5" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{site.name}</p>
          <span
            className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
              SITE_STATUS_CLASS[site.status],
            )}
          >
            {SITE_STATUS_LABEL[site.status]}
          </span>
        </div>

        {site.clientName && (
          <p className="truncate text-xs text-muted-foreground">{site.clientName}</p>
        )}

        {address && (
          <p className="mt-1 flex items-center gap-1 truncate text-xs text-muted-foreground">
            <MapPin className="size-3 shrink-0" />
            <span className="truncate">{address}</span>
          </p>
        )}

        <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarClock className="size-3 shrink-0" />
          {site.lastReportDate ? (
            <>Último RDO em {formatDate(site.lastReportDate)}</>
          ) : (
            <>Nenhum RDO ainda</>
          )}
          <span aria-hidden>·</span>
          <span>{ASSIGNMENT_ROLE_LABEL[site.assignmentRole]}</span>
        </p>
      </div>

      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
    </>
  );
}
