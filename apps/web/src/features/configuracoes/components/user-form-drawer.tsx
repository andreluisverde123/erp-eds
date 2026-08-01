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

import { useCreateUser, useUpdateUser } from '../hooks/use-user-mutations';
import { useRoles } from '../hooks/use-roles';
import { USER_FORM_DEFAULTS, userFormSchema, type UserFormValues } from '../user-form-schema';
import type { User, UserInput } from '../types';

function userToFormValues(user: User): UserFormValues {
  return {
    name: user.name,
    email: user.email,
    password: '',
    phone: user.phone ?? '',
    position: user.position ?? '',
    roleId: user.roles[0]?.id ?? '',
  };
}

interface UserFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  user?: User;
}

export function UserFormDrawer({ open, onOpenChange, user }: UserFormDrawerProps) {
  const isEditing = Boolean(user);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{isEditing ? 'Editar usuário' : 'Novo usuário'}</SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Atualize os dados do usuário.'
              : 'Preencha os dados para cadastrar um usuário.'}
          </SheetDescription>
        </div>

        <UserFormBody
          key={open ? (user?.id ?? 'create') : 'closed'}
          user={user}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function UserFormBody({ user, onDone }: { user?: User; onDone: () => void }) {
  const isEditing = Boolean(user);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateUser();
  const updateMutation = useUpdateUser(user?.id ?? '');
  const { data: rolesData } = useRoles({ limit: 100 });

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: user ? userToFormValues(user) : USER_FORM_DEFAULTS,
  });

  async function onSubmit(values: UserFormValues) {
    setSubmitError(null);

    if (!isEditing && !values.password) {
      form.setError('password', { message: 'A senha é obrigatória.' });
      return;
    }

    try {
      if (isEditing) {
        const input: Partial<UserInput> = {
          name: values.name,
          email: values.email,
          phone: values.phone || undefined,
          position: values.position || undefined,
          roleId: values.roleId,
        };
        await updateMutation.mutateAsync(input);
      } else {
        const input: UserInput = {
          name: values.name,
          email: values.email,
          password: values.password,
          phone: values.phone || undefined,
          position: values.position || undefined,
          roleId: values.roleId,
        };
        await createMutation.mutateAsync(input);
      }
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar o usuário. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="user-form"
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

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>E-mail</FormLabel>
                  <FormControl>
                    <Input type="email" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            {!isEditing && (
              <FormField
                control={form.control}
                name="password"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha inicial</FormLabel>
                    <FormControl>
                      <Input type="password" placeholder="Ao menos 8 caracteres" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-2 gap-4">
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

              <FormField
                control={form.control}
                name="position"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cargo</FormLabel>
                    <FormControl>
                      <Input {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="roleId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Perfil</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Selecione o perfil" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {rolesData?.data.map((role) => (
                        <SelectItem key={role.id} value={role.id}>
                          {role.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
        <Button type="submit" form="user-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
