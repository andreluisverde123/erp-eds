import { useAuth } from './context';
import { APP_LOGO, APP_NAME, COMPANY_NAME } from '@/config/company';

export interface Brand {
  /// O que aparece como nome do sistema.
  name: string;
  /// Caminho do logo a exibir.
  logo: string;
  /// Nome da construtora — o que vai no rodapé da barra lateral. Nunca `null`:
  /// a empresa é única e conhecida antes de existir sessão.
  companyName: string;
}

/// Precedência da marca, do mais específico ao mais genérico:
///
/// 1. o nome e o logo que a própria EDS gravou em Configurações → Sistema
/// 2. a configuração central da aplicação (`EDS_COMPANY`)
///
/// O primeiro nível continua existindo porque é dado editável pelo usuário
/// administrador na própria tela de Configurações — não é resquício de
/// multi-inquilino. O segundo é o que a aplicação mostra antes de existir
/// sessão (login, splash) e quando nada foi personalizado.
export function useBrand(): Brand {
  const { user } = useAuth();
  const settings = user?.tenant ?? null;

  return {
    name: settings?.erpName || APP_NAME,
    logo: settings?.logoUrl ?? APP_LOGO,
    companyName: settings?.name ?? COMPANY_NAME,
  };
}
