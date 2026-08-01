import { z } from 'zod';

function isValidPositiveInt(value: string) {
  return /^\d+$/.test(value) && Number(value) > 0;
}

export const systemSettingsFormSchema = z.object({
  erpName: z.string().trim().min(1, 'Informe o nome do ERP.').max(100, 'Máximo de 100 caracteres.'),
  theme: z.enum(['LIGHT', 'DARK', 'SYSTEM']),
  language: z.string().min(1, 'Selecione o idioma.'),
  timezone: z.string().min(1, 'Selecione o fuso horário.'),
  currency: z.string().min(1, 'Selecione a moeda.'),
  dateFormat: z.string().min(1, 'Selecione o formato de data.'),
  firstDayOfWeek: z.string().min(1, 'Selecione o primeiro dia da semana.'),
  dueDateAlertDays: z
    .string()
    .refine(isValidPositiveInt, 'Informe um número inteiro maior que zero.'),
  maxUploadSizeMb: z
    .string()
    .refine(isValidPositiveInt, 'Informe um número inteiro maior que zero.'),
  // Alçada aceita zero: é assim que se desliga a exigência de aprovação.
  purchaseApprovalThreshold: z
    .string()
    .refine(
      (value) => value.trim() !== '' && Number(value) >= 0,
      'Informe um valor igual ou maior que zero.',
    ),
  paymentApprovalThreshold: z
    .string()
    .refine(
      (value) => value.trim() !== '' && Number(value) >= 0,
      'Informe um valor igual ou maior que zero.',
    ),
  allowAttachments: z.boolean(),
  notificationsEnabled: z.boolean(),
  auditEnabled: z.boolean(),
});

export type SystemSettingsFormValues = z.infer<typeof systemSettingsFormSchema>;

export const THEME_OPTIONS = [
  { value: 'LIGHT', label: 'Claro' },
  { value: 'DARK', label: 'Escuro' },
  { value: 'SYSTEM', label: 'Automático (sistema)' },
];

export const LANGUAGE_OPTIONS = [
  { value: 'pt-BR', label: 'Português (Brasil)' },
  { value: 'en-US', label: 'English (US)' },
  { value: 'es-ES', label: 'Español' },
];

export const TIMEZONE_OPTIONS = [
  { value: 'America/Sao_Paulo', label: 'São Paulo (UTC-3)' },
  { value: 'America/Manaus', label: 'Manaus (UTC-4)' },
  { value: 'America/Noronha', label: 'Fernando de Noronha (UTC-2)' },
  { value: 'UTC', label: 'UTC' },
];

export const CURRENCY_OPTIONS = [
  { value: 'BRL', label: 'Real (R$)' },
  { value: 'USD', label: 'Dólar (US$)' },
  { value: 'EUR', label: 'Euro (€)' },
];

export const DATE_FORMAT_OPTIONS = [
  { value: 'DD/MM/YYYY', label: 'DD/MM/AAAA' },
  { value: 'MM/DD/YYYY', label: 'MM/DD/AAAA' },
  { value: 'YYYY-MM-DD', label: 'AAAA-MM-DD' },
];

export const WEEKDAY_OPTIONS = [
  { value: '0', label: 'Domingo' },
  { value: '1', label: 'Segunda-feira' },
  { value: '6', label: 'Sábado' },
];
