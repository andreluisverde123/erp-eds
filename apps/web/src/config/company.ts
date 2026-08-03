/// Identidade da aplicação no front.
///
/// Substituiu `config/product.ts`, que existia para trocar a marca do software
/// por variável de ambiente — mecanismo de um produto vendido a vários
/// clientes. Este ERP tem um cliente só, que é o dono: a EDS. Não há marca a
/// alternar, então não há variável de ambiente aqui.
///
/// Tudo vem de `EDS_COMPANY` (`@repo/types`), a mesma constante que a API lê.
import { EDS_COMPANY } from '@repo/types';

export { EDS_COMPANY };

/// Nome exibido quando não há sessão (login, splash, aba do navegador).
export const APP_NAME = EDS_COMPANY.appName;

/// Logo institucional da EDS. Único ponto do código que aponta para o arquivo.
export const APP_LOGO = EDS_COMPANY.logo;

/// Nome da construtora no rodapé da barra lateral. Vem da configuração central
/// e não mais de `AuthUser.tenant`: a empresa é fixa e conhecida antes do
/// login, então o rodapé não depende mais de haver sessão.
export const COMPANY_NAME = EDS_COMPANY.tradeName ?? EDS_COMPANY.shortName;

/// Auto-cadastro de construtora (a rota `/cadastro`). Desligado: o ERP da EDS
/// tem uma empresa só e novos usuários são criados por um administrador em
/// Configurações → Usuários.
///
/// Continua atrás de uma variável — e não apagado — porque a mesma tela é o
/// caminho de provisionamento de uma base nova (ambiente de homologação, por
/// exemplo). Ligar aqui sem ligar `PUBLIC_SIGNUP_ENABLED` na API não adianta:
/// a tela abre e o endpoint recusa.
export const PUBLIC_SIGNUP_ENABLED = import.meta.env.VITE_PUBLIC_SIGNUP_ENABLED === 'true';
