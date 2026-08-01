import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      // O staleTime de 30s já cobre a maior parte do "voltar pra aba" comum
      // num ERP (trocar de aba do navegador pra copiar algo e voltar) — sem
      // isso, toda troca de foco de janela dispara refetch de toda query
      // ativa na tela, mesmo sem mudança nenhuma nos dados.
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
