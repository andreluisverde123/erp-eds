import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { Contract } from '../types';
import { ContractsTable } from './contracts-table';

const CONTRATO = {
  id: 'ct-1',
  code: 'CT-0001',
  scope: 'Alvenaria do bloco A',
  totalValue: '12500.00',
  pricingType: 'GLOBAL',
  unitPrice: null,
  unitLabel: null,
  measuredQuantity: null,
  startDate: '2026-09-15T00:00:00.000Z',
  endDate: '2026-10-14T00:00:00.000Z',
  paymentTerms: 'Medições quinzenais',
  status: 'ACTIVE',
  badgeStatus: 'ACTIVE',
  daysRemaining: 29,
  contractor: { id: 'c-1', legalName: 'Alvenarias Silva LTDA', tradeName: null },
  constructionSite: { id: 's-1', code: 'OB-001', name: 'Residencial Aurora' },
} as Contract;

describe('Tabela de contratos', () => {
  it('o menu do contrato gera o PDF', async () => {
    const onGeneratePdf = vi.fn();
    const usuario = userEvent.setup({ pointerEventsCheck: 0 });
    render(
      <ContractsTable
        contracts={[CONTRATO]}
        onGeneratePdf={onGeneratePdf}
        onCancel={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    await usuario.click(screen.getByRole('button', { name: 'Ações' }));
    await usuario.click(await screen.findByRole('menuitem', { name: /Gerar PDF/ }));

    expect(onGeneratePdf).toHaveBeenCalledWith(CONTRATO);
  });
});
