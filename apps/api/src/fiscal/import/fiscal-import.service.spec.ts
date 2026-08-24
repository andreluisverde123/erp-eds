import { Logger } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';
import { FiscalImportService } from './fiscal-import.service';
import { SupplierResolverService } from './supplier-resolver.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const CHAVE = `3526080912345678000190550010000012341${'0'.repeat(7)}`;

const XML = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
    <ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-08-01T10:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>12345678000190</CNPJ><xNome>FORNECEDORA LTDA</xNome></emit>
    <total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

function makeService(resolveResult: string | null) {
  const inboundInvoiceCreate = jest.fn(async () => ({ id: 'nota-1' }));
  const tx = {
    inboundInvoice: { create: inboundInvoiceCreate, update: jest.fn() },
    inboundInvoiceItem: { deleteMany: jest.fn(), createMany: jest.fn() },
  };

  const prisma = {
    fiscalDocument: {
      findMany: jest.fn(async () => [
        { id: 'doc-1', nsu: '42', schema: 'procNFe_v4.00', xml: Buffer.from(XML, 'utf8') },
      ]),
      update: jest.fn(),
    },
    fiscalImportLog: { create: jest.fn() },
    inboundInvoice: { findFirst: jest.fn(async () => null) },
    $transaction: jest.fn(async (arg: unknown) =>
      typeof arg === 'function'
        ? (arg as (client: typeof tx) => Promise<unknown>)(tx)
        : Promise.all(arg as Promise<unknown>[]),
    ),
  } as unknown as PrismaService;

  const resolve = jest.fn(async () => resolveResult);
  const service = new FiscalImportService(prisma, {
    resolve,
  } as unknown as SupplierResolverService);

  return { service, prisma, resolve, inboundInvoiceCreate };
}

beforeAll(() => {
  jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
});
afterAll(() => jest.restoreAllMocks());

describe('FiscalImportService — vínculo do fornecedor', () => {
  it('resolve o emitente e grava o vínculo na nota importada', async () => {
    const { service, resolve, inboundInvoiceCreate } = makeService('sup-1');

    const resultado = await service.processPending(EMPRESA);

    expect(resultado.imported).toBe(1);
    // O resolvedor é chamado com a empresa da nota — nunca sem escopo.
    expect(resolve).toHaveBeenCalledWith(
      EMPRESA,
      expect.objectContaining({ supplierDocument: '12345678000190' }),
    );
    expect(inboundInvoiceCreate.mock.calls[0]![0].data).toMatchObject({
      companyId: EMPRESA,
      accessKey: CHAVE,
      supplierId: 'sup-1',
    });
  });

  it('emitente não resolvido não impede a importação da nota', async () => {
    const { service, inboundInvoiceCreate } = makeService(null);

    const resultado = await service.processPending(EMPRESA);

    // A nota entra sem vínculo, como entrava antes desta mudança — guardar o
    // documento nunca depende de entender o emitente.
    expect(resultado.imported).toBe(1);
    expect(resultado.failed).toBe(0);
    expect(inboundInvoiceCreate.mock.calls[0]![0].data).toMatchObject({ supplierId: null });
  });
});
