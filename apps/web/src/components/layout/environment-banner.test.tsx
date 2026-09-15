import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { EnvironmentBanner } from './environment-banner';

describe('EnvironmentBanner', () => {
  it('mostra o rótulo do ambiente de testes', () => {
    render(<EnvironmentBanner label="AMBIENTE DE TESTES" />);
    expect(screen.getByRole('status').textContent).toBe(
      'AMBIENTE DE TESTES — os dados lançados aqui não vão para a produção',
    );
  });

  it('sem rótulo (produção) não renderiza nada', () => {
    const { container } = render(<EnvironmentBanner label="  " />);
    expect(container.innerHTML).toBe('');
  });
});
