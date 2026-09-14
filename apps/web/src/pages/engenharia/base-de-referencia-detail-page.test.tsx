import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BaseDeReferenciaDetailPage } from './base-de-referencia-detail-page';

const buscas: { tipo: string; query: Record<string, unknown> }[] = [];
let analiticaPedida: string | null = null;

const base = {
  id: 'ds1',
  source: 'SICRO',
  competence: '2026-04',
  referenceDate: '2026-04-01',
  uf: 'SP',
  locality: 'São Paulo',
  regime: 'NAO_DESONERADO',
  versionLabel: '',
  publishedAt: null,
  fileNames: [],
  itemCount: 2395,
  compositionCount: 6618,
  metadata: {},
  importedAt: '2026-09-14T12:00:00.000Z',
};

vi.mock('@/features/bases-referencia/hooks', () => ({
  useReferenceDataset: () => ({ data: base, isError: false }),
  useReferenceCompositions: (_id: string, query: Record<string, unknown>, enabled: boolean) => {
    if (enabled) buscas.push({ tipo: 'composicoes', query });
    return {
      data: {
        data: [
          { id: 'c1', code: '0308308', description: 'Aparelho de apoio metálico elastomérico', unit: 'un', group: null, unitCost: '4938.7200', situation: null, componentCount: 7 },
          { id: 'c2', code: '0999999', description: 'Composição sem custo', unit: 'm', group: null, unitCost: null, situation: null, componentCount: 0 },
        ],
        meta: { page: 1, limit: 50, total: 120, totalPages: 3 },
      },
    };
  },
  useReferenceItems: (_id: string, query: Record<string, unknown>, enabled: boolean) => {
    if (enabled) buscas.push({ tipo: 'insumos', query });
    return {
      data: {
        data: [{ id: 'i1', code: 'E9050', description: 'Guindaste móvel', unit: 'h', category: 'EQUIPAMENTO', unitPrice: '435.3667', metadata: {} }],
        meta: { page: 1, limit: 50, total: 1, totalPages: 1 },
      },
    };
  },
  useReferenceComposition: (id: string | null) => {
    analiticaPedida = id;
    return {
      isLoading: false,
      data: id
        ? {
            id,
            code: '0308308',
            description: 'Aparelho de apoio metálico elastomérico',
            unit: 'un',
            group: null,
            unitCost: '4938.7200',
            situation: null,
            metadata: { teamProduction: '2', productionUnit: 'un', fic: '0.033' },
            dataset: base,
            components: [
              { id: 'k1', position: 0, section: 'A', kind: 'EQUIPMENT', code: 'E9050', description: 'Guindaste móvel', unit: 'h', coefficient: '0.4819300', unitPrice: '435.3667', totalCost: '209.8163', situation: null, metadata: {} },
              { id: 'k2', position: 6, section: 'F', kind: 'TRANSPORT', code: 'M2758', description: 'Aparelho - transporte', unit: 'tkm', coefficient: '0.0380000', unitPrice: null, totalCost: null, situation: null, metadata: {} },
            ],
          }
        : undefined,
    };
  },
}));

function abrir() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/engenharia/bases-de-referencia/ds1']}>
        <Routes>
          <Route path="/engenharia/bases-de-referencia/:id" element={<BaseDeReferenciaDetailPage />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

beforeEach(() => {
  buscas.length = 0;
  analiticaPedida = null;
});

describe('Consulta de base de referência', () => {
  it('cabeçalho com fonte, competência, localização e regime; composições paginadas no servidor', () => {
    abrir();
    expect(screen.getByRole('heading', { name: 'SICRO 04/2026 — SP' })).toBeDefined();
    expect(screen.getByText(/SICRO \(DNIT\) · São Paulo · Não desonerado/)).toBeDefined();
    expect(screen.getByText('120 resultado(s)')).toBeDefined();
    expect(screen.getByText('Sem custo')).toBeDefined();
    expect(buscas.at(-1)).toEqual({ tipo: 'composicoes', query: { page: 1, limit: 50, search: undefined } });
  });

  it('busca e troca para insumos', async () => {
    const usuario = abrir();
    await usuario.type(screen.getByLabelText('Buscar na base'), 'guindaste');
    await usuario.click(screen.getByRole('tab', { name: 'Insumos' }));
    expect(await screen.findByText('Guindaste móvel')).toBeDefined();
    expect(buscas.some((b) => b.tipo === 'insumos')).toBe(true);
  });

  it('composição analítica: seções, coeficientes, preços e o aviso do transporte do SICRO', async () => {
    const usuario = abrir();
    await usuario.click(screen.getByRole('button', { name: 'Aparelho de apoio metálico elastomérico' }));

    const gaveta = await screen.findByRole('dialog');
    expect(analiticaPedida).toBe('c1');
    expect(within(gaveta).getByText(/Produção da equipe: 2 un\. FIC: 0\.033\..*transporte \(seção F\) não está incluído/)).toBeDefined();
    const linhas = within(gaveta).getAllByRole('row');
    expect(linhas[1]!.textContent).toMatch(/A · Equipamento.*E9050.*Guindaste móvel.*h.*0,4819.*R\$\s?435,3667.*R\$\s?209,8163/);
    expect(linhas[2]!.textContent).toMatch(/F · Transporte.*M2758.*—.*—/);
  });
});
