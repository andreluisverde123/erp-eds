import { useAuth } from './context';
import { PRODUCT_LOGO, PRODUCT_NAME } from '@/config/product';

export interface Brand {
  /// O que aparece como nome do sistema.
  name: string;
  /// Caminho do logo a exibir.
  logo: string;
  /// Nome do inquilino logado (`null` fora da sessão) — a construtora, não o
  /// sistema. É o que vai no rodapé da barra lateral.
  tenantName: string | null;
}

/// Precedência da marca, do mais específico ao mais genérico:
///
/// 1. o nome que o próprio cliente deu ao sistema (Configurações → Sistema)
/// 2. o nome do produto, por variável de ambiente
///
/// O logo segue a mesma lógica: o do inquilino quando existe, o do produto
/// quando não. Nenhuma das duas pontas está fixa no código dos componentes —
/// é isso que permite a mesma build servir os dois produtos e qualquer cliente.
export function useBrand(): Brand {
  const { user } = useAuth();
  const tenant = user?.tenant ?? null;

  return {
    name: tenant?.erpName || PRODUCT_NAME,
    logo: tenant?.logoUrl ?? PRODUCT_LOGO,
    tenantName: tenant?.name ?? null,
  };
}
