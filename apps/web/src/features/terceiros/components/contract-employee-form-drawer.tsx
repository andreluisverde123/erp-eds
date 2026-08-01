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
  Switch,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import {
  CONTRACT_EMPLOYEE_FORM_DEFAULTS,
  contractEmployeeFormSchema,
  type ContractEmployeeFormValues,
} from '../contract-employee-form-schema';
import {
  useCreateContractEmployee,
  useUpdateContractEmployee,
} from '../hooks/use-contract-employee-mutations';
import { useContracts } from '../hooks/use-contracts';
import type { ContractEmployee, ContractEmployeeInput } from '../types';

function employeeToFormValues(employee: ContractEmployee): ContractEmployeeFormValues {
  return {
    contractId: employee.contract.id,
    name: employee.name,
    role: employee.role,
    isActive: employee.isActive,
  };
}

interface ContractEmployeeFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee?: ContractEmployee;
}

export function ContractEmployeeFormDrawer({
  open,
  onOpenChange,
  employee,
}: ContractEmployeeFormDrawerProps) {
  const isEditing = Boolean(employee);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>
            {isEditing ? 'Editar funcionário' : 'Novo funcionário terceirizado'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Atualize os dados do funcionário.'
              : 'Vincule um funcionário a um contrato.'}
          </SheetDescription>
        </div>

        <ContractEmployeeFormBody
          key={open ? (employee?.id ?? 'create') : 'closed'}
          employee={employee}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ContractEmployeeFormBody({
  employee,
  onDone,
}: {
  employee?: ContractEmployee;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateContractEmployee();
  const updateMutation = useUpdateContractEmployee(employee?.id ?? '');
  const { data: contractsData } = useContracts({ limit: 100 });

  const form = useForm<ContractEmployeeFormValues>({
    resolver: zodResolver(contractEmployeeFormSchema),
    defaultValues: employee ? employeeToFormValues(employee) : CONTRACT_EMPLOYEE_FORM_DEFAULTS,
  });

  async function onSubmit(values: ContractEmployeeFormValues) {
    setSubmitError(null);
    try {
      if (employee) {
        const input: Partial<ContractEmployeeInput> = {
          name: values.name,
          role: values.role,
          isActive: values.isActive,
        };
        await updateMutation.mutateAsync(input);
      } else {
        const input: ContractEmployeeInput = {
          contractId: values.contractId,
          name: values.name,
          role: values.role,
          isActive: values.isActive,
        };
        await createMutation.mutateAsync(input);
      }
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar o funcionário. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="contract-employee-form"
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
              name="contractId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Contrato</FormLabel>
                  <Select
                    value={field.value}
                    onValueChange={field.onChange}
                    disabled={Boolean(employee)}
                  >
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o contrato" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {contractsData?.data.map((contract) => (
                        <SelectItem key={contract.id} value={contract.id}>
                          {contract.code} —{' '}
                          {contract.contractor.tradeName ?? contract.contractor.legalName}
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
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="role"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Função</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex.: Vigilante, Auxiliar de Limpeza" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="isActive"
              render={({ field }) => (
                <FormItem className="flex flex-row items-center justify-between gap-4">
                  <FormLabel>Ativo</FormLabel>
                  <FormControl>
                    <Switch checked={field.value} onCheckedChange={field.onChange} />
                  </FormControl>
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
        <Button type="submit" form="contract-employee-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
