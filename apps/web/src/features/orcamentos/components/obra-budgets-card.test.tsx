import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { ObraBudgetsCard } from './obra-budgets-card';

const consultas: Record<string, unknown>[] = [];

vi.mock('../hooks/use-budgets', () => ({
  useBudgets: (query: Record<string, unknown>) => {
    consultas.push(query);
    return {
      isLoading: false,
      data: {
        data: [
          {
            id: 'b1',
            code: 'ORC-0001',
            version: 2,
            name: 'Executivo',
            referenceDate: '2026-09-01',
            status: 'CLOSED',
            isOfficial: true,
            totalCost: '1000.00',
            finalPrice: '1250.00',
          },
        ],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      },
    };
  },
  useConstructionSiteOptions: () => ({ data: [{ id: 'obra-1', code: 'OBRA-01', name: 'Aurora', status: 'IN_PROGRESS' }] }),
  useCreateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useUpdateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

function abrir(canManage: boolean) {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/engenharia/obras/obra-1']}>
        <Routes>
          <Route path="/engenharia/obras/:id" element={<ObraBudgetsCard constructionSiteId="obra-1" canManage={canManage} />} />
          <Route path="/engenharia/orcamentos/:id" element={<p>Editor do orçamento</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

describe('Orçamentos na tela da obra', () => {
  it('lista só os orçamentos desta obra, com situação, oficial e preço final', async () => {
    const usuario = abrir(true);
    expect(consultas.at(-1)).toMatchObject({ constructionSiteId: 'obra-1' });
    expect(screen.getByText('ORC-0001 · v2')).toBeDefined();
    expect(screen.getByText('Oficial')).toBeDefined();
    expect(screen.getByText(/R\$\s?1\.250,00/)).toBeDefined();

    await usuario.click(screen.getByRole('button', { name: 'Executivo' }));
    expect(await screen.findByText('Editor do orçamento')).toBeDefined();
  });

  it('novo orçamento já nasce com a obra escolhida', async () => {
    const usuario = abrir(true);
    await usuario.click(screen.getByRole('button', { name: /Novo Orçamento/ }));
    const gaveta = await screen.findByRole('dialog');
    expect(within(gaveta).getAllByText('OBRA-01 — Aurora').length).toBeGreaterThan(0);
  });

  it('quem só consulta não cria', () => {
    abrir(false);
    expect(screen.queryByRole('button', { name: /Novo Orçamento/ })).toBeNull();
  });
});
