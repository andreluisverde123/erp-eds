import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient, setAccessToken, setUnauthorizedHandler } from './api-client';

/// Defeito relatado pelo cliente: nenhum anexo subia ("Selecione o arquivo…").
/// O `post` serializava qualquer corpo em JSON, e um FormData vira "{}": a API
/// recebia o upload sem arquivo. Bastava chamar `post` no lugar de `upload`.
describe('apiClient com arquivo', () => {
  afterEach(() => vi.unstubAllGlobals());

  function interceptar() {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );
    vi.stubGlobal('fetch', fetchMock);
    return fetchMock;
  }

  function formulario() {
    const formData = new FormData();
    formData.append('file', new File(['%PDF-1.4'], 'nota.pdf', { type: 'application/pdf' }));
    return formData;
  }

  it.each(['post', 'patch', 'put', 'upload'] as const)(
    '%s envia o FormData inteiro, sem Content-Type manual',
    async (metodo) => {
      const fetchMock = interceptar();
      const formData = formulario();

      await apiClient[metodo]('/attachments/PurchaseRequest/1', formData);

      const init = fetchMock.mock.calls[0]![1];
      expect(init.body).toBe(formData);
      // O navegador é quem define o boundary do multipart.
      expect(init.headers).not.toHaveProperty('Content-Type');
    },
  );

  it('corpo comum continua indo como JSON', async () => {
    const fetchMock = interceptar();

    await apiClient.post('/purchase-requests', { title: 'Cimento' });

    const init = fetchMock.mock.calls[0]![1];
    expect(init.body).toBe('{"title":"Cimento"}');
    expect(init.headers).toMatchObject({ 'Content-Type': 'application/json' });
  });
});

/// Defeito em produção: quando o access token vencia, as chamadas que estavam
/// no ar levavam 401 juntas e cada uma pedia um refresh. O cookie é de uso
/// único, então as seguintes eram recusadas e a sessão caía no meio do
/// preenchimento de uma solicitação.
describe('apiClient com token vencido', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    setUnauthorizedHandler(null);
    setAccessToken(null);
  });

  it('várias chamadas com 401 ao mesmo tempo fazem UMA renovação só', async () => {
    setAccessToken('vencido');
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        const autorizado = (init.headers as Record<string, string>).Authorization === 'Bearer novo';
        return new Response('{}', { status: autorizado ? 200 : 401 });
      }),
    );
    let liberar!: () => void;
    const renovar = vi.fn(
      () => new Promise<string | null>((resolve) => (liberar = () => resolve('novo'))),
    );
    setUnauthorizedHandler(renovar);

    const chamadas = Promise.all([
      apiClient.get('/purchase-requests'),
      apiClient.get('/construction-sites'),
      apiClient.get('/auth/me'),
    ]);
    await vi.waitFor(() => expect(renovar).toHaveBeenCalled());
    liberar();

    await expect(chamadas).resolves.toHaveLength(3);
    expect(renovar).toHaveBeenCalledTimes(1);
  });
});
