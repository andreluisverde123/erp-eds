import { Matches } from 'class-validator';

/// Corpo da cópia. Repare no que NÃO está aqui: a obra.
///
/// A obra do relatório novo é DERIVADA do relatório de origem, nunca informada
/// pelo cliente. Isso torna "nunca copiar RDO de outra obra" uma
/// impossibilidade estrutural em vez de uma validação que alguém pode esquecer
/// de escrever — não existe campo por onde a obra de destino entre.
///
/// O acesso à obra de origem continua sendo verificado normalmente: copiar um
/// relatório exige poder lê-lo.
export class CopyDailyReportDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Informe a data no formato AAAA-MM-DD.' })
  reportDate!: string;
}
