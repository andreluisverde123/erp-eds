import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateEmployeeAllocationDto } from './create-employee-allocation.dto';

/// Sem `employeeId`/`constructionSiteId`: a alocação não muda de funcionário
/// ou obra depois de criada — pra isso, encerra esta e cria uma nova.
export class UpdateEmployeeAllocationDto extends PartialType(
  OmitType(CreateEmployeeAllocationDto, ['employeeId', 'constructionSiteId'] as const),
) {}
