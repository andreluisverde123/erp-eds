import { memo } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { ClipboardList } from 'lucide-react';
import { Link } from 'react-router';
import {
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { getPurchaseRequest } from '../api';
import { PurchaseRequestStatusBadge } from './purchase-request-status-badge';
import type { PurchaseRequestListItem } from '../types';

function formatCurrency(value: number): string {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR');
}

interface PurchaseRequestsTableProps {
  requests: PurchaseRequestListItem[];
}

export const PurchaseRequestsTable = memo(function PurchaseRequestsTable({
  requests,
}: PurchaseRequestsTableProps) {
  const queryClient = useQueryClient();

  // Ao passar o mouse sobre uma solicitação, já esquenta o cache da tela de
  // detalhe — na hora do clique, a navegação abre sem "Carregando...".
  function prefetchRequest(id: string) {
    queryClient.prefetchQuery({
      queryKey: ['purchase-requests', 'detail', id],
      queryFn: () => getPurchaseRequest(id),
      staleTime: 30_000,
    });
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={ClipboardList}
        title="Nenhuma solicitação encontrada"
        description="Ajuste os filtros ou crie uma nova solicitação."
      />
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Número</TableHead>
          {/* O centro de custo é o destino da solicitação; a obra virou dado
              derivado dele e sai como subtítulo, não como coluna própria. */}
          <TableHead>Centro de custo</TableHead>
          <TableHead>Solicitante</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Data</TableHead>
          <TableHead className="text-right">Valor cotado</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {requests.map((request) => (
          <TableRow key={request.id}>
            <TableCell>
              <Link
                to={`/engenharia/solicitacoes/${request.id}`}
                onMouseEnter={() => prefetchRequest(request.id)}
                className="font-medium text-foreground hover:underline"
              >
                {request.code}
              </Link>
            </TableCell>
            <TableCell>
              <div className="flex flex-col">
                <span className="text-foreground">{request.constructionSite.name}</span>
                {request.costCenter && (
                  <span className="text-xs text-muted-foreground">{request.costCenter.name}</span>
                )}
              </div>
            </TableCell>
            <TableCell className="text-muted-foreground">{request.requestedBy.name}</TableCell>
            <TableCell>
              <PurchaseRequestStatusBadge status={request.status} />
            </TableCell>
            <TableCell className="text-muted-foreground">{formatDate(request.createdAt)}</TableCell>
            <TableCell className="text-right text-muted-foreground">
              {request.estimatedTotal > 0 ? formatCurrency(request.estimatedTotal) : '—'}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
});
