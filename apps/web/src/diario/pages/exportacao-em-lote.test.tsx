import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderDiario } from '@/test/render-diario';

import * as api from '../api';
import { ActionBar, ActionBarProvider } from '../components/action-bar';
import type { DiarioReport } from '../types';
import { DiarioRelatoriosPage } from './relatorios-page';

vi.mock('../api');

const mocked = vi.mocked(api, { deep: true });

function rdo(numero: number, dia: string): DiarioReport {
  return {
    id: `rdo-${numero}`,
    number: numero,
    reportDate: `2026-09-${dia}T00:00:00.000Z`,
    status: 'SUBMITTED',
    createdAt: `2026-09-${dia}T10:00:00.000Z`,
    updatedAt: `2026-09-${dia}T10:00:00.000Z`,
    constructionSite: { id: 'obra-1', code: 'OBR-001', name: 'Residencial Aurora' },
    createdBy: { id: 'user-1', name: 'Eduardo Engenharia' },
  };
}

const TRES = [rdo(3, '03'), rdo(2, '02'), rdo(1, '01')];

function paginado(itens: DiarioReport[]) {
  return { data: itens, meta: { page: 1, limit: 50, total: itens.length, totalPages: 1 } };
}

async function entrarNoModo() {
  const usuario = userEvent.setup();
  mocked.listSites.mockResolvedValue([]);
  mocked.listReports.mockResolvedValue(paginado(TRES));
  mocked.exportReportsPdf.mockResolvedValue();

  renderDiario(<DiarioRelatoriosPage />, { rota: '/relatorios' });
  await usuario.click(await screen.findByRole('button', { name: /Exportar PDF/ }));
  return usuario;
}

describe('Exportação de RDOs em lote', () => {
  it('entrar no modo já marca tudo o que o filtro mostra', async () => {
    await entrarNoModo();

    const caixas = screen.getAllByRole('checkbox');
    expect(caixas).toHaveLength(3);
    expect(caixas.every((caixa) => caixa.getAttribute('aria-checked') === 'true')).toBe(true);
    expect(screen.getByText('selecionados')).toBeDefined();
  });

  it('exporta só os que continuam marcados', async () => {
    const usuario = await entrarNoModo();

    await usuario.click(screen.getByRole('checkbox', { name: /RDO #2/ }));
    await usuario.click(screen.getByRole('button', { name: 'Exportar' }));

    await waitFor(() => expect(mocked.exportReportsPdf).toHaveBeenCalledTimes(1));
    const enviados = mocked.exportReportsPdf.mock.calls[0]![0].map((r) => r.id);
    expect(enviados).toEqual(['rdo-3', 'rdo-1']);
  });

  it('nenhum marcado não exporta', async () => {
    const usuario = await entrarNoModo();

    await usuario.click(screen.getByRole('button', { name: 'Desmarcar todos' }));

    expect(screen.getByRole('button', { name: 'Exportar' }).hasAttribute('disabled')).toBe(true);
  });

  it('"Mês passado" filtra do primeiro ao último dia do mês anterior', async () => {
    const usuario = await entrarNoModo();

    await usuario.click(screen.getByRole('button', { name: 'Mês passado' }));

    await waitFor(() =>
      expect(mocked.listReports).toHaveBeenLastCalledWith(
        expect.objectContaining({
          dateFrom: expect.stringMatching(/^\d{4}-\d{2}-01$/),
          dateTo: expect.stringMatching(/^\d{4}-\d{2}-(28|29|30|31)$/),
        }),
      ),
    );
  });

  it('cancelar volta para a lista que abre os relatórios', async () => {
    const usuario = await entrarNoModo();

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
    expect(screen.getAllByRole('link').length).toBeGreaterThan(0);
  });
});

describe('Faixa de ação no rodapé', () => {
  function Tela() {
    const [mostrar, setMostrar] = useState(false);
    return (
      <ActionBarProvider>
        {(faixaAtiva) => (
          <>
            <p>{faixaAtiva ? 'navegação escondida' : 'navegação visível'}</p>
            <button type="button" onClick={() => setMostrar((v) => !v)}>
              alternar
            </button>
            {mostrar && <ActionBar>ação</ActionBar>}
          </>
        )}
      </ActionBarProvider>
    );
  }

  it('toma o lugar da navegação enquanto está montada', async () => {
    const usuario = userEvent.setup();
    render(<Tela />);

    expect(screen.getByText('navegação visível')).toBeDefined();
    await usuario.click(screen.getByRole('button', { name: 'alternar' }));
    expect(screen.getByText('navegação escondida')).toBeDefined();
    await usuario.click(screen.getByRole('button', { name: 'alternar' }));
    expect(screen.getByText('navegação visível')).toBeDefined();
  });
});
