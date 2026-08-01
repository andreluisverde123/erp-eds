import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';
import { useCostCenters } from '@/features/engenharia/hooks/use-cost-centers';

import {
  purchaseRequestFormSchema,
  toPurchaseRequestInput,
  type PurchaseRequestFormValues,
} from '../purchase-request-form-schema';
import type { PurchaseRequestInput } from '../types';
import { PurchaseRequestItemsGrid } from './purchase-request-items-grid';

interface PurchaseRequestFormProps {
  defaultValues: PurchaseRequestFormValues;
  submitLabel: string;
  submittingLabel: string;
  onSubmit: (input: PurchaseRequestInput) => Promise<void>;
  onCancel: () => void;
}

export function PurchaseRequestForm({
  defaultValues,
  submitLabel,
  submittingLabel,
  onSubmit,
  onCancel,
}: PurchaseRequestFormProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<PurchaseRequestFormValues>({
    resolver: zodResolver(purchaseRequestFormSchema),
    defaultValues,
  });

  const { data: costCentersData } = useCostCenters({ limit: 100 });

  async function handleSubmit(values: PurchaseRequestFormValues) {
    setSubmitError(null);
    try {
      await onSubmit(toPurchaseRequestInput(values));
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a solicitação. Tente novamente.',
      );
    }
  }

  return (
    <Form {...form}>
      {/* A linha em branco final da grade é ignorada pela validação e pelo
          payload (ver `isBlankItemRow` no schema) — o formulário não mexe mais
          no estado do field array antes de enviar. */}
      <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-6" noValidate>
        {submitError && (
          <Alert variant="destructive">
            <AlertTitle>{submitError}</AlertTitle>
          </Alert>
        )}

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {/* Campo único de destino. A obra saiu do formulário: na operação
                  ela e o centro de custo diziam a mesma coisa, e o centro de
                  custo ainda cobre destinos que não são obra (Escritório,
                  Fazenda). Quando o centro escolhido pertence a uma obra, a
                  API faz esse vínculo sozinha. */}
              <FormField
                control={form.control}
                name="costCenterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Centro de Custo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione o centro de custo" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {costCentersData?.data.map((costCenter) => (
                          <SelectItem key={costCenter.id} value={costCenter.id}>
                            <span>{costCenter.name}</span>
                            {costCenter.constructionSite && (
                              <span className="text-muted-foreground">
                                {costCenter.constructionSite.name}
                              </span>
                            )}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Contexto adicional para quem for cotar/aprovar"
                      rows={2}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <h2 className="text-base font-semibold text-foreground">Itens</h2>
          <PurchaseRequestItemsGrid
            control={form.control}
            register={form.register}
            errors={form.formState.errors}
          />
        </div>

        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? submittingLabel : submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  );
}
