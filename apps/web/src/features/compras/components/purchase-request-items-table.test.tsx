import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { PurchaseRequestItem } from '../types';
import { PurchaseRequestItemsTable } from './purchase-request-items-table';

function item(extra: Partial<PurchaseRequestItem> & Pick<PurchaseRequestItem, 'id' | 'description'>): PurchaseRequestItem {
  return {
    unit: 'UN',
    quantity: '10.000',
    estimatedUnitPrice: '40.00',
    notes: null,
    unavailable: false,
    unavailabilityNote: null,
    inStock: false,
    discountType: 'AMOUNT',
    discountValue: '0',
    fulfillment: { requestedQuantity: '10', fulfilledQuantity: '0', pendingQuantity: '10', status: 'PENDING', entries: [] },
    ...extra,
  } as PurchaseRequestItem;
}

const CIMENTO = item({ id: 'c', description: 'Cimento CP-II' });
const TORNEIRA = item({
  id: 't',
  description: 'Torneira de jardim',
  inStock: true,
  estimatedUnitPrice: null,
  fulfillment: { requestedQuantity: '5', fulfilledQuantity: '0', pendingQuantity: '0', status: 'FULFILLED', entries: [] },
});
const COMPRADO = item({
  id: 'p',
  description: 'Tubo PVC',
  fulfillment: {
    requestedQuantity: '20',
    fulfilledQuantity: '20',
    pendingQuantity: '0',
    status: 'FULFILLED',
    entries: [{ purchaseOrderId: 'o1', purchaseOrderCode: 'OC-0001', supplierName: 'Depósito', quantity: '20' }],
  },
});

describe('Itens da solicitação — em estoque e exclusão', () => {
  it('item em estoque: etiqueta "Em estoque", sem preço nem total', () => {
    render(<PurchaseRequestItemsTable items={[CIMENTO, TORNEIRA]} />);

    const torneira = screen.getByTestId('item-Torneira de jardim');
    expect(torneira.textContent).toMatch(/Em estoque/);
    expect(torneira.textContent).not.toMatch(/Atendido/);
    expect(within(torneira).getAllByText('—').length).toBeGreaterThanOrEqual(2);
  });

  it('sem ações, a tabela é só leitura', () => {
    render(<PurchaseRequestItemsTable items={[CIMENTO]} />);
    expect(screen.queryByRole('button', { name: /Ações de/ })).toBeNull();
  });

  it('com ações: marca em estoque, volta para compra e exclui', async () => {
    const onToggleStock = vi.fn();
    const onRemove = vi.fn();
    const usuario = userEvent.setup({ pointerEventsCheck: 0 });
    render(<PurchaseRequestItemsTable items={[CIMENTO, TORNEIRA]} actions={{ onToggleStock, onRemove }} />);

    await usuario.click(screen.getByRole('button', { name: 'Ações de Cimento CP-II' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Marcar como em estoque/ }));
    expect(onToggleStock).toHaveBeenCalledWith(CIMENTO);

    await usuario.click(screen.getByRole('button', { name: 'Ações de Torneira de jardim' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Voltar para compra/ }));
    expect(onToggleStock).toHaveBeenCalledWith(TORNEIRA);

    await usuario.click(screen.getByRole('button', { name: 'Ações de Cimento CP-II' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Excluir item/ }));
    expect(onRemove).toHaveBeenCalledWith(CIMENTO);
  });

  it('linha já em ordem de compra não oferece ação', () => {
    render(<PurchaseRequestItemsTable items={[COMPRADO]} actions={{ onToggleStock: vi.fn(), onRemove: vi.fn() }} />);
    expect(screen.queryByRole('button', { name: 'Ações de Tubo PVC' })).toBeNull();
  });
});
