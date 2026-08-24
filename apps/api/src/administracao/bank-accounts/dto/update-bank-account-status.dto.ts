import { IsBoolean } from 'class-validator';

export class UpdateBankAccountStatusDto {
  @IsBoolean()
  isActive!: boolean;
}
