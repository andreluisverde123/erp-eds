import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ComposicoesPage } from './composicoes-page';
import type { CompositionSummary, PaginatedResult } from '@/features/composicoes/types';

const criar = vi.fn();
const atualizar = vi.fn();
const excluir = vi.fn();
let resultado: PaginatedResult<CompositionSummary> | undefined;
let ultimaQuery: Record<string, unknown> = {};
let permissoes: string[] = [];

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoes } }),
}));

vi.mock('@/features/composicoes/hooks/use-compositions', () => ({
  useCompositions: (query: Record<string, unknown>) => {
    ultimaQuery = query;
    return { data: resultado, isLoading: false, isError: false };
  },
  useCreateComposition: () => ({ mutateAsync: criar, isPending: false }),
  useUpdateComposition: () => ({ mutateAsync: atualizar, isPending: false }),
  useDeleteComposition: () => ({ mutateAsync: excluir, isPending: false }),
}));

const ALVENARIA: CompositionSummary = {
  id: 'c1',
  code: 'COMP-0001',
  name: 'Alvenaria de vedação',
  description: 'Bloco 9x19x39',
  unit: 'M2',
  active: true,
  itemCount: 4,
  unitCost: '75.0000',
  createdAt: '2026-09-14T00:00:00.000Z',
  updatedAt: '2026-09-14T00:00:00.000Z',
};

const pagina = (itens: CompositionSummary[]): PaginatedResult<CompositionSummary> => ({
  data: itens,
  meta: { page: 1, limit: 10, total: itens.length, totalPages: 1 },
});

function abrir() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/engenharia/composicoes']}>
        <Routes>
          <Route path="/engenharia/composicoes" element={<ComposicoesPage />} />
          <Route path="/engenharia/composicoes/:id" element={<p>Página da composição</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

beforeEach(() => {
  resultado = pagina([]);
  ultimaQuery = {};
  permissoes = ['composicoes.view', 'composicoes.manage'];
  criar.mockReset();
  atualizar.mockReset();
  excluir.mockReset();
});

describe('Listagem de composições', () => {
  it('mostra código, nome, unidade, itens, custo unitário e situação', () => {
    resultado = pagina([ALVENARIA]);
    abrir();

    const linha = screen.getByText('Alvenaria de vedação').closest('tr')!;
    expect(within(linha).getByText('COMP-0001')).toBeDefined();
    expect(within(linha).getByText('M2')).toBeDefined();
    expect(within(linha).getByText('4')).toBeDefined();
    expect(within(linha).getByText(/R\$\s?75,00/)).toBeDefined();
    expect(within(linha).getByText('Ativa')).toBeDefined();
  });

  it('lista vazia explica o que fazer', () => {
    abrir();

    expect(screen.getByText('Nenhuma composição encontrada')).toBeDefined();
  });

  it('o termo buscado chega à consulta', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByPlaceholderText(/Buscar por nome ou código/), 'alvenaria');

    await waitFor(() => expect(ultimaQuery.search).toBe('alvenaria'));
  });

  it('filtrar por situação envia o filtro', async () => {
    const usuario = abrir();

    screen.getByLabelText('Situação').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: 'Inativas' }));

    await waitFor(() => expect(ultimaQuery.active).toBe('false'));
  });

  it('abrir a composição leva à página dela', async () => {
    resultado = pagina([ALVENARIA]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Alvenaria de vedação' }));

    expect(await screen.findByText('Página da composição')).toBeDefined();
  });
});

describe('Cadastro e situação', () => {
  it('cria com nome e unidade e abre a composição para incluir os insumos', async () => {
    criar.mockResolvedValue({ ...ALVENARIA, id: 'nova', items: [] });
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Nova Composição/ }));
    const drawer = await screen.findByRole('dialog');
    await usuario.type(within(drawer).getByLabelText('Nome'), 'Alvenaria de vedação');
    within(drawer).getByLabelText('Unidade').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /^M2 —/ }));
    await usuario.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(criar.mock.calls[0]![0]).toMatchObject({ name: 'Alvenaria de vedação', unit: 'M2' });
    expect(await screen.findByText('Página da composição')).toBeDefined();
  });

  it('o formulário não pede custo nem código', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Nova Composição/ }));
    const drawer = await screen.findByRole('dialog');

    expect(within(drawer).queryByLabelText(/custo|preço|código/i)).toBeNull();
    expect(within(drawer).getByText(/gerado automaticamente/)).toBeDefined();
  });

  it('sem nome e sem unidade, não chama o backend', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Nova Composição/ }));
    await usuario.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe o nome da composição.')).toBeDefined();
    expect(screen.getByText('Escolha a unidade.')).toBeDefined();
    expect(criar).not.toHaveBeenCalled();
  });

  it('desativar pelo menu envia só a situação', async () => {
    resultado = pagina([ALVENARIA]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Desativar/ }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith({ id: 'c1', input: { active: false } }),
    );
  });

  it('composição inativa oferece ativar', async () => {
    resultado = pagina([{ ...ALVENARIA, active: false }]);
    const usuario = abrir();

    expect(screen.getByText('Inativa')).toBeDefined();
    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Ativar/ }));

    await waitFor(() =>
      expect(atualizar).toHaveBeenCalledWith({ id: 'c1', input: { active: true } }),
    );
  });
});

describe('Quem só consulta', () => {
  it('vê a lista e abre, mas não cria, não edita e não desativa', async () => {
    permissoes = ['composicoes.view'];
    resultado = pagina([ALVENARIA]);
    const usuario = abrir();

    expect(screen.queryByRole('button', { name: /Nova Composição/ })).toBeNull();
    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    expect(await screen.findByRole('menuitem', { name: /Abrir/ })).toBeDefined();
    expect(screen.queryByRole('menuitem', { name: /Editar|Desativar|Excluir/ })).toBeNull();
  });
});
