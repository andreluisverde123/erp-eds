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
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useConstructionSites } from '@/features/engenharia/hooks/use-construction-sites';
import { useCostCenters } from '@/features/engenharia/hooks/use-cost-centers';

import {
  EMPLOYEE_ALLOCATION_FORM_DEFAULTS,
  employeeAllocationFormSchema,
  type EmployeeAllocationFormValues,
} from '../employee-allocation-form-schema';
import { useCreateEmployeeAllocation } from '../hooks/use-employee-allocation-mutations';
import { useEmployees } from '../hooks/use-employees';
import type { EmployeeAllocationInput } from '../types';

export function EmployeeAllocationForm() {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateEmployeeAllocation();

  const { data: employeesData } = useEmployees({ limit: 100, status: 'ACTIVE' });
  const { data: sitesData } = useConstructionSites({ limit: 100 });

  const form = useForm<EmployeeAllocationFormValues>({
    resolver: zodResolver(employeeAllocationFormSchema),
    defaultValues: EMPLOYEE_ALLOCATION_FORM_DEFAULTS,
  });

  const constructionSiteId = useWatch({ control: form.control, name: 'constructionSiteId' });
  const { data: costCentersData } = useCostCenters({
    constructionSiteId,
    limit: 100,
    enabled: Boolean(constructionSiteId),
  });

  async function onSubmit(values: EmployeeAllocationFormValues) {
    setSubmitError(null);
    try {
      const input: EmployeeAllocationInput = {
        employeeId: values.employeeId,
        constructionSiteId: values.constructionSiteId,
        costCenterId: values.costCenterId || undefined,
        startDate: values.startDate,
        endDate: values.endDate || undefined,
      };
      await createMutation.mutateAsync(input);
      form.reset(EMPLOYEE_ALLOCATION_FORM_DEFAULTS);
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível registrar a alocação. Tente novamente.',
      );
    }
  }

  return (
    <Card>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>{submitError}</AlertTitle>
              </Alert>
            )}

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

            <div className="flex justify-end">
              <Button type="submit" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Alocando...' : 'Alocar Funcionário'}
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
