import { apiClient } from './api-client';

/// Downloads/anexos exigem o header Authorization (token em memória, não é
/// cookie) — por isso nunca podem ser um `<a href>` simples. Busca como blob
/// e dispara o download via um link temporário.
export async function downloadFile(path: string, fileName: string): Promise<void> {
  const blob = await apiClient.getBlob(path);
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/// Mesma ideia, mas abre numa aba nova em vez de baixar — usado pra "ver o
/// anexo" (o navegador decide como exibir, ex.: visualizador de PDF nativo).
export async function openFileInNewTab(path: string): Promise<void> {
  const blob = await apiClient.getBlob(path);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
