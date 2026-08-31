import {
  compareSlipToPayable,
  rankMatches,
  type PayableMatchInput,
  type SlipMatchInput,
} from './slip-matching.util';

const PERINI = 'forn-perini';
const OUTRO = 'forn-outro';

const BOLETO: SlipMatchInput = {
  supplierId: PERINI,
  amount: 3500,
  dueDate: new Date('2026-09-30T00:00:00Z'),
  documentNumber: '000456',
};

const CONTA: PayableMatchInput = {
  id: 'conta-1',
  supplierId: PERINI,
  amount: 3500,
  dueDate: new Date('2026-09-30T00:00:00Z'),
  documentNumber: null,
  invoiceNumber: '456',
};

const nivel = (slip: Partial<SlipMatchInput>, payable: Partial<PayableMatchInput> = {}) =>
  compareSlipToPayable({ ...BOLETO, ...slip }, { ...CONTA, ...payable });

describe('compareSlipToPayable — grau de compatibilidade', () => {
  describe('9. Os três graus, com regra determinística', () => {
    it('tudo confere: ALTA', () => {
      const resultado = nivel({});

      expect(resultado.level).toBe('HIGH');
      expect(resultado.checks).toEqual({
        supplier: 'MATCH',
        amount: 'MATCH',
        dueDate: 'MATCH',
        documentNumber: 'MATCH',
      });
    });

    it('fornecedor e valor conferem, vencimento não: MÉDIA', () => {
      // É o segundo exemplo do prompt, literal.
      const resultado = nivel(
        { documentNumber: null },
        { dueDate: new Date('2026-10-15T00:00:00Z') },
      );

      expect(resultado.level).toBe('MEDIUM');
      expect(resultado.checks.dueDate).toBe('DIVERGENT');
    });

    it('valor divergente mas vencimento e documento conferem: MÉDIA', () => {
      const resultado = nivel({ amount: 3600 });

      expect(resultado.level).toBe('MEDIUM');
      expect(resultado.checks.amount).toBe('DIVERGENT');
    });

    it('só o fornecedor confere: BAIXA', () => {
      const resultado = nivel(
        { amount: 999, documentNumber: null },
        { dueDate: new Date('2026-12-01T00:00:00Z') },
      );

      expect(resultado.level).toBe('LOW');
    });
  });

  describe('12. Fornecedor divergente derruba tudo', () => {
    it('valor e vencimento iguais NÃO compensam fornecedor diferente', () => {
      // Coincidência comum numa construtora: várias compras de R$ 3.500
      // vencendo dia 30. Sem esta regra, o boleto de um fornecedor casaria
      // com a conta de outro.
      const resultado = nivel({}, { supplierId: OUTRO });

      expect(resultado.level).toBe('LOW');
      expect(resultado.checks.supplier).toBe('DIVERGENT');
      expect(resultado.checks.amount).toBe('MATCH');
      expect(resultado.checks.dueDate).toBe('MATCH');
    });

    it('fornecedor não identificado também não passa de BAIXA', () => {
      const resultado = nivel({ supplierId: null });

      expect(resultado.level).toBe('LOW');
      expect(resultado.checks.supplier).toBe('UNKNOWN');
    });
  });

  describe('10, 11 e 12. Divergências ficam visíveis campo a campo', () => {
    it('valor divergente é apontado sem alterar nada', () => {
      const resultado = nivel({ amount: 3500 }, { amount: 3600 });
      expect(resultado.checks.amount).toBe('DIVERGENT');
    });

    it('diferença abaixo de um centavo é a mesma quantia', () => {
      const resultado = nivel({ amount: 3500 }, { amount: 3500.001 });
      expect(resultado.checks.amount).toBe('MATCH');
    });

    it('um centavo de diferença JÁ é divergência', () => {
      const resultado = nivel({ amount: 3500 }, { amount: 3500.01 });
      expect(resultado.checks.amount).toBe('DIVERGENT');
    });

    it('compara o DIA do vencimento, não o instante', () => {
      const resultado = nivel(
        { dueDate: new Date('2026-09-30T23:59:00Z') },
        { dueDate: new Date('2026-09-30T00:00:00Z') },
      );

      expect(resultado.checks.dueDate).toBe('MATCH');
    });
  });

  describe('12 (relacionamentos opcionais). Ausência não é divergência', () => {
    it('boleto sem vencimento deixa a verificação em UNKNOWN', () => {
      const resultado = nivel({ dueDate: null });

      expect(resultado.checks.dueDate).toBe('UNKNOWN');
      // Continua ALTA: fornecedor, valor e documento conferem.
      expect(resultado.level).toBe('HIGH');
    });

    it('boleto sem valor (quantia definida no pagamento) não vira divergência', () => {
      const resultado = nivel({ amount: null });

      expect(resultado.checks.amount).toBe('UNKNOWN');
      expect(resultado.level).toBe('MEDIUM');
    });

    it('conta sem documento nenhum deixa a verificação em UNKNOWN', () => {
      const resultado = nivel({}, { documentNumber: null, invoiceNumber: null });

      expect(resultado.checks.documentNumber).toBe('UNKNOWN');
      expect(resultado.level).toBe('HIGH');
    });
  });

  describe('8. Documento casa com a conta OU com a nota que a originou', () => {
    it('casa com o número da nota fiscal', () => {
      expect(nivel({ documentNumber: '456' }).checks.documentNumber).toBe('MATCH');
    });

    it('zeros à esquerda são formatação, não conteúdo', () => {
      expect(nivel({ documentNumber: '000456' }).checks.documentNumber).toBe('MATCH');
      expect(
        nivel({ documentNumber: '456' }, { invoiceNumber: '000456' }).checks.documentNumber,
      ).toBe('MATCH');
    });

    it('casa com o número do documento da conta avulsa', () => {
      const resultado = nivel(
        { documentNumber: 'REC-2026/88' },
        { documentNumber: 'rec202688', invoiceNumber: null },
      );

      expect(resultado.checks.documentNumber).toBe('MATCH');
    });

    it('documento diferente é divergência, não ausência', () => {
      expect(nivel({ documentNumber: '999' }).checks.documentNumber).toBe('DIVERGENT');
    });
  });

  describe('8. Ordenação das candidatas', () => {
    it('melhor grau primeiro', () => {
      const alta = nivel({});
      const baixa = compareSlipToPayable(BOLETO, { ...CONTA, id: 'conta-2', supplierId: OUTRO });
      const media = compareSlipToPayable(BOLETO, {
        ...CONTA,
        id: 'conta-3',
        amount: 9999,
        invoiceNumber: null,
      });

      const ordenadas = rankMatches([baixa, media, alta]);

      expect(ordenadas.map((m) => m.accountPayableId)).toEqual(['conta-1', 'conta-3', 'conta-2']);
    });

    it('no mesmo grau, mais verificações confirmadas vem primeiro', () => {
      const comDocumento = compareSlipToPayable(BOLETO, { ...CONTA, id: 'com-doc', amount: 1 });
      const semDocumento = compareSlipToPayable(BOLETO, {
        ...CONTA,
        id: 'sem-doc',
        amount: 1,
        invoiceNumber: null,
      });

      const ordenadas = rankMatches([semDocumento, comDocumento]);

      expect(ordenadas[0]!.accountPayableId).toBe('com-doc');
    });

    it('não altera a lista recebida', () => {
      const lista = [nivel({})];
      const copia = [...lista];

      rankMatches(lista);

      expect(lista).toEqual(copia);
    });
  });
});
