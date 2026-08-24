import { z } from 'zod';

/// Formulário de conta bancária.
///
/// As mesmas regras existem no backend (DTO + service) e são elas que valem —
/// esta camada só evita a viagem até a API para o erro óbvio. Nenhuma
/// validação daqui é a única: o servidor não confia no formulário.
///
/// PIX e titular de terceiro são BLOCOS: ou os dois campos, ou nenhum.
///
/// Na EDIÇÃO o número da conta pode ficar em branco, e isso significa "manter
/// o que está gravado". O formulário não tem como preenchê-lo: o valor não
/// chega mascarado por acaso — a tela nunca o recebeu.
export function makeBankAccountFormSchema(modo: 'criar' | 'editar') {
  const numeroDaConta =
    modo === 'criar'
      ? z.string().regex(/^\d{1,20}$/, 'Conta: de 1 a 20 dígitos, sem o dígito.')
      : z.string().regex(/^\d{0,20}$/, 'Conta: só dígitos, sem o dígito verificador.');

  return z
    .object({
      bankCode: z.string().regex(/^\d{3}$/, 'O código do banco tem 3 dígitos (ex.: 341).'),
      bankName: z.string().trim().min(1, 'Informe o nome do banco.').max(100),
      branch: z.string().regex(/^\d{1,6}$/, 'Agência: de 1 a 6 dígitos, sem o dígito.'),
      branchDigit: z.string().regex(/^[0-9Xx]?$/, 'Um caractere (0-9 ou X).'),
      accountType: z.enum(['CHECKING', 'SAVINGS', 'PAYMENT']),
      accountNumber: numeroDaConta,
      accountDigit: z.string().regex(/^[0-9Xx]?$/, 'Um caractere (0-9 ou X).'),
      pixKeyType: z.string(),
      pixKey: z.string().max(100),
      holderName: z.string().max(150),
      holderDocument: z.string().max(20),
    })
    .refine((values) => Boolean(values.pixKeyType) === Boolean(values.pixKey.trim()), {
      message: 'Informe o tipo e a chave PIX juntos.',
      path: ['pixKey'],
    })
    .refine(
      (values) => Boolean(values.holderName.trim()) === Boolean(values.holderDocument.trim()),
      {
        message: 'Titular de terceiro exige nome e CPF/CNPJ.',
        path: ['holderDocument'],
      },
    );
}

export type BankAccountFormValues = z.infer<ReturnType<typeof makeBankAccountFormSchema>>;

export const BANK_ACCOUNT_FORM_DEFAULTS: BankAccountFormValues = {
  bankCode: '',
  bankName: '',
  branch: '',
  branchDigit: '',
  accountType: 'CHECKING',
  accountNumber: '',
  accountDigit: '',
  pixKeyType: '',
  pixKey: '',
  holderName: '',
  holderDocument: '',
};
