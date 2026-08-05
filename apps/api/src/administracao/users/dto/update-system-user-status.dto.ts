import { IsBoolean } from 'class-validator';

export class UpdateSystemUserStatusDto {
  @IsBoolean({ message: 'Status inválido.' })
  isActive!: boolean;
}
