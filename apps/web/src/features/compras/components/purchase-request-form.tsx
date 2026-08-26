import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
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
import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { useCostCenters } from '@/features/engenharia/hooks/use-cost-centers';

import {
  purchaseRequestFormSchema,
  SEM_CENTRO_DE_CUSTO,
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

  // `useWatch` e não `form.watch()`: o React Compiler não consegue memoizar a
  // função devolvida pelo `watch` e pula a otimização do componente inteiro.
  // Mesmo padrão do drawer da ordem e da grade de itens.
  const constructionSiteId = useWatch({ control: form.control, name: 'constructionSiteId' });

  const { data: constructionSitesData } = useConstructionSites({ limit: 100 });
  // `enabled` segura a busca até haver obra: sem ela a lista viria com os
  // centros de custo da empresa inteira, e escolher um de outra obra é
  // exatamente o que a API recusa.
  const { data: costCentersData } = useCostCenters({
    limit: 100,
    constructionSiteId,
    enabled: Boolean(constructionSiteId),
  });

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
              {/* A obra vem primeiro e é obrigatória: quem abre a solicitação
                  sabe para onde o material vai. O centro de custo é opcional e
                  fica logo ao lado, dependente dela. */}
              <FormField
                control={form.control}
                name="constructionSiteId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Obra</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(value) => {
                        field.onChange(value);
                        // Trocar de obra invalida o centro de custo escolhido:
                        // ele pertencia à obra anterior, e a API recusaria o
                        // par. Limpar aqui evita o erro chegar no envio.
                        form.setValue('costCenterId', '');
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione a obra" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {constructionSitesData?.data.map((site) => (
                          <SelectItem key={site.id} value={site.id}>
                            <span>{site.name}</span>
                            <span className="text-muted-foreground">{site.code}</span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Opcional de propósito: o solicitante nem sempre sabe em qual
                  conta a compra entra, e Compras informa na emissão da Ordem —
                  onde o campo volta a ser obrigatório. */}
              <FormField
                control={form.control}
                name="costCenterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>
                      Centro de Custo{' '}
                      <span className="text-muted-foreground font-normal">(opcional)</span>
                    </FormLabel>
                    <Select
                      value={field.value || undefined}
                      onValueChange={(value) =>
                        field.onChange(value === SEM_CENTRO_DE_CUSTO ? '' : value)
                      }
                      disabled={!constructionSiteId}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue
                            placeholder={
                              constructionSiteId ? 'Sem centro de custo' : 'Escolha a obra primeiro'
                            }
                          />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value={SEM_CENTRO_DE_CUSTO}>
                          <span className="text-muted-foreground">Sem centro de custo</span>
                        </SelectItem>
                        {costCentersData?.data.map((costCenter) => (
                          <SelectItem key={costCenter.id} value={costCenter.id}>
                            <span>{costCenter.name}</span>
                            <span className="text-muted-foreground">{costCenter.code}</span>
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
