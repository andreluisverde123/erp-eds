import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { InsumosPage } from './insumos-page';
import type { CatalogItem, PaginatedResult } from '@/features/catalogo/types';
import { ApiError } from '@/lib/api-client';

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

  it('excluir avisa que insumo já usado se desativa, não se exclui', async () => {
    resultado = pagina([CIMENTO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Excluir/ }));

    expect(
      await screen.findByText(/nunca foi usado em solicitação de compra — se já foi, desative-o/),
    ).toBeDefined();
  });

  it('a recusa da API para insumo usado aparece na tela, como veio', async () => {
    excluir.mockRejectedValue(
      new ApiError(
        409,
        'Este insumo já foi usado em solicitações de compra e não pode ser excluído. Desative-o para tirá-lo do uso.',
      ),
    );
    resultado = pagina([CIMENTO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Excluir/ }));
    await usuario.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }),
    );

    expect(await screen.findByText(/já foi usado em solicitações de compra/)).toBeDefined();
    expect(excluir).toHaveBeenCalledWith('i1');
  });
});

describe('Naturezas: material, mão de obra e equipamento', () => {
  const PEDREIRO: CatalogItem = {
    ...CIMENTO,
    id: 'i2',
    code: 'MO-0001',
    name: 'Pedreiro',
    unit: 'H',
    category: null,
    description: null,
    type: 'LABOR',
  };
  const BETONEIRA: CatalogItem = { ...PEDREIRO, id: 'i3', code: 'EQP-0001', name: 'Betoneira', type: 'EQUIPMENT' };

  it('a listagem mostra a natureza de cada insumo', () => {
    resultado = pagina([CIMENTO, PEDREIRO, BETONEIRA]);
    abrir();

    expect(within(screen.getByText('Cimento CP II 50kg').closest('tr')!).getByText('Material')).toBeDefined();
    expect(within(screen.getByText('Pedreiro').closest('tr')!).getByText('Mão de obra')).toBeDefined();
    expect(within(screen.getByText('Betoneira').closest('tr')!).getByText('Equipamento')).toBeDefined();
  });

  it('o insumo existente continua sendo cadastrado como MATERIAL por padrão', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));
    await usuario.type(await screen.findByLabelText('Nome'), 'Areia média');
    const drawer = screen.getByRole('dialog');
    within(drawer).getByLabelText('Unidade').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /M3/ }));
    await usuario.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(criar.mock.calls[0]![0].type).toBe('MATERIAL');
  });

  it('cadastrar mão de obra envia a natureza escolhida', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Novo Insumo/ }));
    await usuario.type(await screen.findByLabelText('Nome'), 'Pedreiro');
    const drawer = screen.getByRole('dialog');

    within(drawer).getByLabelText('Natureza').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: 'Mão de obra' }));

    within(drawer).getByLabelText('Unidade').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /KG/ }));
    await usuario.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(criar.mock.calls[0]![0]).toMatchObject({ name: 'Pedreiro', type: 'LABOR' });
  });

  it('na edição a natureza aparece travada e não é enviada', async () => {
    resultado = pagina([PEDREIRO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Editar/ }));
    const drawer = screen.getByRole('dialog');

    expect(within(drawer).getByLabelText('Natureza')).toHaveProperty('disabled', true);
    await usuario.click(within(drawer).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(atualizar).toHaveBeenCalled());
    expect(atualizar.mock.calls[0]![0]).not.toHaveProperty('type');
  });

  it('filtrar por natureza envia o filtro', async () => {
    const usuario = abrir();

    screen.getByLabelText('Natureza').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: 'Equipamento' }));

    await waitFor(() => expect(ultimaQuery.type).toBe('EQUIPMENT'));
  });

  it('sem filtro, a natureza não é enviada', () => {
    abrir();

    expect(ultimaQuery.type).toBeUndefined();
  });
});

/// As permissões de quem está na tela. Por padrão, Engenharia: consulta e
/// mantém o catálogo, vê e registra preço.
let permissoesDaTela = ['catalogo.view', 'catalogo.manage', 'composicoes.view', 'composicoes.manage'];

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoesDaTela } }),
}));

vi.mock('@/features/catalogo/hooks/use-catalog-item-prices', () => ({
  useCatalogItemPrices: () => ({
    data: { data: [], meta: { page: 1, limit: 50, total: 0, totalPages: 1 } },
    isLoading: false,
    isError: false,
  }),
  useCurrentReferencePrice: () => ({ data: { asOf: '2026-09-14', unit: 'SC', price: null } }),
  usePurchasePriceCandidates: () => ({ data: [], isLoading: false, isError: false }),
  useRegisterManualPrice: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useRegisterPurchasePrice: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

describe('Preços de referência a partir da tela de Insumos (ORC-03)', () => {
  beforeEach(() => {
    permissoesDaTela = ['catalogo.view', 'catalogo.manage', 'composicoes.view', 'composicoes.manage'];
  });

  it('a ação "Preços" abre o histórico do insumo', async () => {
    resultado = pagina([CIMENTO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Preços/ }));

    const drawer = await screen.findByRole('dialog');
    expect(within(drawer).getByText('Preços de referência')).toBeDefined();
    expect(within(drawer).getByText(/MAT-0001 · Cimento CP II 50kg — preço por SC/)).toBeDefined();
  });

  it('quem consulta o catálogo sem composicoes.view não vê a ação de preços', async () => {
    // É o caso de Compras: consultar insumo não dá acesso a preço.
    permissoesDaTela = ['catalogo.view', 'compras.view', 'compras.manage'];
    resultado = pagina([CIMENTO]);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await screen.findByRole('menuitem', { name: /Editar/ });

    expect(screen.queryByRole('menuitem', { name: /Preços/ })).toBeNull();
  });

  it('a tabela de insumos continua sem preço', () => {
    resultado = pagina([CIMENTO]);
    abrir();

    expect(within(screen.getByRole('table')).queryByText(/R\$/)).toBeNull();
  });
});
