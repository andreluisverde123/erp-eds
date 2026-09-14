import { useState } from 'react';
import {
  Alert,
  AlertTitle,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Label,
  NumberInput,
  Textarea,
} from '@repo/ui';

import { toRawDecimal } from '@/features/composicoes/format';
import { ApiError } from '@/lib/api-client';

import { useUpdateBudgetBdi } from '../hooks/use-budgets';
import type { Budget } from '../types';

/// BDI do rascunho: percentual sobre o custo direto e a observação (composição
/// do BDI, premissas). O valor do BDI e o preço final vêm do servidor.
export function BudgetBdiDialog({
  open,
  onOpenChange,
  budget,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget: Budget;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>BDI</DialogTitle>
          <DialogDescription>
            Percentual aplicado sobre o custo direto do orçamento. Zero para um orçamento só de custo.
          </DialogDescription>
        </DialogHeader>
        {open && <Formulario budget={budget} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function Formulario({ budget, onDone }: { budget: Budget; onDone: () => void }) {
  const salvar = useUpdateBudgetBdi(budget.id);
  const [percentual, setPercentual] = useState(() => toRawDecimal(budget.bdiPercent ?? '0'));
  const [observacao, setObservacao] = useState(budget.bdiNote ?? '');
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(evento: React.FormEvent) {
    evento.preventDefault();
    setErro(null);
    const numero = Number(percentual);
    if (percentual === '' || !(numero >= 0)) return setErro('Informe um BDI igual ou maior que zero.');
    try {
      await salvar.mutateAsync({ bdiPercent: numero, bdiNote: observacao.trim() });
      onDone();
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar o BDI.');
    }
  }

  return (
    <form onSubmit={enviar} noValidate className="flex flex-col gap-3">
      {erro && (
        <Alert variant="destructive">
          <AlertTitle>{erro}</AlertTitle>
        </Alert>
      )}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bdi-percentual">BDI (%)</Label>
        <NumberInput
          id="bdi-percentual"
          mode="decimal"
          decimalScale={4}
          value={percentual}
          onChange={setPercentual}
          className="text-right tabular-nums"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="bdi-observacao">Observação</Label>
        <Textarea
          id="bdi-observacao"
          value={observacao}
          maxLength={500}
          rows={3}
          placeholder="Ex.: administração central 4%, risco 1%, lucro 8%, tributos"
          onChange={(evento) => setObservacao(evento.target.value)}
        />
      </div>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" disabled={salvar.isPending}>
          {salvar.isPending ? 'Salvando...' : 'Salvar BDI'}
        </Button>
      </div>
    </form>
  );
}
