import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateTimeEntryDto } from './create-time-entry.dto';

/// Sem `employeeId`: o apontamento não muda de dono depois de criado.
export class UpdateTimeEntryDto extends PartialType(
  OmitType(CreateTimeEntryDto, ['employeeId'] as const),
) {}
