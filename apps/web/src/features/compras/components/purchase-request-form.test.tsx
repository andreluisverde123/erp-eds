import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PURCHASE_REQUEST_FORM_DEFAULTS } from '../purchase-request-form-schema';
import { PurchaseRequestForm } from './purchase-request-form';

vi.mock('@/features/engenharia/hooks/use-construction-sites', () => ({
  useConstructionSites: () => ({ data: { data: [] } }),
}));
vi.mock('@/features/engenharia/hooks/use-cost-centers', () => ({
  useCostCenters: () => ({ data: { data: [] } }),
}));
vi.mock('../item-suggestions', () => ({ searchItemSuggestions: vi.fn().mockResolvedValue([]) }));
vi.mock('../catalog-suggestions', () => ({
  searchCatalogSuggestions: vi.fn().mockResolvedValue([]),
}));

const CHAVE = 'compras:nova-solicitacao:u1';

function abrir(onCancel = vi.fn()) {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tela = render(
    <QueryClientProvider client={cliente}>
      <PurchaseRequestForm
        defaultValues={PURCHASE_REQUEST_FORM_DEFAULTS}
        submitLabel="Criar Solicitação"
        submittingLabel="Criando..."
        onSubmit={vi.fn()}
        onCancel={onCancel}
        draftKey={CHAVE}
      />
    </QueryClientProvider>,
  );
  return { usuario: userEvent.setup(), ...tela };
}

/// Defeito em produção: a sessão caiu no meio de uma solicitação, a tela foi
/// para o login e tudo o que estava digitado se perdeu.
describe('Rascunho da solicitação', () => {
  beforeEach(() => window.localStorage.clear());

  it('o que foi digitado volta depois de a tela ser fechada', async () => {
    const primeira = abrir();
    await primeira.usuario.type(screen.getByLabelText('Observações'), 'Urgente para a laje');
    primeira.unmount();

    abrir();

    expect(screen.getByText('Recuperamos o que você estava preenchendo')).toBeDefined();
    expect((screen.getByLabelText('Observações') as HTMLTextAreaElement).value).toBe(
      'Urgente para a laje',
    );
  });

  it('abrir e sair sem mexer não deixa rascunho', () => {
    abrir().unmount();

    abrir();

    expect(screen.queryByText('Recuperamos o que você estava preenchendo')).toBeNull();
  });

  it('descartar limpa o formulário e o rascunho', async () => {
    const primeira = abrir();
    await primeira.usuario.type(screen.getByLabelText('Observações'), 'Algo');
    primeira.unmount();

    const { usuario } = abrir();
    await usuario.click(screen.getByRole('button', { name: 'Descartar rascunho' }));

    expect((screen.getByLabelText('Observações') as HTMLTextAreaElement).value).toBe('');
    await waitFor(() => expect(window.localStorage.getItem(`eds:rascunho:${CHAVE}`)).toBeNull());
  });

  it('cancelar é desistir: o rascunho vai junto', async () => {
    const onCancel = vi.fn();
    const { usuario } = abrir(onCancel);
    await usuario.type(screen.getByLabelText('Observações'), 'Algo');

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(onCancel).toHaveBeenCalled();
    expect(window.localStorage.getItem(`eds:rascunho:${CHAVE}`)).toBeNull();
  });
});
