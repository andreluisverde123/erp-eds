import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateProductionEntryDto } from './create-production-entry.dto';

/// Sem `employeeId`: o apontamento não muda de dono depois de criado.
export class UpdateProductionEntryDto extends PartialType(
  OmitType(CreateProductionEntryDto, ['employeeId'] as const),
) {}
