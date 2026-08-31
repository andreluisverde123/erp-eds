import { apiClient } from '@/lib/api-client';

/// A EQUIPE DA OBRA: quem enxerga esta obra no Diário de Obras.
///
/// Mora em `engenharia/` porque é da tela de obra que se gerencia, mas as
/// rotas são as do Diário (`/diario/acessos`) — as mesmas que a API já expunha
/// e que, até agora, nenhuma tela consumia. Os vínculos eram criados por
/// script; não havia caminho pela interface.
///
/// Reaproveitar em vez de criar rota nova é o que mantém UMA regra de acesso:
/// quem pode ver o quê no Diário continua sendo decidido em um lugar só.
export type SiteAssignmentRole = 'ENGINEER' | 'INSPECTOR';

export const SITE_ROLE_LABEL: Record<SiteAssignmentRole, string> = {
  ENGINEER: 'Engenheiro',
  INSPECTOR: 'Fiscal de obra',
};

/// Quem PODE ser vinculado: a API devolve só quem passa pelas duas portas do
/// Diário — o papel concede `diario.access` E o interruptor da pessoa está
/// ligado. Alguém fora disso seria adicionado à equipe e continuaria sem
/// conseguir entrar.
export interface SiteTeamCandidate {
  id: string;
  name: string;
  email: string;
}

export interface SiteTeamMember {
  userId: string;
  name: string;
  email: string;
  role: SiteAssignmentRole;
}

export function listSiteTeamCandidates(): Promise<SiteTeamCandidate[]> {
  return apiClient.get('/diario/acessos/candidatos');
}

export function getSiteTeam(siteId: string): Promise<SiteTeamMember[]> {
  return apiClient.get(`/diario/acessos/obras/${siteId}`);
}

/// SUBSTITUI a equipe inteira da obra — não é um "adicionar".
///
/// O corpo é a lista final: quem não está nela perde o acesso. É assim que a
/// API já funcionava, e é o que torna a operação idempotente: salvar duas
/// vezes o mesmo formulário produz o mesmo resultado.
export function replaceSiteTeam(
  siteId: string,
  entries: { userId: string; role: SiteAssignmentRole }[],
): Promise<SiteTeamMember[]> {
  return apiClient.put(`/diario/acessos/obras/${siteId}`, { entries });
}
