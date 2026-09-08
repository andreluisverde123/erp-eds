import { useAuth } from './context';
import { APP_LOGO, APP_NAME, COMPANY_NAME } from '@/config/company';
import { useMarcaDemo } from '@/features/demo-brand/use-demo-brand';

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
/// 0. a marca de demonstração, quando houver — só existe em desenvolvimento
/// 1. o nome e o logo que a própria EDS gravou em Configurações → Sistema
/// 2. a configuração central da aplicação (`EDS_COMPANY`)
///
/// O primeiro nível continua existindo porque é dado editável pelo usuário
/// administrador na própria tela de Configurações — não é resquício de
/// multi-inquilino. O segundo é o que a aplicação mostra antes de existir
/// sessão (login, splash) e quando nada foi personalizado.
export function useBrand(): Brand {
  const { user } = useAuth();
  const demo = useMarcaDemo();
  const settings = user?.tenant ?? null;

  // A marca de demonstração fica ACIMA do que está gravado no banco, e não
  // abaixo: durante uma demonstração o dado salvo é justamente o que se quer
  // esconder. Fora de desenvolvimento `demo` é sempre `null` e esta linha some.
  if (demo) {
    return {
      name: demo.erpName,
      logo: demo.logo ?? APP_LOGO,
      companyName: demo.companyName,
    };
  }

  return {
    name: settings?.erpName || APP_NAME,
    logo: settings?.logoUrl ?? APP_LOGO,
    companyName: settings?.name ?? COMPANY_NAME,
  };
}
