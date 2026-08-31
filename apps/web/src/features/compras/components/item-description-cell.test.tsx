import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { ItemDescriptionCell } from './item-description-cell';
import * as api from '../item-suggestions';

vi.mock('../item-suggestions');
const mocked = vi.mocked(api);

const SUGESTOES = [
  { description: 'Cimento CPII 50kg', unit: 'SC', timesUsed: 12 },
  { description: 'Cimento CPIV 50kg', unit: 'SC', timesUsed: 3 },
];

function montar(valorInicial = '') {
  const onChange = vi.fn();
  const onPick = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  function Campo() {
    return (
      <ItemDescriptionCell
        value={valorInicial}
        onChange={onChange}
        onPick={onPick}
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
  it('não busca com menos de dois caracteres', async () => {
    const usuario = userEvent.setup();
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { campo } = montar();

    await usuario.click(campo);
    await usuario.keyboard('c');

    // Uma letra sugere quase tudo e não ajuda a escolher — e ainda gastaria
    // uma consulta por tecla logo no começo da digitação.
    await new Promise((r) => setTimeout(r, 350));
    expect(mocked.searchItemSuggestions).not.toHaveBeenCalled();
  });

  it('mostra o que já foi pedido, com a unidade', async () => {
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { campo } = montar('cimento');

    await userEvent.setup().click(campo);

    expect(await screen.findByText('Cimento CPII 50kg')).toBeDefined();
    expect(screen.getAllByText('SC').length).toBeGreaterThan(0);
    // O contador separa o material do dia a dia do que foi pedido uma vez.
    expect(screen.getByText('12×')).toBeDefined();
  });

  it('escolher preenche descrição E unidade', async () => {
    const usuario = userEvent.setup();
    mocked.searchItemSuggestions.mockResolvedValue(SUGESTOES);
    const { onPick, campo } = montar('cimento');

    await usuario.click(campo);
    await usuario.click(await screen.findByText('Cimento CPII 50kg'));

    // A unidade é o segundo campo que a pessoa deixaria de digitar; sugerir só
    // o nome resolveria metade do problema.
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ description: 'Cimento CPII 50kg', unit: 'SC' }),
    );
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
