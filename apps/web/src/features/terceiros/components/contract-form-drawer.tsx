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
import { useCreateContract, useUpdateContract } from '../hooks/use-contract-mutations';
import { useContractors } from '../hooks/use-contractors';
import type { Contract, ContractInput, ContractUpdateInput } from '../types';

interface ContractFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Contrato em edição. Ausente = contrato novo.
  contract?: Contract | null;
  /// Chamado com o contrato salvo (novo ou editado) — a seção gera o PDF em
  /// seguida, para o documento nunca ficar com os dados antigos.
  onSaved?: (contract: Contract) => void;
}

/// NOVO CONTRATO ou EDIÇÃO: só o que muda de um contrato para outro.
///
/// Contratada, obra, objeto, prazo, preço e forma de pagamento. As demais
/// cláusulas são o modelo padrão e entram sozinhas no PDF, gerado ao salvar
/// (ver `contract-document.ts` na API).
///
/// Na edição a contratada fica travada: a API não troca a empresa de um
/// contrato (encerra este e cria outro). Contrato encerrado não abre aqui.
export function ContractFormDrawer({
  open,
  onOpenChange,
  contract,
  onSaved,
}: ContractFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{contract ? `Editar contrato ${contract.code}` : 'Novo contrato'}</SheetTitle>
          <SheetDescription>
            {contract
              ? 'Altere os dados do contrato. O PDF é gerado de novo ao salvar.'
              : 'Preencha os dados do contrato. As demais cláusulas são padrão e o PDF é gerado ao salvar.'}
          </SheetDescription>
        </div>

        <ContractFormBody
          key={open ? `open-${contract?.id ?? 'novo'}` : 'closed'}
          contract={contract ?? null}
          onDone={() => onOpenChange(false)}
          onSaved={onSaved}
        />
      </SheetContent>
    </Sheet>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <h3 className="pt-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
      {children}
    </h3>
  );
}

/// Valores do formulário a partir de um contrato salvo. Datas vêm em ISO UTC
/// e o `<input type="date">` quer só `AAAA-MM-DD`.
function toFormValues(contract: Contract): ContractFormValues {
  return {
    contractorId: contract.contractor.id,
    constructionSiteId: contract.constructionSite.id,
    scope: contract.scope,
    paymentTerms: contract.paymentTerms ?? '',
    totalValue: contract.totalValue,
    startDate: contract.startDate.slice(0, 10),
    endDate: contract.endDate.slice(0, 10),
    pricingType: contract.pricingType,
    unitPrice: contract.unitPrice ?? '',
    unitLabel: contract.unitLabel ?? '',
    measuredQuantity: contract.measuredQuantity ?? '',
  };
}

function ContractFormBody({
  contract,
  onDone,
  onSaved,
}: {
  contract: Contract | null;
  onDone: () => void;
  onSaved?: (contract: Contract) => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateContract();
  const updateMutation = useUpdateContract(contract?.id ?? '');

  const { data: contractorsData } = useContractors({ limit: 100, status: 'ACTIVE' });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const form = useForm<ContractFormValues>({
    resolver: zodResolver(contractFormSchema),
    defaultValues: contract ? toFormValues(contract) : CONTRACT_FORM_DEFAULTS,
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
        paymentTerms: values.paymentTerms,
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
        unitLabel:
          values.pricingType === 'UNIT' ? values.unitLabel?.trim() || undefined : undefined,
        measuredQuantity:
          values.pricingType === 'UNIT' && values.measuredQuantity?.trim()
            ? Number(values.measuredQuantity)
            : undefined,
      };
      if (contract) {
        // Na edição, campo do modelo unitário em branco vai como `null` para
        // APAGAR o valor antigo (trocar para preço global, limpar a medição).
        // `undefined` o deixaria no banco.
        const { contractorId: _contractorId, ...rest } = input;
        const update: ContractUpdateInput = {
          ...rest,
          unitPrice: input.unitPrice ?? null,
          unitLabel: input.unitLabel ?? null,
          measuredQuantity: input.measuredQuantity ?? null,
        };
        const saved = await updateMutation.mutateAsync(update);
        onDone();
        onSaved?.(saved);
        return;
      }
      const created = await createMutation.mutateAsync(input);
      onDone();
      onSaved?.(created);
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

            <SectionTitle>Partes</SectionTitle>

            <FormField
              control={form.control}
              name="contractorId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contratada</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={contract !== null}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione a empresa terceirizada" />
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

            <SectionTitle>Objeto</SectionTitle>

            <FormField
              control={form.control}
              name="scope"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Objeto do contrato</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={4}
                      placeholder="Ex.: execução de alvenaria de vedação do bloco A, conforme projeto"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <SectionTitle>Prazo</SectionTitle>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="startDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Início</FormLabel>
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
                    <FormLabel>Término</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <SectionTitle>Preço</SectionTitle>

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

            <FormField
              control={form.control}
              name="totalValue"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>
                    {pricingType === 'UNIT' ? 'Valor total estimado (R$)' : 'Valor total (R$)'}
                  </FormLabel>
                  <FormControl>
                    <NumberInput placeholder="0,00" {...field} />
                  </FormControl>
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

            <SectionTitle>Forma de pagamento</SectionTitle>

            <FormField
              control={form.control}
              name="paymentTerms"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Condições de pagamento</FormLabel>
                  <FormControl>
                    <Textarea
                      rows={3}
                      placeholder="Ex.: medições quinzenais, com pagamento em até 10 dias após a aprovação da medição e a emissão da nota fiscal"
                      {...field}
                    />
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
        <Button type="submit" form="contract-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar e gerar PDF'}
        </Button>
      </div>
    </>
  );
}
