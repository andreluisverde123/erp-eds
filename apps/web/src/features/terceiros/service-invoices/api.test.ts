import { describe, expect, it, vi } from 'vitest';

import { apiClient } from '@/lib/api-client';

import { uploadServiceInvoiceFile } from './api';

vi.mock('@/lib/api-client', () => ({
  apiClient: { post: vi.fn(), upload: vi.fn(async () => ({})) },
}));

/// Defeito relatado pelo cliente: "Selecione o arquivo da nota." em todo envio.
/// O arquivo ia por `apiClient.post`, que serializa o corpo em JSON — um
/// FormData vira "{}" e a API recebe a requisição sem arquivo.
describe('envio do arquivo da nota de serviço', () => {
  it('vai como multipart (apiClient.upload), com o arquivo no campo "file"', async () => {
    const arquivo = new File(['%PDF-1.4'], 'nota-008.pdf', { type: 'application/pdf' });

    await uploadServiceInvoiceFile('nota-1', arquivo);

    expect(apiClient.post).not.toHaveBeenCalled();
    const [caminho, corpo] = vi.mocked(apiClient.upload).mock.calls[0]!;
    expect(caminho).toBe('/service-invoices/nota-1/files');
    expect(corpo).toBeInstanceOf(FormData);
    expect((corpo.get('file') as File).name).toBe('nota-008.pdf');
  });
});
