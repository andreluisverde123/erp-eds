import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import {
  SELECT_SEARCH_THRESHOLD,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@repo/ui';

/// Regra do produto: dropdown com muitas opções tem busca. Mora no `Select`
/// do design system, então vale para toda tela sem código nela — e este teste
/// trava a regra no componente, não numa tela.

const CIDADES = [
  'São Paulo',
  'Curitiba',
  'Florianópolis',
  'Joinville',
  'Brasília',
  'Águas Claras',
  'Porto Alegre',
  'Belo Horizonte',
  'Goiânia',
  'São José dos Campos',
];

function montar(opcoes: string[], valor?: string) {
  render(
    <Select defaultOpen defaultValue={valor}>
      <SelectTrigger>
        <SelectValue placeholder="Cidade" />
      </SelectTrigger>
      <SelectContent>
        {opcoes.map((cidade) => (
          <SelectItem key={cidade} value={cidade}>
            {cidade}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>,
  );
}

function visiveis() {
  return screen
    .getAllByRole('option', { hidden: true })
    .filter((opcao) => !opcao.hasAttribute('hidden'))
    .map((opcao) => opcao.textContent);
}

describe('Select com muitas opções', () => {
  it(`abre com campo de busca a partir de ${SELECT_SEARCH_THRESHOLD} opções`, () => {
    montar(CIDADES);

    expect(screen.getByRole('textbox', { name: 'Buscar opção' })).toBeDefined();
  });

  it('lista curta continua sem busca', () => {
    montar(CIDADES.slice(0, SELECT_SEARCH_THRESHOLD - 1));

    expect(screen.queryByRole('textbox', { name: 'Buscar opção' })).toBeNull();
  });

  it('filtra sem acento, sem maiúscula e por todas as palavras', () => {
    montar(CIDADES);
    const busca = screen.getByRole('textbox', { name: 'Buscar opção' });

    fireEvent.change(busca, { target: { value: 'sao' } });
    expect(visiveis()).toEqual(['São Paulo', 'São José dos Campos']);

    fireEvent.change(busca, { target: { value: 'CAMPOS sao' } });
    expect(visiveis()).toEqual(['São José dos Campos']);

    fireEvent.change(busca, { target: { value: 'aguas' } });
    expect(visiveis()).toEqual(['Águas Claras']);
  });

  it('avisa quando nada casa', () => {
    montar(CIDADES);

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar opção' }), {
      target: { value: 'manaus' },
    });

    expect(visiveis()).toEqual([]);
    expect(screen.getByText('Nenhuma opção encontrada.').hasAttribute('hidden')).toBe(false);
  });

  it('a opção escolhida continua no gatilho mesmo escondida pelo filtro', () => {
    montar(CIDADES, 'Curitiba');

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar opção' }), {
      target: { value: 'sao' },
    });

    // Com a lista aberta o Radix esconde o resto da página do leitor de tela.
    expect(screen.getByRole('combobox', { hidden: true }).textContent).toContain('Curitiba');
  });
});
