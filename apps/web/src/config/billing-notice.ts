/// Aviso de cobrança na tela de login.
///
/// Aparece quando a empresa está `SUSPENDED` — o corte por falta de pagamento.
/// Não é um aviso qualquer: nesse estado ninguém da empresa entra, então o
/// banner é a única explicação que a pessoa recebe. Os textos ficam aqui para
/// você editar sem mexer no componente.

/// Código que a API devolve no login (e no refresh da sessão) quando a empresa
/// está `SUSPENDED`. Tem que bater com `PAYMENT_PENDING_CODE` em
/// `apps/api/src/auth/auth.service.ts`.
export const PAYMENT_PENDING_CODE = 'PAYMENT_PENDING';

export const PAYMENT_PENDING_LOGIN_NOTICE = {
  title: 'Pagamento pendente',
  message: 'O acesso ao sistema está suspenso até a regularização do contrato de manutenção.',
  /// `null` esconde a linha de contato.
  contact: 'Para regularizar, fale com o responsável pelo contrato.' as string | null,
};
