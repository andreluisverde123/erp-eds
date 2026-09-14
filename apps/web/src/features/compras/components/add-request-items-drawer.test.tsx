import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { AddRequestItemsDrawer } from './add-request-items-drawer';

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock('../hooks/use-purchase-request-mutations', () => ({
  useAddPurchaseRequestItems: () => ({ mutateAsync, isPending: false }),
}));

// A célula de descrição consulta o histórico da empresa a cada tecla. Aqui ela
// não é o assunto, e uma chamada de rede no teste só traria intermitência.
vi.mock('../item-suggestions', () => ({ searchItemSuggestions: vi.fn().mockResolvedValue([]) }));

const { searchCatalogSuggestions } = vi.hoisted(() => ({ searchCatalogSuggestions: vi.fn() }));
vi.mock('../catalog-suggestions', () => ({ searchCatalogSuggestions }));

const CIMENTO_DO_CADASTRO = {
  id: 'insumo-1',
  code: 'MAT-0001',
  name: 'Cimento CP II 50kg',
  unit: 'SC',
};

function abrir() {
  const onOpenChange = vi.fn();
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <AddRequestItemsDrawer
        open
        onOpenChange={onOpenChange}
        purchaseRequestId="pr-1"
        requestCode="SOL-0007"
      />
    </QueryClientProvider>,
  );
  // `pointerEventsCheck: 0`: o Radix marca o body com `pointer-events: none`
  // enquanto o Sheet está aberto, e o userEvent recusa clicar em algo assim.
  return { usuario: userEvent.setup({ pointerEventsCheck: 0 }), onOpenChange };
}

/// O `Select` do Radix não abre com clique sintético no jsdom — falta o evento
/// de ponteiro. Pelo teclado o caminho é o mesmo que uma pessoa usaria.
async function escolherUnidade(usuario: ReturnType<typeof userEvent.setup>, nome: RegExp) {
  screen.getByLabelText(/unidade da linha 1/i).focus();
  await usuario.keyboard('{Enter}');
  await usuario.click(await screen.findByRole('option', { name: nome }));
}

beforeEach(() => {
  mutateAsync.mockReset();
  mutateAsync.mockResolvedValue(undefined);
  searchCatalogSuggestions.mockReset();
  searchCatalogSuggestions.mockResolvedValue([]);
});

/// O botão "Incluir itens" precisa INCLUIR, ou dizer por que não.
///
/// A gaveta reaproveita a grade do formulário de solicitação, e chegou a
/// reaproveitar também o schema dele — que exige a obra. Como a obra não está
/// na tela da gaveta, todo envio era reprovado num campo invisível: o
/// `handleSubmit` não chamava o `onSubmit`, nenhuma mensagem aparecia e o
/// clique simplesmente não fazia nada. É esse silêncio que estes testes travam.
describe('Incluir itens numa solicitação já enviada', () => {
  it('envia o item digitado, mesmo sem obra no formulário', async () => {
    const { usuario, onOpenChange } = abrir();

    await usuario.type(screen.getByLabelText(/item da linha 1/i), 'Cimento CPII 50kg');
    await escolherUnidade(usuario, /saco/i);
    await usuario.type(screen.getByLabelText(/quantidade da linha 1/i), '10');

    await usuario.click(screen.getByRole('button', { name: /incluir itens/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith([
      { description: 'Cimento CPII 50kg', unit: 'SC', quantity: 10, notes: undefined },
    ]);
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it('recusa em voz alta quando não há nada digitado', async () => {
    const { usuario } = abrir();

    await usuario.click(screen.getByRole('button', { name: /incluir itens/i }));

    expect(await screen.findByText(/informe ao menos um item para incluir/i)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  /// A linha incompleta não pode passar em silêncio nem ir para a API: o erro
  /// pertence à célula, que é onde a pessoa pode corrigi-lo.
  it('aponta a célula quando o item está pela metade', async () => {
    const { usuario } = abrir();

    await usuario.type(screen.getByLabelText(/item da linha 1/i), 'Cimento CPII 50kg');
    await usuario.click(screen.getByRole('button', { name: /incluir itens/i }));

    expect(await screen.findByText(/informe a unidade/i)).toBeTruthy();
    expect(mutateAsync).not.toHaveBeenCalled();
  });
});

/// O vínculo com o cadastro de insumos, de ponta a ponta na grade.
describe('Item escolhido do cadastro de insumos', () => {
  it('escolher do cadastro envia o insumo, com nome e unidade dele', async () => {
    searchCatalogSuggestions.mockResolvedValue([CIMENTO_DO_CADASTRO]);
    const { usuario } = abrir();

    await usuario.type(screen.getByLabelText(/item da linha 1/i), 'cim');
    await usuario.click(await screen.findByText('Cimento CP II 50kg'));
    await usuario.type(screen.getByLabelText(/quantidade da linha 1/i), '10');
    await usuario.click(screen.getByRole('button', { name: /incluir itens/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0]![0]).toEqual([
      {
        catalogItemId: 'insumo-1',
        description: 'Cimento CP II 50kg',
        unit: 'SC',
        quantity: 10,
        notes: undefined,
      },
    ]);
  });

  it('a célula mostra o código do insumo escolhido', async () => {
    searchCatalogSuggestions.mockResolvedValue([CIMENTO_DO_CADASTRO]);
    const { usuario } = abrir();

    await usuario.type(screen.getByLabelText(/item da linha 1/i), 'cim');
    await usuario.click(await screen.findByText('Cimento CP II 50kg'));

    expect(await screen.findByTitle('Insumo do cadastro')).toHaveProperty(
      'textContent',
      'MAT-0001',
    );
  });

  it('digitar por cima desfaz o vínculo: a linha vira texto livre', async () => {
    searchCatalogSuggestions.mockResolvedValue([CIMENTO_DO_CADASTRO]);
    const { usuario } = abrir();

    const item = screen.getByLabelText(/item da linha 1/i);
    await usuario.type(item, 'cim');
    await usuario.click(await screen.findByText('Cimento CP II 50kg'));
    await usuario.type(item, ' branco');
    await usuario.keyboard('{Escape}');
    await usuario.type(screen.getByLabelText(/quantidade da linha 1/i), '4');
    await usuario.click(screen.getByRole('button', { name: /incluir itens/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const [linha] = mutateAsync.mock.calls[0]![0];
    expect(linha.catalogItemId).toBeUndefined();
    expect(linha.description).toBe('Cimento CP II 50kg branco');
    // A unidade que veio do insumo fica: é o que a pessoa vê na tela.
    expect(linha.unit).toBe('SC');
  });

  it('sem cadastro, o texto livre segue funcionando como antes', async () => {
    const { usuario } = abrir();

    await usuario.type(screen.getByLabelText(/item da linha 1/i), 'Material inédito');
    await escolherUnidade(usuario, /unidade/i);
    await usuario.type(screen.getByLabelText(/quantidade da linha 1/i), '1');
    await usuario.click(screen.getByRole('button', { name: /incluir itens/i }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    const [linha] = mutateAsync.mock.calls[0]![0];
    expect(linha).toMatchObject({ description: 'Material inédito', unit: 'UN', quantity: 1 });
    expect(linha.catalogItemId).toBeUndefined();
  });
});
