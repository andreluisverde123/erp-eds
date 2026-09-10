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

import { useCreatePayslip } from '../hooks/use-payslip-mutations';
import { useEmployees } from '../hooks/use-employees';
import {
  MONTH_OPTIONS,
  PAYSLIP_FORM_DEFAULTS,
  payslipFormSchema,
  type PayslipFormValues,
} from '../payslip-form-schema';
import type { PayslipInput } from '../types';

interface PayslipFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PayslipFormDrawer({ open, onOpenChange }: PayslipFormDrawerProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-md">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>Novo holerite</SheetTitle>
          <SheetDescription>
            Registre o holerite de um funcionário para uma competência.
          </SheetDescription>
        </div>

        <PayslipFormBody key={open ? 'open' : 'closed'} onDone={() => onOpenChange(false)} />
      </SheetContent>
    </Sheet>
  );
}

function PayslipFormBody({ onDone }: { onDone: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreatePayslip();

  const { data: employeesData } = useEmployees({ limit: 100 });

  const form = useForm<PayslipFormValues>({
    resolver: zodResolver(payslipFormSchema),
    defaultValues: PAYSLIP_FORM_DEFAULTS,
  });

  async function onSubmit(values: PayslipFormValues) {
    setSubmitError(null);
    try {
      const input: PayslipInput = {
        employeeId: values.employeeId,
        referenceYear: Number(values.referenceYear),
        referenceMonth: Number(values.referenceMonth),
        grossSalary: Number(values.grossSalary),
        deductions: Number(values.deductions),
        netSalary: Number(values.netSalary),
        // Campo vazio vira `undefined`, e não `0`: no backend, ausente
        // significa DESCONHECIDO. Um zero afirmaria que a empresa não gastou
        // nada com encargos naquele mês, e o custo somaria isso como verdade.
        employerCharges: values.employerCharges?.trim()
          ? Number(values.employerCharges)
          : undefined,
        benefits: values.benefits?.trim() ? Number(values.benefits) : undefined,
        provisions: values.provisions?.trim() ? Number(values.provisions) : undefined,
      };
      await createMutation.mutateAsync(input);
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível registrar o holerite. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="payslip-form"
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
                name="referenceMonth"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Mês</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {MONTH_OPTIONS.map((option) => (
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

              <FormField
                control={form.control}
                name="referenceYear"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ano</FormLabel>
                    <FormControl>
                      <Input inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="grossSalary"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Salário bruto (R$)</FormLabel>
                  <FormControl>
                    <Input inputMode="decimal" placeholder="0,00" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="deductions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Descontos (R$)</FormLabel>
                    <FormControl>
                      <NumberInput placeholder="0,00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="netSalary"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Salário líquido (R$)</FormLabel>
                    <FormControl>
                      <NumberInput placeholder="0,00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* CUSTO DO EMPREGADOR — o que a empresa paga ALÉM do salário
                bruto. Os descontos acima são do empregado (INSS e IRRF retidos)
                e já estão dentro do bruto; não são custo da empresa.

                Deixar em branco não é erro: significa "ainda não sei", e o
                relatório de custo por obra mostra o mês como parcial em vez de
                apresentar só o salário como se fosse o custo do funcionário. */}
            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <p className="text-sm font-medium text-foreground">Custo do empregador</p>
              <p className="text-xs text-muted-foreground">
                Opcional. Em branco, o custo da obra sai marcado como parcial.
              </p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="employerCharges"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Encargos (R$)</FormLabel>
                    <FormControl>
                      <NumberInput placeholder="—" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="benefits"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Benefícios (R$)</FormLabel>
                    <FormControl>
                      <NumberInput placeholder="—" {...field} value={field.value ?? ''} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="provisions"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>13º e férias (R$)</FormLabel>
                    <FormControl>
                      <NumberInput placeholder="—" {...field} value={field.value ?? ''} />
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
        <Button type="submit" form="payslip-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
