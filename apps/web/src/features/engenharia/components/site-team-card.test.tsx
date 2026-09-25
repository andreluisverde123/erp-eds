import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteTeamCard } from './site-team-card';
import * as siteTeam from '../site-team';

vi.mock('../site-team', async (original) => ({
  ...(await original<typeof import('../site-team')>()),
  getSiteTeam: vi.fn(),
  listSiteTeamCandidates: vi.fn(),
  replaceSiteTeam: vi.fn(),
}));
const mocked = vi.mocked(siteTeam);

const ANA = {
  userId: 'u-ana',
  name: 'Ana',
  email: 'ana@eds.app',
  isActive: true,
  role: 'ENGINEER' as const,
};
const FISCAL = { id: 'u-fiscal', name: 'Fiscal', email: 'fiscal@gestaoeds.com.br' };

function abrir() {
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <SiteTeamCard siteId="obra-1" />
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

describe('Equipe no Diário', () => {
  beforeEach(() => {
    mocked.getSiteTeam.mockResolvedValue([ANA]);
    mocked.listSiteTeamCandidates.mockResolvedValue([
      { id: 'u-ana', name: 'Ana', email: 'ana@eds.app' },
      FISCAL,
    ]);
    mocked.replaceSiteTeam.mockImplementation(async (_siteId, entries) =>
      entries.map((e) => ({ ...e, name: e.userId, email: '', isActive: true })),
    );
  });

  it('mostra quem já está na obra e o papel de cada um', async () => {
    abrir();

    const linha = (await screen.findByText('Ana')).closest('li')!;
    expect(within(linha).getByText('ana@eds.app')).toBeDefined();
    expect(within(linha).getByRole('combobox').textContent).toContain('Engenheiro');
  });

  it('adicionar o fiscal manda a equipe INTEIRA (a API substitui a lista)', async () => {
    const usuario = abrir();
    await screen.findByText('Ana');

    screen.getByLabelText('Pessoa').focus();
    await usuario.keyboard('{Enter}');
    await usuario.click(await screen.findByRole('option', { name: /Fiscal · fiscal@/ }));
    await usuario.click(screen.getByRole('button', { name: /Adicionar/ }));

    expect(mocked.replaceSiteTeam).toHaveBeenCalledWith('obra-1', [
      { userId: 'u-ana', role: 'ENGINEER' },
      { userId: 'u-fiscal', role: 'INSPECTOR' },
    ]);
  });

  it('quem já está na equipe não aparece para adicionar de novo', async () => {
    const usuario = abrir();
    await screen.findByText('Ana');

    screen.getByLabelText('Pessoa').focus();
    await usuario.keyboard('{Enter}');

    expect(await screen.findByRole('option', { name: /Fiscal/ })).toBeDefined();
    expect(screen.queryByRole('option', { name: /Ana/ })).toBeNull();
  });

  it('tirar da obra manda a equipe sem a pessoa', async () => {
    const usuario = abrir();
    await screen.findByText('Ana');

    await usuario.click(screen.getByRole('button', { name: 'Tirar Ana da obra' }));

    expect(mocked.replaceSiteTeam).toHaveBeenCalledWith('obra-1', []);
  });

  it('obra sem ninguém avisa, em vez de mostrar uma lista vazia', async () => {
    mocked.getSiteTeam.mockResolvedValue([]);
    abrir();

    expect(await screen.findByText(/Ninguém acompanha esta obra no Diário ainda/)).toBeDefined();
  });

  it('erro da API aparece na tela', async () => {
    const { ApiError } = await import('@/lib/api-client');
    mocked.replaceSiteTeam.mockRejectedValue(
      new ApiError(400, 'Um ou mais usuários informados não existem nesta empresa.'),
    );
    const usuario = abrir();
    await screen.findByText('Ana');

    await usuario.click(screen.getByRole('button', { name: 'Tirar Ana da obra' }));

    expect(await screen.findByText(/não existem nesta empresa/)).toBeDefined();
  });
});
