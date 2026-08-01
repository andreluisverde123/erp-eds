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
  Textarea,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useCreateRole, useUpdateRole } from '../hooks/use-role-mutations';
import { usePermissions } from '../hooks/use-permissions';
import { PermissionCheckboxGroup } from './permission-checkbox-group';
import {
  ROLE_FORM_DEFAULTS,
  ROLE_TYPE_OPTIONS,
  roleFormSchema,
  type RoleFormValues,
} from '../role-form-schema';
import type { Role } from '../types';

function roleToFormValues(role: Role): RoleFormValues {
  return {
    name: role.name,
    type: role.type,
    description: role.description ?? '',
    permissionCodes: role.permissionCodes,
  };
}

interface RoleFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  role?: Role;
}

export function RoleFormDrawer({ open, onOpenChange, role }: RoleFormDrawerProps) {
  const isEditing = Boolean(role);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-xl">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{isEditing ? 'Editar perfil' : 'Novo perfil'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Atualize o perfil e suas permissões.'
              : 'Crie um perfil personalizado e marque as permissões.'}
          </SheetDescription>
        </div>

        <RoleFormBody
          key={open ? (role?.id ?? 'create') : 'closed'}
          role={role}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function RoleFormBody({ role, onDone }: { role?: Role; onDone: () => void }) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateRole();
  const updateMutation = useUpdateRole(role?.id ?? '');
  const { data: permissions } = usePermissions();

  const form = useForm<RoleFormValues>({
    resolver: zodResolver(roleFormSchema),
    defaultValues: role ? roleToFormValues(role) : ROLE_FORM_DEFAULTS,
  });

  async function onSubmit(values: RoleFormValues) {
    setSubmitError(null);
    try {
      const input = {
        name: values.name,
        type: values.type,
        description: values.description || undefined,
        permissionCodes: values.permissionCodes,
      };
      if (role) {
        await updateMutation.mutateAsync(input);
      } else {
        await createMutation.mutateAsync(input);
      }
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar o perfil. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="role-form"
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
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Ex.: Diretoria" disabled={role?.isSystem} {...field} />
                    </FormControl>
                    {role?.isSystem && (
                      <p className="text-xs text-muted-foreground">
                        Papéis padrão do sistema não podem ser renomeados.
                      </p>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLE_TYPE_OPTIONS.map((option) => (
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

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Descrição</FormLabel>
                  <FormControl>
                    <Textarea rows={2} placeholder="Opcional" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="permissionCodes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Permissões</FormLabel>
                  <FormControl>
                    <PermissionCheckboxGroup
                      permissions={permissions ?? []}
                      selectedCodes={field.value}
                      onChange={field.onChange}
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
        <Button type="submit" form="role-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
