import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsumosPage } from './insumos-page';
import type { CatalogItem, PaginatedResult } from '@/features/catalogo/types';

const criar = vi.fn();
const atualizar = vi.fn();
const excluir = vi.fn();
let resultado: PaginatedResult<CatalogItem> | undefined;
let ultimaQuery: Record<string, unknown> = {};

vi.mock('@/features/catalogo/hooks/use-catalog-items', () => ({
  useCatalogItems: (query: Record<string, unknown>) => {
    ultimaQuery = query;
    return { data: resultado, isLoading: false, isError: false };
  },
  useCatalogCategories: () => ({ data: ['Cimento', 'Aço'] }),
  useMeasurementUnits: () => ({
    data: [
      { code: 'SC', name: 'Saco' },
      { code: 'KG', name: 'Quilograma' },
      { code: 'M3', name: 'Metro cúbico' },
    ],
  }),
  useCreateCatalogItem: () => ({ mutateAsync: criar, isPending: false }),
  useUpdateCatalogItem: () => ({ mutateAsync: atualizar, isPending: false }),
  useDeleteCatalogItem: () => ({ mutateAsync: excluir, isPending: false }),
}));

const CIMENTO: CatalogItem = {
  id: 'i1',
  code: 'MAT-0001',
  name: 'Cimento CP II 50kg',
  unit: 'SC',
  category: 'Cimento',
  description: 'Saco de 50kg',
  type: 'MATERIAL',
  active: true,
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z',
};

const pagina = (itens: CatalogItem[]): PaginatedResult<CatalogItem> => ({
  data: itens,
  meta: { page: 1, limit: 10, total: itens.length, totalPages: 1 },
});

function abrir() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <InsumosPage />
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

beforeEach(() => {
  resultado = pagina([]);
  ultimaQuery = {};
  criar.mockReset();
  atualizar.mockReset();
  excluir.mockReset();
});

describe('Listagem de insumos', () => {
  it('mostra código, nome, unidade, categoria e situação', () => {
    resultado = pagina([CIMENTO]);
    abrir();

    const linha = screen.getByText('Cimento CP II 50kg').closest('tr')!;
    expect(within(linha).getByText('MAT-0001')).toBeDefined();
    expect(within(linha).getByText('SC')).toBeDefined();
    expect(within(linha).getByText('Cimento')).toBeDefined();
    expect(within(linha).getByText('Ativo')).toBeDefined();
  });

  it('a TABELA não tem coluna nem valor de preço', () => {
    // O catálogo responde "o que é este insumo", nunca "quanto custa".
    // (A legenda da página menciona preço de propósito, para dizer de onde ele
    // vem — por isso a asserção é sobre a tabela, não sobre a página inteira.)
    resultado = pagina([CIMENTO]);
    abrir();

    const tabela = screen.getByRole('table');
    expect(within(tabela).queryByText(/R\$/)).toBeNull();
    expect(within(tabela).queryByText(/preço|valor|custo/i)).toBeNull();
  });

  it('insumo inativo é distinguido do ativo', () => {
    resultado = pagina([{ ...CIMENTO, active: false }]);
    abrir();

    expect(screen.getByText('Inativo')).toBeDefined();
  });

  it('catálogo vazio explica o que fazer', () => {
    abrir();

    expect(screen.getByText('Nenhum insumo encontrado')).toBeDefined();
  });
});

describe('Busca e filtros', () => {
  it('o termo digitado chega à consulta', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByPlaceholderText(/Buscar por nome ou código/), 'cimento');

    await waitFor(() => expect(ultimaQuery.search).toBe('cimento'));
  });

  it('busca por código funciona pelo mesmo campo', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByPlaceholderText(/Buscar por nome ou código/), 'MAT-0001');

    await waitFor(() => expect(ultimaQuery.search).toBe('MAT-0001'));
  });

  it('filtrar por situação envia o filtro', async () => {
    const usuario = abrir();

    screen.getByLabelText('Situação').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: 'Ativos' }));

    await waitFor(() => expect(ultimaQuery.active).toBe('true'));
  });

  it('sem filtro, nem categoria nem situação são enviadas', () => {
    abrir();

    expect(ultimaQuery.category).toBeUndefined();
    expect(ultimaQuery.active).toBeUndefined();
  });
});

describe('Cadastro', () => {
  it('cria com nome e unidade escolhida da lista', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));
    await usuario.type(await screen.findByLabelText('Nome'), 'Areia média');

    screen.getByLabelText('Unidade').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /M3/ }));

    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(criar.mock.calls[0]![0]).toMatchObject({ name: 'Areia média', unit: 'M3' });
  });

  it('a unidade é ESCOLHIDA, nunca digitada', async () => {
    // É o que impede "m²", "M²" e "m2" de virarem três unidades. A lista vem da
    // API — a mesma que o validador usa.
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));

    const unidade = await screen.findByLabelText('Unidade');
    expect(unidade.tagName).not.toBe('INPUT');
  });

  it('sem nome, não chama o backend', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));
    await usuario.click(await screen.findByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Informe o nome do insumo.')).toBeDefined();
    expect(criar).not.toHaveBeenCalled();
  });

  it('sem unidade, não chama o backend', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));
    await usuario.type(await screen.findByLabelText('Nome'), 'Areia');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText('Escolha a unidade.')).toBeDefined();
    expect(criar).not.toHaveBeenCalled();
  });

  it('o formulário de criação NÃO tem campo de preço', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));
    await screen.findByLabelText('Nome');

    expect(screen.queryByLabelText(/preço/i)).toBeNull();
    expect(screen.queryByLabelText(/valor/i)).toBeNull();
  });

  it('o código não é digitável — é gerado pelo servidor', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));

    expect(await screen.findByText(/gerado automaticamente/)).toBeDefined();
    expect(screen.queryByLabelText(/código/i)).toBeNull();
  });

  it('a recusa por nome duplicado aparece como veio do backend', async () => {
    const { ApiError } = await import('@/lib/api-client');
    criar.mockRejectedValueOnce(
      new ApiError(
        409,
        'Já existe um insumo com este nome. Se for outro material, diferencie o nome.',
      ),
    );
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));
    await usuario.type(await screen.findByLabelText('Nome'), 'Cimento CP II 50kg');
    screen.getByLabelText('Unidade').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /SC/ }));
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(await screen.findByText(/Já existe um insumo com este nome/)).toBeDefined();
  });
});

describe('Edição e exclusão', () => {
  it('editar abre preenchido e o código é informado, não editável', async () => {
    resultado = pagina([CIMENTO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Editar/ }));

    expect((await screen.findByLabelText('Nome')) as HTMLInputElement).toHaveProperty(
      'value',
      'Cimento CP II 50kg',
    );
    expect(screen.getByText(/Insumo MAT-0001\. O código não muda\./)).toBeDefined();
  });

  it('desativar é edição de situação', async () => {
    resultado = pagina([CIMENTO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Editar/ }));

    // "Situação" existe duas vezes na tela: o filtro da listagem e o campo do
    // formulário. A busca é escopada ao drawer.
    const drawer = screen.getByRole('dialog');
    within(drawer).getByLabelText('Situação').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: 'Inativo' }));
    await usuario.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(atualizar).toHaveBeenCalled());
    expect(atualizar.mock.calls[0]![0].active).toBe(false);
  });

  it('excluir avisa que o histórico de compras fica intacto', async () => {
    resultado = pagina([CIMENTO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Excluir/ }));

    expect(
      await screen.findByText(/As solicitações que já usaram este insumo continuam intactas/),
    ).toBeDefined();
  });
});
