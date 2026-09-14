import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ComposicaoDetailPage } from './composicao-detail-page';
import type { CatalogOption, Composition } from '@/features/composicoes/types';
import { ApiError } from '@/lib/api-client';

const incluir = vi.fn();
const atualizarItem = vi.fn();
const removerItem = vi.fn();
const atualizar = vi.fn();
const buscar = vi.fn();
let composicao: Composition;
let permissoes: string[] = [];

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoes } }),
}));

vi.mock('@/features/composicoes/hooks/use-compositions', () => ({
  useComposition: () => ({ data: composicao, isLoading: false, isError: false }),
  useUpdateComposition: () => ({ mutateAsync: atualizar, isPending: false }),
  useCreateComposition: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useAddCompositionItem: () => ({ mutateAsync: incluir, isPending: false }),
  useUpdateCompositionItem: () => ({ mutateAsync: atualizarItem, isPending: false }),
  useRemoveCompositionItem: () => ({ mutateAsync: removerItem, isPending: false }),
}));

vi.mock('@/features/composicoes/api', () => ({
  searchCompositionCatalogOptions: (termo: string) => buscar(termo),
}));

const linha = (
  id: string,
  code: string,
  name: string,
  unit: string,
  type: 'MATERIAL' | 'LABOR' | 'EQUIPMENT',
  coefficient: string,
  unitPrice: string,
  totalCost: string,
) => ({
  id,
  catalogItemId: `insumo-${id}`,
  coefficient,
  unitPrice,
  totalCost,
  catalogItem: { id: `insumo-${id}`, code, name, unit, type, active: true },
});

/// O exemplo do enunciado, como a API o devolve.
function alvenaria(): Composition {
  return {
    id: 'c1',
    code: 'COMP-0001',
    name: 'Alvenaria de vedação',
    description: null,
    unit: 'M2',
    active: true,
    itemCount: 4,
    unitCost: '75.0000',
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    items: [
      linha('l1', 'MAT-0001', 'Bloco cerâmico', 'UN', 'MATERIAL', '25.000000', '1.5000', '37.5000'),
      linha('l2', 'MO-0001', 'Pedreiro', 'H', 'LABOR', '0.800000', '30.0000', '24.0000'),
      linha('l3', 'MO-0002', 'Servente', 'H', 'LABOR', '0.600000', '20.0000', '12.0000'),
      linha('l4', 'EQP-0001', 'Betoneira', 'H', 'EQUIPMENT', '0.100000', '15.0000', '1.5000'),
    ],
  };
}

const ARGAMASSA: CatalogOption = {
  id: 'insumo-argamassa',
  code: 'MAT-0002',
  name: 'Argamassa',
  unit: 'KG',
  type: 'MATERIAL',
  referencePrice: null,
};
const ENCANADOR: CatalogOption = {
  id: 'insumo-encanador',
  code: 'MO-0003',
  name: 'Encanador',
  unit: 'H',
  type: 'LABOR',
  referencePrice: { unitPrice: '42.5000', unit: 'H', referenceDate: '2026-09-10', source: 'MANUAL' },
};

describe('Preço de referência sugerido (ORC-03)', () => {
  async function escolherInsumo(usuario: ReturnType<typeof userEvent.setup>, termo: string, nome: RegExp) {
    await usuario.type(screen.getByLabelText('Insumo'), termo);
    await usuario.click(await screen.findByRole('option', { name: nome }));
  }

  it('insumo com preço de referência já vem com o preço sugerido, e ele é enviado', async () => {
    const usuario = abrir();

    await escolherInsumo(usuario, 'enc', /Encanador/);

    expect(screen.getByLabelText('Preço unitário')).toHaveProperty('value', '42,5');
    expect(screen.getByTestId('preco-sugerido').textContent).toMatch(
      /R\$\s?42,50 \/ H, referência de 10\/09\/2026 \(Manual\)/,
    );

    await usuario.type(screen.getByLabelText('Coeficiente'), '0,5');
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    await waitFor(() => expect(incluir).toHaveBeenCalledTimes(1));
    expect(incluir.mock.calls[0]![0]).toEqual({
      catalogItemId: 'insumo-encanador',
      coefficient: 0.5,
      unitPrice: 42.5,
    });
  });

  it('o preço sugerido pode ser alterado antes de adicionar', async () => {
    const usuario = abrir();

    await escolherInsumo(usuario, 'enc', /Encanador/);
    await usuario.clear(screen.getByLabelText('Preço unitário'));
    await usuario.type(screen.getByLabelText('Preço unitário'), '40');
    await usuario.type(screen.getByLabelText('Coeficiente'), '1');
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    await waitFor(() => expect(incluir).toHaveBeenCalledTimes(1));
    expect(incluir.mock.calls[0]![0].unitPrice).toBe(40);
  });

  it('sem preço de referência, o preço fica para ser digitado e a inclusão funciona', async () => {
    const usuario = abrir();

    await escolherInsumo(usuario, 'arga', /Argamassa/);

    expect(screen.getByLabelText('Preço unitário')).toHaveProperty('value', '');
    expect(screen.queryByTestId('preco-sugerido')).toBeNull();
    expect(screen.getByText(/não tem preço de referência/)).toBeDefined();

    await usuario.type(screen.getByLabelText('Coeficiente'), '12,5');
    await usuario.type(screen.getByLabelText('Preço unitário'), '0,35');
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    await waitFor(() => expect(incluir).toHaveBeenCalledTimes(1));
    expect(incluir.mock.calls[0]![0].unitPrice).toBe(0.35);
  });

  it('trocar o insumo tira a sugestão do anterior do campo de preço', async () => {
    const usuario = abrir();

    await escolherInsumo(usuario, 'enc', /Encanador/);
    await usuario.click(screen.getByRole('button', { name: 'Trocar insumo' }));

    expect(screen.getByLabelText('Preço unitário')).toHaveProperty('value', '');
    expect(screen.queryByTestId('preco-sugerido')).toBeNull();
  });

  it('um preço digitado à mão não é apagado ao trocar de insumo', async () => {
    const usuario = abrir();

    await escolherInsumo(usuario, 'enc', /Encanador/);
    await usuario.clear(screen.getByLabelText('Preço unitário'));
    await usuario.type(screen.getByLabelText('Preço unitário'), '39');
    await usuario.click(screen.getByRole('button', { name: 'Trocar insumo' }));

    expect(screen.getByLabelText('Preço unitário')).toHaveProperty('value', '39');
  });

  it('as linhas já gravadas mostram o preço da composição, não o de referência', () => {
    // O snapshot é do servidor; a tela só não pode "atualizar" a linha sozinha.
    abrir();

    expect(
      within(linhaDe('Pedreiro')).getByLabelText('Preço unitário de Pedreiro'),
    ).toHaveProperty('value', '30');
    expect(atualizarItem).not.toHaveBeenCalled();
  });
});

function abrir() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/engenharia/composicoes/c1']}>
        <Routes>
          <Route path="/engenharia/composicoes/:id" element={<ComposicaoDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

const linhaDe = (nome: string) => screen.getByText(nome).closest('tr')!;

beforeEach(() => {
  composicao = alvenaria();
  permissoes = ['composicoes.view', 'composicoes.manage'];
  for (const mock of [incluir, atualizarItem, removerItem, atualizar, buscar]) mock.mockReset();
  buscar.mockResolvedValue([ARGAMASSA, ENCANADOR]);
});

describe('Itens e custo da composição', () => {
  it('mostra natureza, unidade, coeficiente, preço e custo de cada item', () => {
    abrir();

    const pedreiro = linhaDe('Pedreiro');
    expect(within(pedreiro).getByText('Mão de obra')).toBeDefined();
    expect(within(pedreiro).getByText('H')).toBeDefined();
    expect(within(pedreiro).getByLabelText('Coeficiente de Pedreiro')).toHaveProperty('value', '0,8');
    expect(within(pedreiro).getByLabelText('Preço unitário de Pedreiro')).toHaveProperty(
      'value',
      '30',
    );
    expect(within(pedreiro).getByText(/R\$\s?24,00/)).toBeDefined();

    expect(within(linhaDe('Bloco cerâmico')).getByText('Material')).toBeDefined();
    expect(within(linhaDe('Betoneira')).getByText('Equipamento')).toBeDefined();
    expect(within(linhaDe('Betoneira')).getByText(/R\$\s?1,50/)).toBeDefined();
  });

  it('mostra o custo unitário calculado pelo servidor, por unidade da composição', () => {
    abrir();

    const rodape = screen.getByTestId('custo-unitario');
    expect(rodape.textContent).toMatch(/R\$\s?75,00/);
    expect(rodape.textContent).toContain('/ M2');
  });

  it('custo com mais de duas casas não é arredondado para centavo na tela', () => {
    composicao = {
      ...alvenaria(),
      unitCost: '0.0062',
      items: [linha('l9', 'MAT-0009', 'Aditivo', 'L', 'MATERIAL', '0.000123', '50.0000', '0.0062')],
    };
    abrir();

    expect(within(linhaDe('Aditivo')).getByText(/R\$\s?0,0062/)).toBeDefined();
  });
});

describe('Incluir insumo', () => {
  async function escolher(usuario: ReturnType<typeof userEvent.setup>, termo: string, nome: RegExp) {
    await usuario.type(screen.getByLabelText('Insumo'), termo);
    await usuario.click(await screen.findByRole('option', { name: nome }));
  }

  it('envia insumo, coeficiente e preço — e nunca o custo', async () => {
    const usuario = abrir();

    await escolher(usuario, 'arga', /Argamassa/);
    await usuario.type(screen.getByLabelText('Coeficiente'), '12,5');
    await usuario.type(screen.getByLabelText('Preço unitário'), '0,35');
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    await waitFor(() => expect(incluir).toHaveBeenCalledTimes(1));
    expect(incluir.mock.calls[0]![0]).toEqual({
      catalogItemId: 'insumo-argamassa',
      coefficient: 12.5,
      unitPrice: 0.35,
    });
    expect(buscar).toHaveBeenCalledWith('arga');
  });

  it('a busca mostra a natureza e a unidade de cada insumo', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Insumo'), 'e');

    const opcao = await screen.findByRole('option', { name: /Encanador/ });
    expect(opcao.textContent).toContain('Mão de obra');
    expect(opcao.textContent).toContain('MO-0003 · H');
  });

  it('depois de escolher, diz em que unidade é o coeficiente', async () => {
    const usuario = abrir();

    await escolher(usuario, 'arga', /Argamassa/);

    expect(screen.getByText('Coeficiente em KG por M2; preço por KG.')).toBeDefined();
  });

  it('insumo que já está na composição não é oferecido de novo', async () => {
    buscar.mockResolvedValue([
      { id: 'insumo-l2', code: 'MO-0001', name: 'Pedreiro', unit: 'H', type: 'LABOR' },
    ]);
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Insumo'), 'pedr');

    expect(await screen.findByText('Os insumos encontrados já estão nesta composição.')).toBeDefined();
    expect(screen.queryByRole('option', { name: /Pedreiro/ })).toBeNull();
  });

  it('sem insumo escolhido, não chama o backend', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Coeficiente'), '1');
    await usuario.type(screen.getByLabelText('Preço unitário'), '10');
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    expect(await screen.findByText('Escolha um insumo.')).toBeDefined();
    expect(incluir).not.toHaveBeenCalled();
  });

  it('coeficiente zero não chama o backend', async () => {
    const usuario = abrir();

    await escolher(usuario, 'arga', /Argamassa/);
    await usuario.type(screen.getByLabelText('Coeficiente'), '0');
    await usuario.type(screen.getByLabelText('Preço unitário'), '10');
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    expect(await screen.findByText('O coeficiente deve ser maior que zero.')).toBeDefined();
    expect(incluir).not.toHaveBeenCalled();
  });

  it('sem preço, não chama o backend', async () => {
    const usuario = abrir();

    await escolher(usuario, 'arga', /Argamassa/);
    await usuario.type(screen.getByLabelText('Coeficiente'), '2');
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    expect(await screen.findByText('Informe o preço unitário.')).toBeDefined();
    expect(incluir).not.toHaveBeenCalled();
  });

  it('o preço não aceita sinal negativo', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Preço unitário'), '-5');

    expect(screen.getByLabelText('Preço unitário')).toHaveProperty('value', '5');
  });

  it('a recusa da API aparece como veio', async () => {
    incluir.mockRejectedValue(
      new ApiError(409, 'Este insumo já está nesta composição. Ajuste o coeficiente da linha existente.'),
    );
    const usuario = abrir();

    await escolher(usuario, 'arga', /Argamassa/);
    await usuario.type(screen.getByLabelText('Coeficiente'), '1');
    await usuario.type(screen.getByLabelText('Preço unitário'), '1');
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    expect(await screen.findByText(/já está nesta composição/)).toBeDefined();
  });
});

describe('Editar e remover item', () => {
  it('alterar o coeficiente salva ao sair do campo, só com o coeficiente', async () => {
    const usuario = abrir();

    const campo = within(linhaDe('Pedreiro')).getByLabelText('Coeficiente de Pedreiro');
    await usuario.clear(campo);
    await usuario.type(campo, '1');
    await usuario.tab();

    await waitFor(() => expect(atualizarItem).toHaveBeenCalledTimes(1));
    expect(atualizarItem.mock.calls[0]![0]).toEqual({ itemId: 'l2', input: { coefficient: 1 } });
  });

  it('alterar o preço salva só o preço', async () => {
    const usuario = abrir();

    const campo = within(linhaDe('Bloco cerâmico')).getByLabelText('Preço unitário de Bloco cerâmico');
    await usuario.clear(campo);
    await usuario.type(campo, '2');
    await usuario.tab();

    await waitFor(() => expect(atualizarItem).toHaveBeenCalledTimes(1));
    expect(atualizarItem.mock.calls[0]![0]).toEqual({ itemId: 'l1', input: { unitPrice: 2 } });
  });

  it('passar pelo campo sem mudar o valor não salva', async () => {
    const usuario = abrir();

    await usuario.click(within(linhaDe('Pedreiro')).getByLabelText('Coeficiente de Pedreiro'));
    await usuario.tab();

    expect(atualizarItem).not.toHaveBeenCalled();
  });

  it('coeficiente zero numa linha não salva e avisa', async () => {
    const usuario = abrir();

    const campo = within(linhaDe('Servente')).getByLabelText('Coeficiente de Servente');
    await usuario.clear(campo);
    await usuario.type(campo, '0');
    await usuario.tab();

    expect(await screen.findByText('O coeficiente deve ser maior que zero.')).toBeDefined();
    expect(atualizarItem).not.toHaveBeenCalled();
  });

  it('remover pede confirmação e remove a linha certa', async () => {
    const usuario = abrir();

    await usuario.click(within(linhaDe('Betoneira')).getByRole('button', { name: 'Remover Betoneira' }));
    await usuario.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Remover' }),
    );

    await waitFor(() => expect(removerItem).toHaveBeenCalledWith('l4'));
  });
});

describe('Quem só consulta', () => {
  beforeEach(() => {
    permissoes = ['composicoes.view'];
  });

  it('vê itens e custos, mas não edita, não inclui e não remove', () => {
    abrir();

    expect(screen.getByTestId('custo-unitario').textContent).toMatch(/R\$\s?75,00/);
    expect(within(linhaDe('Pedreiro')).getByText('0,8')).toBeDefined();
    expect(screen.queryByLabelText('Coeficiente de Pedreiro')).toBeNull();
    expect(screen.queryByRole('button', { name: /Adicionar/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Remover/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Editar/ })).toBeNull();
  });
});
