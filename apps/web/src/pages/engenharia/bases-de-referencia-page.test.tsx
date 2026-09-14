import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { BasesDeReferenciaPage } from './bases-de-referencia-page';
import type { ReferenceDataset, ReferenceDatasetPreview } from '@/features/bases-referencia/types';

let permissoes: string[] = [];
const importar = vi.fn();
const previa = vi.fn();

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoes } }),
}));

const base: ReferenceDataset = {
  id: 'ds1',
  source: 'SINAPI',
  competence: '2026-08',
  referenceDate: '2026-08-01',
  uf: 'SP',
  locality: 'SAO PAULO',
  regime: 'NAO_DESONERADO',
  versionLabel: '',
  publishedAt: '2026-09-11',
  fileNames: ['SINAPI_Referência_2026_08.xlsx'],
  itemCount: 4876,
  compositionCount: 10547,
  metadata: {},
  importedAt: '2026-09-14T12:00:00.000Z',
};

vi.mock('@/features/bases-referencia/hooks', () => ({
  useReferenceDatasets: () => ({ data: { data: [base], meta: { page: 1, limit: 20, total: 1, totalPages: 1 } }, isLoading: false, isError: false }),
  useImportReferenceDataset: () => ({ mutateAsync: importar, isPending: false }),
}));

vi.mock('@/features/bases-referencia/api', () => ({
  previewReferenceDataset: (...args: unknown[]) => previa(...args),
}));

const resultado = (extra: Partial<ReferenceDatasetPreview> = {}): ReferenceDatasetPreview => ({
  source: 'SINAPI',
  competence: '2026-08',
  referenceDate: '2026-08-01',
  uf: 'SP',
  locality: 'SAO PAULO',
  regime: 'NAO_DESONERADO',
  versionLabel: '',
  publishedAt: '2026-09-11',
  itemCount: 4876,
  compositionCount: 10547,
  componentCount: 56281,
  itemsWithoutPrice: 0,
  compositionsWithoutCost: 2143,
  errors: [],
  errorCount: 0,
  warnings: [{ code: 'COMPOSICAO_SEM_CUSTO', message: '2143 composição(ões) sem custo nesta referência.' }],
  warningCount: 1,
  fileNames: ['SINAPI_Referência_2026_08.xlsx'],
  fileHash: 'a'.repeat(64),
  duplicate: null,
  availableUfs: ['SP'],
  canImport: true,
  ...extra,
});

function abrir() {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemoryRouter initialEntries={['/engenharia/bases-de-referencia']}>
        <Routes>
          <Route path="/engenharia/bases-de-referencia" element={<BasesDeReferenciaPage />} />
          <Route path="/engenharia/bases-de-referencia/:id" element={<p>Detalhe da base</p>} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

async function escolher(usuario: ReturnType<typeof userEvent.setup>, campo: HTMLElement, opcao: RegExp | string) {
  campo.focus();
  await usuario.keyboard('{Enter}');
  await usuario.click(await screen.findByRole('option', { name: opcao }));
}

beforeEach(() => {
  permissoes = ['orcamentos.view', 'orcamentos.manage'];
  importar.mockReset();
  previa.mockReset();
});

describe('Bases de Referência', () => {
  it('lista fonte, competência, localização, regime e contagens', () => {
    abrir();
    const linha = screen.getByRole('button', { name: 'SINAPI' }).closest('tr')!;
    expect(linha.textContent).toMatch(/08\/2026.*SP — SAO PAULO.*Não desonerado.*4\.876.*10\.547/);
  });

  it('quem só consulta não importa', () => {
    permissoes = ['orcamentos.view'];
    abrir();
    expect(screen.queryByRole('button', { name: /Importar base/ })).toBeNull();
  });

  it('SINAPI: arquivo, UF e regime → prévia → confirmação com o hash da prévia', async () => {
    previa.mockResolvedValue(resultado());
    importar.mockResolvedValue({ ...base, id: 'novo' });
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Importar base/ }));
    const gaveta = await screen.findByRole('dialog');
    const arquivo = new File(['x'], 'SINAPI_Referência_2026_08.xlsx');
    await usuario.upload(within(gaveta).getByLabelText(/Arquivo SINAPI/), arquivo);
    await escolher(usuario, within(gaveta).getByLabelText('UF'), 'SP');

    expect(within(gaveta).getByRole('button', { name: 'Confirmar importação' })).toHaveProperty('disabled', true);
    await usuario.click(within(gaveta).getByRole('button', { name: 'Analisar arquivos' }));

    const bloco = await within(gaveta).findByTestId('previa-base');
    expect(bloco.textContent).toMatch(/SINAPI \(CAIXA\).*08\/2026.*SP — SAO PAULO.*Não desonerado.*4\.876.*10\.547 \(2143 sem custo\).*56\.281/);
    expect(within(gaveta).getByText(/2143 composição\(ões\) sem custo/)).toBeDefined();
    expect(previa).toHaveBeenCalledWith({ source: 'SINAPI', files: [arquivo], uf: 'SP', regime: 'NAO_DESONERADO', versionLabel: '' });

    await usuario.click(within(gaveta).getByRole('button', { name: 'Confirmar importação' }));
    await waitFor(() =>
      expect(importar).toHaveBeenCalledWith({
        input: { source: 'SINAPI', files: [arquivo], uf: 'SP', regime: 'NAO_DESONERADO', versionLabel: '' },
        fileHash: 'a'.repeat(64),
      }),
    );
    expect(await screen.findByText('Detalhe da base')).toBeDefined();
  });

  it('prévia com erro ou duplicada não deixa confirmar', async () => {
    previa.mockResolvedValue(
      resultado({
        canImport: false,
        duplicate: { id: 'ds1', importedAt: '2026-09-14T12:00:00.000Z' },
        errors: [{ code: 'UF_AUSENTE', message: 'A UF XX não está na planilha.' }],
        errorCount: 1,
      }),
    );
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: /Importar base/ }));
    const gaveta = await screen.findByRole('dialog');
    await usuario.upload(within(gaveta).getByLabelText(/Arquivo SINAPI/), new File(['x'], 'a.xlsx'));
    await escolher(usuario, within(gaveta).getByLabelText('UF'), 'SP');
    await usuario.click(within(gaveta).getByRole('button', { name: 'Analisar arquivos' }));

    expect(await within(gaveta).findByText('Esta base já foi importada')).toBeDefined();
    expect(within(gaveta).getByText('A UF XX não está na planilha.')).toBeDefined();
    expect(within(gaveta).getByRole('button', { name: 'Confirmar importação' })).toHaveProperty('disabled', true);
    expect(importar).not.toHaveBeenCalled();
  });
});
