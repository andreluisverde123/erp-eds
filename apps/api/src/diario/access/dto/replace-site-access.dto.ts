import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsIn, IsUUID, ValidateNested } from 'class-validator';

import type { SiteAssignmentRole } from '../../../../generated/prisma/client';

export class SiteAccessEntryDto {
  @IsUUID(undefined, { message: 'Usuário inválido.' })
  userId!: string;

  @IsIn(['ENGINEER', 'INSPECTOR'], { message: 'Papel na obra inválido.' })
  role!: SiteAssignmentRole;
}

/// Substitui a lista INTEIRA de acessos da obra, em vez de expor
/// adicionar/remover separados. O motivo é a tela: quem distribui obras vê a
/// equipe de uma obra e a edita como um conjunto. Com duas rotas granulares,
/// dois coordenadores editando ao mesmo tempo produzem uma equipe que nenhum
/// dos dois montou; com substituição, o último a salvar salva algo coerente.
export class ReplaceSiteAccessDto {
  @IsArray()
  // Teto defensivo: sem ele, um corpo com 100 mil entradas viraria uma
  // transação enorme. Nenhuma obra real tem uma equipe desse tamanho.
  @ArrayMaxSize(200, { message: 'No máximo 200 acessos por obra.' })
  @ValidateNested({ each: true })
  @Type(() => SiteAccessEntryDto)
  entries!: SiteAccessEntryDto[];
}
