import { PartialType } from '@nestjs/mapped-types';

import { CreateCompositionDto } from './create-composition.dto';

/// Tudo opcional, e o `code` continua fora: identidade não se edita.
export class UpdateCompositionDto extends PartialType(CreateCompositionDto) {}
