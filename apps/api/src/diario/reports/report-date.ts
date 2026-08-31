import { BadRequestException } from '@nestjs/common';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/// Dias da semana em português, indexados por `Date#getUTCDay()`.
///
/// Tabela fixa em vez de `Intl.DateTimeFormat`: a saída do `Intl` depende dos
/// dados de ICU embarcados no Node, que variam entre a imagem `node:22-slim` e
/// a máquina de quem desenvolve — o dia da semana do RDO não pode mudar de
/// grafia conforme onde a API está rodando.
const WEEKDAYS = [
  'Domingo',
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
] as const;

/// Tolerância para a data no futuro. Existe por causa de fuso: às 21h de
/// Brasília (UTC-3) o servidor já está no dia seguinte em UTC, e um RDO
/// preenchido no fim do turno seria recusado como "data futura" — erro que
/// aparece só à noite e some de manhã, o pior tipo de defeito para diagnosticar.
/// Um dia cobre isso; um ano digitado errado (2062) continua barrado.
const MAX_FUTURE_DAYS = 1;

/// Converte `YYYY-MM-DD` na meia-noite UTC que a coluna `@db.Date` armazena.
///
/// A conversão precisa ser explicitamente UTC. `new Date('2026-08-30')` já é
/// UTC, mas `new Date(2026, 7, 30)` seria meia-noite LOCAL — e num servidor a
/// oeste de Greenwich isso vira 03:00 UTC do mesmo dia, que o Postgres trunca
/// para `DATE` sem reclamar. O erro só apareceria em fusos a leste, gravando o
/// dia anterior.
export function parseReportDate(value: string, now: Date = new Date()): Date {
  if (!DATE_ONLY.test(value)) {
    throw new BadRequestException('A data do relatório deve estar no formato AAAA-MM-DD.');
  }

  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException('Data do relatório inválida.');
  }

  // `2026-02-31` passa no regex e o construtor "conserta" para 03/03. Sem esta
  // conferência o usuário pediria 31/02 e receberia um RDO de 03/03.
  if (parsed.toISOString().slice(0, 10) !== value) {
    throw new BadRequestException('Data do relatório inválida.');
  }

  const limite = new Date(now);
  limite.setUTCHours(0, 0, 0, 0);
  limite.setUTCDate(limite.getUTCDate() + MAX_FUTURE_DAYS);
  if (parsed > limite) {
    throw new BadRequestException('A data do relatório não pode estar no futuro.');
  }

  return parsed;
}

/// Dia da semana da data do relatório, calculado pelo servidor. O cabeçalho do
/// RDO exibe o que vier daqui — nunca uma segunda conta feita no navegador.
export function weekdayOf(date: Date): string {
  return WEEKDAYS[date.getUTCDay()]!;
}

/// Número de dias entre duas datas puras. Ambas estão na meia-noite UTC (é o
/// que `@db.Date` devolve), então a divisão é exata — não há horário de verão
/// a atrapalhar, que é o motivo de a conta ser feita em UTC e não em local.
export function daysBetween(from: Date, to: Date): number {
  const MS_POR_DIA = 24 * 60 * 60 * 1000;
  return Math.round((to.getTime() - from.getTime()) / MS_POR_DIA);
}
