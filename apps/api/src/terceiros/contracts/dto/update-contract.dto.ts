import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateContractDto } from './create-contract.dto';

/// Sem `contractorId`: o contrato não muda de empresa terceirizada depois de
/// criado — pra isso, encerra este e cria um novo.
export class UpdateContractDto extends PartialType(
  OmitType(CreateContractDto, ['contractorId'] as const),
) {}
