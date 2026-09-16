import { render, screen } from '@testing-library/react';
import { HardHat, Building2 } from 'lucide-react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';

import { SidebarNavLink } from './sidebar-nav-link';

describe('SidebarNavLink', () => {
  it('link externo é um <a> comum, que recarrega a página', () => {
    render(
      <MemoryRouter>
        <SidebarNavLink
          item={{ title: 'Diário de Obras', path: '/diario', icon: HardHat, external: true }}
          collapsed={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Diário de Obras' }).getAttribute('href')).toBe(
      '/diario',
    );
  });

  it('link interno continua marcando o item ativo', () => {
    render(
      <MemoryRouter initialEntries={['/engenharia/obras']}>
        <SidebarNavLink
          item={{ title: 'Obras', path: '/engenharia/obras', icon: Building2 }}
          collapsed={false}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole('link', { name: 'Obras' }).getAttribute('aria-current')).toBe('page');
  });
});
