/// Namespace dos locks consultivos do Diário. O `pg_advisory_lock` do Postgres
/// tem um espaço de chaves ÚNICO para o banco inteiro: sem um namespace, o
/// lock da numeração de RDO poderia colidir com o de qualquer outro módulo que
/// venha a usar o mecanismo, e o sintoma seria duas operações sem relação
/// nenhuma se serializando misteriosamente.
const DIARIO_LOCK_NAMESPACE = 4747;

/// Só o que a alocação precisa do cliente Prisma. Tipagem estrutural (e não
/// `Prisma.TransactionClient`) para o teste conseguir passar um dublê que
/// implementa o lock de verdade — é assim que a corrida vira algo verificável
/// sem um Postgres na mesa.
export interface ReportNumberTx {
  $executeRaw(query: TemplateStringsArray, ...values: unknown[]): Promise<number>;
  dailyReport: {
    aggregate(args: {
      where: { constructionSiteId: string };
      _max: { number: true };
    }): Promise<{ _max: { number: number | null } }>;
  };
}

/// Próximo número do RDO daquela obra, alocado de forma segura sob concorrência.
///
/// **Por que não `count() + 1`.** É o que `nextSequentialCode` faz para os
/// códigos de solicitação, e lá o próprio comentário admite a janela de
/// corrida. Aqui ela não é aceitável: o pedido é explícito, e dois RDOs #24 na
/// mesma obra é um documento de obra duplicado, não um código feio. Além
/// disso `count()` erra sozinho — basta um relatório excluído para a contagem
/// e o último número deixarem de coincidir. Por isso: `MAX(number) + 1`.
///
/// **Como a corrida é fechada.** `pg_advisory_xact_lock` é tirado ANTES da
/// leitura do máximo e liberado pelo Postgres no commit/rollback — não há
/// caminho de código que esqueça de soltá-lo. A chave é a obra, então dois
/// RDOs de obras diferentes não esperam um pelo outro; dois da MESMA obra
/// serializam, e o segundo lê um máximo que já inclui o primeiro.
///
/// O lock vive no servidor de banco, não no processo Node: continua valendo
/// com várias instâncias da API atrás do balanceador, que é justamente o
/// cenário em que um `Mutex` em memória daria a falsa sensação de resolvido.
///
/// **Rede de segurança.** Se por qualquer motivo o lock não segurar, o índice
/// único `(constructionSiteId, number)` recusa o duplicado — a criação falha
/// com erro, em vez de gravar dois relatórios com o mesmo número.
///
/// **O que a numeração garante, e o que não garante.** Dois RDOs nunca dividem
/// um número, e o de um relatório FINALIZADO nunca muda nem se repete — é o que
/// importa para quem citou o RDO 24 numa ata ou medição, porque finalizado não
/// se exclui. Já o número de um RASCUNHO excluído volta para o próximo, se ele
/// era o último: `MAX(number) + 1` sobre linhas que existem. É consequência
/// aceita da exclusão ser definitiva (ver `DailyReportsService.remove`), e não
/// custa nada — o rascunho apagado nunca foi documento de ninguém.
export async function allocateReportNumber(
  tx: ReportNumberTx,
  constructionSiteId: string,
): Promise<number> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${DIARIO_LOCK_NAMESPACE}, hashtext(${constructionSiteId}))`;

  const { _max } = await tx.dailyReport.aggregate({
    where: { constructionSiteId },
    _max: { number: true },
  });

  return (_max.number ?? 0) + 1;
}
