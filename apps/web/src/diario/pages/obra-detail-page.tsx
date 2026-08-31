import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ClipboardList, Plus } from 'lucide-react';
import { Link, useParams } from 'react-router';
import { Button, ErrorState, Skeleton, cn } from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { getSite } from '../api';
import {
  ASSIGNMENT_ROLE_LABEL,
  SITE_STATUS_CLASS,
  SITE_STATUS_LABEL,
  formatDate,
  formatShortAddress,
} from '../components/site-status';

/// Um dado da obra, com rótulo. Lista de definição em vez de tabela: numa
/// tela de 375px uma tabela de duas colunas ou quebra o rótulo ou corta o
/// valor, e o Diário evita tabela no celular por princípio.
function Field({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="border-b border-border py-3 last:border-b-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm text-foreground">{value ?? '—'}</dd>
    </div>
  );
}

export function DiarioObraDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data, isPending, isError, error } = useQuery({
    queryKey: ['diario', 'obras', id],
    queryFn: () => getSite(id!),
    enabled: Boolean(id),
    // Um 404 aqui significa "esta obra não é sua" (ver `SiteAccessService` na
    // API) — repetir a chamada não mudaria a resposta.
    retry: (failureCount, queryError) =>
      queryError instanceof ApiError && queryError.status === 404 ? false : failureCount < 1,
  });

  return (
    <div className="mx-auto max-w-2xl px-4 py-4">
      <Link
        to="/obras"
        className="-ml-2 mb-2 inline-flex h-10 items-center gap-1.5 px-2 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" />
        Obras
      </Link>

      {isPending && (
        <div className="space-y-3">
          <Skeleton className="h-8 w-2/3" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      )}

      {isError && (
        <ErrorState
          message={
            error instanceof ApiError && error.status === 404
              ? 'Obra não encontrada ou não vinculada ao seu acesso.'
              : 'Não foi possível carregar a obra.'
          }
        />
      )}

      {data && (
        <>
          <div className="mb-1 flex items-center gap-2">
            <span
              className={cn(
                'rounded-full px-2 py-0.5 text-[10px] font-medium',
                SITE_STATUS_CLASS[data.status],
              )}
            >
              {SITE_STATUS_LABEL[data.status]}
            </span>
            <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
              Você: {ASSIGNMENT_ROLE_LABEL[data.assignmentRole]}
            </span>
          </div>

          <h1 className="text-xl font-semibold leading-tight text-foreground">{data.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{data.code}</p>

          <Button asChild size="lg" className="mt-4 h-12 w-full text-base">
            <Link to={`/relatorios/novo?obra=${data.id}`}>
              <Plus className="size-5" />
              Criar relatório
            </Link>
          </Button>

          {/* O segundo passo do fluxo principal: da obra para os RDOs DELA.
              Antes só existia o filtro por obra dentro da lista, em estado
              local — não havia caminho daqui até lá. */}
          <Button asChild variant="secondary" className="mt-2 h-12 w-full text-base">
            <Link to={`/relatorios?obra=${data.id}`}>
              <ClipboardList className="size-5" />
              Ver relatórios desta obra
            </Link>
          </Button>

          <dl className="mt-5 rounded-xl border border-border bg-background px-4">
            <Field label="Contratante" value={data.clientName} />
            <Field label="Responsável" value={data.responsibleName} />
            <Field label="Local" value={formatShortAddress(data)} />
            <Field label="Início" value={formatDate(data.startDate)} />
            <Field label="Previsão de término" value={formatDate(data.expectedEndDate)} />
            <Field
              label="Relatórios"
              value={
                data.reportCount === 0
                  ? 'Nenhum registrado'
                  : `${data.reportCount} — último em ${formatDate(data.lastReportDate)}`
              }
            />
          </dl>

          {/* Não há "número do contrato" na obra do ERP hoje: o único
              `contractNumber` do sistema é o do contrato com empresa
              TERCEIRIZADA, que é outro documento. O campo entra quando o RDO
              precisar dele — inventá-lo agora só criaria uma linha vazia. */}
        </>
      )}
    </div>
  );
}
