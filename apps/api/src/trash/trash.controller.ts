import { Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/types/jwt-payload.type';
import { TrashService } from './trash.service';

/// Lixeira da empresa: um lugar só para achar (e desfazer) exclusões de
/// qualquer módulo.
///
/// Sem `@RequirePermissions` na classe de propósito — a filtragem é por
/// registro: o serviço só devolve os módulos que o usuário pode consultar e
/// só deixa restaurar onde ele tem permissão de escrita.
@Controller('trash')
export class TrashController {
  constructor(private readonly trashService: TrashService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('entityType') entityType?: string) {
    return this.trashService.findAll(user.companyId, user.permissions, entityType);
  }

  @HttpCode(HttpStatus.OK)
  @Post(':entityType/:id/restore')
  restore(
    @CurrentUser() user: JwtPayload,
    @Param('entityType') entityType: string,
    @Param('id') id: string,
  ) {
    return this.trashService.restore(user.companyId, user.permissions, entityType, id);
  }
}
