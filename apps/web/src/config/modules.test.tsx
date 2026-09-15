import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { PermissionCheckboxGroup } from '@/features/configuracoes/components/permission-checkbox-group';
import type { Permission } from '@/features/configuracoes/types';

import { MODULO_ORCAMENTOS_ATIVO } from './modules';
import { navLinks } from './nav';

describe('Módulo de Orçamentos desligado na EDS', () => {
  it('a chave está desligada', () => {
    expect(MODULO_ORCAMENTOS_ATIVO).toBe(false);
  });

  it('o menu não oferece Composições, Orçamentos nem Bases de Referência; Insumos continua', () => {
    const caminhos = navLinks.map((link) => link.path);

    expect(caminhos).toContain('/engenharia/insumos');
    expect(caminhos).not.toContain('/engenharia/composicoes');
    expect(caminhos).not.toContain('/engenharia/orcamentos');
    expect(caminhos).not.toContain('/engenharia/bases-de-referencia');
  });

  it('a tela de papéis não lista as permissões do módulo', () => {
    const permissoes = [
      { code: 'catalogo.view', module: 'catalogo', description: 'Ver insumos' },
      { code: 'composicoes.view', module: 'composicoes', description: 'Ver composições' },
      { code: 'orcamentos.manage', module: 'orcamentos', description: 'Gerenciar orçamentos' },
    ] as Permission[];

    render(
      <PermissionCheckboxGroup permissions={permissoes} selectedCodes={[]} onChange={vi.fn()} />,
    );

    expect(screen.getByText('Ver insumos')).toBeDefined();
    expect(screen.queryByText('Ver composições')).toBeNull();
    expect(screen.queryByText('Gerenciar orçamentos')).toBeNull();
  });
});
