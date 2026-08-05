import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Length,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export class CreateInboundInvoiceItemDto {
  @IsString()
  @MinLength(1, { message: 'Descrição do item é obrigatória.' })
  @MaxLength(500)
  description!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unit?: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Quantidade inválida.' })
  @IsPositive({ message: 'Quantidade deve ser maior que zero.' })
  quantity!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 4 }, { message: 'Valor unitário inválido.' })
  @Min(0)
  unitPrice!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor total do item inválido.' })
  @Min(0)
  totalPrice!: number;
}

/// Entrada manual de nota fiscal. Nesta versão é o ÚNICO caminho de entrada —
/// a captura automática (XML/SEFAZ) usará este mesmo formato quando existir,
/// mudando apenas a origem registrada em `InboundInvoice.source`.
export class CreateInboundInvoiceDto {
  @IsString()
  @MinLength(1, { message: 'Nome do emitente é obrigatório.' })
  @MaxLength(255)
  supplierName!: string;

  /// CNPJ do emitente. É por ele que o sistema tenta casar a nota com um
  /// fornecedor cadastrado — quando não casa, a nota entra mesmo assim e
  /// aparece na listagem sem fornecedor vinculado.
  ///
  /// O `@Transform` tira a máscara ANTES da validação: quem copia o CNPJ de um
  /// XML ou de um PDF cola "12.345.678/0001-99", e recusar isso por "18
  /// dígitos" seria o sistema exigindo que o humano faça o trabalho de tirar
  /// ponto e barra. O banco guarda só dígitos, que é o formato do
  /// `Supplier.document`.
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @Length(11, 14, { message: 'CNPJ/CPF do emitente deve ter entre 11 e 14 dígitos.' })
  supplierDocument!: string;

  @IsString()
  @MinLength(1, { message: 'Número da nota é obrigatório.' })
  @MaxLength(20)
  number!: string;

  @IsOptional()
  @IsString()
  @MaxLength(10)
  series?: string;

  /// Mesma normalização: a chave costuma ser copiada com espaços a cada 4
  /// dígitos, do jeito que o DANFE a imprime.
  @IsOptional()
  @Transform(({ value }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value))
  @IsString()
  @Length(44, 44, { message: 'Chave de acesso deve ter 44 dígitos.' })
  accessKey?: string;

  @IsISO8601({}, { message: 'Data de emissão inválida.' })
  issueDate!: string;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Valor total inválido.' })
  @IsPositive({ message: 'Valor total deve ser maior que zero.' })
  totalAmount!: number;

  /// Itens quando disponíveis. Uma nota sem itens é válida: a entrada manual
  /// costuma trazer só o cabeçalho, e a tela de conciliação lida com a lista
  /// vazia.
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500, { message: 'Nota com itens demais para entrada manual.' })
  @ValidateNested({ each: true })
  @Type(() => CreateInboundInvoiceItemDto)
  items?: CreateInboundInvoiceItemDto[];
}
