import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../prisma/prisma.service';

/// Um material já pedido antes, com o que se sabe dele.
export interface ItemSuggestion {
  description: string;
  /// A unidade da ÚLTIMA vez que este material foi pedido. Escolher a sugestão
  /// preenche as duas coisas: quem digita "cimento" quase nunca quer mudar de
  /// saco para quilo.
  unit: string;
  /// Quantas vezes apareceu. Serve para ordenar — o material do dia a dia sobe,
  /// o pedido uma vez só desce.
  timesUsed: number;
}

/// Sugestão de material a partir do que a empresa JÁ PEDIU.
///
/// **Por que existe.** Uma obra pede os mesmos materiais o tempo todo, e cada
/// solicitação era redigitada do zero. Além do trabalho, isso produz três
/// grafias para o mesmo item ("Cimento CP-II", "cimento cp2", "CIMENTO CPII
/// 50KG") — e aí relatório por material deixa de somar, porque o banco vê três
/// materiais.
///
/// **Não é catálogo.** Não existe cadastro de materiais no ERP, e isto não
/// cria um: a sugestão é o histórico, e a pessoa continua livre para digitar
/// algo novo. Um catálogo de verdade — com código, ficha técnica e preço de
/// referência — é outra decisão, bem maior, e esta funcionalidade não a
/// antecipa nem a atrapalha.
@Injectable()
export class ItemSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  /// Materiais já pedidos que casam com o que está sendo digitado.
  ///
  /// **SQL cru, e não `groupBy` do Prisma.** A consulta precisa de duas coisas
  /// ao mesmo tempo: agrupar por descrição e trazer a UNIDADE da ocorrência
  /// mais recente de cada grupo. `groupBy` devolveria só as colunas agrupadas
  /// e as agregações; a unidade exigiria uma segunda consulta por linha.
  /// `DISTINCT ON` do Postgres resolve numa passada.
  async search(companyId: string, search: string, limit = 8): Promise<ItemSuggestion[]> {
    const termo = search.trim();

    // Uma letra sugere quase tudo e não ajuda ninguém a escolher; a busca só
    // começa a valer com duas.
    if (termo.length < 2) return [];

    const teto = Math.min(Math.max(limit, 1), 20);

    return this.prisma.$queryRaw<ItemSuggestion[]>`
      SELECT description,
             unit,
             "timesUsed"
        FROM (
              SELECT DISTINCT ON (lower(i.description))
                     i.description,
                     i.unit,
                     COUNT(*) OVER (PARTITION BY lower(i.description))::int AS "timesUsed",
                     i."createdAt"
                FROM "PurchaseRequestItem" i
                JOIN "PurchaseRequest" r ON r.id = i."purchaseRequestId"
               WHERE r."companyId" = ${companyId}::uuid
                 AND r."deletedAt" IS NULL
                 AND i.description ILIKE ${'%' + termo + '%'}
               -- A ocorrência MAIS RECENTE de cada descrição vence: é dela que
               -- saem a grafia e a unidade sugeridas. Uma unidade corrigida no
               -- mês passado não deve ser sobreposta pela errada do ano
               -- passado.
               ORDER BY lower(i.description), i."createdAt" DESC
             ) AS recentes
       -- Mais pedido primeiro; empate desempata pelo uso mais recente.
       ORDER BY "timesUsed" DESC, "createdAt" DESC
       LIMIT ${teto}
    `;
  }
}
