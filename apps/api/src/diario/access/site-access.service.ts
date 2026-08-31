import { Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/// Mesma mensagem para "a obra não existe" e para "a obra existe mas não é
/// sua". Não é preguiça: respostas diferentes transformam a rota num
/// oráculo — quem tem um token válido descobriria, um UUID por vez, quais
/// obras a construtora tem, sem nunca conseguir abrir nenhuma. O log do
/// servidor registra a distinção; a resposta HTTP, não.
const SITE_NOT_FOUND_MESSAGE = 'Obra não encontrada ou não vinculada ao seu acesso.';

/// Campos da obra que o Diário lê. Todos já existiam em `ConstructionSite` —
/// nenhum campo novo foi criado para o Diário. O que o pedido chama de
/// "contratante" é `clientName`; "endereço/local" é o trio
/// `addressLine`/`city`/`state`; "prazo" é `startDate`/`expectedEndDate`;
/// "responsável" é `responsibleName`.
///
/// Não existe hoje um "número do contrato" na obra. O único `contractNumber`
/// do sistema vive em `ContractorContract`, que é o contrato com uma empresa
/// TERCEIRIZADA — não o contrato da obra com o cliente. Inventar a coluna
/// seria criar um campo que ninguém preenche; ela entra quando o Diário
/// precisar dela de verdade, no RDO.
export const diarioSiteSelect = Prisma.validator<Prisma.ConstructionSiteSelect>()({
  id: true,
  code: true,
  name: true,
  clientName: true,
  responsibleName: true,
  status: true,
  addressLine: true,
  city: true,
  state: true,
  startDate: true,
  expectedEndDate: true,
});

export type DiarioSite = Prisma.ConstructionSiteGetPayload<{ select: typeof diarioSiteSelect }>;

/// O ÚNICO lugar do Diário que decide "quais obras esta pessoa vê".
///
/// Todo controller e todo service do Diário passa por aqui antes de ler
/// qualquer coisa presa a uma obra. A regra tem um chokepoint só de propósito:
/// espalhar `where: { userId }` por cinco services é como um deles acaba sem
/// o filtro, e o vazamento não aparece em nenhuma tela — só numa URL montada
/// à mão.
///
/// **Não há atalho por papel.** Administrador, Diretoria e SUPER_ADMIN também
/// veem apenas as obras em que foram colocados. O Diário é ferramenta de
/// campo: "quem está tocando esta obra" é uma lista de pessoas, não uma
/// consequência de cargo. Quem precisa da visão gerencial de todas as obras
/// já tem o ERP. Quem precisa DISTRIBUIR obras usa `diario.manage_access`,
/// que é outra permissão e outro controller.
@Injectable()
export class SiteAccessService {
  constructor(private readonly prisma: PrismaService) {}

  /// IDs das obras vinculadas ao usuário, dentro da empresa dele. O
  /// `companyId` vem do token (nunca do cliente) e o filtro cruza os dois:
  /// um vínculo com obra de outro inquilino — que só existiria por corrupção
  /// de dados — não passa por aqui.
  async listAccessibleSiteIds(companyId: string, userId: string): Promise<string[]> {
    const links = await this.prisma.userConstructionSite.findMany({
      where: {
        userId,
        constructionSite: { companyId, deletedAt: null },
      },
      select: { constructionSiteId: true },
    });

    return links.map((link) => link.constructionSiteId);
  }

  /// As obras do usuário, já com os dados que a Home e a lista exibem.
  async listAccessibleSites(
    companyId: string,
    userId: string,
  ): Promise<(DiarioSite & { assignmentRole: 'ENGINEER' | 'INSPECTOR' })[]> {
    const links = await this.prisma.userConstructionSite.findMany({
      where: {
        userId,
        constructionSite: { companyId, deletedAt: null },
      },
      select: { role: true, constructionSite: { select: diarioSiteSelect } },
      // Obra em andamento antes de obra planejada/pausada seria o ideal, mas
      // exigiria ordenar por um CASE. Nome é previsível e basta para a
      // quantidade de obras que uma pessoa acompanha ao mesmo tempo.
      orderBy: { constructionSite: { name: 'asc' } },
    });

    return links.map((link) => ({ ...link.constructionSite, assignmentRole: link.role }));
  }

  /// Porta de entrada de toda rota que recebe um id de obra vindo do cliente.
  /// Devolve a obra (o chamador quase sempre precisa dela) e lança 404 quando
  /// o vínculo não existe.
  async assertSiteAccess(companyId: string, userId: string, siteId: string): Promise<DiarioSite> {
    const link = await this.prisma.userConstructionSite.findFirst({
      where: {
        userId,
        constructionSiteId: siteId,
        constructionSite: { companyId, deletedAt: null },
      },
      select: { constructionSite: { select: diarioSiteSelect } },
    });

    if (!link) {
      throw new NotFoundException(SITE_NOT_FOUND_MESSAGE);
    }

    return link.constructionSite;
  }

  /// Filtro de obra para listagens que podem vir com ou sem `siteId`.
  ///
  /// Sem `siteId`, restringe às obras do usuário; com `siteId`, valida o
  /// vínculo daquela obra antes de usar. A diferença importa: um `IN (...)`
  /// montado a partir de um id não validado devolveria lista vazia em vez de
  /// erro, e "não há relatório" é uma resposta bem diferente de "esta obra
  /// não é sua".
  async resolveSiteFilter(
    companyId: string,
    userId: string,
    siteId?: string,
  ): Promise<{ in: string[] }> {
    if (siteId) {
      await this.assertSiteAccess(companyId, userId, siteId);
      return { in: [siteId] };
    }

    return { in: await this.listAccessibleSiteIds(companyId, userId) };
  }
}
