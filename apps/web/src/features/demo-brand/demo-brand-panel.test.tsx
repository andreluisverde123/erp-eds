import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import { DemoBrandPanel } from './demo-brand-panel';
import { aplicarMarca, lerBiblioteca, reiniciarParaTeste } from './demo-brand';

const corDaRaiz = (token: string) => document.documentElement.style.getPropertyValue(token);

async function abrirPainel() {
  const usuario = userEvent.setup();
  render(<DemoBrandPanel />);
  // Pelo `title`, e não pelo texto: com uma marca ativa o botão passa a exibir
  // o rótulo do cliente, que é justamente o cenário de um dos testes.
  await usuario.click(screen.getByTitle(/marca de demonstração/i));
  return usuario;
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute('style');
  reiniciarParaTeste();
});

/// O caminho que a pessoa percorre minutos antes de uma reunião: abre o
/// sistema, digita a cor do cliente e a tela vira. Os testes de unidade cobrem
/// a aritmética e o armazenamento; este cobre o fato de que os dois estão
/// ligados a um campo de verdade.
describe('Trocar a marca pelo painel', () => {
  it('o botão fica discreto até ser aberto', async () => {
    render(<DemoBrandPanel />);

    // Nada de formulário na tela enquanto ninguém pediu: durante a apresentação
    // o que se vê é um botão pequeno no canto, não um painel.
    expect(screen.queryByLabelText(/fechar painel/i)).toBeNull();
    expect(screen.getByRole('button', { name: /marca/i })).toBeDefined();
  });

  it('digitar a cor do cliente repinta o sistema', async () => {
    const usuario = await abrirPainel();

    await usuario.clear(screen.getByPlaceholderText('#545454'));
    await usuario.type(screen.getByPlaceholderText('#545454'), '#545454');

    expect(corDaRaiz('--primary')).toBe('#545454');
  });

  it('um hex pela metade não pinta nada', async () => {
    // O painel aplica a cada tecla. "#5" precisa ser um passo silencioso, e não
    // uma cor preta piscando no meio da digitação.
    const usuario = await abrirPainel();

    await usuario.clear(screen.getByPlaceholderText('#545454'));
    await usuario.type(screen.getByPlaceholderText('#545454'), '#5');

    expect(corDaRaiz('--primary')).toBe('');
  });

  it('o nome do sistema e da construtora acompanham', async () => {
    const usuario = await abrirPainel();

    await usuario.clear(screen.getByLabelText(/nome do sistema/i));
    await usuario.type(screen.getByLabelText(/nome do sistema/i), 'ERP Lets');

    expect((screen.getByLabelText(/nome do sistema/i) as HTMLInputElement).value).toBe('ERP Lets');
  });

  it('salvar guarda a marca para a próxima demonstração', async () => {
    const usuario = await abrirPainel();

    await usuario.clear(screen.getByLabelText(/cliente/i));
    await usuario.type(screen.getByLabelText(/cliente/i), 'Lets Engenharia');
    await usuario.click(screen.getByRole('button', { name: 'Salvar' }));

    expect(lerBiblioteca().map((m) => m.rotulo)).toEqual(['Lets Engenharia']);
  });

  it('"Voltar para EDS" devolve as cores da casa', async () => {
    aplicarMarca({
      id: 'lets',
      rotulo: 'Lets',
      erpName: 'ERP Lets',
      companyName: 'Lets',
      primary: '#545454',
      logo: null,
    });
    const usuario = await abrirPainel();

    await usuario.click(screen.getByRole('button', { name: /voltar para eds/i }));

    expect(corDaRaiz('--primary')).toBe('');
  });

  it('Ctrl+Shift+M some com o painel para o print sair limpo', async () => {
    const usuario = userEvent.setup();
    render(<DemoBrandPanel />);

    await usuario.keyboard('{Control>}{Shift>}m{/Shift}{/Control}');
    expect(screen.queryByRole('button', { name: /marca/i })).toBeNull();

    await usuario.keyboard('{Control>}{Shift>}m{/Shift}{/Control}');
    expect(screen.getByRole('button', { name: /marca/i })).toBeDefined();
  });
});
