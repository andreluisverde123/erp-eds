import {
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { unmangleDeletedCode } from '../common/utils/soft-delete.util';
import { PrismaService } from '../prisma/prisma.service';
import {
  TRASH_ENTITIES,
  delegateFor,
  findTrashEntity,
  type SoftDeletableDelegate,
  type TrashEntity,
} from './trash-entities';

/// Quantos registros excluídos trazer por tipo. A lixeira é para "acabei de
/// apagar sem querer", não para navegar o histórico inteiro da empresa.
const PER_ENTITY_LIMIT = 25;

export interface TrashItem {
  entityType: string;
  entityLabel: string;
  module: string;
  id: string;
  title: string;
  deletedAt: Date;
  /// `false` quando o usuário pode ver o item mas não tem `<módulo>.manage`
  /// para trazê-lo de volta — o botão aparece desabilitado, em vez de o item
  /// sumir e a pessoa achar que o registro se perdeu.
  canRestore: boolean;
}

@Injectable()
export class TrashService {
  private readonly logger = new Logger(TrashService.name);

  constructor(private readonly prisma: PrismaService) {}

  /// Lista os registros excluídos dos módulos que o usuário pode consultar.
  async findAll(
    companyId: string,
    permissions: string[],
    entityType?: string,
  ): Promise<TrashItem[]> {
    const entities = TRASH_ENTITIES.filter(
      (entity) =>
        permissions.includes(`${entity.module}.view`) &&
        (!entityType || entity.model === entityType),
    );

    const results = await Promise.all(
      entities.map(async (entity) => {
        const rows = await delegateFor(this.prisma, entity.model).findMany({
          where: { ...entity.scope(companyId), deletedAt: { not: null } },
          orderBy: { deletedAt: 'desc' },
          take: PER_ENTITY_LIMIT,
        });

        return rows.map((row) => this.toItem(entity, row, permissions));
      }),
    );

    return results.flat().sort((a, b) => b.deletedAt.getTime() - a.deletedAt.getTime());
  }

  /// Traz o registro de volta. Exige `<módulo>.manage` — quem só consulta o
  /// módulo não desfaz exclusão de ninguém.
  async restore(
    companyId: string,
    permissions: string[],
    entityType: string,
    id: string,
  ): Promise<TrashItem> {
    const entity = findTrashEntity(entityType);
    if (!entity) throw new NotFoundException('Tipo de registro desconhecido.');

    if (!permissions.includes(`${entity.module}.manage`)) {
      throw new ForbiddenException(
        `Você não tem permissão para restaurar registros de ${entity.label}.`,
      );
    }

    const delegate = delegateFor(this.prisma, entity.model);
    const scope = entity.scope(companyId);

    // O escopo do tenant entra no `where` da busca E do update: o mesmo
    // cuidado dos demais módulos, para um id de outra empresa não virar uma
    // restauração silenciosa.
    const existing = await delegate.findFirst({
      where: { id, ...scope, deletedAt: { not: null } },
    });
    if (!existing) throw new NotFoundException('Registro não encontrado na lixeira.');

    const data = await this.buildRestoreData(entity, existing, scope, delegate);
    await delegate.update({ where: { id, ...scope }, data });
    this.logger.log(`Registro restaurado: ${entity.model} ${id} (empresa ${companyId})`);

    return this.toItem(entity, { ...existing, deletedAt: existing.deletedAt }, permissions);
  }

  /// Além de limpar o `deletedAt`, devolve ao campo único o valor original.
  ///
  /// O delete "suja" códigos e documentos (`OBRA-1__deleted__<uuid>`) para
  /// liberar o valor para reuso — sem desfazer isso, restaurar traria de volta
  /// uma obra com código corrompido. E como o valor pode ter sido reaproveitado
  /// por um registro novo nesse meio-tempo, a colisão vira um 409 explicando o
  /// que fazer, em vez de um erro de constraint do banco.
  private async buildRestoreData(
    entity: TrashEntity,
    existing: Record<string, unknown>,
    scope: Record<string, unknown>,
    delegate: SoftDeletableDelegate,
  ): Promise<Record<string, unknown>> {
    if (!entity.uniqueField) return { deletedAt: null };

    const currentValue = existing[entity.uniqueField];
    if (typeof currentValue !== 'string') return { deletedAt: null };

    const originalValue = unmangleDeletedCode(currentValue);
    if (originalValue === currentValue) return { deletedAt: null };

    const conflict = await delegate.findFirst({
      where: { ...scope, [entity.uniqueField]: originalValue, deletedAt: null },
    });
    if (conflict) {
      throw new ConflictException(
        `Já existe um registro ativo de ${entity.label.toLowerCase()} com "${originalValue}". Altere ou exclua esse registro antes de restaurar este.`,
      );
    }

    return { deletedAt: null, [entity.uniqueField]: originalValue };
  }

  private toItem(
    entity: TrashEntity,
    row: Record<string, unknown>,
    permissions: string[],
  ): TrashItem {
    const parts = entity.titleFields
      .map((field) => row[field])
      .filter((value) => value !== null && value !== undefined && value !== '')
      // O campo único vem sujo do delete; na tela o usuário precisa ver o
      // código que ele conhece ("OBRA-1"), não o sufixo interno.
      .map((value) => (typeof value === 'string' ? unmangleDeletedCode(value) : String(value)));

    return {
      entityType: entity.model,
      entityLabel: entity.label,
      module: entity.module,
      id: String(row.id),
      // Sem campo de título (ponto, alocação), o rótulo do tipo já diz o que é;
      // a data da exclusão completa a identificação na tela.
      title: parts.length > 0 ? parts.join(' · ') : entity.label,
      deletedAt: row.deletedAt as Date,
      canRestore: permissions.includes(`${entity.module}.manage`),
    };
  }
}
