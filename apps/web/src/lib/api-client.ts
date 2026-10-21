const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    /// Código de negócio que a API manda em casos específicos (ex.:
    /// `PAYMENT_PENDING`). Ausente na maioria dos erros.
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

let accessToken: string | null = null;
let unauthorizedHandler: (() => Promise<string | null>) | null = null;

/// Chamado pelo AuthProvider sempre que o token muda (login, refresh, logout).
/// Mantém o client desacoplado do contexto React — nenhum componente precisa
/// passar o token manualmente em cada chamada.
export function setAccessToken(token: string | null) {
  accessToken = token;
}

/// Chamado pelo AuthProvider para registrar "o que fazer quando uma chamada
/// autenticada recebe 401" (tenta um refresh silencioso e retorna o novo
/// token, ou null se a sessão realmente acabou).
export function setUnauthorizedHandler(handler: (() => Promise<string | null>) | null) {
  unauthorizedHandler = handler;
}

/// UMA renovação por vez. Quando o access token vence, a tela costuma ter
/// várias chamadas no ar ao mesmo tempo, e todas levam 401 juntas. Cada uma
/// chamando o refresh por conta própria gastava o mesmo cookie de uso único:
/// a primeira renovava, as seguintes eram recusadas e derrubavam a sessão —
/// a pessoa ia parar no login no meio de uma solicitação e perdia o que
/// estava digitando. Agora quem chega com o refresh em andamento espera o
/// mesmo resultado.
let refreshing: Promise<string | null> | null = null;

function renewAccessToken(handler: () => Promise<string | null>): Promise<string | null> {
  refreshing ??= handler().finally(() => {
    refreshing = null;
  });
  return refreshing;
}

interface RequestOptions extends RequestInit {
  skipAuthRetry?: boolean;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { skipAuthRetry, headers, ...init } = options;
  // FormData (upload de arquivo) não pode levar Content-Type manual — o
  // browser precisa definir o boundary do multipart sozinho.
  const isFormData = init.body instanceof FormData;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (response.status === 401 && accessToken && !skipAuthRetry && unauthorizedHandler) {
    const newToken = await renewAccessToken(unauthorizedHandler);
    if (newToken) {
      accessToken = newToken;
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    const code = typeof body?.code === 'string' ? body.code : undefined;
    throw new ApiError(response.status, message ?? 'Erro inesperado. Tente novamente.', code);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}

/// Igual ao `requestBlob`, mas devolve a `Response` sem consumir o corpo.
async function requestResponse(path: string, options: RequestOptions = {}): Promise<Response> {
  const { skipAuthRetry, headers, ...init } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (response.status === 401 && accessToken && !skipAuthRetry && unauthorizedHandler) {
    const newToken = await renewAccessToken(unauthorizedHandler);
    if (newToken) {
      accessToken = newToken;
      return requestResponse(path, { ...options, skipAuthRetry: true });
    }
  }

  if (!response.ok) {
    throw new ApiError(response.status, 'Não foi possível carregar o arquivo.');
  }

  return response;
}

async function requestBlob(path: string, options: RequestOptions = {}): Promise<Blob> {
  const { skipAuthRetry, headers, ...init } = options;

  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...headers,
    },
  });

  if (response.status === 401 && accessToken && !skipAuthRetry && unauthorizedHandler) {
    const newToken = await renewAccessToken(unauthorizedHandler);
    if (newToken) {
      accessToken = newToken;
      return requestBlob(path, { ...options, skipAuthRetry: true });
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new ApiError(response.status, message ?? 'Erro inesperado. Tente novamente.');
  }

  return response.blob();
}

/// Upload com progresso e cancelamento.
///
/// Usa `XMLHttpRequest` em vez de `fetch` por um motivo só: o `fetch` não
/// reporta progresso de ENVIO. Existe `ReadableStream` no corpo em navegadores
/// recentes, mas o Safari do iOS — que é metade dos aparelhos em obra — não o
/// suporta, e uma barra de progresso que não anda é pior que nenhuma quando o
/// upload leva dois minutos no 4G do canteiro.
///
/// O `Authorization` é o mesmo token em memória do resto do client. Não há
/// retry automático de 401 aqui, ao contrário do `request`: reenviar um vídeo
/// de 20 MB porque o token acabou de expirar é caro demais para acontecer
/// silenciosamente — a tela mostra a falha e oferece "tentar novamente", já
/// com o token renovado pela próxima chamada comum.
function uploadWithProgress<T>(
  path: string,
  formData: FormData,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `${API_URL}${path}`);
    xhr.withCredentials = true;
    if (accessToken) xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);

    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable && onProgress) {
        onProgress(Math.round((evento.loaded / evento.total) * 100));
      }
    };

    xhr.onload = () => {
      const corpo = parseJson(xhr.responseText);
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(corpo as T);
        return;
      }
      const mensagem = Array.isArray(corpo?.message) ? corpo.message.join(' ') : corpo?.message;
      reject(new ApiError(xhr.status, mensagem ?? 'Não foi possível enviar o arquivo.'));
    };

    // `status 0` é o que o navegador reporta para queda de conexão, DNS que
    // não resolveu e CORS — todos indistinguíveis daqui. Em obra o caso real é
    // sempre o primeiro, e a mensagem precisa dizer isso.
    xhr.onerror = () =>
      reject(new ApiError(0, 'Sem conexão. Verifique a internet e tente novamente.'));
    xhr.ontimeout = () => reject(new ApiError(0, 'O envio demorou demais. Tente novamente.'));
    xhr.onabort = () => reject(new ApiError(0, 'Envio cancelado.'));

    // Dois minutos: um vídeo de 25 MB numa conexão ruim de canteiro leva
    // tempo, e abortar cedo demais faz a pessoa reenviar tudo de novo.
    xhr.timeout = 120_000;

    signal?.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(formData);
  });
}

function parseJson(texto: string): { message?: string | string[] } | null {
  try {
    return texto ? (JSON.parse(texto) as { message?: string | string[] }) : null;
  } catch {
    return null;
  }
}

/// Corpo de `post`/`patch`/`put`. FormData passa INTEIRO: serializado em JSON
/// ele vira "{}" e a API recebe o upload sem arquivo ("Selecione o arquivo…").
/// Foi assim que o anexo genérico e o arquivo da nota de serviço ficaram sem
/// funcionar — bastava chamar `post` no lugar de `upload`.
function serializeBody(body: unknown): BodyInit | undefined {
  if (body instanceof FormData) return body;
  return body ? JSON.stringify(body) : undefined;
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: serializeBody(body) }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: serializeBody(body),
    }),
  /// PUT, e não PATCH: usado onde o corpo SUBSTITUI o recurso inteiro em vez
  /// de alterar campos — a equipe de uma obra é a lista final, e quem não está
  /// nela sai.
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PUT',
      body: serializeBody(body),
    }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  uploadWithProgress: <T>(
    path: string,
    formData: FormData,
    onProgress?: (percent: number) => void,
    signal?: AbortSignal,
  ) => uploadWithProgress<T>(path, formData, onProgress, signal),
  getBlob: (path: string) => requestBlob(path),
  /// A `Response` crua de uma leitura autenticada, para quem precisa ler o
  /// corpo em pedaços — hoje só o vídeo do Diário, que mostra progresso
  /// enquanto baixa. Mesmo token, mesmo retry de 401 do resto do client.
  getResponse: (path: string) => requestResponse(path),
};
