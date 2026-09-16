import { describe, expect, it } from 'vitest';

import { navEntries, navLinks } from './nav';

describe('Diário de Obras no menu', () => {
  const diario = navLinks.find((link) => link.path === '/diario');

  it('fica no grupo Engenharia', () => {
    const engenharia = navEntries.find(
      (entry) => entry.type === 'group' && entry.label === 'Engenharia',
    );

    expect(engenharia?.type === 'group' && engenharia.items).toContain(diario);
  });

  it('só aparece para quem entra no Diário, e sai do roteador do ERP', () => {
    expect(diario).toMatchObject({ permission: 'diario.access', external: true });
  });
});
