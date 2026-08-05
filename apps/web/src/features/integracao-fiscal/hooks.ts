import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  getIntegrationStatus,
  listSyncRuns,
  removeCertificate,
  syncNow,
  testConnection,
  uploadCertificate,
} from './api';

const KEY = ['fiscal-integration'];

export function useIntegrationStatus() {
  return useQuery({
    queryKey: [...KEY, 'status'],
    queryFn: getIntegrationStatus,
    // O job roda de hora em hora, mas uma sincronização manual muda o painel
    // na hora. 30s mantém a tela viva sem transformar um painel aberto num
    // gerador de tráfego.
    refetchInterval: 30_000,
  });
}

export function useSyncRuns(page: number, limit: number) {
  return useQuery({
    queryKey: [...KEY, 'runs', page, limit],
    queryFn: () => listSyncRuns(page, limit),
  });
}

function invalidate(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: KEY });
}

export function useUploadCertificate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, password }: { file: File; password: string }) =>
      uploadCertificate(file, password),
    onSuccess: () => invalidate(queryClient),
  });
}

export function useRemoveCertificate() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: removeCertificate, onSuccess: () => invalidate(queryClient) });
}

/// Não invalida o status: testar a conexão não muda estado nenhum — é uma
/// consulta que de propósito não avança o ponteiro NSU.
export function useTestConnection() {
  return useMutation({ mutationFn: testConnection });
}

export function useSyncNow() {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn: syncNow, onSuccess: () => invalidate(queryClient) });
}
