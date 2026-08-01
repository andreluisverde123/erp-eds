import { IsEnum } from 'class-validator';

import { AccountPayableStatus } from '../../../../generated/prisma/client';

export class UpdateAccountPayableStatusDto {
  @IsEnum(AccountPayableStatus, { message: 'Status inválido.' })
  status!: AccountPayableStatus;
}
