import { danfeFileName } from '../../conciliacao/inbound-invoices/inbound-invoices.service';
import { CHAVE_FIXTURE, nfeXml } from './danfe.fixture';
import { DanfeXmlError, parseDanfeXml } from './danfe-data';
import { formatKey, invoiceNumber, renderDanfePdf } from './danfe-pdf';

describe('parseDanfeXml', () => {
  const data = parseDanfeXml(nfeXml());

  it('lê cabeçalho, protocolo e partes', () => {
    expect(data.accessKey).toBe(CHAVE_FIXTURE);
    expect(data.number).toBe('1234');
    expect(data.operationType).toBe('1');
    // Data do próprio texto, sem conversão de fuso: 23:40 do dia 4 continua dia 4.
    expect(data.issueDate).toBe('04/08/2026');
    expect(data.exitTime).toBe('08:00:00');
    expect(data.protocol).toBe('353260000123456 - 04/08/2026 23:40:15');
    expect(data.issuer.document).toBe('12345678000190');
    expect(data.recipient.street).toBe('QUADRA 102 NORTE, S/N, BLOCO A SALA 201');
  });

  it('lê itens com impostos, duplicatas e transporte', () => {
    expect(data.items).toHaveLength(2);
    expect(data.items[0]).toMatchObject({
      cst: '000',
      icmsRate: '18.00',
      ipiAmount: '16.25',
      description: 'CIMENTO CP II-E-32 SACO 50KG ITEM 1\nLote 2026-08 validade 90 dias',
    });
    expect(data.duplicates).toEqual([
      { number: '001', dueDate: '10/09/2026', amount: '100.00' },
      { number: '002', dueDate: '11/09/2026', amount: '100.00' },
    ]);
    expect(data.volumes.grossWeight).toBe('1010.500');
    expect(data.carrier.plate).toBe('ABC1D23');
  });

  it('nota de um item só e uma duplicata só continua virando lista', () => {
    const uma = parseDanfeXml(nfeXml({ itens: 1, duplicatas: 1 }));
    expect(uma.items).toHaveLength(1);
    expect(uma.duplicates).toHaveLength(1);
  });

  it('recusa documento que não é NF-e completa', () => {
    expect(() => parseDanfeXml('<resNFe><chNFe>1</chNFe></resNFe>')).toThrow(DanfeXmlError);
  });
});

describe('renderDanfePdf', () => {
  it('gera um PDF de uma folha para nota curta', async () => {
    const { buffer, pageCount } = await renderDanfePdf(parseDanfeXml(nfeXml()));
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF');
    expect(pageCount).toBe(1);
  });

  it('pagina quando os itens não cabem numa folha', async () => {
    const { pageCount } = await renderDanfePdf(parseDanfeXml(nfeXml({ itens: 80 })));
    expect(pageCount).toBeGreaterThan(1);
  });

  it('carimba nota cancelada sem quebrar a geração', async () => {
    const { buffer } = await renderDanfePdf(parseDanfeXml(nfeXml()), { cancelled: true });
    expect(buffer.length).toBeGreaterThan(1000);
  });

  it('formata número e chave como o MOC', () => {
    expect(invoiceNumber('1234')).toBe('000.001.234');
    expect(formatKey(CHAVE_FIXTURE)).toBe('5326 0812 3456 7800 0190 5500 1000 0012 3410 0001 2345');
  });
});

describe('danfeFileName', () => {
  it('monta um nome só com ASCII, curto e sem hífen sobrando', () => {
    expect(danfeFileName('1234', 'Materiais de Construção Exemplo Ltda')).toBe(
      'DANFE-1234-MATERIAIS-DE-CONSTRUCAO-EXEMPL.pdf',
    );
    expect(danfeFileName('9', '***')).toBe('DANFE-9.pdf');
  });
});
