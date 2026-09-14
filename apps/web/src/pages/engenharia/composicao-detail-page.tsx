import { useState } from 'react';
import { ArrowLeft, Pencil, Power } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { Alert, AlertTitle, Badge, Button, Card, CardContent, ErrorState } from '@repo/ui';

import { useAuth } from '@/features/auth/context';
import { ApiError } from '@/lib/api-client';

import { CompositionFormDrawer } from '@/features/composicoes/components/composition-form-drawer';
import { CompositionItemsEditor } from '@/features/composicoes/components/composition-items-editor';
import { formatCost } from '@/features/composicoes/format';
import {
  useComposition,
  useUpdateComposition,
} from '@/features/composicoes/hooks/use-compositions';

/// Uma composição aberta: cabeçalho, itens e custo unitário.
export function ComposicaoDetailPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const canManage = user?.permissions.includes('composicoes.manage') ?? false;

  const { data: composicao, isLoading, isError } = useComposition(id);
  const updateMutation = useUpdateComposition();
  const [editando, setEditando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const voltar = (
    <Button
      variant="ghost"
      size="sm"
      className="w-fit"
      onClick={() => navigate('/engenharia/composicoes')}
    >
      <ArrowLeft />
      Composições
    </Button>
  );

  if (isError) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <ErrorState message="Composição não encontrada ou indisponível." />
      </div>
    );
  }

  if (isLoading || !composicao) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <p className="text-sm text-muted-foreground">Carregando composição...</p>
      </div>
    );
  }

  async function alternarSituacao() {
    if (!composicao) return;
    setErro(null);
    try {
      await updateMutation.mutateAsync({
        id: composicao.id,
        input: { active: !composicao.active },
      });
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível alterar a situação.');
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {voltar}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">{composicao.code}</span>
            <Badge variant={composicao.active ? 'success' : 'secondary'}>
              {composicao.active ? 'Ativa' : 'Inativa'}
            </Badge>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            {composicao.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Por {composicao.unit}
            {composicao.description ? ` · ${composicao.description}` : ''}
          </p>
        </div>

        {canManage && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={alternarSituacao} disabled={updateMutation.isPending}>
              <Power />
              {composicao.active ? 'Desativar' : 'Ativar'}
            </Button>
            <Button variant="outline" onClick={() => setEditando(true)}>
              <Pencil />
              Editar
            </Button>
          </div>
        )}
      </div>

      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Custo unitário</span>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {formatCost(composicao.unitCost)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                / {composicao.unit}
              </span>
            </span>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col gap-1">
            <span className="text-xs text-muted-foreground">Insumos</span>
            <span className="text-xl font-semibold tabular-nums text-foreground">
              {composicao.itemCount}
            </span>
          </CardContent>
        </Card>
      </div>

      <CompositionItemsEditor composition={composicao} canManage={canManage} />

      <CompositionFormDrawer open={editando} onOpenChange={setEditando} composition={composicao} />
    </div>
  );
}
