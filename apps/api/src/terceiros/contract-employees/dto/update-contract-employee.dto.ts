import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateContractEmployeeDto } from './create-contract-employee.dto';

/// Sem `contractId`: o funcionário não muda de contrato depois de criado.
export class UpdateContractEmployeeDto extends PartialType(
  OmitType(CreateContractEmployeeDto, ['contractId'] as const),
) {}
