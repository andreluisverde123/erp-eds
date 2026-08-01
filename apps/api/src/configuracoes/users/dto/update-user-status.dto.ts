import { IsBoolean } from 'class-validator';

export class UpdateUserStatusDto {
  @IsBoolean({ message: 'Status inválido.' })
  isActive!: boolean;
}
