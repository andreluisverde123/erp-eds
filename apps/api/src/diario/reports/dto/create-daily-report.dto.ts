import { IsOptional, IsString, IsUUID, Matches, MaxLength } from 'class-validator';

export class CreateDailyReportDto {
  /// A obra é validada contra os vínculos do usuário antes de qualquer
  /// escrita (`SiteAccessService.assertSiteAccess`). Um id de obra alheia aqui
  /// resulta em 404, não em relatório criado.
  @IsUUID(undefined, { message: 'Selecione a obra.' })
  constructionSiteId!: string;

  /// `AAAA-MM-DD`, sem hora — a coluna é `DATE`. A validação de calendário
  /// (31/02, ano absurdo, futuro) fica em `parseReportDate`, que roda no
  /// service: ela precisa da data de referência e produz mensagens melhores
  /// que um regex sozinho.
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data no formato AAAA-MM-DD.' })
  reportDate!: string;

  /// NÃO existe campo `number` aqui, e é proposital: o número é gerado pelo
  /// servidor sob lock (ver `report-number.ts`). Aceitá-lo do cliente
  /// devolveria a corrida ao navegador, que é exatamente o que a numeração
  /// sequencial não pode depender.
  ///
  /// `status` também não entra: todo RDO nasce em rascunho.
  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'As observações devem ter no máximo 5000 caracteres.' })
  notes?: string;
}
