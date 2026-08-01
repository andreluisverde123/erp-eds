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

import {
  CONTRACTOR_FORM_DEFAULTS,
  contractorFormSchema,
  type ContractorFormValues,
} from '../contractor-form-schema';
import { CONTRACTOR_STATUS_OPTIONS } from '../contractor-status';
import { useCreateContractor, useUpdateContractor } from '../hooks/use-contractor-mutations';
import type { Contractor, ContractorInput } from '../types';

function contractorToFormValues(contractor: Contractor): ContractorFormValues {
  return {
    legalName: contractor.legalName,
    tradeName: contractor.tradeName ?? '',
    document: contractor.document,
    specialty: contractor.specialty ?? '',
    responsibleName: contractor.responsibleName ?? '',
    status: contractor.status,
    email: contractor.email ?? '',
    phone: contractor.phone ?? '',
    city: contractor.city ?? '',
    state: contractor.state ?? '',
  };
}

function toContractorInput(values: ContractorFormValues): ContractorInput {
  return {
    legalName: values.legalName,
    tradeName: values.tradeName || undefined,
    document: values.document,
    specialty: values.specialty || undefined,
    responsibleName: values.responsibleName || undefined,
    status: values.status,
    email: values.email || undefined,
    phone: values.phone || undefined,
    city: values.city || undefined,
    state: values.state || undefined,
  };
}

interface ContractorFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contractor?: Contractor;
}

export function ContractorFormDrawer({
  open,
  onOpenChange,
  contractor,
}: ContractorFormDrawerProps) {
  const isEditing = Boolean(contractor);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>
            {isEditing ? 'Editar empresa terceirizada' : 'Nova empresa terceirizada'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Atualize os dados da empresa.'
              : 'Preencha os dados para cadastrar uma empresa.'}
          </SheetDescription>
        </div>

        <ContractorFormBody
          key={open ? (contractor?.id ?? 'create') : 'closed'}
          contractor={contractor}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ContractorFormBody({
  contractor,
  onDone,
}: {
  contractor?: Contractor;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateContractor();
  const updateMutation = useUpdateContractor(contractor?.id ?? '');

  const form = useForm<ContractorFormValues>({
    resolver: zodResolver(contractorFormSchema),
    defaultValues: contractor ? contractorToFormValues(contractor) : CONTRACTOR_FORM_DEFAULTS,
  });

  async function onSubmit(values: ContractorFormValues) {
    setSubmitError(null);
    try {
      const input = toContractorInput(values);
      if (contractor) {
        await updateMutation.mutateAsync(input);
      } else {
        await createMutation.mutateAsync(input);
      }
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a empresa. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="contractor-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>{submitError}</AlertTitle>
              </Alert>
            )}

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="legalName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Razão Social</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="tradeName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome Fantasia</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="document"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CNPJ/CPF</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="specialty"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Especialidade</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Limpeza, Segurança" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="responsibleName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Responsável</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CONTRACTOR_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>E-mail</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefone</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="city"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cidade</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="state"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Estado (UF)</FormLabel>
                    <FormControl>
                      <Input maxLength={2} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="contractor-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
