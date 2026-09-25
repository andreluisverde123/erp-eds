import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { NotasServicoSection } from './notas-servico-section';
import type { ServiceInvoice } from '@/features/terceiros/service-invoices/types';

let permissoes: string[] = [];
const cancelar = vi.fn();
const criar = vi.fn();

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoes } }),
}));

function nota(extra: Partial<ServiceInvoice>): ServiceInvoice {
  return {
    id: 'n-1',
    documentNumber: '4521',
    description: 'Conserto da bomba da fazenda',
    notes: null,
    amount: '1000.00',
    issueDate: null,
    dueDate: '2026-10-05T00:00:00.000Z',
    createdAt: '2026-09-25T12:00:00.000Z',
    situation: 'AGUARDANDO_LIBERACAO',
    approvedForPaymentAt: null,
    approvedForPaymentBy: null,
    launchedBy: { id: 'u-1', name: 'Vitor Souza' },
    contractor: { id: 'c-1', legalName: 'Bombas Silva ME', tradeName: null, document: '1' },
    costCenter: { id: 'cc-1', code: 'ADM-02', name: 'Fazenda' },
    constructionSite: null,
    attachmentsCount: 1,
    ...extra,
  };
}

const NOTAS = [
  nota({}),
  nota({ id: 'n-2', documentNumber: '88', situation: 'LIBERADA' }),
  nota({ id: 'n-3', documentNumber: '99', situation: 'PAGA', attachmentsCount: 0 }),
];

vi.mock('@/features/terceiros/service-invoices/hooks', () => ({
  useServiceInvoices: () => ({
    data: { data: NOTAS, meta: { page: 1, limit: 10, total: 3, totalPages: 1 } },
    isLoading: false,
    isError: false,
  }),
  useCancelServiceInvoice: () => ({ mutateAsync: cancelar, isPending: false }),
  useCreateServiceInvoice: () => ({ mutateAsync: criar, isPending: false }),
  useServiceInvoiceCostCenters: () => ({ data: [] }),
  useServiceInvoiceFiles: () => ({ data: [], isLoading: false }),
  useUploadServiceInvoiceFile: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/features/terceiros/hooks/use-contractors', () => ({
  useContractors: () => ({ data: { data: [] } }),
}));

function abrir() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <NotasServicoSection />
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

describe('Notas de serviço (Terceirizados)', () => {
  beforeEach(() => {
    permissoes = ['terceiros.view', 'terceiros.manage'];
    cancelar.mockReset();
  });

  it('a Engenharia acompanha a situação de cada nota', () => {
    abrir();

    const linha = (numero: string) => screen.getByText(numero).closest('tr')!;
    expect(within(linha('4521')).getByText('Aguardando liberação')).toBeDefined();
    expect(within(linha('88')).getByText('Liberada para pagamento')).toBeDefined();
    expect(within(linha('99')).getByText('Paga')).toBeDefined();
  });

  it('nota sem contrato: mostra o serviço e o centro (a fazenda)', () => {
    abrir();

    const linha = screen.getByText('4521').closest('tr')!;
    expect(within(linha).getByText('Conserto da bomba da fazenda')).toBeDefined();
    expect(within(linha).getByText('Fazenda')).toBeDefined();
    expect(within(linha).getByText(/lançada por Vitor/)).toBeDefined();
  });

  it('só a nota aguardando liberação pode ser cancelada pela Engenharia', async () => {
    const usuario = abrir();

    const menus = screen.getAllByRole('button', { name: 'Ações' });
    expect(menus).toHaveLength(1);

    await usuario.click(menus[0]!);
    await usuario.click(await screen.findByRole('menuitem', { name: /Cancelar nota/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar nota' }));

    expect(cancelar).toHaveBeenCalledWith('n-1');
  });

  it('quem só consulta não lança nem cancela', () => {
    permissoes = ['terceiros.view'];
    abrir();

    expect(screen.queryByRole('button', { name: /Lançar nota/ })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ações' })).toBeNull();
  });

  it('"Lançar nota" abre o formulário, sem pedir contrato', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Lançar nota/ }));

    expect(await screen.findByText('Lançar nota de serviço')).toBeDefined();
    expect(screen.getByText(/Não precisa de contrato/)).toBeDefined();
    expect(screen.queryByText(/^Contrato$/)).toBeNull();
  });
});
