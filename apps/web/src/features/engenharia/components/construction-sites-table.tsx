import { memo } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { Building2, Copy, MoreHorizontal, Pencil, Star, Trash2 } from 'lucide-react';
import { Link } from 'react-router';
import {
  Button,
  Checkbox,
  cn,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { useFavorites } from '@/hooks/use-favorites';

import { getConstructionSite } from '../api';
import { ConstructionSiteStatusBadge } from './construction-site-status-badge';
import type { ConstructionSite } from '../types';

const FAVORITE_TYPE = 'construction-site';

interface ConstructionSitesTableProps {
  sites: ConstructionSite[];
  onEdit: (site: ConstructionSite) => void;
  onDelete: (site: ConstructionSite) => void;
  onDuplicate: (site: ConstructionSite) => void;
  isSelected: (id: string) => boolean;
  onToggleRow: (id: string) => void;
  onToggleAll: () => void;
  isAllSelected: boolean;
  isIndeterminate: boolean;
  isColumnVisible: (id: string) => boolean;
}

export const ConstructionSitesTable = memo(function ConstructionSitesTable({
  sites,
  onEdit,
  onDelete,
  onDuplicate,
  isSelected,
  onToggleRow,
  onToggleAll,
  isAllSelected,
  isIndeterminate,
  isColumnVisible,
}: ConstructionSitesTableProps) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const queryClient = useQueryClient();

  // Ao passar o mouse sobre uma obra, já esquenta o cache da tela de
  // detalhe — na hora do clique, a navegação abre sem "Carregando...".
  function prefetchSite(id: string) {
    queryClient.prefetchQuery({
      queryKey: ['construction-sites', 'detail', id],
      queryFn: () => getConstructionSite(id),
      staleTime: 30_000,
    });
  }

  if (sites.length === 0) {
    return (
      <EmptyState
        icon={Building2}
        title="Nenhuma obra encontrada"
        description="Ajuste os filtros ou cadastre uma nova obra."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-10">
            <Checkbox
              checked={isIndeterminate ? 'indeterminate' : isAllSelected}
              onCheckedChange={onToggleAll}
              aria-label="Selecionar todas as obras"
            />
          </TableHead>
          <TableHead>Obra</TableHead>
          {isColumnVisible('clientName') && <TableHead>Cliente</TableHead>}
          {isColumnVisible('city') && <TableHead>Cidade</TableHead>}
          {isColumnVisible('status') && <TableHead>Status</TableHead>}
          {isColumnVisible('responsibleName') && <TableHead>Responsável</TableHead>}
          {isColumnVisible('costCenters') && <TableHead>Centros de custo</TableHead>}
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {sites.map((site) => (
          <TableRow key={site.id} data-state={isSelected(site.id) ? 'selected' : undefined}>
            <TableCell>
              <Checkbox
                checked={isSelected(site.id)}
                onCheckedChange={() => onToggleRow(site.id)}
                aria-label={`Selecionar ${site.name}`}
              />
            </TableCell>
            <TableCell>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    toggleFavorite({
                      type: FAVORITE_TYPE,
                      id: site.id,
                      label: site.name,
                      subtitle: site.code,
                      path: `/engenharia/obras/${site.id}`,
                    })
                  }
                  className="shrink-0 text-muted-foreground/50 hover:text-primary"
                >
                  <Star
                    className={cn(
                      'size-4',
                      isFavorite(FAVORITE_TYPE, site.id) && 'fill-primary text-primary',
                    )}
                  />
                  <span className="sr-only">Favoritar {site.name}</span>
                </button>
                <Link
                  to={`/engenharia/obras/${site.id}`}
                  onMouseEnter={() => prefetchSite(site.id)}
                  className="flex flex-col hover:underline"
                >
                  <span className="font-medium text-foreground">{site.name}</span>
                  <span className="text-xs text-muted-foreground">{site.code}</span>
                </Link>
              </div>
            </TableCell>
            {isColumnVisible('clientName') && (
              <TableCell className="text-muted-foreground">{site.clientName ?? '—'}</TableCell>
            )}
            {isColumnVisible('city') && (
              <TableCell className="text-muted-foreground">
                {site.city ? `${site.city}${site.state ? `, ${site.state}` : ''}` : '—'}
              </TableCell>
            )}
            {isColumnVisible('status') && (
              <TableCell>
                <ConstructionSiteStatusBadge status={site.status} />
              </TableCell>
            )}
            {isColumnVisible('responsibleName') && (
              <TableCell className="text-muted-foreground">{site.responsibleName ?? '—'}</TableCell>
            )}
            {isColumnVisible('costCenters') && (
              <TableCell className="text-muted-foreground">{site._count.costCenters}</TableCell>
            )}
            <TableCell>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-8">
                    <MoreHorizontal className="size-4" />
                    <span className="sr-only">Ações</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem asChild>
                    <Link to={`/engenharia/obras/${site.id}`}>Ver detalhes</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onEdit(site)}>
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => onDuplicate(site)}>
                    <Copy />
                    Duplicar
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onClick={() => onDelete(site)}>
                    <Trash2 />
                    Excluir
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
