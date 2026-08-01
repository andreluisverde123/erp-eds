import { ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router';
import { Button } from '@repo/ui';

import { PurchaseRequestForm } from '@/features/compras/components/purchase-request-form';
import { useCreatePurchaseRequest } from '@/features/compras/hooks/use-purchase-request-mutations';
import { PURCHASE_REQUEST_FORM_DEFAULTS } from '@/features/compras/purchase-request-form-schema';
import type { PurchaseRequestInput } from '@/features/compras/types';

export function NovaSolicitacaoPage() {
  const navigate = useNavigate();
  const createMutation = useCreatePurchaseRequest();

  async function handleSubmit(input: PurchaseRequestInput) {
    const created = await createMutation.mutateAsync(input);
    navigate(`/engenharia/solicitacoes/${created.id}`);
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <Button
          variant="ghost"
          size="sm"
          className="w-fit text-muted-foreground"
          onClick={() => navigate('/engenharia/solicitacoes')}
        >
          <ArrowLeft />
          Voltar
        </Button>
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            Nova Solicitação
          </h1>
          <p className="text-sm text-muted-foreground">
            Lance os itens necessários — a solicitação nasce como rascunho.
          </p>
        </div>
      </div>

      <PurchaseRequestForm
        defaultValues={PURCHASE_REQUEST_FORM_DEFAULTS}
        submitLabel="Criar Solicitação"
        submittingLabel="Criando..."
        onSubmit={handleSubmit}
        onCancel={() => navigate('/engenharia/solicitacoes')}
      />
    </div>
  );
}
