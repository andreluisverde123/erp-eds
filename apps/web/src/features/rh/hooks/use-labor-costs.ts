import { useQuery } from '@tanstack/react-query';

import { getLaborCosts } from '../api';

/// Custo de mão de obra de uma obra num período.
///
/// Só busca com obra e as duas datas: sem elas a pergunta não está formada, e
/// disparar traria o custo de uma obra arbitrária.
export function useLaborCosts(constructionSiteId: string | null, from: string, to: string) {
  return useQuery({
    queryKey: ['labor-costs', constructionSiteId, from, to],
    queryFn: () => getLaborCosts({ constructionSiteId: constructionSiteId!, from, to }),
    enabled: Boolean(constructionSiteId && from && to),
  });
}
