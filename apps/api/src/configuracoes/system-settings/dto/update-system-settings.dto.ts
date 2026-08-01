import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { SettingsTheme } from '../../../../generated/prisma/client';

export class UpdateSystemSettingsDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  erpName?: string;

  @IsOptional()
  @IsEnum(SettingsTheme, { message: 'Tema inválido.' })
  theme?: SettingsTheme;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  language?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  timezone?: string;

  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  dateFormat?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(6)
  firstDayOfWeek?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(90)
  dueDateAlertDays?: number;

  /// Alçada de aprovação: `0` desliga (comportamento padrão). Acima disso,
  /// aprovar solicitação/registrar pagamento com valor maior exige a
  /// permissão `<módulo>.approve`.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Alçada de compras inválida.' })
  @Min(0)
  @Max(999_999_999.99)
  purchaseApprovalThreshold?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Alçada de pagamentos inválida.' })
  @Min(0)
  @Max(999_999_999.99)
  paymentApprovalThreshold?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  maxUploadSizeMb?: number;

  @IsOptional()
  @IsBoolean()
  allowAttachments?: boolean;

  @IsOptional()
  @IsBoolean()
  notificationsEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  auditEnabled?: boolean;
}
