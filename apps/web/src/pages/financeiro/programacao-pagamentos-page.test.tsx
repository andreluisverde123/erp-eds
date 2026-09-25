import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ProgramacaoPagamentosPage } from './programacao-pagamentos-page';
import type { PaymentSchedule, PaymentScheduleRow } from '@/features/financeiro/types';

let permissoes: string[] = [];
const liberar = vi.fn();
const desfazer = vi.fn();

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoes } }),
}));

function linha(extra: Partial<PaymentScheduleRow>): PaymentScheduleRow {
  return {
    id: 'c-1',
    dueDate: '2026-09-30T00:00:00.000Z',
    amount: '1000.00',
    remaining: '1000.00',
    status: 'OPEN',
    origin: 'MANUAL',
    overdue: false,
    attachmentsCount: 0,
    invoiceAttachmentsCount: 0,
    supplier: { id: 'f-1', legalName: 'Perini Materiais LTDA', tradeName: 'Perini' },
    costCenter: null,
    constructionSite: { id: 'o-1', code: 'OBR-001', name: 'Residencial Alfa' },
    invoice: null,
    description: 'Aluguel de andaime',
    documentNumber: null,
    issueDate: null,
    paymentMethod: null,
    notes: null,
    approvedForPaymentAt: null,
    approvedForPaymentBy: null,
    traceability: {} as PaymentScheduleRow['traceability'],
    ...extra,
  };
}

const PROGRAMACAO: PaymentSchedule = {
  weekStart: '2026-09-28',
  weekEnd: '2026-10-04',
  rows: [
    linha({
      id: 'atrasada',
      overdue: true,
      dueDate: '2026-09-20T00:00:00.000Z',
      remaining: '300.00',
    }),
    linha({ id: 'quarta', remaining: '1000.00' }),
    linha({
      id: 'liberada',
      dueDate: '2026-10-02T00:00:00.000Z',
      remaining: '250.00',
      approvedForPaymentAt: '2026-09-25T10:00:00.000Z',
      approvedForPaymentBy: { id: 'u-1', name: 'Marcelo Cassol' },
      invoice: { id: 'nf-1', number: '1234', series: '1' },
      invoiceAttachmentsCount: 2,
    }),
  ],
  totals: { total: 1550, overdue: 300, approved: 250, pendingApproval: 1300 },
};

vi.mock('@/features/financeiro/hooks/use-payment-schedule', () => ({
  usePaymentSchedule: () => ({ data: PROGRAMACAO, isLoading: false, isError: false }),
  useApprovePayment: () => ({ mutate: liberar, isPending: false }),
  useRevokePaymentApproval: () => ({ mutate: desfazer, isPending: false }),
  useDownloadPaymentSchedulePdf: () => ({ mutate: vi.fn(), isPending: false }),
}));

// O drawer de pagamento e o painel de anexos têm testes próprios e buscam
// dados; aqui só interessa a programação.
vi.mock('@/features/financeiro/components/payment-form-drawer', () => ({
  PaymentFormDrawer: () => null,
}));
vi.mock('@/features/financeiro/components/payment-schedule-attachments-sheet', () => ({
  PaymentScheduleAttachmentsSheet: () => null,
}));

/// `toLocaleString` separa "R$" do valor com espaço inseparável.
function texto(elemento: Element | null | undefined): string {
  return (elemento?.textContent ?? '').replace(/\s/g, ' ');
}

function abrir() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <ProgramacaoPagamentosPage />
    </QueryClientProvider>,
  );
}

describe('Programação de pagamentos', () => {
  beforeEach(() => {
    permissoes = ['financeiro.view', 'financeiro.manage', 'financeiro.approve'];
    liberar.mockReset();
    desfazer.mockReset();
  });

  it('mostra os totais da semana', () => {
    abrir();

    expect(texto(screen.getByText('A pagar até domingo').parentElement)).toContain('R$ 1.550,00');
    expect(texto(screen.getByText('Liberado para pagar').parentElement)).toContain('R$ 250,00');
    expect(texto(screen.getByText('Falta liberar').parentElement)).toContain('R$ 1.300,00');
  });

  it('as vencidas aparecem num grupo próprio, no topo', () => {
    abrir();

    const grupos = screen.getAllByRole('row').filter((row) => row.querySelector('[colspan]'));
    expect(texto(grupos[0])).toContain('Vencidas e ainda não pagas');
    expect(texto(grupos[0])).toContain('R$ 300,00');
  });

  it('marcar todas seleciona só as que aguardam liberação, e libera em lote', async () => {
    const usuario = userEvent.setup();
    abrir();

    await usuario.click(
      screen.getByRole('checkbox', { name: /Selecionar todas as contas aguardando liberação/ }),
    );
    expect(screen.getByText(/2 contas selecionadas/)).toBeTruthy();

    await usuario.click(screen.getByRole('button', { name: /Liberar para pagamento/ }));

    expect(liberar).toHaveBeenCalledWith(['atrasada', 'quarta'], expect.anything());
  });

  it('a conta liberada mostra quem liberou e não pode ser marcada de novo', () => {
    abrir();

    const linhaLiberada = screen.getByText('NF 1234').closest('tr')!;
    expect(within(linhaLiberada).getByText(/Liberada · Marcelo/)).toBeTruthy();
    expect(within(linhaLiberada).getByRole('checkbox').hasAttribute('disabled')).toBe(true);
  });

  it('conta os anexos da nota junto com os da conta', () => {
    abrir();

    const linhaLiberada = screen.getByText('NF 1234').closest('tr')!;
    expect(within(linhaLiberada).getByRole('button', { name: /2/ })).toBeTruthy();
  });

  it('o Financeiro (sem `financeiro.approve`) vê a lista, mas não libera', () => {
    permissoes = ['financeiro.view', 'financeiro.manage'];
    abrir();

    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByRole('button', { name: /Liberar para pagamento/ })).toBeNull();
    expect(screen.getAllByText('Aguardando liberação')).toHaveLength(2);
  });
});
