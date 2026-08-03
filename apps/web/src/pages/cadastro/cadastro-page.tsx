import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useNavigate } from 'react-router';
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
  Checkbox,
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

/// Mesmas regras do backend (`SignupDto`): validar aqui evita ida ao servidor
/// para erro óbvio, mas quem manda é a API — nenhuma destas checagens
/// substitui a validação de lá.
const cadastroSchema = z.object({
  name: z.string().trim().min(1, 'Informe seu nome.').max(120, 'Nome muito longo.'),
  email: z.string().trim().email('Informe um e-mail válido.').max(180),
  password: z
    .string()
    .min(8, 'A senha deve ter ao menos 8 caracteres.')
    .max(72, 'A senha deve ter no máximo 72 caracteres.')
    .regex(/(?=.*[A-Za-z])(?=.*\d)/, 'A senha deve conter ao menos uma letra e um número.'),
  companyName: z
    .string()
    .trim()
    .min(1, 'Informe o nome da construtora.')
    .max(120, 'Nome muito longo.'),
  acceptedTerms: z.literal(true, { message: 'É preciso aceitar os termos de uso.' }),
});

type CadastroFormValues = z.infer<typeof cadastroSchema>;

export function CadastroPage() {
  const { status, signup } = useAuth();
  const navigate = useNavigate();
  const [submitError, setSubmitError] = useState<string | null>(null);

  const form = useForm<CadastroFormValues>({
    resolver: zodResolver(cadastroSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      companyName: '',
      acceptedTerms: false as unknown as true,
    },
  });

  if (status === 'authenticated') {
    return <Navigate to="/dashboard" replace />;
  }

  async function onSubmit(values: CadastroFormValues) {
    setSubmitError(null);
    try {
      await signup(values);
      // O backend devolve a sessão junto com o cadastro, então já entra logado.
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível criar a conta. Tente novamente em instantes.',
      );
    }
  }

  return (
    <div className="flex min-h-svh items-center justify-center bg-muted/30 px-4 py-10">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CompanyLogo />
          <CardTitle className="mt-3 text-xl font-semibold text-foreground">Criar conta</CardTitle>
          <CardDescription>
            Cadastre sua construtora e comece a usar o ERP. Os dados fiscais podem ser preenchidos
            depois.
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
                name="companyName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome da construtora</FormLabel>
                    <FormControl>
                      <Input
                        placeholder="Construtora Horizonte"
                        autoComplete="organization"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Seu nome</FormLabel>
                    <FormControl>
                      <Input placeholder="Maria Souza" autoComplete="name" {...field} />
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
                      <Input
                        type="email"
                        placeholder="voce@construtora.com.br"
                        autoComplete="email"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>É com ele que você vai entrar no sistema.</FormDescription>
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
                name="acceptedTerms"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-start gap-2">
                      <FormControl>
                        <Checkbox
                          checked={field.value}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                          aria-invalid={Boolean(form.formState.errors.acceptedTerms)}
                        />
                      </FormControl>
                      <FormLabel className="text-sm font-normal leading-snug text-muted-foreground">
                        Li e aceito os termos de uso e a política de privacidade.
                      </FormLabel>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button type="submit" className="mt-2 w-full" disabled={form.formState.isSubmitting}>
                {form.formState.isSubmitting ? 'Criando conta...' : 'Criar conta'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                Já tem conta?{' '}
                <Link
                  to="/login"
                  className="font-medium text-foreground underline-offset-4 hover:underline"
                >
                  Entrar
                </Link>
              </p>
            </form>
          </Form>
        </CardContent>
      </Card>
    </div>
  );
}
