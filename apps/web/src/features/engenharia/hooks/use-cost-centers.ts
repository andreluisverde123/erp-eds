import { useQuery } from '@tanstack/react-query';

import { listCostCenters } from '../api';
import type { CostCenterQuery } from '../types';

/// Sem obra na query devolve os centros de custo da empresa inteira — é assim
/// que a solicitação de compra lista os destinos disponíveis desde que o campo
/// "Obra" saiu do formulário. As telas de RH continuam passando a obra e, para
/// elas, `enabled` segura a busca até o usuário escolher uma.
export function useCostCenters(query: CostCenterQuery & { enabled?: boolean }) {
  const { enabled = true, ...listQuery } = query;

  return useQuery({
    queryKey: ['cost-centers', 'list', listQuery],
    queryFn: () => listCostCenters(listQuery),
    enabled,
  });
}
