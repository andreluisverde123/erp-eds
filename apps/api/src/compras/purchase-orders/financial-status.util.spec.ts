import {
  buildFinancialStatus,
  type FinancialSourceInboundInvoice,
  type FinancialSourceInvoice,
} from './financial-status.util';

const NFE_PENDENTE: FinancialSourceInboundInvoice = {
  id: 'nfe-1',
  number: '000456',
  series: '1',
  status: 'PENDING',
  reconciledAt: null,
};

const NFE_CONCILIADA: FinancialSourceInboundInvoice = {
  ...NFE_PENDENTE,
  status: 'RECONCILED',
  reconciledAt: new Date('2026-08-24T10:00:00Z'),
};

const nota = (parcelas: FinancialSourceInvoice['accountsPayable']): FinancialSourceInvoice => ({
  id: 'inv-1',
  number: '000456',
  series: '1',
  status: 'VALIDATED',
  accountsPayable: parcelas,
});

describe('buildFinancialStatus — situação financeira da ordem de compra', () => {
  describe('6 e 8. Os estágios, todos derivados do que já existe', () => {
    it('sem nota: a ordem foi emitida e nada chegou', () => {
      const status = buildFinancialStatus([], []);

      expect(status.stage).toBe('WITHOUT_INVOICE');
      expect(status.hasInboundInvoice).toBe(false);
      expect(status.isReconciled).toBe(false);
      expect(status.hasPayable).toBe(false);
      expect(status.isFullyPaid).toBe(false);
    });

    it('NF recebida: a nota chegou da SEFAZ e ninguém conciliou ainda', () => {
      const status = buildFinancialStatus([], [NFE_PENDENTE]);

      expect(status.stage).toBe('INVOICE_RECEIVED');
      expect(status.hasInboundInvoice).toBe(true);
      expect(status.isReconciled).toBe(false);
    });

    it('conciliada, mas antes de existir parcela', () => {
      // Estado momentâneo (a conciliação cria a nota e as parcelas na mesma
      // transação), mas alcançável por nota lançada à mão e ainda não validada.
      const status = buildFinancialStatus([nota([])], [NFE_CONCILIADA]);

      expect(status.stage).toBe('RECONCILED');
      expect(status.isReconciled).toBe(true);
      expect(status.hasPayable).toBe(false);
    });

    it('conta a pagar criada: parcela em aberto', () => {
      const status = buildFinancialStatus([nota([{ status: 'OPEN' }])], [NFE_CONCILIADA]);

      expect(status.stage).toBe('PAYABLE_CREATED');
      expect(status.hasPayable).toBe(true);
      expect(status.payables).toEqual({ total: 1, open: 1, paid: 0, cancelled: 0 });
    });

    it('pago: todas as parcelas baixadas', () => {
      const status = buildFinancialStatus(
        [nota([{ status: 'PAID' }, { status: 'PAID' }])],
        [NFE_CONCILIADA],
      );

      expect(status.stage).toBe('PAID');
      expect(status.isFullyPaid).toBe(true);
      expect(status.payables.paid).toBe(2);
    });

    it('uma parcela de três NÃO torna a compra paga', () => {
      const status = buildFinancialStatus(
        [nota([{ status: 'PAID' }, { status: 'OPEN' }, { status: 'OPEN' }])],
        [NFE_CONCILIADA],
      );

      expect(status.stage).toBe('PAYABLE_CREATED');
      expect(status.isFullyPaid).toBe(false);
      expect(status.payables).toEqual({ total: 3, open: 2, paid: 1, cancelled: 0 });
    });

    it('parcela cancelada não fica esperando pagamento', () => {
      const status = buildFinancialStatus(
        [nota([{ status: 'PAID' }, { status: 'CANCELLED' }])],
        [NFE_CONCILIADA],
      );

      expect(status.stage).toBe('PAID');
      expect(status.isFullyPaid).toBe(true);
    });

    it('só parcelas canceladas não é "pago" — nada foi pago', () => {
      const status = buildFinancialStatus([nota([{ status: 'CANCELLED' }])], [NFE_CONCILIADA]);

      expect(status.isFullyPaid).toBe(false);
      expect(status.stage).toBe('PAYABLE_CREATED');
    });
  });

  describe('3 e 4. A ordem alcança a nota e a nota alcança a conta', () => {
    it('lista as notas ligadas à ordem, com o vínculo de conciliação', () => {
      const status = buildFinancialStatus([nota([{ status: 'OPEN' }])], [NFE_CONCILIADA]);

      expect(status.inboundInvoices).toEqual([
        { id: 'nfe-1', number: '000456', series: '1', status: 'RECONCILED', reconciled: true },
      ]);
      expect(status.invoices).toEqual([
        { id: 'inv-1', number: '000456', series: '1', status: 'VALIDATED' },
      ]);
    });

    it('soma parcelas de VÁRIAS notas na mesma ordem (entrega parcial)', () => {
      const status = buildFinancialStatus(
        [
          { ...nota([{ status: 'PAID' }]), id: 'inv-1' },
          { ...nota([{ status: 'OPEN' }]), id: 'inv-2', number: '000457' },
        ],
        [NFE_CONCILIADA],
      );

      expect(status.payables).toEqual({ total: 2, open: 1, paid: 1, cancelled: 0 });
      expect(status.stage).toBe('PAYABLE_CREATED');
      expect(status.invoices).toHaveLength(2);
    });

    it('nota lançada à mão (sem NF-e capturada) conta como conciliada', () => {
      // A `Invoice` só existe porque houve conciliação ou lançamento manual —
      // é o caminho antigo, anterior à captura automática.
      const status = buildFinancialStatus([nota([])], []);

      expect(status.isReconciled).toBe(true);
      expect(status.hasInboundInvoice).toBe(false);
      expect(status.stage).toBe('RECONCILED');
    });
  });

  describe('8 e 14. Nada novo é inventado', () => {
    it('não devolve status financeiro fora dos cinco estágios derivados', () => {
      const estagios = [
        buildFinancialStatus([], []),
        buildFinancialStatus([], [NFE_PENDENTE]),
        buildFinancialStatus([nota([])], [NFE_CONCILIADA]),
        buildFinancialStatus([nota([{ status: 'OPEN' }])], [NFE_CONCILIADA]),
        buildFinancialStatus([nota([{ status: 'PAID' }])], [NFE_CONCILIADA]),
      ].map((status) => status.stage);

      expect(estagios).toEqual([
        'WITHOUT_INVOICE',
        'INVOICE_RECEIVED',
        'RECONCILED',
        'PAYABLE_CREATED',
        'PAID',
      ]);
    });

    it('não copia valor monetário da conta a pagar para a ordem', () => {
      const status = buildFinancialStatus([nota([{ status: 'OPEN' }])], [NFE_CONCILIADA]);

      expect(JSON.stringify(status)).not.toContain('amount');
    });
  });
});
