import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  AlertTitle,
  Button,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@repo/ui';

import { todayInSaoPaulo } from '@/features/catalogo/reference-date';
import { ApiError } from '@/lib/api-client';

import { useConstructionSiteOptions, useCreateBudget, useUpdateBudget } from '../hooks/use-budgets';
import type { Budget } from '../types';

const schema = z.object({
  constructionSiteId: z.string().min(1, 'Escolha a obra.'),
  name: z.string().trim().min(1, 'Informe o nome do orçamento.').max(150, 'Máximo de 150 caracteres.'),
  referenceDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Informe a data-base.'),
  description: z.string().trim().max(1000, 'Máximo de 1000 caracteres.').optional(),
});

type Valores = z.infer<typeof schema>;

/// Cabeçalho do orçamento: obra, nome, data-base e descrição.
///
/// A data-base decide qual preço de referência é sugerido para insumo. Mudá-la
/// não reprecifica o que já está no orçamento — só as próximas sugestões.
export function BudgetFormDrawer({
  open,
  onOpenChange,
  budget,
  constructionSiteId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: Budget;
  /// Obra já escolhida — quando o orçamento nasce na tela da obra.
  constructionSiteId?: string;
  onSaved?: (budget: Budget) => void;
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{budget ? 'Editar orçamento' : 'Novo orçamento'}</SheetTitle>
          <SheetDescription>
            {budget
              ? `${budget.code} v${budget.version}. O código não muda.`
              : 'O código é gerado automaticamente (ORC-0001), na versão 1.'}
          </SheetDescription>
        </div>
        <Corpo
          key={open ? (budget?.id ?? 'novo') : 'fechado'}
          budget={budget}
          constructionSiteId={constructionSiteId}
          onDone={(salvo) => {
            onOpenChange(false);
            if (salvo) onSaved?.(salvo);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}

function Corpo({
  budget,
  constructionSiteId,
  onDone,
}: {
  budget?: Budget;
  constructionSiteId?: string;
  onDone: (salvo?: Budget) => void;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const { data: obras } = useConstructionSiteOptions();
  const criar = useCreateBudget();
  const atualizar = useUpdateBudget(budget?.id ?? '');

  const form = useForm<Valores>({
    resolver: zodResolver(schema),
    defaultValues: budget
      ? {
          constructionSiteId: budget.constructionSite.id,
          name: budget.name,
          referenceDate: budget.referenceDate,
          description: budget.description ?? '',
        }
      : { constructionSiteId: constructionSiteId ?? '', name: '', referenceDate: todayInSaoPaulo(), description: '' },
  });

  async function salvar(valores: Valores) {
    setErro(null);
    const input = {
      constructionSiteId: valores.constructionSiteId,
      name: valores.name,
      referenceDate: valores.referenceDate,
      description: valores.description?.trim() || undefined,
    };
    try {
      const salvo = budget ? await atualizar.mutateAsync(input) : await criar.mutateAsync(input);
      onDone(salvo);
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível salvar o orçamento.');
    }
  }

  const salvando = criar.isPending || atualizar.isPending;

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form id="budget-form" onSubmit={form.handleSubmit(salvar)} className="flex flex-col gap-4" noValidate>
            {erro && (
              <Alert variant="destructive">
                <AlertTitle>{erro}</AlertTitle>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="constructionSiteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Obra</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Escolha a obra" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {obras?.map((obra) => (
                        <SelectItem key={obra.id} value={obra.id}>
                          {obra.code} — {obra.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Orçamento executivo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="referenceDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data-base</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <p className="text-xs text-muted-foreground">
                    O preço de insumo sugerido é o vigente nesta data. Mudá-la não altera itens já
                    incluídos.
                  </p>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Input placeholder="Escopo, premissas" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={() => onDone()}>
          Cancelar
        </Button>
        <Button type="submit" form="budget-form" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
