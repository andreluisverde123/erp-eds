import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useNavigate } from 'react-router';
import { z } from 'zod';
import {
  Alert,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@repo/ui';

import { CompanyLogo } from '@/components/company-logo';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/features/auth/context';

const trocarSenhaSchema = z
  .object({
    currentPassword: z.string().min(1, 'Informe a senha atual.'),
    newPassword: z
      .string()
      .min(8, 'A nova senha deve ter ao menos 8 caracteres.')
      .max(72, 'A nova senha deve ter no máximo 72 caracteres.')
      .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'A nova senha deve conter ao menos uma letra e um número.'),
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'As senhas não conferem.',
  })
  .refine((values) => values.newPassword !== values.currentPassword, {
    path: ['newPassword'],
    message: 'A nova senha precisa ser diferente da atual.',
  });

type TrocarSenhaFormValues = z.infer<typeof trocarSenhaSchema>;

/// Tela obrigatória de primeiro acesso: quem entrou com senha definida por um
/// admin não consegue usar mais nada até trocá-la (a API bloqueia, não só o
/// front — ver `PasswordChangeGuard`).
export function TrocarSenhaPage() {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<TrocarSenhaFormValues>({
    resolver: zodResolver(trocarSenhaSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  // Quem já trocou não tem o que fazer aqui.
  if (user && !user.mustChangePassword) {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(values: TrocarSenhaFormValues) {
    setSubmitError(null);
    try {
      await changePassword(values.currentPassword, values.newPassword);
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível trocar a senha. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CompanyLogo />
          <CardTitle className="mt-3 text-xl font-semibold text-foreground">
            Defina sua senha
          </CardTitle>
          <CardDescription>
            Sua senha atual foi criada por um administrador. Escolha uma senha própria para
            continuar.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              {submitError && (
                <Alert variant="destructive">
                  <AlertTitle>{submitError}</AlertTitle>
                </Alert>
              )}

              <FormField
                control={form.control}
                name="currentPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Senha atual</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="current-password" {...field} />
                    </FormControl>
                    <FormDescription>A que você recebeu do administrador.</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="newPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nova senha</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormDescription>
                      Mínimo de 8 caracteres, com ao menos uma letra e um número.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="confirmPassword"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Confirme a nova senha</FormLabel>
                    <FormControl>
                      <Input type="password" autoComplete="new-password" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="mt-2 w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Salvando...' : 'Salvar e continuar'}
              </Button>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
