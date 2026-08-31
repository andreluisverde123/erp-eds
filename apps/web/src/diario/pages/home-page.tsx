import { useQuery } from '@tanstack/react-query';
import { Building2, ClipboardList, Plus } from 'lucide-react';
import { Link } from 'react-router';
import { Button, EmptyState, ErrorState, Skeleton } from '@repo/ui';

import { useAuth } from '@/features/auth/context';

import { getHome } from '../api';
import { ReportRow } from '../components/report-row';
import { Section } from '../components/section';
import { SiteCard } from '../components/site-card';

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}

export function DiarioHomePage() {
  const { user } = useAuth();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: ['diario', 'home'],
    queryFn: getHome,
  });

  return (
    <div className="mx-auto max-w-2xl">
      <div className="px-4 pb-1 pt-5">
        <p className="text-sm text-muted-foreground">Olá, {user ? firstNameOf(user.name) : ''}</p>
        <h1 className="text-xl font-semibold text-foreground">O que vamos registrar hoje?</h1>
      </div>

      {/* O CTA vem ANTES das listas, e não escondido no fim da rolagem: é a
          ação que traz a pessoa ao app. O botão da barra inferior é o mesmo
          destino — dois caminhos para a mesma coisa, porque quem chega pela
          Home e quem chega de outra tela estão com o polegar em lugares
          diferentes. */}
      <div className="px-4 pb-1 pt-3">
        <Button asChild size="lg" className="h-12 w-full text-base">
          <Link to="/relatorios/novo">
            <Plus className="size-5" />
            Criar relatório
          </Link>
        </Button>
      </div>

      {isError && (
        <div className="px-4 py-3">
          <ErrorState message={error instanceof Error ? error.message : 'Erro ao carregar.'} />
          <Button variant="secondary" className="mt-3 w-full" onClick={() => void refetch()}>
            Tentar novamente
          </Button>
        </div>
      )}

      {isPending && !isError && (
        <div className="space-y-3 px-4 py-5">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      )}

      {data && (
        <>
          <Section
            title="Minhas obras"
            action={
              data.sites.length > 0 ? (
                <Link to="/obras" className="text-xs font-medium text-primary">
                  Ver todas
                </Link>
              ) : undefined
            }
          >
            {data.sites.length === 0 ? (
              <EmptyState
                icon={Building2}
                title="Nenhuma obra vinculada"
                description="Peça à coordenação para vincular você às obras que vai acompanhar."
                className="min-h-40 px-6"
              />
            ) : (
              <ul className="space-y-3">
                {data.sites.slice(0, 3).map((site) => (
                  <li key={site.id}>
                    <SiteCard site={site} />
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section
            title="RDOs recentes"
            action={
              data.recentReports.length > 0 ? (
                <Link to="/relatorios" className="text-xs font-medium text-primary">
                  Ver todos
                </Link>
              ) : undefined
            }
          >
            {data.recentReports.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nenhum relatório ainda"
                description="Os relatórios das suas obras aparecem aqui assim que forem criados."
                className="min-h-40 px-6"
              />
            ) : (
              <ul className="space-y-2.5">
                {data.recentReports.map((report) => (
                  <ReportRow key={report.id} report={report} />
                ))}
              </ul>
            )}
          </Section>
        </>
      )}
    </div>
  );
}
