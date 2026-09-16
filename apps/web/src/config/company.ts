/// Identidade da aplicação no front.
///
/// O sistema é o mesmo para todas as construtoras; a marca é da INSTALAÇÃO.
/// Ela vem da pasta `apps/web/brands/<id>/`, escolhida no build por
/// `VITE_BRAND`, e chega aqui pronta em `__APP_BRAND__` (ver
/// `apps/web/brand/brand.ts`).
///
/// Nenhum componente deve escrever o nome de uma construtora: usa estas
/// constantes, ou `useBrand()` quando o dado gravado em Configurações deve
/// prevalecer.

export interface AppBrand {
  id: string;
  appName: string;
  shortName: string;
  companyName: string;
  description: string;
  logo: string;
  favicon: string;
  colors: {
    primary: string;
    primaryForeground: string;
    pending: string;
    pendingForeground: string;
  };
}

export const APP_BRAND: AppBrand = __APP_BRAND__;

/// Nome exibido quando não há sessão (login, splash, aba do navegador).
export const APP_NAME = APP_BRAND.appName;

/// Logo da instalação. Único ponto do código que aponta para o arquivo.
export const APP_LOGO = APP_BRAND.logo;

/// Nome da construtora no rodapé da barra lateral, antes de a empresa gravar o
/// dela em Configurações.
export const COMPANY_NAME = APP_BRAND.companyName;

/// Auto-cadastro de construtora (a rota `/cadastro`). Desligado: novos usuários
/// são criados por um administrador em Configurações → Usuários.
///
/// Continua atrás de uma variável — e não apagado — porque a mesma tela é o
/// caminho de provisionamento de uma base nova. Ligar aqui sem ligar
/// `PUBLIC_SIGNUP_ENABLED` na API não adianta: a tela abre e o endpoint recusa.
export const PUBLIC_SIGNUP_ENABLED = import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED === 'true';
