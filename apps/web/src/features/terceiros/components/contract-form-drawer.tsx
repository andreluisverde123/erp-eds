import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, useWatch } from 'react-hook-form';
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
  NumberInput,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Textarea,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';

import {
  CONTRACT_FORM_DEFAULTS,
  contractFormSchema,
  type ContractFormValues,
} from '../contract-form-schema';
import { useCreateContract } from '../hooks/use-contract-mutations';
import { useContractors } from '../hooks/use-contractors';
import type { ContractInput } from '../types';

interface ContractFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ContractFormDrawer({ open, onOpenChange }: ContractFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Novo contrato</SheetTitle>
          <SheetDescription>Vincule uma empresa terceirizada a uma obra.</SheetDescription>
        </div>

        <ContractFormBody key={open ? 'open' : 'closed'} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function ContractFormBody({ onDone }: { onDone: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateContract();

  const { data: contractorsData } = useContractors({ limit: 100, status: 'ACTIVE' });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: CONTRACT_FORM_DEFAULTS,
  });

  // `useWatch` e não `form.watch()`: o React Compiler não memoiza a função
  // devolvida por `watch` e desiste de otimizar o componente inteiro.
  const pricingType = useWatch({ control: form.control, name: 'pricingType' });

  async function onSubmit(values: ContractFormValues) {
    setSubmitError(null);
    try {
      const input: ContractInput = {
        contractorId: values.contractorId,
        constructionSiteId: values.constructionSiteId,
        scope: values.scope,
        totalValue: Number(values.totalValue),
        startDate: values.startDate,
        endDate: values.endDate,
        pricingType: values.pricingType,
        // Só vão no modelo unitário. Campo em branco vira `undefined`, e não
        // zero: no backend, ausente significa DESCONHECIDO, e o custo do
        // contrato aparece assim em vez de somar R$ 0,00.
        unitPrice:
          values.pricingType === 'UNIT' && values.unitPrice?.trim()
            ? Number(values.unitPrice)
            : undefined,
        unitLabel: values.pricingType === 'UNIT' ? values.unitLabel?.trim() || undefined : undefined,
        measuredQuantity:
          values.pricingType === 'UNIT' && values.measuredQuantity?.trim()
            ? Number(values.measuredQuantity)
            : undefined,
      };
      await createMutation.mutateAsync(input);
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível registrar o contrato. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="contract-form"
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
              name="contractorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Empresa Terceirizada</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a empresa" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contractorsData?.data.map((contractor) => (
                        <SelectItem key={contractor.id} value={contractor.id}>
                          {contractor.tradeName ?? contractor.legalName}
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
              name="constructionSiteId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Obra</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a obra" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {sitesData?.data.map((site) => (
                        <SelectItem key={site.id} value={site.id}>
                          {site.name}
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
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Escopo</FormLabel>
                  <FormControl>
                    <Textarea rows={3} placeholder="Descreva o serviço contratado" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="totalValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Valor total (R$)</FormLabel>
                  <FormControl>
                    <NumberInput placeholder="0,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data início</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="endDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data fim</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="pricingType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modelo de preço</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="GLOBAL">Preço global (valor fechado)</SelectItem>
                      <SelectItem value="UNIT">Preço unitário (por medição)</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Os campos de medição só existem no modelo unitário. No global o
                custo é o valor contratado, e um preço por m² ali seria
                informação que o cálculo ignora. */}
            {pricingType === 'UNIT' && (
              <div className="grid grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="unitPrice"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Preço unitário (R$)</FormLabel>
                      <FormControl>
                        <NumberInput placeholder="0,00" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="unitLabel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Unidade</FormLabel>
                      <FormControl>
                        <Input placeholder="m²" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="measuredQuantity"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Medido até agora</FormLabel>
                      <FormControl>
                        <NumberInput placeholder="—" {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            )}
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="contract-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
