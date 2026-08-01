import { Link } from 'react-router';
import { Building2 } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@repo/ui';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { ConstructionSiteStatusBadge } from '@/features/engenharia/components/construction-site-status-badge';

export function ObrasHomeSection() {
  const { data, isLoading } = useConstructionSites({ page: 1, limit: 5 });
  const sites = data?.data ?? [];

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-base font-semibold text-foreground/80">Obras</h2>
        <p className="text-sm text-foreground/60">Acompanhe aqui as obras, em que pé elas estão.</p>
      </div>

      <div className="rounded-md border border-border bg-card p-4">
        {isLoading && (
          <p className="py-6 text-center text-sm text-muted-foreground">Carregando...</p>
        )}

        {!isLoading && sites.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
            <Building2 className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">Nenhuma obra cadastrada ainda.</p>
          </div>
        )}

        {!isLoading && sites.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Obra</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Cidade</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Responsável</TableHead>
                <TableHead>Centros de custo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sites.map((site) => (
                <TableRow key={site.id}>
                  <TableCell>
                    <Link
                      to={`/engenharia/obras/${site.id}`}
                      className="flex flex-col hover:underline"
                    >
                      <span className="font-medium text-foreground">{site.name}</span>
                      <span className="text-xs text-muted-foreground">{site.code}</span>
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{site.clientName ?? '—'}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.city ? `${site.city}${site.state ? `, ${site.state}` : ''}` : '—'}
                  </TableCell>
                  <TableCell>
                    <ConstructionSiteStatusBadge status={site.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {site.responsibleName ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{site._count.costCenters}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
