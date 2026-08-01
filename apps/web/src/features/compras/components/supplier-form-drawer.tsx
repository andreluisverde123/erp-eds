import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertTitle,
  Button,
  Form,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import {
  SUPPLIER_FORM_DEFAULTS,
  supplierFormSchema,
  toSupplierInput,
  type SupplierFormValues,
} from '../supplier-form-schema';
import { useCreateSupplier, useUpdateSupplier } from '../hooks/use-supplier-mutations';
import type { Supplier } from '../types';
import { SupplierFormFields } from './supplier-form-fields';

function supplierToFormValues(supplier: Supplier): SupplierFormValues {
  return {
    legalName: supplier.legalName,
    tradeName: supplier.tradeName ?? '',
    document: supplier.document,
    contactName: supplier.contactName ?? '',
    email: supplier.email ?? '',
    phone: supplier.phone ?? '',
    city: supplier.city ?? '',
    state: supplier.state ?? '',
  };
}

interface SupplierFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Presente = editando esse fornecedor; ausente = criando um novo.
  supplier?: Supplier;
}

export function SupplierFormDrawer({ open, onOpenChange, supplier }: SupplierFormDrawerProps) {
  const isEditing = Boolean(supplier);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{isEditing ? 'Editar fornecedor' : 'Novo fornecedor'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Atualize os dados do fornecedor.'
              : 'Preencha os dados para cadastrar um fornecedor.'}
          </SheetDescription>
        </div>

        <SupplierFormBody
          key={open ? (supplier?.id ?? 'create') : 'closed'}
          supplier={supplier}
          isEditing={isEditing}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function SupplierFormBody({
  supplier,
  isEditing,
  onDone,
}: {
  supplier?: Supplier;
  isEditing: boolean;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);

  const createMutation = useCreateSupplier();
  const updateMutation = useUpdateSupplier(supplier?.id ?? '');
  const mutation = isEditing ? updateMutation : createMutation;

  const form = useForm<SupplierFormValues>({
    resolver: zodResolver(supplierFormSchema),
    defaultValues: supplier ? supplierToFormValues(supplier) : SUPPLIER_FORM_DEFAULTS,
  });

  async function onSubmit(values: SupplierFormValues) {
    setSubmitError(null);
    try {
      await mutation.mutateAsync(toSupplierInput(values));
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar o fornecedor. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form id="supplier-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            {submitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>{submitError}</AlertTitle>
              </Alert>
            )}
            <SupplierFormFields control={form.control} />
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="supplier-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
