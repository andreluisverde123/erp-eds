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

import {
  EMPLOYEE_FORM_DEFAULTS,
  employeeFormSchema,
  type EmployeeFormValues,
} from '../employee-form-schema';
import { EMPLOYEE_STATUS_OPTIONS } from '../employee-status';
import { useCreateEmployee, useUpdateEmployee } from '../hooks/use-employee-mutations';
import type { Employee, EmployeeInput } from '../types';

function employeeToFormValues(employee: Employee): EmployeeFormValues {
  return {
    name: employee.name,
    cpf: employee.cpf,
    position: employee.position,
    status: employee.status,
    hireDate: employee.hireDate.slice(0, 10),
    terminationDate: employee.terminationDate?.slice(0, 10) ?? '',
    baseSalary: employee.baseSalary ?? '',
  };
}

function toEmployeeInput(values: EmployeeFormValues): EmployeeInput {
  return {
    name: values.name,
    cpf: values.cpf,
    position: values.position,
    status: values.status,
    hireDate: values.hireDate,
    terminationDate: values.terminationDate || undefined,
    baseSalary: values.baseSalary ? Number(values.baseSalary) : undefined,
  };
}

interface EmployeeFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Presente = editando esse funcionário; ausente = criando um novo.
  employee?: Employee;
}

export function EmployeeFormDrawer({ open, onOpenChange, employee }: EmployeeFormDrawerProps) {
  const isEditing = Boolean(employee);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{isEditing ? 'Editar funcionário' : 'Novo funcionário'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Atualize os dados do funcionário.'
              : 'Preencha os dados para cadastrar um funcionário.'}
          </SheetDescription>
        </div>

        <EmployeeFormBody
          key={open ? (employee?.id ?? 'create') : 'closed'}
          employee={employee}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function EmployeeFormBody({ employee, onDone }: { employee?: Employee; onDone: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee(employee?.id ?? '');

  const form = useForm<EmployeeFormValues>({
    resolver: zodResolver(employeeFormSchema),
    defaultValues: employee ? employeeToFormValues(employee) : EMPLOYEE_FORM_DEFAULTS,
  });

  async function onSubmit(values: EmployeeFormValues) {
    setSubmitError(null);
    try {
      if (employee) {
        await updateMutation.mutateAsync(toEmployeeInput(values));
      } else {
        // status nunca vai no create — todo funcionário sempre nasce ACTIVE
        // (o backend nem aceita esse campo nessa rota).
        const { status: _status, ...createInput } = toEmployeeInput(values);
        await createMutation.mutateAsync(createInput);
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
            id="employee-form"
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
                    <Input placeholder="Nome completo" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="cpf"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CPF</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        placeholder="Só números"
                        maxLength={11}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Pedreiro" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="hireDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de admissão</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {employee ? (
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
                          {EMPLOYEE_STATUS_OPTIONS.map((option) => (
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
              ) : (
                <div />
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="baseSalary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salário base (R$)</FormLabel>
                    <FormControl>
                      <NumberInput placeholder="0,00" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="terminationDate"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data de desligamento</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
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
        <Button type="submit" form="employee-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
