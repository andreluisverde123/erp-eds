import { ArrowLeft, ClipboardList } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button } from '@repo/ui';

import { PurchaseRequestForm } from '@/features/compras/components/purchase-request-form';
import { usePurchaseRequest } from '@/features/compras/hooks/use-purchase-request';
import { useUpdatePurchaseRequest } from '@/features/compras/hooks/use-purchase-request-mutations';
import { requestToFormValues } from '@/features/compras/purchase-request-form-schema';
import type { PurchaseRequestInput } from '@/features/compras/types';

export function EditarSolicitacaoPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: request, isLoading, isError } = usePurchaseRequest(id);
  const updateMutation = useUpdatePurchaseRequest(id ?? '');

  if (!id) {
    return <Navigate to="/engenharia/solicitacoes" replace />;
  }

  if (isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <ClipboardList className="size-9 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Solicitação não encontrada.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/engenharia/solicitacoes')}>
          Voltar para Solicitações
        </Button>
      </div>
    );
  }

  if (isLoading || !request) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Carregando solicitação...
      </div>
    );
  }

  async function handleSubmit(input: PurchaseRequestInput) {
    await updateMutation.mutateAsync(input);
    navigate(`/engenharia/solicitacoes/${id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground"
          onClick={() => navigate(`/engenharia/solicitacoes/${id}`)}
        >
          <ArrowLeft />
          Voltar
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Editar {request.code}
          </h1>
          <p className="text-sm text-muted-foreground">
            Ajuste os dados enquanto a solicitação está em rascunho.
          </p>
        </div>
      </div>

      <PurchaseRequestForm
        defaultValues={requestToFormValues(request)}
        submitLabel="Salvar Alterações"
        submittingLabel="Salvando..."
        onSubmit={handleSubmit}
        onCancel={() => navigate(`/engenharia/solicitacoes/${id}`)}
      />
    </div>
  );
}
