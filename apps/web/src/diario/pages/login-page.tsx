import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate, type Location } from 'react-router';
import { z } from 'zod';
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
} from '@repo/ui';

import { CompanyLogo } from '@/components/company-logo';
import { useAuth } from '@/features/auth/context';
import { ApiError } from '@/lib/api-client';

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function redirectPath(location: Location): string {
  const from = (location.state as { from?: Location } | null)?.from;
  return from ? `${from.pathname}${from.search}` : '/';
}

/// Login do Diário. MESMAS credenciais, MESMO endpoint (`POST /auth/login`),
/// mesmo cookie de sessão — não existe segunda conta e nem segundo banco de
/// usuários. O que muda é só a tela: campos altos, teclado de e-mail e um
/// botão que ocupa a largura toda, para ser usado com uma mão só, de pé, na
/// obra.
///
/// Sessão compartilhada entre o ERP e o Diário (entrar num e já estar dentro
/// do outro) depende do cookie de refresh valer para o domínio inteiro —
/// `REFRESH_COOKIE_DOMAIN=.gestaoeds.com.br` na API. Sem essa variável cada
/// subdomínio mantém a própria sessão, e esta tela aparece uma vez por
/// aparelho.
export function DiarioLoginPage() {
  const { status, login } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (status === 'authenticated') {
    return <Navigate to={redirectPath(location)} replace />;
  }

  async function onSubmit(values: LoginFormValues) {
    setSubmitError(null);
    try {
      await login(values.email, values.password);
      navigate(redirectPath(location), { replace: true });
    } catch (error) {
      setSubmitError(
        error instanceof ApiError ? error.message : 'Não foi possível entrar. Tente novamente.',
      );
    }
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-sm flex-col justify-center px-6 py-10">
      <CompanyLogo className="h-9 w-auto max-w-none" />
      <h1 className="mt-5 text-2xl font-semibold leading-tight text-foreground">Diário de Obras</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Entre com o mesmo e-mail e senha do sistema da EDS.
      </p>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="mt-7 flex flex-col gap-4"
          noValidate
        >
          {submitError && (
            <Alert variant="destructive">
              <AlertTitle>{submitError}</AlertTitle>
            </Alert>
          )}

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>E-mail</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    inputMode="email"
                    autoCapitalize="none"
                    autoComplete="username"
                    placeholder="voce@empresa.com"
                    className="h-12 text-base"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="password"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Senha</FormLabel>
                <FormControl>
                  <Input
                    type="password"
                    autoComplete="current-password"
                    placeholder="••••••••"
                    className="h-12 text-base"
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button
            type="submit"
            size="lg"
            disabled={form.formState.isSubmitting}
            className="mt-2 h-12 text-base"
          >
            {form.formState.isSubmitting ? 'Entrando…' : 'Entrar'}
          </Button>
        </form>
      </Form>
    </div>
  );
}
