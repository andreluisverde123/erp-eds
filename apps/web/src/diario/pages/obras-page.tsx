import { useQuery } from '@tanstack/react-query';
import { Building2 } from 'lucide-react';
import { Button, EmptyState, ErrorState, Skeleton } from '@repo/ui';

import { listSites } from '../api';
import { SiteCard } from '../components/site-card';

export function DiarioObrasPage() {
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['diario', 'obras'],
    queryFn: listSites,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-5">
      <h1 className="mb-4 text-xl font-semibold text-foreground">Obras</h1>

      {isPending && (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {isError && (
        <>
          <ErrorState message={error instanceof Error ? error.message : 'Erro ao carregar.'} />
          <Button variant="secondary" className="mt-3 w-full" onClick={() => void refetch()}>
            Tentar de novo
          </Button>
        </>
      )}

      {data?.length === 0 && (
        <EmptyState
          icon={Building2}
          title="Nenhuma obra vinculada"
          description="Você só enxerga aqui as obras em que foi colocado. Fale com a coordenação."
          className="px-6"
        />
      )}

      {data && data.length > 0 && (
        <ul className="space-y-3">
          {data.map((site) => (
            <li key={site.id}>
              <SiteCard site={site} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
