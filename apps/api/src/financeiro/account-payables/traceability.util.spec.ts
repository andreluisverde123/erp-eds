import { buildTraceability, type TraceableAccountPayable } from './traceability.util';

const FORNECEDOR = { id: 'forn-1', legalName: 'Perini Materiais LTDA', tradeName: 'Perini' };
const CENTRO = { id: 'cc-1', code: 'CC-001', name: 'Residencial Alfa' };
const OBRA = { id: 'obra-1', code: 'OBR-001', name: 'Residencial Alfa' };

const SOLICITACAO = { id: 'sol-1', code: 'REQ-000789', status: 'APPROVED' as const };
const ORDEM = {
  id: 'oc-1',
  code: 'OC-000123',
  status: 'OPEN' as const,
  purchaseRequest: SOLICITACAO,
};
const NFE_CAPTURADA = {
  id: 'nfe-1',
  number: '000456',
  series: '1',
  accessKey: '3'.repeat(44),
};

/// Conta nascida do caminho completo: Engenharia -> Solicitação -> OC -> NF-e
/// -> Conciliação -> Conta a Pagar.
const CADEIA_COMPLETA: TraceableAccountPayable = {
  origin: 'INVOICE',
  supplier: FORNECEDOR,
  costCenter: CENTRO,
  constructionSite: OBRA,
  invoice: {
    id: 'inv-1',
    number: '000456',
    series: '1',
    status: 'VALIDATED',
    purchaseOrder: ORDEM,
    inboundInvoices: [NFE_CAPTURADA],
  },
};

describe('buildTraceability — origem de uma conta a pagar', () => {
  describe('8 e 13. Rastreabilidade completa (Engenharia -> Financeiro)', () => {
    it('devolve os cinco elos: obra, solicitação, ordem, fornecedor e nota', () => {
      const trace = buildTraceability(CADEIA_COMPLETA);

      expect(trace.constructionSite).toEqual(OBRA);
      expect(trace.purchaseRequest).toEqual(SOLICITACAO);
      expect(trace.purchaseOrder).toEqual({ id: 'oc-1', code: 'OC-000123', status: 'OPEN' });
      expect(trace.supplier).toEqual(FORNECEDOR);
      expect(trace.invoice).toEqual({
        id: 'inv-1',
        number: '000456',
        series: '1',
        status: 'VALIDATED',
      });
      expect(trace.inboundInvoice).toEqual(NFE_CAPTURADA);
    });

    it('marca a profundidade da cadeia como PURCHASE_REQUEST', () => {
      expect(buildTraceability(CADEIA_COMPLETA).depth).toBe('PURCHASE_REQUEST');
    });

    it('distingue a NF-e capturada da nota do financeiro — são documentos diferentes', () => {
      const trace = buildTraceability(CADEIA_COMPLETA);

      expect(trace.inboundInvoice!.id).not.toBe(trace.invoice!.id);
      expect(trace.inboundInvoice!.accessKey).toHaveLength(44);
    });
  });

  describe('1 e 2. A obra e a solicitação acompanham o fluxo', () => {
    it('a obra vem da PRÓPRIA conta, não da travessia até a solicitação', () => {
      // As duas dizem o mesmo quando a cadeia existe. Ler da conta é o que
      // também responde para a conta avulsa, que não tem nota nenhuma.
      const trace = buildTraceability(CADEIA_COMPLETA);

      expect(trace.constructionSite).toEqual(OBRA);
      expect(trace.costCenter).toEqual(CENTRO);
    });

    it('despesa administrativa não inventa obra', () => {
      const trace = buildTraceability({
        ...CADEIA_COMPLETA,
        constructionSite: null,
        costCenter: { id: 'cc-adm', code: 'CC-ADM', name: 'Administrativo' },
      });

      expect(trace.constructionSite).toBeNull();
      expect(trace.costCenter!.name).toBe('Administrativo');
    });
  });

  describe('12. Relacionamentos opcionais', () => {
    it('conta avulsa: sem nota, sem ordem, sem solicitação — e sem erro', () => {
      const trace = buildTraceability({
        origin: 'MANUAL',
        supplier: FORNECEDOR,
        costCenter: CENTRO,
        constructionSite: OBRA,
        invoice: null,
      });

      expect(trace.depth).toBe('MANUAL');
      expect(trace.invoice).toBeNull();
      expect(trace.inboundInvoice).toBeNull();
      expect(trace.purchaseOrder).toBeNull();
      expect(trace.purchaseRequest).toBeNull();
      // O que a conta avulsa TEM continua respondendo.
      expect(trace.constructionSite).toEqual(OBRA);
      expect(trace.supplier).toEqual(FORNECEDOR);
    });

    it('compra de balcão: nota sem ordem de compra para na profundidade INVOICE', () => {
      const trace = buildTraceability({
        ...CADEIA_COMPLETA,
        invoice: { ...CADEIA_COMPLETA.invoice!, purchaseOrder: null },
      });

      expect(trace.depth).toBe('INVOICE');
      expect(trace.invoice).not.toBeNull();
      expect(trace.inboundInvoice).not.toBeNull();
      expect(trace.purchaseOrder).toBeNull();
      expect(trace.purchaseRequest).toBeNull();
    });

    it('ordem sem solicitação (dado antigo) para na profundidade PURCHASE_ORDER', () => {
      const trace = buildTraceability({
        ...CADEIA_COMPLETA,
        invoice: {
          ...CADEIA_COMPLETA.invoice!,
          purchaseOrder: { ...ORDEM, purchaseRequest: null },
        },
      });

      expect(trace.depth).toBe('PURCHASE_ORDER');
      expect(trace.purchaseOrder).not.toBeNull();
      expect(trace.purchaseRequest).toBeNull();
    });

    it('nota lançada à mão, sem NF-e capturada, não inventa documento fiscal', () => {
      const trace = buildTraceability({
        ...CADEIA_COMPLETA,
        invoice: { ...CADEIA_COMPLETA.invoice!, inboundInvoices: [] },
      });

      expect(trace.inboundInvoice).toBeNull();
      expect(trace.invoice).not.toBeNull();
    });
  });

  describe('14. Não duplicar dados', () => {
    it('devolve referências (id + código), nunca cópias de nome ou valor', () => {
      const trace = buildTraceability(CADEIA_COMPLETA);

      // Cada elo carrega o necessário para linkar e reconhecer — e nada mais.
      expect(Object.keys(trace.purchaseOrder!).sort()).toEqual(['code', 'id', 'status']);
      expect(Object.keys(trace.purchaseRequest!).sort()).toEqual(['code', 'id', 'status']);
      // Nenhum valor monetário é copiado para a origem.
      expect(JSON.stringify(trace)).not.toContain('totalAmount');
      expect(JSON.stringify(trace)).not.toContain('amount');
    });
  });
});
