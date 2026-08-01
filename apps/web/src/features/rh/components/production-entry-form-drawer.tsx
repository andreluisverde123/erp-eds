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
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { useCostCenters } from '@/features/engenharia/hooks/use-cost-centers';

import { useCreateProductionEntry } from '../hooks/use-production-entry-mutations';
import { useEmployees } from '../hooks/use-employees';
import {
  PRODUCTION_ENTRY_FORM_DEFAULTS,
  productionEntryFormSchema,
  type ProductionEntryFormValues,
} from '../production-entry-form-schema';
import type { ProductionEntryInput } from '../types';

interface ProductionEntryFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProductionEntryFormDrawer({ open, onOpenChange }: ProductionEntryFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Registrar produção</SheetTitle>
          <SheetDescription>
            Aponte o serviço executado por um funcionário na obra.
          </SheetDescription>
        </div>

        <ProductionEntryFormBody
          key={open ? 'open' : 'closed'}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ProductionEntryFormBody({ onDone }: { onDone: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateProductionEntry();

  const { data: employeesData } = useEmployees({ limit: 100, status: 'ACTIVE' });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const form = useForm<ProductionEntryFormValues>({
    resolver: zodResolver(productionEntryFormSchema),
    defaultValues: PRODUCTION_ENTRY_FORM_DEFAULTS,
  });

  const constructionSiteId = useWatch({ control: form.control, name: 'constructionSiteId' });
  const { data: costCentersData } = useCostCenters({
    constructionSiteId,
    limit: 100,
    enabled: Boolean(constructionSiteId),
  });

  async function onSubmit(values: ProductionEntryFormValues) {
    setSubmitError(null);
    try {
      const input: ProductionEntryInput = {
        employeeId: values.employeeId,
        constructionSiteId: values.constructionSiteId,
        costCenterId: values.costCenterId || undefined,
        date: values.date,
        description: values.description,
        quantity: Number(values.quantity),
        unit: values.unit,
      };
      await createMutation.mutateAsync(input);
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível registrar a produção. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="production-entry-form"
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
              name="employeeId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Funcionário</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o funcionário" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {employeesData?.data.map((employee) => (
                        <SelectItem key={employee.id} value={employee.id}>
                          {employee.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
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
                        form.setValue('costCenterId', '');
                      }}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Selecione" />
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
                name="costCenterId"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Centro de Custo</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={!constructionSiteId}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Opcional" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {costCentersData?.data.map((costCenter) => (
                          <SelectItem key={costCenter.id} value={costCenter.id}>
                            {costCenter.name}
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
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Serviço executado</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Alvenaria de vedação" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem className="col-span-2">
                    <FormLabel>Quantidade</FormLabel>
                    <FormControl>
                      {/* Quantidade produzida não é dinheiro: `decimal` deixa
                          digitar "10" e ler dez (a máscara de centavos lia
                          0,10), mantendo fração pra unidades como m³/m². */}
                      <NumberInput placeholder="0" mode="decimal" decimalScale={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="unit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Unidade</FormLabel>
                    <FormControl>
                      <Input placeholder="M2" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Data</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
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
        <Button type="submit" form="production-entry-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Registrar Produção'}
        </Button>
      </div>
    </>
  );
}
