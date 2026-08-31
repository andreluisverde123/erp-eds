import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../auth/decorators/permissions.decorator';
import { IS_PUBLIC_KEY } from '../auth/decorators/public.decorator';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { PasswordChangeGuard } from '../auth/guards/password-change.guard';
import type { PrismaService } from '../prisma/prisma.service';
import { SiteAccessService } from './access/site-access.service';
import { SiteAccessAdminService } from './access/site-access-admin.service';
import { DiarioController } from './diario.controller';
import { DailyReportsController } from './reports/daily-reports.controller';
import { DailyReportsService } from './reports/daily-reports.service';
import { DiarioSitesController } from './sites/diario-sites.controller';
import { DiarioSitesService } from './sites/diario-sites.service';
import { SiteAccessController } from './access/site-access.controller';
import type { AuditLoggerService } from '../common/services/audit-logger.service';

import {
  ALPHA as OBRA_1,
  BETA as OBRA_2,
  EMPRESA_A,
  ENGENHEIRO_A,
  ENGENHEIRO_B,
  FISCAL,
  GAMMA as OBRA_3,
  OBRA_ARQUIVADA,
  OBRA_OUTRA_EMPRESA,
  SEM_OBRAS,
  criarAuditLoggerFalso,
  criarPrismaFalso,
  rdo,
} from './testing/diario-fixture';

// ---------------------------------------------------------------------------
// Massa e dublê: `test/diario/diario-fixture.ts`, compartilhado com o spec dos
// relatórios. Um único dublê para os dois evita que eles divirjam — e é ele que
// reproduz de verdade os filtros do banco.
// ---------------------------------------------------------------------------

/// Um RDO em cada obra: sem eles, "vejo só os RDOs das minhas obras" e "não
/// vejo RDO nenhum" produziriam o mesmo resultado.
const RDO_OBRA_1 = 'rdo-alpha';
const RDO_OBRA_2 = 'rdo-beta';

function montar() {
  const { client } = criarPrismaFalso([
    rdo({ id: RDO_OBRA_1, constructionSiteId: OBRA_1, number: 24 }),
    rdo({
      id: RDO_OBRA_2,
      constructionSiteId: OBRA_2,
      number: 8,
      createdById: ENGENHEIRO_B,
      reportDate: new Date('2026-08-27T00:00:00.000Z'),
    }),
  ]);
  const prisma = client as unknown as PrismaService;
  const siteAccess = new SiteAccessService(prisma);
  const sites = new DiarioSitesService(prisma, siteAccess);
  const reports = new DailyReportsService(
    prisma,
    siteAccess,
    criarAuditLoggerFalso() as unknown as AuditLoggerService,
  );
  return { prisma: client, siteAccess, sites, reports };
}

// ---------------------------------------------------------------------------
// Cenários
// ---------------------------------------------------------------------------

describe('Diário de Obras — cadeia de acesso (usuário → permissão → vínculo → obras → RDOs)', () => {
  let prisma: ReturnType<typeof montar>['prisma'];
  let siteAccess: SiteAccessService;
  let sites: DiarioSitesService;
  let reports: DailyReportsService;

  beforeEach(() => {
    ({ prisma, siteAccess, sites, reports } = montar());
  });

  it('engenheiro autorizado enxerga apenas as obras vinculadas a ele', async () => {
    const lista = await sites.findAll(EMPRESA_A, ENGENHEIRO_A);

    expect(lista.map((site) => site.id).sort()).toEqual([OBRA_1, OBRA_3].sort());
    expect(lista.map((site) => site.id)).not.toContain(OBRA_2);
  });

  it('o outro engenheiro enxerga um conjunto disjunto — a lista não é "todas as obras"', async () => {
    const doA = await sites.findAll(EMPRESA_A, ENGENHEIRO_A);
    const doB = await sites.findAll(EMPRESA_A, ENGENHEIRO_B);

    expect(doB.map((site) => site.id)).toEqual([OBRA_2]);
    expect(doA.map((site) => site.id)).not.toContain(OBRA_2);
  });

  it('fiscal enxerga apenas as obras atribuídas a ele, com o papel de fiscal', async () => {
    const lista = await sites.findAll(EMPRESA_A, FISCAL);

    expect(lista.map((site) => site.id)).toEqual([OBRA_1]);
    expect(lista[0]!.assignmentRole).toBe('INSPECTOR');
  });

  it('usuário sem nenhuma obra vinculada recebe lista vazia, não erro', async () => {
    await expect(sites.findAll(EMPRESA_A, SEM_OBRAS)).resolves.toEqual([]);
  });

  it('acesso direto por ID a obra não vinculada é negado', async () => {
    await expect(sites.findOne(EMPRESA_A, ENGENHEIRO_A, OBRA_2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('a mensagem de negação não revela se a obra existe', async () => {
    const inexistente = 'bbbbbbbb-0000-4000-8000-000000000099';
    const alheia = sites.findOne(EMPRESA_A, ENGENHEIRO_A, OBRA_2).catch((erro) => erro.message);
    const fantasma = sites
      .findOne(EMPRESA_A, ENGENHEIRO_A, inexistente)
      .catch((erro) => erro.message);

    expect(await alheia).toBe(await fantasma);
  });

  it('obra excluída (soft delete) some do Diário mesmo com o vínculo gravado', async () => {
    const lista = await sites.findAll(EMPRESA_A, ENGENHEIRO_A);

    expect(lista.map((site) => site.id)).not.toContain(OBRA_ARQUIVADA);
    await expect(
      siteAccess.assertSiteAccess(EMPRESA_A, ENGENHEIRO_A, OBRA_ARQUIVADA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('vínculo com obra de OUTRA empresa não vale — o companyId do token manda', async () => {
    const lista = await sites.findAll(EMPRESA_A, ENGENHEIRO_A);

    expect(lista.map((site) => site.id)).not.toContain(OBRA_OUTRA_EMPRESA);
    await expect(
      siteAccess.assertSiteAccess(EMPRESA_A, ENGENHEIRO_A, OBRA_OUTRA_EMPRESA),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('a listagem de RDOs traz só os das obras vinculadas', async () => {
    const { data } = await reports.findAll(EMPRESA_A, ENGENHEIRO_A, { page: 1, limit: 10 });

    expect(data.map((rdo) => rdo.id)).toEqual([RDO_OBRA_1]);
  });

  it('consultar RDO de obra não vinculada é negado, mesmo sabendo o id', async () => {
    await expect(reports.findOne(EMPRESA_A, ENGENHEIRO_A, RDO_OBRA_2)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('filtrar a listagem por obra não vinculada dá erro — e não lista vazia', async () => {
    // A diferença importa: "não há relatório" e "esta obra não é sua" são
    // respostas distintas, e a segunda não pode se disfarçar de primeira.
    await expect(
      reports.findAll(EMPRESA_A, ENGENHEIRO_A, { page: 1, limit: 10, siteId: OBRA_2 }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('usuário sem obras não dispara consulta de RDO com filtro vazio', async () => {
    const consultaDeRdos = jest.spyOn(prisma.dailyReport, 'findMany');

    const resultado = await reports.findAll(EMPRESA_A, SEM_OBRAS, { page: 1, limit: 10 });

    expect(resultado.data).toEqual([]);
    expect(resultado.meta.total).toBe(0);
    expect(consultaDeRdos).not.toHaveBeenCalled();
  });

  it('a Home devolve só as obras do usuário e só os RDOs delas', async () => {
    const controller = new DiarioController(sites, reports);
    const home = await controller.home(EMPRESA_A, ENGENHEIRO_A);

    expect(home.sites.map((site) => site.id).sort()).toEqual([OBRA_1, OBRA_3].sort());
    expect(home.recentReports.map((rdo) => rdo.id)).toEqual([RDO_OBRA_1]);
  });
});

// ---------------------------------------------------------------------------
// Autorização nas rotas (a metade da cadeia que vive nos guards)
// ---------------------------------------------------------------------------

/// O `PermissionsGuard` já é global (`app.module.ts`), então basta o
/// controller declarar a permissão. Estes testes verificam a declaração — é
/// ela que some numa refatoração distraída, e a falta não quebra nenhuma tela.
describe('Diário de Obras — autorização declarada nas rotas', () => {
  const reflector = new Reflector();

  it.each([
    ['DiarioController', DiarioController],
    ['DiarioSitesController', DiarioSitesController],
    ['DailyReportsController', DailyReportsController],
  ])('%s exige diario.access', (_nome, controller) => {
    expect(reflector.get<string[]>(PERMISSIONS_KEY, controller)).toEqual(['diario.access']);
  });

  it('SiteAccessController exige diario.manage_access (e não diario.access)', () => {
    expect(reflector.get<string[]>(PERMISSIONS_KEY, SiteAccessController)).toEqual([
      'diario.manage_access',
    ]);
  });

  it.each([
    ['create', DailyReportsController.prototype.create],
    ['update', DailyReportsController.prototype.update],
    ['copy', DailyReportsController.prototype.copy],
    ['submit', DailyReportsController.prototype.submit],
  ])('escrever relatório (%s) exige também diario.report.manage', (_nome, handler) => {
    // Ler e escrever são permissões distintas: um perfil de acompanhamento
    // abre os relatórios das obras dele sem poder alterá-los. A declaração no
    // método SOBREPÕE a da classe (`getAllAndOverride`), então ela precisa
    // repetir `diario.access` — as permissões são exigidas em AND.
    expect(reflector.get<string[]>(PERMISSIONS_KEY, handler)).toEqual([
      'diario.access',
      'diario.report.manage',
    ]);
  });

  it('ler relatório continua exigindo apenas diario.access', () => {
    expect(
      reflector.get<string[]>(PERMISSIONS_KEY, DailyReportsController.prototype.findOne),
    ).toBeUndefined();
    expect(reflector.get<string[]>(PERMISSIONS_KEY, DailyReportsController)).toEqual([
      'diario.access',
    ]);
  });

  it('nenhuma rota do Diário é pública — o JwtAuthGuard global vale para todas', () => {
    for (const controller of [
      DiarioController,
      DiarioSitesController,
      DailyReportsController,
      SiteAccessController,
    ]) {
      expect(reflector.get<boolean>(IS_PUBLIC_KEY, controller)).toBeUndefined();
    }
  });
});

function contextoFalso(handler: unknown, classe: unknown, request: unknown) {
  return {
    getHandler: () => handler,
    getClass: () => classe,
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('Diário de Obras — o guard nega antes de qualquer consulta', () => {
  const guard = new PermissionsGuard(new Reflector());
  const rota = DiarioController.prototype.home;

  it('usuário autenticado SEM diario.access é bloqueado', () => {
    const permitido = guard.canActivate(
      contextoFalso(rota, DiarioController, {
        method: 'GET',
        originalUrl: '/diario/home',
        user: { sub: ENGENHEIRO_A, permissions: ['engenharia.view'], roles: ['Engenharia'] },
      }),
    );

    expect(permitido).toBe(false);
  });

  it('usuário COM diario.access passa', () => {
    const permitido = guard.canActivate(
      contextoFalso(rota, DiarioController, {
        method: 'GET',
        originalUrl: '/diario/home',
        user: { sub: ENGENHEIRO_A, permissions: ['diario.access'], roles: ['Engenharia'] },
      }),
    );

    expect(permitido).toBe(true);
  });

  it('quem só tem diario.access NÃO escreve — permissões são exigidas em AND', () => {
    // O perfil de acompanhamento (Diretoria, hoje) abre os relatórios das obras
    // dele e não altera nada. É a metade da regra que a declaração no
    // controller sozinha não prova: aqui o guard é executado de fato.
    const escrever = DailyReportsController.prototype.create;
    const permitido = guard.canActivate(
      contextoFalso(escrever, DailyReportsController, {
        method: 'POST',
        originalUrl: '/diario/relatorios',
        user: { sub: ENGENHEIRO_A, permissions: ['diario.access'], roles: ['Diretoria'] },
      }),
    );

    expect(permitido).toBe(false);
  });

  it('quem tem diario.access + diario.report.manage escreve', () => {
    const escrever = DailyReportsController.prototype.create;
    const permitido = guard.canActivate(
      contextoFalso(escrever, DailyReportsController, {
        method: 'POST',
        originalUrl: '/diario/relatorios',
        user: {
          sub: ENGENHEIRO_A,
          permissions: ['diario.access', 'diario.report.manage'],
          roles: ['Engenharia'],
        },
      }),
    );

    expect(permitido).toBe(true);
  });

  it('requisição sem usuário (token ausente, expirado ou revogado) é bloqueada', () => {
    // Na prática o JwtAuthGuard já teria devolvido 401 antes daqui. O teste
    // garante o comportamento à prova de falhas: se algum dia a ordem dos
    // guards mudar, a ausência de sessão continua NEGANDO em vez de liberar.
    const permitido = guard.canActivate(
      contextoFalso(rota, DiarioController, {
        method: 'GET',
        originalUrl: '/diario/home',
        user: undefined,
      }),
    );

    expect(permitido).toBe(false);
  });

  it('senha temporária bloqueia o Diário inteiro, como bloqueia o ERP', () => {
    const passwordGuard = new PasswordChangeGuard(new Reflector());

    expect(() =>
      passwordGuard.canActivate(
        contextoFalso(rota, DiarioController, {
          method: 'GET',
          originalUrl: '/diario/home',
          user: { sub: ENGENHEIRO_A, mustChangePassword: true },
        }),
      ),
    ).toThrow(ForbiddenException);
  });
});

// ---------------------------------------------------------------------------
// Distribuição de obras
// ---------------------------------------------------------------------------

describe('Diário de Obras — distribuição de obras', () => {
  it('recusa vincular usuário de outra empresa, mesmo com o id correto', async () => {
    // O dublê não tem nenhum usuário cadastrado, então nenhum id informado
    // pertence à EMPRESA_A — é o cenário do teste.
    const { client: prisma } = criarPrismaFalso();
    const service = new SiteAccessAdminService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as never,
    );

    await expect(
      service.replaceForSite(
        EMPRESA_A,
        OBRA_1,
        { entries: [{ userId: ENGENHEIRO_B, role: 'ENGINEER' }] },
        ENGENHEIRO_A,
      ),
    ).rejects.toThrow('não existem nesta empresa');
  });

  it('recusa obra de outra empresa', async () => {
    const { client: prisma } = criarPrismaFalso();
    const service = new SiteAccessAdminService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as never,
    );

    await expect(
      service.replaceForSite(EMPRESA_A, OBRA_OUTRA_EMPRESA, { entries: [] }, ENGENHEIRO_A),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('recusa o mesmo usuário duas vezes na lista', async () => {
    const { client: prisma } = criarPrismaFalso();
    const service = new SiteAccessAdminService(
      prisma as unknown as PrismaService,
      { log: jest.fn() } as never,
    );

    await expect(
      service.replaceForSite(
        EMPRESA_A,
        OBRA_1,
        {
          entries: [
            { userId: ENGENHEIRO_A, role: 'ENGINEER' },
            { userId: ENGENHEIRO_A, role: 'INSPECTOR' },
          ],
        },
        ENGENHEIRO_A,
      ),
    ).rejects.toThrow('mais de uma vez');
  });
});
