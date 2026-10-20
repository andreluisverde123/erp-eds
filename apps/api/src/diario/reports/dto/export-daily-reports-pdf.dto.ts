import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsUUID } from 'class-validator';

import { MAX_RDOS_POR_LOTE } from '../pdf/rdo-pdf.service';

export class ExportDailyReportsPdfDto {
  /// `?ids=a,b,c`. Separados por vírgula, e não `ids=a&ids=b`: um id só
  /// chegaria como string e não como lista, e o caso de um relatório viraria
  /// um erro de validação.
  @Transform(({ value }) => (typeof value === 'string' ? value.split(',').filter(Boolean) : value))
  @IsArray()
  @ArrayMinSize(1, { message: 'Escolha ao menos um relatório.' })
  @ArrayMaxSize(MAX_RDOS_POR_LOTE, {
    message: `Exporte até ${MAX_RDOS_POR_LOTE} relatórios por arquivo. Reduza o período.`,
  })
  @IsUUID(undefined, { each: true, message: 'Relatório inválido.' })
  ids!: string[];
}
