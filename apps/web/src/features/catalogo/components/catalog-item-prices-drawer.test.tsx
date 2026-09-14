import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CatalogItemPricesDrawer } from './catalog-item-prices-drawer';
import type { CatalogItemPrice, PurchasePriceCandidate } from '../price-types';
import type { CatalogItem } from '../types';
import { ApiError } from '@/lib/api-client';
import { todayInSaoPaulo } from '../reference-date';

const registrarManual = vi.fn();
const registrarCompra = vi.fn();
let permissoes: string[] = [];
let historico: CatalogItemPrice[] = [];
let vigente: CatalogItemPrice | null = null;
let candidatas: PurchasePriceCandidate[] = [];
let consultouCompras = false;

vi.mock('@/features/auth/context', () => ({
  useAuth: () => ({ user: { permissions: permissoes } }),
}));

vi.mock('../hooks/use-catalog-item-prices', () => ({
  useCatalogItemPrices: () => ({
    data: { data: historico, meta: { page: 1, limit: 50, total: historico.length, totalPages: 1 } },
    isLoading: false,
    isError: false,
  }),
  useCurrentReferencePrice: () => ({ data: { asOf: '2026-09-14', unit: 'SC', price: vigente } }),
  usePurchasePriceCandidates: () => {
    consultouCompras = true;
    return { data: candidatas, isLoading: false, isError: false };
  },
  useRegisterManualPrice: () => ({ mutateAsync: registrarManual, isPending: false }),
  useRegisterPurchasePrice: () => ({ mutateAsync: registrarCompra, isPending: false }),
}));

const CIMENTO: CatalogItem = {
  id: 'i1',
  code: 'MAT-0001',
  name: 'Cimento CP II 50kg',
  unit: 'SC',
  category: 'Cimento',
  description: null,
  type: 'MATERIAL',
  active: true,
  createdAt: '2026-09-09T00:00:00.000Z',
  updatedAt: '2026-09-09T00:00:00.000Z',
};

const preco = (extra: Partial<CatalogItemPrice>): CatalogItemPrice => ({
  id: 'p1',
  catalogItemId: 'i1',
  unitPrice: '38.7500',
  unit: 'SC',
  source: 'MANUAL',
  referenceDate: '2026-09-10',
  note: null,
  purchaseOrder: null,
  createdBy: { name: 'Engenheira Ana' },
  createdAt: '2026-09-10T12:00:00.000Z',
  ...extra,
});

function abrir() {
  const cliente = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={cliente}>
      <CatalogItemPricesDrawer open onOpenChange={() => {}} item={CIMENTO} />
    </QueryClientProvider>,
  );
  return userEvent.setup({ pointerEventsCheck: 0 });
}

beforeEach(() => {
  permissoes = ['catalogo.view', 'composicoes.view', 'composicoes.manage', 'compras.view'];
  historico = [];
  vigente = null;
  candidatas = [];
  consultouCompras = false;
  registrarManual.mockReset();
  registrarCompra.mockReset();
});

describe('Histórico de preços do insumo', () => {
  it('mostra o vigente hoje com unidade, data e origem', () => {
    vigente = preco({});
    abrir();

    const cartao = screen.getByTestId('preco-vigente');
    expect(cartao.textContent).toMatch(/R\$\s?38,75/);
    expect(cartao.textContent).toContain('/ SC');
    expect(cartao.textContent).toContain('Referência de 10/09/2026');
    expect(cartao.textContent).toContain('Manual');
  });

  it('sem nenhum preço, diz isso em vez de mostrar zero', () => {
    abrir();

    expect(screen.getByText('Sem preço de referência até hoje.')).toBeDefined();
    expect(screen.getByText('Nenhum preço registrado ainda.')).toBeDefined();
  });

  it('lista preço, unidade, origem, data de referência e autor de cada registro', () => {
    historico = [
      preco({ id: 'p2', unitPrice: '42.0000', referenceDate: '2026-09-10' }),
      preco({
        id: 'p1',
        unitPrice: '36.0000',
        referenceDate: '2026-08-15',
        source: 'PURCHASE',
        purchaseOrder: { id: 'o1', code: 'OC-0007' },
      }),
    ];
    abrir();

    const [, primeira, segunda] = screen.getAllByRole('row');
    expect(primeira!.textContent).toMatch(/10\/09\/2026.*R\$\s?42,00.*\/ SC.*Manual.*Engenheira Ana/);
    expect(segunda!.textContent).toMatch(/15\/08\/2026.*R\$\s?36,00.*Compra.*OC-0007/);
  });

  it('não há como editar nem excluir um preço do histórico', () => {
    historico = [preco({})];
    abrir();

    expect(screen.queryByRole('button', { name: /editar|excluir|remover/i })).toBeNull();
  });
});

describe('Registrar preço manual', () => {
  it('envia valor, data e observação — e nada de origem ou unidade', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Preço (R$ / SC)'), '38,75');
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: '2026-09-10' } });
    await usuario.type(screen.getByLabelText('Observação'), 'Cotação por telefone');
    await usuario.click(screen.getByRole('button', { name: 'Registrar preço' }));

    await waitFor(() => expect(registrarManual).toHaveBeenCalledTimes(1));
    expect(registrarManual.mock.calls[0]![0]).toEqual({
      unitPrice: 38.75,
      referenceDate: '2026-09-10',
      note: 'Cotação por telefone',
    });
  });

  it('a data começa em hoje', () => {
    abrir();

    expect(screen.getByLabelText('Data de referência')).toHaveProperty('value', todayInSaoPaulo());
  });

  it('sem preço, não chama o backend', async () => {
    const usuario = abrir();

    await usuario.click(screen.getByRole('button', { name: 'Registrar preço' }));

    expect(await screen.findByText('Informe o preço.')).toBeDefined();
    expect(registrarManual).not.toHaveBeenCalled();
  });

  it('data futura não chama o backend', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Preço (R$ / SC)'), '40');
    fireEvent.change(screen.getByLabelText('Data de referência'), { target: { value: '2999-01-01' } });
    await usuario.click(screen.getByRole('button', { name: 'Registrar preço' }));

    expect(await screen.findByText('A data de referência não pode ser futura.')).toBeDefined();
    expect(registrarManual).not.toHaveBeenCalled();
  });

  it('o preço não aceita sinal negativo', async () => {
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Preço (R$ / SC)'), '-5');

    expect(screen.getByLabelText('Preço (R$ / SC)')).toHaveProperty('value', '5');
  });

  it('a recusa da API aparece como veio', async () => {
    registrarManual.mockRejectedValue(new ApiError(400, 'O preço unitário aceita até 4 casas decimais.'));
    const usuario = abrir();

    await usuario.type(screen.getByLabelText('Preço (R$ / SC)'), '40');
    await usuario.click(screen.getByRole('button', { name: 'Registrar preço' }));

    expect(await screen.findByText('O preço unitário aceita até 4 casas decimais.')).toBeDefined();
  });
});

describe('Preço de compra', () => {
  const RECEBIDA: PurchasePriceCandidate = {
    purchaseOrderItemId: 'l1',
    purchaseOrder: { id: 'o1', code: 'OC-0007', supplierName: 'Depósito Silva' },
    description: 'Cimento CP II 50kg',
    quantity: '100',
    unit: 'SC',
    listUnitPrice: '40.00',
    practicedUnitPrice: '36.0000',
    referenceDate: '2026-09-10',
    block: null,
    blockMessage: null,
  };

  it('mostra o preço praticado e registra só quando alguém escolhe', async () => {
    candidatas = [RECEBIDA];
    const usuario = abrir();

    const linha = screen.getByText('OC-0007').closest('tr')!;
    expect(linha.textContent).toMatch(/Depósito Silva.*10\/09\/2026.*100 SC.*R\$\s?36,00/);
    expect(registrarCompra).not.toHaveBeenCalled();

    await usuario.click(within(linha).getByRole('button', { name: /Registrar/ }));

    await waitFor(() => expect(registrarCompra).toHaveBeenCalledWith('l1'));
  });

  it('linha que não pode virar referência mostra o motivo e não tem botão', () => {
    candidatas = [
      {
        ...RECEBIDA,
        unit: 'KG',
        block: 'UNIT_MISMATCH',
        blockMessage: 'A linha da compra está numa unidade diferente da do insumo.',
      },
    ];
    abrir();

    const linha = screen.getByText('OC-0007').closest('tr')!;
    expect(within(linha).getByText(/unidade diferente/)).toBeDefined();
    expect(within(linha).queryByRole('button')).toBeNull();
  });

  it('sem compras.view, a seção de compras nem é consultada', () => {
    permissoes = ['catalogo.view', 'composicoes.view', 'composicoes.manage'];
    abrir();

    expect(screen.queryByText('Compras recebidas')).toBeNull();
    expect(consultouCompras).toBe(false);
  });
});

describe('Quem só consulta', () => {
  it('vê vigente e histórico, mas não registra nem vê compras', () => {
    permissoes = ['catalogo.view', 'composicoes.view', 'compras.view'];
    historico = [preco({})];
    abrir();

    expect(screen.getAllByRole('row')).toHaveLength(2);
    expect(screen.queryByRole('button', { name: 'Registrar preço' })).toBeNull();
    expect(screen.queryByText('Compras recebidas')).toBeNull();
  });
});
