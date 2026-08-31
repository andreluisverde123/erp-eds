import { IsEnum, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { WeatherCondition } from '../../../../generated/prisma/client';

/// `HH:MM` em relógio de 24 horas. O `<input type="time">` do navegador manda
/// exatamente neste formato.
const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)$/;

/// Atualização parcial — é o corpo que o autosave manda. Todo campo é
/// opcional: a tela envia só o que mudou, e um PATCH com um campo só é o caso
/// normal, não a exceção.
///
/// Não estende `PartialType(CreateDailyReportDto)` de propósito. Isso tornaria
/// `constructionSiteId` editável, e mover um relatório de obra é outra
/// operação inteiramente: mudaria o dono do documento, invalidaria a numeração
/// (sequencial por obra) e furaria o isolamento de acesso. A obra de um RDO é
/// definida no nascimento e não muda.
export class UpdateDailyReportDto {
  // NÃO existe `reportDate` aqui, e a ausência é a regra: um RDO É um dia
  // específico. Mudar a data transformaria o documento em outro documento —
  // com o mesmo número, que é sequencial por obra e foi emitido para aquela
  // data. A data é escolhida na criação e não muda mais.
  //
  // (Uma versão anterior permitia corrigi-la enquanto o relatório fosse
  // rascunho. Foi removido: sem exclusão de RDO, o preço de errar a data passa
  // a ser um relatório vazio a mais na lista — ver a nota em
  // `docs/diario-de-obras.md`.)

  @IsOptional()
  @IsString()
  @MaxLength(5000, { message: 'As observações devem ter no máximo 5000 caracteres.' })
  notes?: string;

  // --- Horário de trabalho -------------------------------------------------
  //
  // Quatro strings `HH:MM`, todas opcionais e todas aceitando `null` para
  // limpar. A coerência entre elas (término depois do início, intervalo dentro
  // da jornada) é conferida no service, contra o horário RESULTANTE — um
  // campo isolado não tem como saber que o outro já estava gravado.
  //
  // Elas viajam no MESMO PATCH das observações de propósito: o autosave que já
  // existe passa a cobrir horário e clima sem nenhum mecanismo novo.

  @IsOptional()
  @Matches(TIME_OF_DAY, { message: 'Informe o início no formato HH:MM.' })
  workStartTime?: string | null;

  @IsOptional()
  @Matches(TIME_OF_DAY, { message: 'Informe a saída para o intervalo no formato HH:MM.' })
  workBreakStartTime?: string | null;

  @IsOptional()
  @Matches(TIME_OF_DAY, { message: 'Informe o retorno do intervalo no formato HH:MM.' })
  workBreakEndTime?: string | null;

  @IsOptional()
  @Matches(TIME_OF_DAY, { message: 'Informe o término no formato HH:MM.' })
  workEndTime?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação do horário deve ter no máximo 500 caracteres.' })
  scheduleNotes?: string;

  // --- Clima ---------------------------------------------------------------

  @IsOptional()
  @IsEnum(WeatherCondition, { message: 'Condição do tempo inválida para a manhã.' })
  morningWeather?: WeatherCondition | null;

  @IsOptional()
  @IsEnum(WeatherCondition, { message: 'Condição do tempo inválida para a tarde.' })
  afternoonWeather?: WeatherCondition | null;

  @IsOptional()
  @IsString()
  @MaxLength(500, { message: 'A observação do clima deve ter no máximo 500 caracteres.' })
  weatherNotes?: string;
}
