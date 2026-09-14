import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrcamentosPage } from './orcamentos-page';
import type { BudgetSummary, PaginatedResult } from '@/features/orcamentos/types';
import { ApiError } from '@/lib/api-client';

const criar = vi.fn();
let resultado: PaginatedResult<BudgetSummary> | undefined;
let ultimaQuery: Record<string, unknown> = {};
let permissoes: string[] = [];

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoes } }),
}));

vi.mock('@/features/orcamentos/hooks/use-budgets', () => ({
  useBudgets: (query: Record<string, unknown>) => {
    ultimaQuery = query;
    return { data: resultado, isLoading: false, isError: false };
  },
  useConstructionSiteOptions: () => ({
    data: [
      { id: 'obra-1', code: 'OBRA-01', name: 'Residencial Aurora', status: 'IN_PROGRESS' },
      { id: 'obra-2', code: 'OBRA-02', name: 'Galpão Norte', status: 'PLANNING' },
    ],
  }),
  useCreateBudget: () => ({ mutateAsync: criar, isPending: false }),
  useUpdateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

const ORCAMENTO: BudgetSummary = {
  id: 'b1',
  code: 'ORC-0001',
  version: 1,
  name: 'Orçamento executivo',
  description: null,
  referenceDate: '2026-09-01',
  status: 'DRAFT',
  closedAt: null,
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z',
  constructionSite: { id: 'obra-1', code: 'OBRA-01', name: 'Residencial Aurora' },
  itemCount: 4,
  totalCost: '9350.50',
  totalCostExact: '9350.50000000',
  isOfficial: false,
  directCost: '9350.50',
  directCostExact: '9350.50000000',
  bdiPercent: '0.0000',
  bdiValue: '0.00',
  finalPrice: '9350.50',
};

const pagina = (itens: BudgetSummary[]): PaginatedResult<BudgetSummary> => ({
  data: itens,
  meta: { page: 1, limit: 10, total: itens.length, totalPages: 1 },
});

function abrir() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/engenharia/orcamentos']}>
        <Routes>
          <Route path="/engenharia/orcamentos" element={<OrcamentosPage />} />
          <Route path="/engenharia/orcamentos/:id" element={<p>Editor do orçamento</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

beforeEach(() => {
  resultado = pagina([]);
  ultimaQuery = {};
  permissoes = ['orcamentos.view', 'orcamentos.manage'];
  criar.mockReset();
});

describe('Lista de orçamentos', () => {
  it('mostra código, nome, obra, data-base, versão, situação e total', () => {
    resultado = pagina([ORCAMENTO, { ...ORCAMENTO, id: 'b2', code: 'ORC-0002', name: 'Estudo', status: 'CLOSED', totalCost: '120.00' }]);
    abrir();

    const linha = screen.getByText('Orçamento executivo').closest('tr')!;
    expect(linha.textContent).toMatch(/ORC-0001.*Orçamento executivo.*OBRA-01 — Residencial Aurora.*01\/09\/2026.*v1.*Rascunho.*R\$\s?9\.350,50/);
    expect(within(screen.getByText('Estudo').closest('tr')!).getByText('Fechado')).toBeDefined();
  });

  it('vazia, explica o que fazer', () => {
    abrir();
    expect(screen.getByText('Nenhum orçamento encontrado')).toBeDefined();
  });

  it('busca e filtro de situação chegam à consulta', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByPlaceholderText(/Buscar por nome, código ou obra/), 'aurora');
    screen.getByLabelText('Situação').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: 'Fechado' }));

    await waitFor(() => expect(ultimaQuery).toMatchObject({ search: 'aurora', status: 'CLOSED' }));
  });

  it('abrir leva ao editor', async () => {
    resultado = pagina([ORCAMENTO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Orçamento executivo' }));

    expect(await screen.findByText('Editor do orçamento')).toBeDefined();
  });
});

describe('Novo orçamento', () => {
  it('cria com obra, nome e data-base e abre o editor', async () => {
    criar.mockResolvedValue({ ...ORCAMENTO, id: 'novo', nodes: [], items: [] });
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Orçamento/ }));
    const drawer = await screen.findByRole('dialog');
    within(drawer).getByLabelText('Obra').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /Residencial Aurora/ }));
    await usuario.type(within(drawer).getByLabelText('Nome'), 'Orçamento executivo');
    fireEvent.change(within(drawer).getByLabelText('Data-base'), { target: { value: '2026-09-01' } });
    await usuario.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(criar.mock.calls[0]![0]).toEqual({
      constructionSiteId: 'obra-1',
      name: 'Orçamento executivo',
      referenceDate: '2026-09-01',
      description: undefined,
    });
    expect(await screen.findByText('Editor do orçamento')).toBeDefined();
  });

  it('sem obra, não chama o backend', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Orçamento/ }));
    const drawer = await screen.findByRole('dialog');
    await usuario.type(within(drawer).getByLabelText('Nome'), 'X');
    await usuario.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Escolha a obra.')).toBeDefined();
    expect(criar).not.toHaveBeenCalled();
  });

  it('o formulário não pede código, versão, status nem total', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Orçamento/ }));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).queryByLabelText(/código|versão|status|total/i)).toBeNull();
  });

  it('a recusa da API aparece como veio', async () => {
    criar.mockRejectedValue(new ApiError(400, 'Obra não encontrada.'));
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Orçamento/ }));
    const drawer = await screen.findByRole('dialog');
    within(drawer).getByLabelText('Obra').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /Galpão Norte/ }));
    await usuario.type(within(drawer).getByLabelText('Nome'), 'X');
    await usuario.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Obra não encontrada.')).toBeDefined();
  });
});

describe('Quem só consulta', () => {
  it('vê a lista, sem botão de novo orçamento', () => {
    permissoes = ['orcamentos.view'];
    resultado = pagina([ORCAMENTO]);
    abrir();

    expect(screen.getByText('Orçamento executivo')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Novo Orçamento/ })).toBeNull();
  });
});
