import { afterEach, describe, expect, it, vi } from 'vitest';

import { apiClient } from './api-client';

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
