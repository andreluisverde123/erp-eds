import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { TriangleAlert } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate, type Location } from 'react-router';
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
} from '@repo/ui';

import { CompanyLogo } from '@/components/company-logo';
import { PAYMENT_PENDING_CODE, PAYMENT_PENDING_LOGIN_NOTICE } from '@/config/billing-notice';
import { APP_NAME } from '@/config/company';
import { ApiError } from '@/lib/api-client';
import { useAuth } from '@/features/auth/context';

const loginSchema = z.object({
  email: z.string().email('Informe um e-mail válido.'),
  password: z.string().min(8, 'A senha deve ter ao menos 8 caracteres.'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

function redirectPath(location: Location): string {
  const from = (location.state as { from?: Location } | null)?.from;
  return from ? `${from.pathname}${from.search}` : '/dashboard';
}

export function LoginPage() {
  const { status, login, paymentPending: sessionDroppedForPayment } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);
  // Antes de qualquer tentativa, vale o que o provider sabe (a sessão caiu pela
  // suspensão, inclusive se isso for descoberto com a tela já aberta). Depois,
  // a última tentativa de login decide.
  const [attemptPaymentPending, setPaymentPending] = useState<boolean | null>(null);
  const paymentPending = attemptPaymentPending ?? sessionDroppedForPayment;

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
      // A API só manda este código depois de conferir a senha, então quem
      // erra a senha não descobre que a empresa está suspensa.
      if (error instanceof ApiError && error.code === PAYMENT_PENDING_CODE) {
        setPaymentPending(true);
        return;
      }
      setPaymentPending(false);
      setSubmitError(
        error instanceof ApiError ? error.message : 'Não foi possível entrar. Tente novamente.',
      );
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CompanyLogo />
          <CardTitle className="mt-3 text-xl font-semibold text-foreground">Entrar</CardTitle>
          <CardDescription>Acesse o {APP_NAME} com suas credenciais.</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4" noValidate>
              {paymentPending && <PaymentPendingBanner />}

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
                        placeholder="voce@empresa.com"
                        autoComplete="email"
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
                        placeholder="••••••••"
                        autoComplete="current-password"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" disabled={form.formState.isSubmitting} className="mt-2">
                {form.formState.isSubmitting ? 'Entrando...' : 'Entrar'}
              </Button>

              {/* Sem convite para criar conta: o acesso ao ERP da EDS é
                  concedido por um administrador em Configurações → Usuários,
                  nunca por auto-cadastro. */}
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}

/// Mesmo âmbar da faixa de "Fatura em atraso" (`BillingNoticeBanner`): é o
/// mesmo assunto, só que agora com o acesso já cortado.
function PaymentPendingBanner() {
  const { title, message, contact } = PAYMENT_PENDING_LOGIN_NOTICE;

  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg border-2 border-amber-400 bg-amber-100 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/15 dark:text-amber-100"
    >
      <TriangleAlert className="mt-0.5 size-5 shrink-0" strokeWidth={2.25} />
      <div className="min-w-0">
        <p className="font-bold">{title}</p>
        <p className="mt-1 text-amber-900 dark:text-amber-100/90">{message}</p>
        {contact ? <p className="mt-1 font-semibold">{contact}</p> : null}
      </div>
    </div>
  );
}
