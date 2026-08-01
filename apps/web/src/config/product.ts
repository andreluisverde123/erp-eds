/// Identidade do PRODUTO — o software que é vendido, não o cliente que o usa.
///
/// Existe para que nenhum nome de marca fique espalhado pelo código. Os dois
/// produtos que nascem desta Foundation trocam a marca por variável de
/// ambiente, sem tocar em componente nenhum.
///
/// Não confundir com a marca do INQUILINO (`AuthUser.tenant`), que vem do banco
/// e muda a cada login. A regra de precedência está em `useBrand`.
export const PRODUCT_NAME = import.meta.env.VITE_PRODUCT_NAME || 'OManager';

/// Logo exibido quando não há inquilino logado (login, cadastro, troca de
/// senha) e como reserva quando o inquilino não subiu logo próprio.
export const PRODUCT_LOGO = import.meta.env.VITE_PRODUCT_LOGO || '/logo-product.svg';

/// Se a barra lateral mostra o cartão "Construtora / <nome>" no rodapé.
///
/// Ligado (padrão) na plataforma multi-inquilino: o topo traz a marca do
/// produto e o rodapé diz de qual construtora é a sessão. Numa instalação
/// dedicada a um cliente a informação é redundante — o logo do topo já é o
/// dele —, então lá vale desligar.
export const SHOW_TENANT_BADGE = import.meta.env.VITE_SHOW_TENANT_BADGE !== 'false';
