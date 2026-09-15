import { downloadPackage } from './package-download';

const ZIP = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('conteudo')]);

function resposta(corpo: Buffer | string, status = 200, headers: Record<string, string> = {}) {
  return new Response(typeof corpo === 'string' ? corpo : new Uint8Array(corpo), { status, headers });
}

describe('Download dos pacotes oficiais', () => {
  const opcoes = (fetchImpl: jest.Mock) => ({ fetchImpl: fetchImpl as unknown as typeof fetch, esperaMs: 0 });

  it('404 é pacote não publicado', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(resposta('', 404));
    await expect(downloadPackage('u', '7z', opcoes(fetchImpl))).resolves.toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('página HTML (a CAIXA redireciona o mês ausente para a inicial) é pacote não publicado', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(resposta('<html>', 200, { 'content-type': 'text/html; charset=utf-8' }));
    await expect(downloadPackage('u', 'zip', opcoes(fetchImpl))).resolves.toBeNull();
  });

  it('download truncado tenta de novo e aceita o íntegro', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(resposta(ZIP.subarray(0, 6), 200, { 'content-length': String(ZIP.length) }))
      .mockResolvedValueOnce(resposta(ZIP, 200, { 'content-length': String(ZIP.length) }));
    await expect(downloadPackage('u', 'zip', opcoes(fetchImpl))).resolves.toEqual(ZIP);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('arquivo que não é do formato esperado falha depois das tentativas', async () => {
    const fetchImpl = jest.fn().mockImplementation(async () => resposta(ZIP));
    await expect(downloadPackage('u', '7z', opcoes(fetchImpl))).rejects.toThrow(/não é um \.7z/);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
