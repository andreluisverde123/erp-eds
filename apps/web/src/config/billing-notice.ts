/// Aviso de fatura em atraso.
///
/// Faixa informativa exibida no topo do app para todos os usuários, EXCETO os
/// e-mails isentos (o administrador do contrato). NÃO bloqueia o trabalho: é
/// uma cobrança visível, não um travamento. Todos os textos e valores ficam
/// aqui para você editar sem mexer no componente.
export interface BillingNoticeConfig {
  /// Liga/desliga a faixa. Deixe `false` para não aparecer para ninguém.
  enabled: boolean;
  /// E-mails que NUNCA veem o aviso (quem administra o contrato do seu lado).
  exemptEmails: string[];
  /// Título curto da faixa.
  title: string;
  /// Corpo da mensagem. Uma linha, direto ao ponto.
  message: string;
  /// Prazo mostrado em destaque (texto livre).
  deadline: string;
  /// Contato para regularizar (aparece no fim da mensagem). `null` esconde.
  contact: string | null;
}

export const BILLING_NOTICE: BillingNoticeConfig = {
  enabled: true,
  exemptEmails: ['admin@obrei.com'],
  title: 'Fatura em atraso',
  message:
    'O contrato de manutenção deste sistema está com pagamento pendente. Regularize para manter o acesso normal da equipe.',
  deadline: 'Prazo: hoje às 17h40 (horário de Brasília).',
  contact: 'Para regularizar, fale com o responsável pelo contrato.',
};

/// Código que a API devolve no login (e no refresh da sessão) quando a empresa
/// está `SUSPENDED`. Tem que bater com `PAYMENT_PENDING_CODE` em
/// `apps/api/src/auth/auth.service.ts`.
export const PAYMENT_PENDING_CODE = 'PAYMENT_PENDING';

/// Banner da tela de login quando o acesso já foi cortado. Diferente da faixa
/// acima, este bloqueia: ninguém da empresa entra até ela voltar a `ACTIVE`.
export const PAYMENT_PENDING_LOGIN_NOTICE = {
  title: 'Pagamento pendente',
  message: 'O acesso ao sistema está suspenso até a regularização do contrato de manutenção.',
  contact: BILLING_NOTICE.contact,
};

/// Um usuário vê o aviso quando a faixa está ligada e o e-mail dele não está na
/// lista de isentos. Comparação sem diferenciar maiúsculas/minúsculas.
export function shouldShowBillingNotice(
  email: string | null | undefined,
  config: BillingNoticeConfig = BILLING_NOTICE,
): boolean {
  if (!config.enabled) return false;
  if (!email) return false;

  const normalized = email.trim().toLowerCase();
  const exempt = config.exemptEmails.map((value) => value.trim().toLowerCase());

  return !exempt.includes(normalized);
}
