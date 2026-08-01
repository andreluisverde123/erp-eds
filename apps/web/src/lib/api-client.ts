const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
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
    const newToken = await unauthorizedHandler();
    if (newToken) {
      accessToken = newToken;
      return request<T>(path, { ...options, skipAuthRetry: true });
    }
  }

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const message = Array.isArray(body?.message) ? body.message.join(' ') : body?.message;
    throw new ApiError(response.status, message ?? 'Erro inesperado. Tente novamente.');
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
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
    const newToken = await unauthorizedHandler();
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

export const apiClient = {
  get: <T>(path: string) => request<T>(path),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>(path, {
      ...options,
      method: 'PATCH',
      body: body ? JSON.stringify(body) : undefined,
    }),
  delete: <T>(path: string, options?: RequestOptions) =>
    request<T>(path, { ...options, method: 'DELETE' }),
  upload: <T>(path: string, formData: FormData) =>
    request<T>(path, { method: 'POST', body: formData }),
  getBlob: (path: string) => requestBlob(path),
};
