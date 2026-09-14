import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useNavigate } from 'react-router';
import {
  Badge,
  Button,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { formatDateOnly } from '@/features/catalogo/reference-date';

import { BUDGET_STATUS_LABELS, formatMoney } from '../format';
import { useBudgets } from '../hooks/use-budgets';
import { BudgetFormDrawer } from './budget-form-drawer';

/// Os orçamentos DESTA obra, dentro da tela da obra, com o atalho para criar
/// um novo já ligado a ela. Vale para obra em qualquer situação — de
/// planejamento a concluída.
export function ObraBudgetsCard({ constructionSiteId, canManage }: { constructionSiteId: string; canManage: boolean }) {
  const navigate = useNavigate();
  const [criando, setCriando] = useState(false);
  const { data, isLoading } = useBudgets({ constructionSiteId, limit: 50 });
  const orcamentos = data?.data ?? [];

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-foreground">Orçamentos</h2>
          {canManage && (
            <Button size="sm" onClick={() => setCriando(true)}>
              <Plus />
              Novo Orçamento
            </Button>
          )}
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Carregando orçamentos...</p>}
        {!isLoading && orcamentos.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhum orçamento para esta obra.</p>
        )}

        {orcamentos.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Código</TableHead>
                <TableHead>Nome</TableHead>
                <TableHead>Data-base</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Preço final</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {orcamentos.map((orcamento) => (
                <TableRow key={orcamento.id}>
                  <TableCell className="font-mono text-xs text-muted-foreground">
                    {orcamento.code} · v{orcamento.version}
                  </TableCell>
                  <TableCell>
                    <button
                      type="button"
                      className="text-left font-medium text-foreground hover:underline"
                      onClick={() => navigate(`/engenharia/orcamentos/${orcamento.id}`)}
                    >
                      {orcamento.name}
                    </button>
                  </TableCell>
                  <TableCell className="tabular-nums">{formatDateOnly(orcamento.referenceDate)}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant={orcamento.status === 'CLOSED' ? 'success' : 'secondary'}>
                        {BUDGET_STATUS_LABELS[orcamento.status]}
                      </Badge>
                      {orcamento.isOfficial && <Badge variant="outline">Oficial</Badge>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMoney(orcamento.finalPrice ?? orcamento.totalCost)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      {canManage && (
        <BudgetFormDrawer
          open={criando}
          onOpenChange={setCriando}
          constructionSiteId={constructionSiteId}
          onSaved={(salvo) => navigate(`/engenharia/orcamentos/${salvo.id}`)}
        />
      )}
    </Card>
  );
}
