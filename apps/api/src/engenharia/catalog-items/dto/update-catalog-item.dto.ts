import { PartialType } from '@nestjs/mapped-types';

import { CreateCatalogItemDto } from './create-catalog-item.dto';

/// Tudo opcional. O `code` continua fora: identidade não se edita — o insumo
/// cadastrado errado é excluído e refeito, e a solicitação que apontava para
/// ele continua íntegra.
export class UpdateCatalogItemDto extends PartialType(CreateCatalogItemDto) {}
