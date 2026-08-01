import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class QuerySearchDto {
  @IsString()
  @IsNotEmpty({ message: 'Informe um termo de busca.' })
  @MaxLength(100)
  q!: string;
}
