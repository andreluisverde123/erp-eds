import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Form,
  FormControl,
  FormDescription,
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

import {
  BANK_ACCOUNT_FORM_DEFAULTS,
  makeBankAccountFormSchema,
  type BankAccountFormValues,
} from '../bank-account-form-schema';
import { useCreateBankAccount, useUpdateBankAccount } from '../hooks/use-bank-account-mutations';
import {
  BANK_ACCOUNT_TYPE_LABELS,
  PIX_KEY_TYPE_LABELS,
  type BankAccount,
  type BankAccountInput,
  type BankAccountType,
  type PixKeyType,
} from '../types';

interface BankAccountFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Dono da conta — só usado no cadastro; na edição ele não muda.
  ownerId: string;
  ownerName: string;
  /// Presente = edição.
  account?: BankAccount | null;
}

export function BankAccountFormDrawer({
  open,
  onOpenChange,
  ownerId,
  ownerName,
  account,
}: BankAccountFormDrawerProps) {
  const editando = Boolean(account);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>{editando ? 'Editar conta bancária' : 'Nova conta bancária'}</SheetTitle>
          <SheetDescription>
            Destino de pagamento de {ownerName}. Estes dados não disparam pagamento nenhum — ficam
            guardados para quando o Financeiro precisar deles.
          </SheetDescription>
        </div>

        {/* `key` remonta o formulário a cada abertura: sem isso o drawer
            reabriria com o que foi digitado da vez anterior. */}
        <BankAccountFormBody
          key={`${account?.id ?? 'nova'}-${open ? 'aberto' : 'fechado'}`}
          ownerId={ownerId}
          account={account ?? null}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function toDefaults(account: BankAccount | null): BankAccountFormValues {
  if (!account) return BANK_ACCOUNT_FORM_DEFAULTS;

  return {
    bankCode: account.bankCode,
    bankName: account.bankName,
    branch: account.branch,
    branchDigit: account.branchDigit ?? '',
    accountType: account.accountType,
    // Em branco de propósito: a tela nunca recebeu o número, só a máscara.
    accountNumber: '',
    accountDigit: account.accountDigit ?? '',
    pixKeyType: account.pixKeyType ?? '',
    // Idem: preencher com a máscara faria o usuário salvar "****8888" como
    // chave PIX.
    pixKey: '',
    holderName: account.holder.isOwner ? '' : (account.holder.name ?? ''),
    holderDocument: account.holder.isOwner ? '' : (account.holder.document ?? ''),
  };
}

function BankAccountFormBody({
  ownerId,
  account,
  onDone,
}: {
  ownerId: string;
  account: BankAccount | null;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const createMutation = useCreateBankAccount();
  const updateMutation = useUpdateBankAccount();
  const editando = Boolean(account);

  const form = useForm<BankAccountFormValues>({
    resolver: zodResolver(makeBankAccountFormSchema(editando ? 'editar' : 'criar')),
    defaultValues: toDefaults(account),
  });

  async function onSubmit(values: BankAccountFormValues) {
    setSubmitError(null);

    const comuns = {
      bankCode: values.bankCode,
      bankName: values.bankName,
      branch: values.branch,
      branchDigit: values.branchDigit || undefined,
      accountType: values.accountType as BankAccountType,
      accountDigit: values.accountDigit || undefined,
    };

    try {
      if (account) {
        await updateMutation.mutateAsync({
          id: account.id,
          input: {
            ...comuns,
            // Em branco = manter o que está gravado.
            ...(values.accountNumber ? { accountNumber: values.accountNumber } : {}),
            // String vazia é o que APAGA o bloco na API — ver o service.
            ...(values.pixKey
              ? { pixKeyType: values.pixKeyType as PixKeyType, pixKey: values.pixKey }
              : { pixKey: '' }),
            ...(values.holderName
              ? { holderName: values.holderName, holderDocument: values.holderDocument }
              : { holderName: '' }),
          },
        });
      } else {
        const input: BankAccountInput = {
          ownerType: 'USER',
          ownerId,
          ...comuns,
          accountNumber: values.accountNumber,
          ...(values.pixKey
            ? { pixKeyType: values.pixKeyType as PixKeyType, pixKey: values.pixKey }
            : {}),
          ...(values.holderName
            ? { holderName: values.holderName, holderDocument: values.holderDocument }
            : {}),
        };
        await createMutation.mutateAsync(input);
      }
      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a conta. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form
            id="bank-account-form"
            onSubmit={form.handleSubmit(onSubmit)}
            className="flex flex-col gap-4"
            noValidate
          >
            {submitError && (
              <Alert variant="destructive">
                <AlertTitle>{submitError}</AlertTitle>
              </Alert>
            )}

            <div className="grid grid-cols-[6rem_1fr] gap-4">
              <FormField
                control={form.control}
                name="bankCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Código</FormLabel>
                    <FormControl>
                      <Input placeholder="341" inputMode="numeric" maxLength={3} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Banco</FormLabel>
                    <FormControl>
                      <Input placeholder="Itaú Unibanco" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="grid grid-cols-[1fr_5rem] gap-4">
              <FormField
                control={form.control}
                name="branch"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Agência</FormLabel>
                    <FormControl>
                      <Input placeholder="1234" inputMode="numeric" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="branchDigit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dígito</FormLabel>
                    <FormControl>
                      <Input placeholder="—" maxLength={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="accountType"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Tipo de conta</FormLabel>
                  <Select value={field.value} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {Object.entries(BANK_ACCOUNT_TYPE_LABELS).map(([value, label]) => (
                        <SelectItem key={value} value={value}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid grid-cols-[1fr_5rem] gap-4">
              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Conta</FormLabel>
                    <FormControl>
                      <Input
                        placeholder={account ? account.accountNumberMasked : '567890'}
                        inputMode="numeric"
                        autoComplete="off"
                        {...field}
                      />
                    </FormControl>
                    {account && (
                      <FormDescription>
                        Em branco mantém a conta atual. O número gravado não é exibido aqui.
                      </FormDescription>
                    )}
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="accountDigit"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Dígito</FormLabel>
                    <FormControl>
                      <Input placeholder="—" maxLength={1} {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <div className="rounded-md border border-border p-4">
              <p className="mb-3 text-sm font-medium text-foreground">PIX (opcional)</p>

              <div className="grid grid-cols-[10rem_1fr] gap-4">
                <FormField
                  control={form.control}
                  name="pixKeyType"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de chave</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger className="w-full">
                            <SelectValue placeholder="Sem PIX" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(PIX_KEY_TYPE_LABELS).map(([value, label]) => (
                            <SelectItem key={value} value={value}>
                              {label}
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
                  name="pixKey"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Chave</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={account?.pixKeyMasked ?? 'chave PIX'}
                          autoComplete="off"
                          {...field}
                        />
                      </FormControl>
                      {account?.pixKeyMasked && (
                        <FormDescription>Em branco REMOVE a chave gravada.</FormDescription>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="rounded-md border border-border p-4">
              <p className="text-sm font-medium text-foreground">Titular</p>
              <p className="mb-3 text-xs text-muted-foreground">
                Preencha SOMENTE se a conta for de outra pessoa. Em branco, o titular é o próprio
                usuário.
              </p>

              <div className="flex flex-col gap-4">
                <FormField
                  control={form.control}
                  name="holderName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Nome do titular</FormLabel>
                      <FormControl>
                        <Input placeholder="—" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="holderDocument"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>CPF/CNPJ do titular</FormLabel>
                      <FormControl>
                        <Input placeholder="—" inputMode="numeric" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <Alert>
              <AlertDescription>
                Cadastro e edição ficam registrados na auditoria, sem os valores. Ver o número
                completo depois exige permissão própria.
              </AlertDescription>
            </Alert>
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="bank-account-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar conta'}
        </Button>
      </div>
    </>
  );
}
