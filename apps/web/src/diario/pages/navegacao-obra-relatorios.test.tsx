import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { renderDiario } from '@/test/render-diario';

import * as api from '../api';
import type { DiarioReport, DiarioSite } from '../types';
import { DiarioObraDetailPage } from './obra-detail-page';
import { DiarioRelatoriosPage } from './relatorios-page';

vi.mock('../api');

const mocked = vi.mocked(api, { deep: true });

const AURORA: DiarioSite = {
  id: 'obra-1',
  code: 'OBR-001',
  name: 'Residencial Aurora',
  clientName: 'Construtora XYZ',
  responsibleName: 'Marina Souza',
  status: 'IN_PROGRESS',
  addressLine: 'Rua das Obras, 100',
  city: 'Curitiba',
  state: 'PR',
  startDate: '2026-01-01T00:00:00.000Z',
  expectedEndDate: '2026-12-31T00:00:00.000Z',
  assignmentRole: 'ENGINEER',
  lastReportDate: '2026-08-30T00:00:00.000Z',
  reportCount: 2,
};

const CENTRAL: DiarioSite = { ...AURORA, id: 'obra-2', name: 'Edifício Central' };

const RDO: DiarioReport = {
  id: 'rdo-24',
  number: 24,
  reportDate: '2026-08-30T00:00:00.000Z',
  status: 'DRAFT',
  createdAt: '2026-08-30T10:00:00.000Z',
  updatedAt: '2026-08-30T10:00:00.000Z',
  constructionSite: { id: AURORA.id, code: AURORA.code, name: AURORA.name },
  createdBy: { id: 'user-1', name: 'Eduardo Engenharia' },
};

function paginado(itens: DiarioReport[]) {
  return { data: itens, meta: { page: 1, limit: 50, total: itens.length, totalPages: 1 } };
}

/// O segundo passo do fluxo principal do Diário: obra → RDOs DELA.
///
/// Antes existia só o filtro por obra dentro da lista, em estado local — não
/// havia caminho da tela da obra até ele, e o fluxo do enunciado (LISTA DE
/// OBRAS → SELEÇÃO DA OBRA → LISTA DE RDOs) ficava sem a terceira etapa.
describe('Da obra para os relatórios dela', () => {
  it('a tela da obra oferece o caminho para os relatórios', async () => {
    mocked.getSite.mockResolvedValue(AURORA);

    renderDiario(<DiarioObraDetailPage />, { rota: '/obras/obra-1', path: '/obras/:id' });

    const link = await screen.findByRole('link', { name: /Ver relatórios desta obra/ });
    expect(link.getAttribute('href')).toBe('/relatorios?obra=obra-1');
  });

  it('a lista abre já filtrada pela obra que veio na URL', async () => {
    mocked.listSites.mockResolvedValue([AURORA, CENTRAL]);
    mocked.listReports.mockResolvedValue(paginado([RDO]));

    renderDiario(<DiarioRelatoriosPage />, { rota: '/relatorios?obra=obra-1' });

    await waitFor(() =>
      expect(mocked.listReports).toHaveBeenCalledWith(
        expect.objectContaining({ siteId: 'obra-1' }),
      ),
    );
    // O chip da obra vem marcado — o filtro não é invisível.
    const chip = await screen.findByRole('button', { name: 'Residencial Aurora' });
    expect(chip.getAttribute('aria-pressed')).toBe('true');
  });

  it('trocar o filtro atualiza a URL, e não só um estado que se perde', async () => {
    const usuario = userEvent.setup();
    mocked.listSites.mockResolvedValue([AURORA, CENTRAL]);
    mocked.listReports.mockResolvedValue(paginado([RDO]));

    renderDiario(<DiarioRelatoriosPage />, { rota: '/relatorios' });

    await usuario.click(await screen.findByRole('button', { name: 'Edifício Central' }));

    await waitFor(() =>
      expect(mocked.listReports).toHaveBeenCalledWith(
        expect.objectContaining({ siteId: 'obra-2' }),
      ),
    );
  });

  it('"Todas" volta a listar sem filtro de obra', async () => {
    const usuario = userEvent.setup();
    mocked.listSites.mockResolvedValue([AURORA, CENTRAL]);
    mocked.listReports.mockResolvedValue(paginado([RDO]));

    renderDiario(<DiarioRelatoriosPage />, { rota: '/relatorios?obra=obra-1' });

    await usuario.click(await screen.findByRole('button', { name: 'Todas as obras' }));

    await waitFor(() =>
      expect(mocked.listReports).toHaveBeenLastCalledWith(
        expect.objectContaining({ siteId: undefined }),
      ),
    );
  });
});
