import { BadRequestException, NotFoundException } from '@nestjs/common';

import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteAccessAdminService } from './site-access-admin.service';

const EMPRESA = '11111111-1111-4111-8111-111111111111';
const OBRA = 'aaaaaaaa-0000-4000-8000-000000000001';
const ADMIN = 'bbbbbbbb-0000-4000-8000-000000000001';
const ENGENHEIRO = 'cccccccc-0000-4000-8000-000000000001';
const FISCAL = 'cccccccc-0000-4000-8000-000000000002';

function makeService({
  obraExiste = true,
  usuariosDaEmpresa = 2,
}: { obraExiste?: boolean; usuariosDaEmpresa?: number } = {}) {
  const prisma = {
    constructionSite: {
      findFirst: jest.fn(async () => (obraExiste ? { id: OBRA } : null)),
    },
    userConstructionSite: {
      findMany: jest.fn(async () => [
        {
          role: 'ENGINEER',
          user: { id: ENGENHEIRO, name: 'Ana', email: 'ana@eds.app', isActive: true },
        },
      ]),
      deleteMany: jest.fn(async () => ({ count: 1 })),
      create: jest.fn(async () => ({})),
    },
    user: { count: jest.fn(async () => usuariosDaEmpresa) },
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService & {
    userConstructionSite: { findMany: jest.Mock; deleteMany: jest.Mock; create: jest.Mock };
    user: { count: jest.Mock };
  };

  const auditLogger = { log: jest.fn(async () => undefined) } as unknown as AuditLoggerService;
  return { service: new SiteAccessAdminService(prisma, auditLogger), prisma, auditLogger };
}

describe('Equipe da obra no Diário', () => {
  describe('listar', () => {
    it('deixa de fora usuário EXCLUÍDO (o vínculo dele quebrava a regravação)', async () => {
      const { service, prisma } = makeService();

      await service.listBySite(EMPRESA, OBRA);

      expect(prisma.userConstructionSite.findMany.mock.calls[0][0].where).toEqual({
        constructionSiteId: OBRA,
        user: { deletedAt: null },
      });
    });

    it('obra de outra empresa: não encontrada', async () => {
      const { service } = makeService({ obraExiste: false });

      await expect(service.listBySite(EMPRESA, OBRA)).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('salvar', () => {
    const EQUIPE = [
      { userId: ENGENHEIRO, role: 'ENGINEER' as const },
      { userId: FISCAL, role: 'INSPECTOR' as const },
    ];

    it('substitui a equipe inteira numa transação', async () => {
      const { service, prisma } = makeService();

      await service.replaceForSite(EMPRESA, OBRA, { entries: EQUIPE }, ADMIN);

      expect(prisma.userConstructionSite.deleteMany).toHaveBeenCalledWith({
        where: { constructionSiteId: OBRA },
      });
      expect(prisma.userConstructionSite.create).toHaveBeenCalledWith({
        data: { constructionSiteId: OBRA, userId: FISCAL, role: 'INSPECTOR' },
      });
    });

    it('só aceita usuários da empresa e não excluídos', async () => {
      const { service, prisma } = makeService({ usuariosDaEmpresa: 1 });

      await expect(
        service.replaceForSite(EMPRESA, OBRA, { entries: EQUIPE }, ADMIN),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.user.count.mock.calls[0][0].where).toMatchObject({
        companyId: EMPRESA,
        deletedAt: null,
      });
      expect(prisma.userConstructionSite.deleteMany).not.toHaveBeenCalled();
    });

    it('recusa a mesma pessoa duas vezes', async () => {
      const { service } = makeService();

      await expect(
        service.replaceForSite(
          EMPRESA,
          OBRA,
          { entries: [EQUIPE[0]!, { userId: ENGENHEIRO, role: 'INSPECTOR' }] },
          ADMIN,
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('equipe vazia tira todo mundo da obra', async () => {
      const { service, prisma } = makeService();

      await service.replaceForSite(EMPRESA, OBRA, { entries: [] }, ADMIN);

      expect(prisma.userConstructionSite.deleteMany).toHaveBeenCalled();
      expect(prisma.userConstructionSite.create).not.toHaveBeenCalled();
    });

    it('deixa rastro na auditoria', async () => {
      const { service, auditLogger } = makeService();

      await service.replaceForSite(EMPRESA, OBRA, { entries: EQUIPE }, ADMIN);

      expect(auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ADMIN,
          entityType: 'UserConstructionSite',
          entityId: OBRA,
        }),
      );
    });
  });
});
