import { OmitType, PartialType } from '@nestjs/mapped-types';

import { CreateCatalogItemDto } from './create-catalog-item.dto';

/// Tudo opcional. O `code` continua fora: identidade não se edita — o insumo
/// cadastrado errado é excluído e refeito, e a solicitação que apontava para
/// ele continua íntegra.
///
/// A natureza (`type`) também fica fora: ela escolheu o prefixo do código, e
/// "MAT-0007" virando mão de obra passaria a mentir. Como a validação global
/// usa `forbidNonWhitelisted`, mandá-la na edição é recusado com 400, em vez de
/// ser ignorada em silêncio.
export class UpdateCatalogItemDto extends PartialType(
  OmitType(CreateCatalogItemDto, ['type'] as const),
) {}
