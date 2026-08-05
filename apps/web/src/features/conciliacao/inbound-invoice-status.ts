import type { badgeVariants } from '@repo/ui';
import type { VariantProps } from 'class-variance-authority';

import type { InboundInvoiceStatus, PaymentMethod, PaymentTerms } from './types';

type BadgeVariant = VariantProps<typeof badgeVariants>['variant'];

export const INBOUND_INVOICE_STATUS_OPTIONS: { value: InboundInvoiceStatus; label: string }[] = [
  { value: 'PENDING', label: 'Pendente' },
  { value: 'RECONCILED', label: 'Conciliada' },
  { value: 'DIVERGENT', label: 'Divergência' },
  { value: 'CANCELLED', label: 'Cancelada' },
];

const STATUS_LABEL: Record<InboundInvoiceStatus, string> = Object.fromEntries(
  INBOUND_INVOICE_STATUS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<InboundInvoiceStatus, string>;

/// Mesmas variantes já usadas no resto do financeiro, sem cor nova: âmbar para
/// o que espera ação, verde para o resolvido, vermelho para o que exige
/// atenção e cinza para o encerrado.
const STATUS_BADGE_VARIANT: Record<InboundInvoiceStatus, BadgeVariant> = {
  PENDING: 'warning',
  RECONCILED: 'success',
  DIVERGENT: 'destructive',
  CANCELLED: 'secondary',
};

export function getInboundInvoiceStatusLabel(status: InboundInvoiceStatus): string {
  return STATUS_LABEL[status];
}

export function getInboundInvoiceStatusBadgeVariant(status: InboundInvoiceStatus): BadgeVariant {
  return STATUS_BADGE_VARIANT[status];
}

export const PAYMENT_METHOD_OPTIONS: { value: PaymentMethod; label: string }[] = [
  { value: 'PIX', label: 'PIX' },
  { value: 'BANK_SLIP', label: 'Boleto' },
  { value: 'CREDIT_CARD', label: 'Cartão' },
  { value: 'CASH', label: 'Dinheiro' },
];

export const PAYMENT_TERMS_OPTIONS: { value: PaymentTerms; label: string; installments: number }[] =
  [
    { value: 'CASH', label: 'À vista', installments: 1 },
    { value: 'NET_30', label: '30 dias', installments: 1 },
    { value: 'NET_30_60', label: '30/60 dias', installments: 2 },
    { value: 'NET_30_60_90', label: '30/60/90 dias', installments: 3 },
  ];

const METHOD_LABEL: Record<PaymentMethod, string> = Object.fromEntries(
  PAYMENT_METHOD_OPTIONS.map((option) => [option.value, option.label]),
) as Record<PaymentMethod, string>;

const TERMS_LABEL: Record<PaymentTerms, string> = Object.fromEntries(
  PAYMENT_TERMS_OPTIONS.map((option) => [option.value, option.label]),
) as Record<PaymentTerms, string>;

export function getPaymentMethodLabel(method: PaymentMethod): string {
  return METHOD_LABEL[method];
}

export function getPaymentTermsLabel(terms: PaymentTerms): string {
  return TERMS_LABEL[terms];
}

/// Quantas parcelas de contas a pagar a condição escolhida vai gerar. A tela
/// mostra isso antes de confirmar — "30/60/90" gerar três vencimentos é o tipo
/// de coisa que o financeiro precisa saber ANTES, não ao abrir a agenda.
export function getInstallmentCount(terms: PaymentTerms): number {
  return PAYMENT_TERMS_OPTIONS.find((option) => option.value === terms)?.installments ?? 1;
}
