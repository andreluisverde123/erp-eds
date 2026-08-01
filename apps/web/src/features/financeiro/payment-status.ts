import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { PaymentRecordStatus } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const PAYMENT_STATUS_OPTIONS: { value: PaymentRecordStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'PROCESSING', label: 'Processando' },
  { value: 'PAID', label: 'Pago' },
  { value: 'REFUNDED', label: 'Estornado' },
];

const STATUS_LABEL: Record<PaymentRecordStatus, string> = Object.fromEntries(
  PAYMENT_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<PaymentRecordStatus, string>;

const STATUS_BADGE_VARIANT: Record<PaymentRecordStatus, BadgeVariant> = {
  PENDING: 'secondary',
  PROCESSING: 'info',
  PAID: 'success',
  REFUNDED: 'destructive',
};

/// Formas de pagamento pré-definidas pro Select do formulário. Só rótulos —
/// nenhuma integração bancária ou PIX por trás.
export const PAYMENT_METHOD_OPTIONS = [
  'Boleto',
  'Transferência Bancária',
  'Cartão de Crédito',
  'Cartão de Débito',
  'Dinheiro',
  'Cheque',
];

export function getPaymentStatusLabel(status: PaymentRecordStatus): string {
  return STATUS_LABEL[status];
}

export function getPaymentStatusBadgeVariant(status: PaymentRecordStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}
