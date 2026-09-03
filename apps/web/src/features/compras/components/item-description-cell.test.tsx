import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ItemDescriptionCell } from './item-description-cell';
import * as api from '../item-suggestions';

vi.mock('../item-suggestions');
const mocked = vi.mocked(api);

const SUGESTOES = [
  { description: 'Cimento CPII 50kg', timesUsed: 12 },
  { description: 'Cimento CPIV 50kg', timesUsed: 3 },
];

/// `localSuggestions` são as descrições das OUTRAS linhas da solicitação
/// aberta — o que a grade passa de verdade. Vazio reproduz o comportamento
/// anterior, e é por isso que os testes antigos continuam valendo sem mudar.
function montar(valorInicial = '', localSuggestions: string[] = []) {
  const onChange = vi.fn();
  const onPick = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Campo() {
    return (
      <ItemDescriptionCell
        value={valorInicial}
        onChange={onChange}
        onPick={onPick}
        localSuggestions={localSuggestions}
        aria-label="Item da linha 1"
      />
    );
  }

  render(
    <QueryClientProvider client={client}>
      <Campo />
    </QueryClientProvider>,
  );

  return { onChange, onPick, campo: screen.getByLabelText('Item da linha 1') };
}

describe('sugestão de material', () => {
  it('busca já na PRIMEIRA letra', async () => {
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { campo } = montar('c');

    await userEvent.setup().click(campo);

    // O mínimo era dois, e não por decisão de produto: com `ILIKE '%c%'` o
    // índice trigram não é usado abaixo de três caracteres, e a primeira letra
    // custava varredura de tabela. Com o índice de prefixo sobre `searchKey`,
    // ela é uma consulta indexada — e é onde a sugestão poupa mais digitação.
    await waitFor(() => expect(mocked.searchItemSuggestions).toHaveBeenCalledWith('c'));
    expect(await screen.findByText('Cimento CPII 50kg')).toBeDefined();
  });

  it('campo vazio não busca nada', async () => {
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { campo } = montar('');

    await userEvent.setup().click(campo);

    await new Promise((r) => setTimeout(r, 300));
    expect(mocked.searchItemSuggestions).not.toHaveBeenCalled();
  });

  it('avisa enquanto busca, em vez de mostrar painel vazio', async () => {
    mocked.searchItemSuggestions.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(SUGESTOES), 200)),
    );
    const { campo } = montar('cimento');

    await userEvent.setup().click(campo);

    expect(await screen.findByText('Buscando materiais…')).toBeDefined();
  });

  it('diz quando não existe o material, em vez de não dizer nada', async () => {
    mocked.searchItemSuggestions.mockResolvedValue([]);
    const { campo } = montar('xyz');

    await userEvent.setup().click(campo);

    // Três situações produziam a mesma tela vazia — buscando, não achou e
    // quebrou. O relato chegava como "o autocomplete não funciona", sem como
    // distinguir qual das três era.
    expect(await screen.findByText(/Nenhum material encontrado/)).toBeDefined();
  });

  it('falha na busca não fica invisível, e não trava a digitação', async () => {
    mocked.searchItemSuggestions.mockRejectedValue(new Error('403'));
    const { campo } = montar('cimento');

    await userEvent.setup().click(campo);

    expect(await screen.findByText(/Não foi possível buscar sugestões/)).toBeDefined();
  });

  it('mostra o que já foi pedido, e quantas vezes', async () => {
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { campo } = montar('cimento');

    await userEvent.setup().click(campo);

    expect(await screen.findByText('Cimento CPII 50kg')).toBeDefined();
    // O contador separa o material do dia a dia do que foi pedido uma vez.
    expect(screen.getByText('12×')).toBeDefined();
  });

  it('escolher preenche SÓ o nome', async () => {
    const usuario = userEvent.setup();
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { onPick, campo } = montar('cimento');

    await usuario.click(campo);
    await usuario.click(await screen.findByText('Cimento CPII 50kg'));

    // Unidade, quantidade e observação são decisões daquele pedido, não do
    // material: a mesma tinta vem em lata numa compra e em galão na outra.
    expect(onPick).toHaveBeenCalledWith({ description: 'Cimento CPII 50kg', timesUsed: 12 });
  });

  it('não sugere exatamente o que já está escrito', async () => {
    mocked.searchItemSuggestions.mockResolvedValue([SUGESTOES[0]!]);
    const { campo } = montar('Cimento CPII 50kg');

    await userEvent.setup().click(campo);

    // Repetir o que a pessoa acabou de digitar é ruído.
    await waitFor(() => expect(mocked.searchItemSuggestions).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: /Cimento CPII 50kg/ })).toBeNull();
  });

  it('as setas percorrem a lista sem tirar a mão do teclado', async () => {
    const usuario = userEvent.setup();
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { onPick, campo } = montar('cimento');

    await usuario.click(campo);
    await screen.findByText('Cimento CPII 50kg');
    await usuario.keyboard('{ArrowDown}{Enter}');

    // É uma grade de digitação: obrigar o mouse custaria mais que redigitar.
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Cimento CPIV 50kg' }),
    );
  });

  it('Escape fecha a lista sem escolher nada', async () => {
    const usuario = userEvent.setup();
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { onPick, campo } = montar('cimento');

    await usuario.click(campo);
    await screen.findByText('Cimento CPII 50kg');
    await usuario.keyboard('{Escape}');

    await waitFor(() => expect(screen.queryByText('Cimento CPII 50kg')).toBeNull());
    expect(onPick).not.toHaveBeenCalled();
  });
});

/// A repetição que mais custa é a de ANTES de salvar: a fonte do servidor é o
/// que está gravado, e o material digitado uma linha acima ainda não está.
describe('sugestão do que já foi digitado nesta solicitação', () => {
  it('sugere o material de outra linha, mesmo sem nada gravado', async () => {
    // Banco vazio de propósito: é o caso da solicitação nova, em que TODA
    // sugestão útil está na tela e nenhuma está no banco.
    mocked.searchItemSuggestions.mockResolvedValue([]);
    const { campo } = montar('Telha', ['Telha fosca']);

    await userEvent.setup().click(campo);

    expect(await screen.findByText('Telha fosca')).toBeDefined();
    // Sem contador: "3×" num material que só existe duas linhas acima seria
    // uma frequência inventada.
    expect(screen.getByText('nesta solicitação')).toBeDefined();
  });

  it('escolher uma local preenche só o nome, como as do histórico', async () => {
    const usuario = userEvent.setup();
    mocked.searchItemSuggestions.mockResolvedValue([]);
    const { onPick, campo } = montar('Telha', ['Telha fosca']);

    await usuario.click(campo);
    await usuario.click(await screen.findByText('Telha fosca'));

    expect(onPick).toHaveBeenCalledWith({ description: 'Telha fosca', timesUsed: 1 });
  });

  it('não repete o material que o banco também devolve', async () => {
    mocked.searchItemSuggestions.mockResolvedValue([
      { description: 'Telha fosca', timesUsed: 9 },
    ]);
    const { campo } = montar('Telha', ['Telha fosca']);

    await userEvent.setup().click(campo);

    // Uma entrada só, e a da própria solicitação vence: é a mais próxima do
    // que a pessoa está fazendo agora.
    await waitFor(() => expect(mocked.searchItemSuggestions).toHaveBeenCalled());
    expect(screen.getAllByText('Telha fosca')).toHaveLength(1);
    expect(screen.queryByText('9×')).toBeNull();
  });

  it('casa ignorando acento e caixa, sem corrigir a grafia de ninguém', async () => {
    mocked.searchItemSuggestions.mockResolvedValue([]);
    const { campo } = montar('concreto', ['Concreto usinado FCK 25']);

    await userEvent.setup().click(campo);

    // O texto exibido é o que a pessoa digitou lá em cima — a normalização
    // serve para COMPARAR, não para reescrever.
    expect(await screen.findByText('Concreto usinado FCK 25')).toBeDefined();
  });

  it('uma letra já sugere o material da linha de cima', async () => {
    mocked.searchItemSuggestions.mockResolvedValue([]);
    const { campo } = montar('t', ['Telha fosca']);

    await userEvent.setup().click(campo);

    // Mesmo mínimo das sugestões do servidor: uma letra basta nas duas fontes.
    expect(await screen.findByText('Telha fosca')).toBeDefined();
  });

  it('linha em branco não vira sugestão', async () => {
    mocked.searchItemSuggestions.mockResolvedValue([]);
    // A grade sempre mantém uma linha vazia no fim; ela não é um material.
    const { campo } = montar('Telha', ['', '   ', 'Telha fosca']);

    await userEvent.setup().click(campo);

    expect(await screen.findByText('Telha fosca')).toBeDefined();
    expect(screen.getAllByRole('button')).toHaveLength(1);
  });
});
