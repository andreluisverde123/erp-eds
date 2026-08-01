import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Textarea,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import {
  COST_CENTER_FORM_DEFAULTS,
  costCenterFormSchema,
  toCostCenterInput,
  type CostCenterFormValues,
} from '../cost-center-form-schema';
import { useCreateCostCenter, useUpdateCostCenter } from '../hooks/use-cost-center-mutations';
import type { CostCenter } from '../types';

interface CostCenterFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  constructionSiteId: string;
  /// Presente = editando esse centro de custo; ausente = criando um novo.
  costCenter?: CostCenter;
}

export function CostCenterFormDrawer({
  open,
  onOpenChange,
  constructionSiteId,
  costCenter,
}: CostCenterFormDrawerProps) {
  const isEditing = Boolean(costCenter);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{isEditing ? 'Editar centro de custo' : 'Novo centro de custo'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Atualize os dados do centro de custo.'
              : 'Cadastre um centro de custo para a obra.'}
          </SheetDescription>
        </div>

        <CostCenterFormBody
          key={open ? (costCenter?.id ?? 'create') : 'closed'}
          costCenter={costCenter}
          isEditing={isEditing}
          constructionSiteId={constructionSiteId}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function CostCenterFormBody({
  costCenter,
  isEditing,
  constructionSiteId,
  onDone,
}: {
  costCenter?: CostCenter;
  isEditing: boolean;
  constructionSiteId: string;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useCreateCostCenter();
  const updateMutation = useUpdateCostCenter(costCenter?.id ?? '');
  const mutation = isEditing ? updateMutation : createMutation;

  const form = useForm<CostCenterFormValues>({
    resolver: zodResolver(costCenterFormSchema),
    defaultValues: costCenter
      ? { code: costCenter.code, name: costCenter.name, description: costCenter.description ?? '' }
      : COST_CENTER_FORM_DEFAULTS,
  });

  async function onSubmit(values: CostCenterFormValues) {
    setSubmitError(null);
    try {
      await mutation.mutateAsync({ ...toCostCenterInput(values), constructionSiteId });
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar o centro de custo. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="cost-center-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>{submitError}</AlertTitle>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Fundação" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Código</FormLabel>
                  <FormControl>
                    <Input placeholder="CC-001" {...field} />
                  </FormControl>
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
                    <Textarea placeholder="Detalhes sobre o centro de custo" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="cost-center-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
