import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

import { QuickActions } from './quick-actions';

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({
    user: {
      permissions: ['compras.request', 'engenharia.manage', 'rh.manage', 'terceiros.manage'],
    },
  }),
}));

function renderizar() {
  return render(
    <MemoryRouter>
      <QuickActions />
    </MemoryRouter>,
  );
}

/// Os quatro atalhos da Home eram arquivos SVG em `/public`, carregados por
/// `<img>`. A cor vinha assada dentro do arquivo, o que os tornava intocáveis
/// por CSS — e eles ficaram com `#DB027D`, o rosa da marca do produto que este
/// ERP deixou de ser, enquanto o resto do sistema virou vermelho EDS.
///
/// O que estes testes guardam não é "a cor está certa" (isso seria congelar um
/// hex), e sim que os ícones OBEDECEM ao token da marca. É a mesma propriedade
/// que faz eles acompanharem a marca de demonstração de graça.
describe('Ícones das ações rápidas seguem a marca', () => {
  it('são SVG inline, e não imagens de cor fixa', () => {
    const { container } = renderizar();

    expect(container.querySelectorAll('svg')).toHaveLength(4);
    expect(container.querySelector('img')).toBeNull();
  });

  it('a cor vem do token da marca', () => {
    const { container } = renderizar();

    for (const svg of container.querySelectorAll('svg')) {
      // `text-primary` alimenta o `currentColor` de dentro do desenho: é o elo
      // entre o ícone e `--primary`.
      expect(svg.getAttribute('class')).toContain('text-primary');
      expect(svg.innerHTML).toContain('currentColor');
    }
  });

  it('nenhum desenho carrega cor literal', () => {
    // Um `fill="#..."` sobrevivente voltaria a ser um ícone imune ao tema, que
    // é exatamente o defeito de origem.
    const { container } = renderizar();

    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.innerHTML).not.toMatch(/fill="#[0-9a-f]{3,6}"/i);
    }
  });

  it('cada atalho continua atrás da sua permissão', () => {
    // O ícone mudou; a regra de acesso, não.
    renderizar();

    expect(screen.getByText('Nova Solicitação')).toBeDefined();
    expect(screen.getByText('Novo Terceirizado')).toBeDefined();
  });
});
