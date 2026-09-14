import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OrcamentoDetailPage } from './orcamento-detail-page';
import type { Budget, BudgetItem, BudgetNode, BudgetVersion } from '@/features/orcamentos/types';
import { ApiError } from '@/lib/api-client';

const mutacoes = {
  fechar: vi.fn(),
  revisar: vi.fn(),
  oficial: vi.fn(),
  bdi: vi.fn(),
  importar: vi.fn(),
  excluir: vi.fn(),
  addNode: vi.fn(),
  updateNode: vi.fn(),
  moveNode: vi.fn(),
  removeNode: vi.fn(),
  addItem: vi.fn(),
  updateItem: vi.fn(),
  removeItem: vi.fn(),
};
const buscarComposicoes = vi.fn();
const buscarInsumos = vi.fn();
const buscarReferencias = vi.fn();
const exportar = vi.fn();
const previaDaPlanilha = vi.fn();
let versoes: BudgetVersion[] = [];
let orcamento: Budget;
let permissoes: string[] = [];

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoes } }),
}));

vi.mock('@/features/orcamentos/hooks/use-budgets', () => ({
  useBudget: () => ({ data: orcamento, isLoading: false, isError: false }),
  useCloseBudget: () => ({ mutateAsync: mutacoes.fechar, isPending: false }),
  useReviseBudget: () => ({ mutateAsync: mutacoes.revisar, isPending: false }),
  useSetOfficialBudget: () => ({ mutateAsync: mutacoes.oficial, isPending: false }),
  useUpdateBudgetBdi: () => ({ mutateAsync: mutacoes.bdi, isPending: false }),
  useImportBudget: () => ({ mutateAsync: mutacoes.importar, isPending: false }),
  useBudgetVersions: () => ({ data: versoes }),
  useBudgetReferenceDatasetOptions: () => ({
    data: [
      { id: 'ds1', source: 'SINAPI', competence: '2026-08', uf: 'SP', locality: 'SAO PAULO', regime: 'NAO_DESONERADO', versionLabel: '', itemCount: 4876, compositionCount: 10547 },
    ],
    isLoading: false,
  }),
  useDeleteBudget: () => ({ mutateAsync: mutacoes.excluir, isPending: false }),
  useUpdateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useCreateBudget: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useConstructionSiteOptions: () => ({ data: [] }),
  useAddBudgetNode: () => ({ mutateAsync: mutacoes.addNode, isPending: false }),
  useUpdateBudgetNode: () => ({ mutateAsync: mutacoes.updateNode, isPending: false }),
  useMoveBudgetNode: () => ({ mutateAsync: mutacoes.moveNode, isPending: false }),
  useRemoveBudgetNode: () => ({ mutateAsync: mutacoes.removeNode, isPending: false }),
  useAddBudgetItem: () => ({ mutateAsync: mutacoes.addItem, isPending: false }),
  useUpdateBudgetItem: () => ({ mutateAsync: mutacoes.updateItem, isPending: false }),
  useRemoveBudgetItem: () => ({ mutateAsync: mutacoes.removeItem, isPending: false }),
}));

vi.mock('@/features/orcamentos/api', () => ({
  searchBudgetCompositionOptions: (_id: string, termo: string) => buscarComposicoes(termo),
  searchBudgetCatalogOptions: (_id: string, termo: string) => buscarInsumos(termo),
  searchBudgetReferenceOptions: (_id: string, datasetId: string, kind: string, termo: string) => buscarReferencias(datasetId, kind, termo),
  downloadBudgetExport: (...args: unknown[]) => exportar(...args),
  downloadBudgetImportTemplate: vi.fn(),
  previewBudgetImport: (...args: unknown[]) => previaDaPlanilha(...args),
}));

const no = (id: string, code: string, name: string, depth: number, subtotal: string, parentId: string | null = null): BudgetNode => ({
  id,
  parentId,
  code,
  depth,
  name,
  position: 0,
  itemCount: 0,
  subtotal,
  subtotalExact: subtotal,
});

const item = (extra: Partial<BudgetItem> & Pick<BudgetItem, 'id' | 'budgetNodeId' | 'description'>): BudgetItem => ({
  position: 0,
  source: 'MANUAL',
  compositionId: null,
  catalogItemId: null,
  referencePriceId: null,
  sourceCode: null,
  catalogItemType: null,
  unit: 'UN',
  quantity: '1.0000',
  unitCost: '1.0000',
  totalCost: '1.00',
  totalCostExact: '1.00000000',
  components: [],
  ...extra,
});

/// O orçamento como a API o devolve: EAP numerada em pré-ordem, subtotais e
/// totais calculados no servidor.
function exemplo(): Budget {
  return {
    id: 'b1',
    code: 'ORC-0001',
    version: 1,
    name: 'Orçamento executivo',
    description: null,
    referenceDate: '2026-09-01',
    status: 'DRAFT',
    closedAt: null,
    closedBy: null,
    createdBy: { name: 'Engenheira Ana' },
    createdAt: '2026-09-14T00:00:00.000Z',
    updatedAt: '2026-09-14T00:00:00.000Z',
    constructionSite: { id: 'obra-1', code: 'OBRA-01', name: 'Residencial Aurora' },
    itemCount: 3,
    nodeCount: 4,
    isOfficial: false,
    totalCost: '12650.50',
    totalCostExact: '12650.50000000',
    directCost: '12650.50',
    directCostExact: '12650.50000000',
    bdiPercent: '10.0000',
    bdiValue: '1265.05',
    finalPrice: '13915.55',
    bdiNote: 'AC 4%, lucro 6%',
    nodes: [
      no('n1', '1', 'Serviços preliminares', 1, '5350.50'),
      no('n11', '1.1', 'Canteiro', 2, '4500.00', 'n1'),
      no('n12', '1.2', 'Locação', 2, '850.50', 'n1'),
      no('n2', '2', 'Estrutura', 1, '7300.00'),
    ],
    items: [
      item({ id: 'i1', budgetNodeId: 'n11', description: 'Tapume provisório', source: 'CATALOG_ITEM', catalogItemId: 'c1', sourceCode: 'MAT-0001', unit: 'M2', quantity: '100.0000', unitCost: '45.0000', totalCost: '4500.00' }),
      item({ id: 'i2', budgetNodeId: 'n12', description: 'Gabarito', unit: 'VB', unitCost: '850.5000', totalCost: '850.50' }),
      item({
        id: 'i3',
        budgetNodeId: 'n2',
        description: 'Alvenaria de vedação',
        source: 'COMPOSITION',
        compositionId: 'comp1',
        sourceCode: 'COMP-0001',
        unit: 'M2',
        quantity: '118.7000',
        unitCost: '61.5000',
        totalCost: '7300.05',
        components: [
          { id: 'k1', catalogItemId: 'bloco', code: 'MAT-0002', name: 'Bloco cerâmico', type: 'MATERIAL', unit: 'UN', coefficient: '25.000000', unitPrice: '1.5000', totalCost: '37.5000' },
          { id: 'k2', catalogItemId: 'pedreiro', code: 'MO-0001', name: 'Pedreiro', type: 'LABOR', unit: 'H', coefficient: '0.800000', unitPrice: '30.0000', totalCost: '24.0000' },
        ],
      }),
    ],
  };
}

function abrir() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <MemoryRouter initialEntries={['/engenharia/orcamentos/b1']}>
        <Routes>
          <Route path="/engenharia/orcamentos/:id" element={<OrcamentoDetailPage />} />
          <Route path="/engenharia/orcamentos" element={<p>Lista de orçamentos</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

const grupo = (code: string) => screen.getByTestId(`grupo-${code}`);
const linha = (descricao: string) => screen.getByTestId(`item-${descricao}`);

beforeEach(() => {
  orcamento = exemplo();
  permissoes = ['orcamentos.view', 'orcamentos.manage'];
  Object.values(mutacoes).forEach((m) => m.mockReset());
  buscarComposicoes.mockReset();
  buscarInsumos.mockReset();
  buscarReferencias.mockReset();
  exportar.mockReset();
  previaDaPlanilha.mockReset();
  versoes = [];
});

describe('Visualização', () => {
  it('mostra a EAP numerada, os subtotais e o total geral do servidor', () => {
    abrir();

    expect(grupo('1').textContent).toMatch(/1\s*Serviços preliminares.*R\$\s?5\.350,50/);
    expect(grupo('1.1').textContent).toMatch(/1\.1\s*Canteiro.*R\$\s?4\.500,00/);
    expect(grupo('2').textContent).toMatch(/Estrutura.*R\$\s?7\.300,00/);
    expect(screen.getByTestId('total-geral').textContent).toMatch(/R\$\s?12\.650,50/);
    expect(screen.getByTestId('total-do-orcamento').textContent).toMatch(/R\$\s?12\.650,50/);
  });

  it('cada item mostra origem, unidade, quantidade, custo e total', () => {
    abrir();

    const tapume = linha('Tapume provisório');
    expect(tapume.textContent).toMatch(/MAT-0001.*Insumo.*M2.*R\$\s?4\.500,00/);
    expect(within(tapume).getByLabelText('Quantidade de Tapume provisório')).toHaveProperty('value', '100');
    expect(within(tapume).getByLabelText('Custo unitário de Tapume provisório')).toHaveProperty('value', '45');
  });

  it('item de composição mostra as linhas copiadas e não deixa editar o custo', async () => {
    const usuario = abrir();

    const alvenaria = linha('Alvenaria de vedação');
    expect(within(alvenaria).queryByLabelText(/Custo unitário de/)).toBeNull();
    expect(alvenaria.textContent).toMatch(/Composição.*R\$\s?61,50/);

    await usuario.click(within(alvenaria).getByRole('button', { name: /Ver composição/ }));

    expect(screen.getByText('Bloco cerâmico')).toBeDefined();
    expect(screen.getByText('Pedreiro')).toBeDefined();
  });
});

describe('Estrutura EAP', () => {
  it('adiciona grupo raiz', async () => {
    mutacoes.addNode.mockResolvedValue(orcamento);
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Nome do novo grupo'), 'Fundação');
    await usuario.click(screen.getByRole('button', { name: /Adicionar grupo/ }));

    await waitFor(() => expect(mutacoes.addNode).toHaveBeenCalledWith({ name: 'Fundação' }));
  });

  it('adiciona subgrupo pelo menu do grupo', async () => {
    mutacoes.addNode.mockResolvedValue(orcamento);
    const usuario = abrir();

    await usuario.click(within(grupo('2')).getByRole('button', { name: 'Ações do grupo 2' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Adicionar subgrupo/ }));
    const dialogo = await screen.findByRole('dialog');
    await usuario.type(within(dialogo).getByLabelText('Nome do grupo'), 'Pilares');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(mutacoes.addNode).toHaveBeenCalledWith({ name: 'Pilares', parentId: 'n2' }));
  });

  it('renomeia, move e exclui grupo', async () => {
    mutacoes.updateNode.mockResolvedValue(orcamento);
    const usuario = abrir();

    await usuario.click(within(grupo('1.2')).getByRole('button', { name: 'Ações do grupo 1.2' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Renomear/ }));
    const dialogo = await screen.findByRole('dialog');
    const campo = within(dialogo).getByLabelText('Nome do grupo');
    expect(campo).toHaveProperty('value', 'Locação');
    await usuario.clear(campo);
    await usuario.type(campo, 'Locação da obra');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(mutacoes.updateNode).toHaveBeenCalledWith({ nodeId: 'n12', name: 'Locação da obra' }));

    await usuario.click(within(grupo('1.2')).getByRole('button', { name: 'Ações do grupo 1.2' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Mover para cima/ }));
    await waitFor(() => expect(mutacoes.moveNode).toHaveBeenCalledWith({ nodeId: 'n12', direction: 'UP' }));

    await usuario.click(within(grupo('1')).getByRole('button', { name: 'Ações do grupo 1' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Excluir grupo/ }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(confirmacao.textContent).toMatch(/subgrupos e os itens dele também/);
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(mutacoes.removeNode).toHaveBeenCalledWith('n1'));
  });
});

describe('Inclusão de itens', () => {
  async function abrirInclusao(usuario: ReturnType<typeof userEvent.setup>, code: string) {
    await usuario.click(within(grupo(code)).getByRole('button', { name: `Ações do grupo ${code}` }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Incluir item/ }));
    return screen.findByRole('dialog');
  }

  it('COMPOSIÇÃO: envia composição e quantidade — sem custo, que vem congelado da composição', async () => {
    buscarComposicoes.mockResolvedValue([{ id: 'comp1', code: 'COMP-0001', name: 'Alvenaria de vedação', unit: 'M2', itemCount: 2, unitCost: '61.5000' }]);
    mutacoes.addItem.mockResolvedValue(orcamento);
    const usuario = abrir();

    const gaveta = await abrirInclusao(usuario, '2');
    await usuario.type(within(gaveta).getByRole('combobox', { name: 'Composição' }), 'alv');
    await usuario.click(await screen.findByRole('option', { name: /Alvenaria de vedação/ }));
    expect(within(gaveta).getByTestId('custo-congelado').textContent).toMatch(/R\$\s?61,50 \/ M2.*congelado/);
    expect(within(gaveta).queryByLabelText(/Custo unitário/)).toBeNull();
    await usuario.type(within(gaveta).getByLabelText(/Quantidade/), '120,5');
    await usuario.click(within(gaveta).getByRole('button', { name: 'Incluir' }));

    await waitFor(() => expect(mutacoes.addItem).toHaveBeenCalledTimes(1));
    expect(mutacoes.addItem.mock.calls[0]![0]).toEqual({ budgetNodeId: 'n2', source: 'COMPOSITION', compositionId: 'comp1', quantity: 120.5 });
  });

  it('INSUMO: o custo começa com o preço vigente na data-base e pode ser alterado', async () => {
    buscarInsumos.mockResolvedValue([
      { id: 'c1', code: 'MAT-0001', name: 'Tapume provisório', unit: 'M2', type: 'MATERIAL', referencePrice: { unitPrice: '45.0000', unit: 'M2', referenceDate: '2026-08-20', source: 'MANUAL' } },
    ]);
    mutacoes.addItem.mockResolvedValue(orcamento);
    const usuario = abrir();

    const gaveta = await abrirInclusao(usuario, '1.1');
    await usuario.click(within(gaveta).getByRole('tab', { name: 'Insumo' }));
    await usuario.type(within(gaveta).getByRole('combobox', { name: 'Insumo' }), 'tap');
    await usuario.click(await screen.findByRole('option', { name: /Tapume provisório/ }));

    const custo = within(gaveta).getByLabelText(/Custo unitário/);
    expect(custo).toHaveProperty('value', '45');
    expect(within(gaveta).getByTestId('preco-sugerido').textContent).toMatch(/20\/08\/2026.*vigente na data-base/);

    await usuario.clear(custo);
    await usuario.type(custo, '44,9');
    await usuario.type(within(gaveta).getByLabelText(/Quantidade/), '100');
    await usuario.click(within(gaveta).getByRole('button', { name: 'Incluir' }));

    await waitFor(() => expect(mutacoes.addItem).toHaveBeenCalledTimes(1));
    expect(mutacoes.addItem.mock.calls[0]![0]).toEqual({ budgetNodeId: 'n11', source: 'CATALOG_ITEM', catalogItemId: 'c1', quantity: 100, unitCost: 44.9 });
  });

  it('INSUMO sem preço de referência: custo em branco para digitar', async () => {
    buscarInsumos.mockResolvedValue([{ id: 'c2', code: 'MAT-0009', name: 'Lona', unit: 'M2', type: 'MATERIAL', referencePrice: null }]);
    const usuario = abrir();

    const gaveta = await abrirInclusao(usuario, '1.1');
    await usuario.click(within(gaveta).getByRole('tab', { name: 'Insumo' }));
    await usuario.type(within(gaveta).getByRole('combobox', { name: 'Insumo' }), 'lon');
    await usuario.click(await screen.findByRole('option', { name: /Lona/ }));

    expect(within(gaveta).getByLabelText(/Custo unitário/)).toHaveProperty('value', '');
    expect(within(gaveta).getByTestId('preco-sugerido').textContent).toMatch(/Sem preço de referência/);
  });

  it('MANUAL: envia descrição, unidade, quantidade e custo', async () => {
    mutacoes.addItem.mockResolvedValue(orcamento);
    const usuario = abrir();

    const gaveta = await abrirInclusao(usuario, '1.2');
    await usuario.click(within(gaveta).getByRole('tab', { name: 'Manual' }));
    await usuario.type(within(gaveta).getByLabelText('Descrição'), 'Taxa de ligação provisória');
    within(gaveta).getByLabelText('Unidade').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /^VB —/ }));
    await usuario.type(within(gaveta).getByLabelText(/Quantidade/), '1');
    await usuario.type(within(gaveta).getByLabelText(/Custo unitário/), '1250,75');
    await usuario.click(within(gaveta).getByRole('button', { name: 'Incluir' }));

    await waitFor(() => expect(mutacoes.addItem).toHaveBeenCalledTimes(1));
    expect(mutacoes.addItem.mock.calls[0]![0]).toEqual({
      budgetNodeId: 'n12',
      source: 'MANUAL',
      description: 'Taxa de ligação provisória',
      unit: 'VB',
      quantity: 1,
      unitCost: 1250.75,
    });
  });

  it('quantidade zero não chama o backend', async () => {
    const usuario = abrir();

    const gaveta = await abrirInclusao(usuario, '1.2');
    await usuario.click(within(gaveta).getByRole('tab', { name: 'Manual' }));
    await usuario.type(within(gaveta).getByLabelText('Descrição'), 'X');
    await usuario.type(within(gaveta).getByLabelText(/Quantidade/), '0');
    await usuario.click(within(gaveta).getByRole('button', { name: 'Incluir' }));

    expect(await within(gaveta).findByText('A quantidade deve ser maior que zero.')).toBeDefined();
    expect(mutacoes.addItem).not.toHaveBeenCalled();
  });
});

describe('Edição e exclusão de itens no rascunho', () => {
  it('alterar a quantidade salva ao sair do campo', async () => {
    mutacoes.updateItem.mockResolvedValue(orcamento);
    const usuario = abrir();

    const campo = within(linha('Tapume provisório')).getByLabelText('Quantidade de Tapume provisório');
    await usuario.clear(campo);
    await usuario.type(campo, '120');
    await usuario.tab();

    await waitFor(() => expect(mutacoes.updateItem).toHaveBeenCalledWith({ itemId: 'i1', input: { quantity: 120 } }));
  });

  it('alterar o custo de insumo salva só o custo', async () => {
    mutacoes.updateItem.mockResolvedValue(orcamento);
    const usuario = abrir();

    const campo = within(linha('Tapume provisório')).getByLabelText('Custo unitário de Tapume provisório');
    await usuario.clear(campo);
    await usuario.type(campo, '50');
    await usuario.tab();

    await waitFor(() => expect(mutacoes.updateItem).toHaveBeenCalledWith({ itemId: 'i1', input: { unitCost: 50 } }));
  });

  it('excluir item pede confirmação', async () => {
    const usuario = abrir();

    await usuario.click(within(linha('Gabarito')).getByRole('button', { name: 'Excluir Gabarito' }));
    await usuario.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mutacoes.removeItem).toHaveBeenCalledWith('i2'));
  });
});

describe('Fechamento', () => {
  it('fechar pede confirmação e chama o fechamento', async () => {
    mutacoes.fechar.mockResolvedValue({ ...orcamento, status: 'CLOSED' });
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Fechar orçamento/ }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(confirmacao.textContent).toMatch(/não podem mais ser alterados/);
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Fechar orçamento' }));

    await waitFor(() => expect(mutacoes.fechar).toHaveBeenCalledTimes(1));
  });

  it('a recusa do fechamento aparece como veio', async () => {
    mutacoes.fechar.mockRejectedValue(new ApiError(400, 'Não é possível fechar o orçamento. O orçamento não tem nenhum item.'));
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Fechar orçamento/ }));
    await usuario.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Fechar orçamento' }));

    expect(await screen.findByText(/não tem nenhum item/)).toBeDefined();
  });

  it('FECHADO: só visualização — nenhum campo, botão ou menu de alteração', () => {
    orcamento = { ...exemplo(), status: 'CLOSED', closedAt: '2026-09-14T15:00:00.000Z', closedBy: { name: 'Engenheira Ana' } };
    abrir();

    expect(screen.getByText('Orçamento fechado')).toBeDefined();
    expect(screen.getByText(/por Engenheira Ana/)).toBeDefined();
    expect(screen.getByTestId('total-geral').textContent).toMatch(/R\$\s?12\.650,50/);
    expect(screen.queryByLabelText('Nome do novo grupo')).toBeNull();
    expect(screen.queryByLabelText(/Quantidade de/)).toBeNull();
    expect(screen.queryByRole('button', { name: /Ações do grupo/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Excluir|Fechar orçamento|Editar informações/ })).toBeNull();
    expect(linha('Tapume provisório').textContent).toMatch(/100.*R\$\s?45,00.*R\$\s?4\.500,00/);
  });

  it('quem só consulta vê o rascunho sem poder alterar', () => {
    permissoes = ['orcamentos.view'];
    abrir();

    expect(screen.queryByLabelText('Nome do novo grupo')).toBeNull();
    expect(screen.queryByRole('button', { name: /Fechar orçamento/ })).toBeNull();
    expect(screen.queryByLabelText(/Quantidade de/)).toBeNull();
  });
});

describe('Resumo, BDI e exportação (ORC-05)', () => {
  it('mostra custo direto, BDI, valor do BDI, preço final, grupos, itens e data-base', () => {
    abrir();
    expect(screen.getByTestId('total-do-orcamento').textContent).toMatch(/R\$\s?12\.650,50/);
    expect(screen.getByText('BDI (10%)')).toBeDefined();
    expect(screen.getByTestId('valor-do-bdi').textContent).toMatch(/R\$\s?1\.265,05/);
    expect(screen.getByTestId('preco-final').textContent).toMatch(/R\$\s?13\.915,55/);
    expect(screen.getByText('Grupos da EAP').nextSibling?.textContent).toBe('4');
    expect(screen.getByText(/BDI: AC 4%, lucro 6%/)).toBeDefined();
  });

  it('edita o BDI do rascunho', async () => {
    mutacoes.bdi.mockResolvedValue(orcamento);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /^BDI$/ }));
    const dialogo = await screen.findByRole('dialog');
    const campo = within(dialogo).getByLabelText('BDI (%)');
    expect(campo).toHaveProperty('value', '10');
    await usuario.clear(campo);
    await usuario.type(campo, '25,5');
    await usuario.click(within(dialogo).getByRole('button', { name: 'Salvar BDI' }));

    await waitFor(() => expect(mutacoes.bdi).toHaveBeenCalledWith({ bdiPercent: 25.5, bdiNote: 'AC 4%, lucro 6%' }));
  });

  it('exporta XLSX e PDF', async () => {
    exportar.mockResolvedValue(undefined);
    const usuario = abrir();
    await usuario.click(screen.getByRole('button', { name: /Exportar XLSX/ }));
    await usuario.click(screen.getByRole('button', { name: /Exportar PDF/ }));
    expect(exportar.mock.calls.map((chamada) => chamada[1])).toEqual(['xlsx', 'pdf']);
  });

  it('item de base referencial mostra fonte, código, competência, UF e regime, e o custo não se edita', async () => {
    orcamento = {
      ...exemplo(),
      items: [
        ...exemplo().items,
        item({
          id: 'i4',
          budgetNodeId: 'n2',
          code: '2.2',
          description: 'PISO PODOTÁTIL',
          source: 'REFERENCE',
          sourceCode: '104658',
          unit: 'M2',
          quantity: '12.5000',
          unitCost: '208.0000',
          totalCost: '2600.00',
          reference: { source: 'SINAPI', kind: 'COMPOSITION', code: '104658', competence: '2026-08', uf: 'SP', locality: 'SAO PAULO', regime: 'NAO_DESONERADO', versionLabel: '', datasetId: 'ds1', referenceItemId: null, referenceCompositionId: 'rc1' },
          referenceComponents: [
            { id: 'r1', position: 0, section: null, kind: 'INPUT', code: '36178', description: 'PISO TATIL LADRILHO', unit: 'UN', coefficient: '6.4375000', unitPrice: '20.3300', totalCost: '130.8700', situation: 'COM PREÇO' },
          ],
        }),
      ],
    };
    const usuario = abrir();

    const piso = linha('PISO PODOTÁTIL');
    expect(piso.textContent).toMatch(/2\.2.*SINAPI 104658 · 08\/2026 · SP · Não desonerado.*Base de referência/);
    expect(within(piso).queryByLabelText(/Custo unitário de/)).toBeNull();
    await usuario.click(within(piso).getByRole('button', { name: /Ver composição/ }));
    expect(screen.getByText('PISO TATIL LADRILHO')).toBeDefined();
  });

  it('BASE DE REFERÊNCIA: fonte/competência → busca → item com custo publicado → envia só o id e a quantidade', async () => {
    buscarReferencias.mockResolvedValue([
      { id: 'rc1', kind: 'COMPOSITION', code: '104658', description: 'PISO PODOTÁTIL', unit: 'M2', category: null, unitCost: '208.0000', componentCount: 5 },
    ]);
    mutacoes.addItem.mockResolvedValue(orcamento);
    const usuario = abrir();

    await usuario.click(within(grupo('2')).getByRole('button', { name: 'Ações do grupo 2' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Incluir item/ }));
    const gaveta = await screen.findByRole('dialog');
    await usuario.click(within(gaveta).getByRole('tab', { name: 'Base de referência' }));
    within(gaveta).getByLabelText('Fonte e competência').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /SINAPI · 08\/2026 · SP · Não desonerado/ }));
    await usuario.type(within(gaveta).getByRole('combobox', { name: 'Item da base' }), '1046');
    await usuario.click(await screen.findByRole('option', { name: /PISO PODOTÁTIL/ }));

    expect(buscarReferencias).toHaveBeenCalledWith('ds1', 'COMPOSITION', expect.stringContaining('1046'));
    expect(within(gaveta).getByTestId('referencia-escolhida').textContent).toMatch(/104658.*M2.*R\$\s?208,00.*SINAPI.*08\/2026.*SP — SAO PAULO · Não desonerado.*5 linhas analíticas/);
    expect(within(gaveta).queryByLabelText(/Custo unitário/)).toBeNull();
    await usuario.type(within(gaveta).getByLabelText(/Quantidade/), '12,5');
    await usuario.click(within(gaveta).getByRole('button', { name: 'Incluir' }));

    await waitFor(() => expect(mutacoes.addItem).toHaveBeenCalledTimes(1));
    expect(mutacoes.addItem.mock.calls[0]![0]).toEqual({ budgetNodeId: 'n2', source: 'REFERENCE', referenceCompositionId: 'rc1', quantity: 12.5 });
  });

  it('importação por planilha: analisar mostra a prévia, e só então confirma com o hash', async () => {
    orcamento = { ...exemplo(), nodes: [], items: [], itemCount: 0 };
    previaDaPlanilha.mockResolvedValue({
      fileHash: 'h'.repeat(64),
      errors: [],
      warnings: [],
      summary: { groupCount: 2, itemCount: 3, byType: { MANUAL: 1, INSUMO: 1, COMPOSICAO: 0, REFERENCIA: 1 }, directCost: '2745.38', directCostExact: '2745.38000000' },
      canImport: true,
    });
    mutacoes.importar.mockResolvedValue(orcamento);
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Importar planilha/ }));
    const dialogo = await screen.findByRole('dialog');
    const planilha = new File(['x'], 'orcamento.xlsx');
    await usuario.upload(within(dialogo).getByLabelText('Planilha (.xlsx)'), planilha);
    expect(within(dialogo).getByRole('button', { name: 'Confirmar importação' })).toHaveProperty('disabled', true);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Analisar' }));

    expect((await within(dialogo).findByTestId('previa-importacao')).textContent).toMatch(/Grupos2.*Itens3.*R\$\s?2\.745,38/);
    await usuario.click(within(dialogo).getByRole('button', { name: 'Confirmar importação' }));
    await waitFor(() => expect(mutacoes.importar).toHaveBeenCalledWith({ file: planilha, fileHash: 'h'.repeat(64), referenceDatasetId: undefined }));
  });

  it('planilha com erro: lista os erros e não deixa confirmar', async () => {
    orcamento = { ...exemplo(), nodes: [], items: [], itemCount: 0 };
    previaDaPlanilha.mockResolvedValue({
      fileHash: 'h'.repeat(64),
      errors: [{ row: 4, message: '1.2: insumo MAT-9999 não encontrado.' }],
      warnings: [],
      summary: { groupCount: 1, itemCount: 1, byType: { MANUAL: 1, INSUMO: 0, COMPOSICAO: 0, REFERENCIA: 0 }, directCost: '1.00', directCostExact: '1.00000000' },
      canImport: false,
    });
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Importar planilha/ }));
    const dialogo = await screen.findByRole('dialog');
    await usuario.upload(within(dialogo).getByLabelText('Planilha (.xlsx)'), new File(['x'], 'o.xlsx'));
    await usuario.click(within(dialogo).getByRole('button', { name: 'Analisar' }));

    expect(await within(dialogo).findByText(/Linha 4: 1\.2: insumo MAT-9999 não encontrado/)).toBeDefined();
    expect(within(dialogo).getByRole('button', { name: 'Confirmar importação' })).toHaveProperty('disabled', true);
    expect(mutacoes.importar).not.toHaveBeenCalled();
  });
});

describe('Versões e orçamento oficial (ORC-05)', () => {
  const fechado = () => ({ ...exemplo(), status: 'CLOSED' as const, closedAt: '2026-09-14T15:00:00.000Z', closedBy: { name: 'Engenheira Ana' } });

  it('fechado: nova revisão pede confirmação e abre a nova versão', async () => {
    orcamento = fechado();
    mutacoes.revisar.mockResolvedValue({ ...fechado(), id: 'b2', version: 2, status: 'DRAFT' });
    const usuario = abrir();

    expect(screen.queryByRole('button', { name: /^BDI$/ })).toBeNull();
    await usuario.click(screen.getByRole('button', { name: /Nova revisão/ }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(confirmacao.textContent).toMatch(/v2 em rascunho.*v1 continua fechada/);
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Criar revisão' }));

    await waitFor(() => expect(mutacoes.revisar).toHaveBeenCalledTimes(1));
  });

  it('fechado: definir como orçamento oficial é ação explícita', async () => {
    orcamento = fechado();
    mutacoes.oficial.mockResolvedValue({ ...fechado(), isOfficial: true });
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Definir como orçamento oficial/ }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(confirmacao.textContent).toMatch(/R\$\s?13\.915,55.*OBRA-01/);
    await usuario.click(within(confirmacao).getByRole('button', { name: 'Definir como oficial' }));
    await waitFor(() => expect(mutacoes.oficial).toHaveBeenCalledTimes(1));
  });

  it('rascunho não oferece revisão nem oficial; o oficial mostra o selo e não a ação', () => {
    abrir();
    expect(screen.queryByRole('button', { name: /Nova revisão|Definir como orçamento oficial/ })).toBeNull();
  });

  it('oficial: selo, sem a ação de definir', () => {
    orcamento = { ...fechado(), isOfficial: true };
    abrir();
    expect(screen.getByTestId('selo-oficial')).toBeDefined();
    expect(screen.queryByRole('button', { name: /Definir como orçamento oficial/ })).toBeNull();
  });

  it('histórico de versões', () => {
    versoes = [
      { id: 'b1', version: 1, status: 'CLOSED', closedAt: '2026-09-10T00:00:00.000Z', createdAt: '2026-09-01T00:00:00.000Z', revisedFromId: null, isOfficial: true },
      { id: 'b2', version: 2, status: 'DRAFT', closedAt: null, createdAt: '2026-09-14T00:00:00.000Z', revisedFromId: 'b1', isOfficial: false },
    ];
    abrir();
    const secao = screen.getByRole('region', { name: 'Versões' });
    expect(within(secao).getByRole('button', { name: 'v1 — Fechado · oficial' })).toBeDefined();
    expect(within(secao).getByRole('button', { name: 'v2 — Rascunho' })).toBeDefined();
  });

  it('quem só consulta exporta, mas não revisa nem define oficial', () => {
    orcamento = fechado();
    permissoes = ['orcamentos.view'];
    abrir();
    expect(screen.getByRole('button', { name: /Exportar PDF/ })).toBeDefined();
    expect(screen.queryByRole('button', { name: /Nova revisão|Definir como orçamento oficial/ })).toBeNull();
  });
});
