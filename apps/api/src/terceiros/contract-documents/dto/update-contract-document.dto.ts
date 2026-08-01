import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateContractDocumentDto } from './create-contract-document.dto';

/// Sem `contractId`: o documento não muda de contrato depois de criado.
export class UpdateContractDocumentDto extends PartialType(
  OmitType(CreateContractDocumentDto, ['contractId'] as const),
) {}
