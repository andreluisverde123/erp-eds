import { Injectable } from '@nestjs/common';

import { normalizeCatalogKey } from '../../engenharia/catalog-items/catalog-key';
import { PrismaService } from '../../prisma/prisma.service';
import { escapeLikePattern, normalizeForSearch } from './search-key';

/// Um insumo do CADASTRO, com o mínimo para ser escolhido numa linha de
/// solicitação. Sem preço: o catálogo não tem.
export interface CatalogSuggestion {
  id: string;
  code: string;
  name: string;
  unit: string;
}

/// Um material já pedido antes, com o que se sabe dele.
export interface ItemSuggestion {
  description: string;
  /// Quantas vezes apareceu. Serve para ordenar — o material do dia a dia sobe,
  /// o pedido uma vez só desce.
  timesUsed: number;
}

/// A partir de quantas letras a busca vale a pena.
///
/// UMA. Era duas, e a razão não era de produto: com `ILIKE '%c%'` o índice
/// trigram não é usado abaixo de três caracteres, então a primeira letra
/// custava uma varredura da tabela inteira e foi barrada. Com `searchKey` e o
/// índice de prefixo, "c" é uma busca indexada como qualquer outra.
const MINIMO_DE_LETRAS = 1;

/// Sugestão de material a partir do que a empresa JÁ PEDIU.
///
/// **Por que existe.** Uma obra pede os mesmos materiais o tempo todo, e cada
/// solicitação era redigitada do zero. Além do trabalho, isso produz três
/// grafias para o mesmo item ("Cimento CP-II", "cimento cp2", "CIMENTO CPII
/// 50KG") — e aí relatório por material deixa de somar, porque o banco vê três
/// materiais.
///
/// **Não é catálogo, e não virou um.** Não existe cadastro de materiais no
/// ERP. A memória de insumos é o próprio HISTÓRICO de solicitações: a fonte
/// continua sendo `PurchaseRequestItem`, sem tabela paralela para manter em
/// sincronia e sem risco de o catálogo divergir do que foi realmente pedido.
/// O que mudou foi COMO ele é consultado — ver `searchKey` no schema.
///
/// Um catálogo de verdade — com código, ficha técnica e preço de referência —
/// é outra decisão, bem maior, e esta funcionalidade não a antecipa nem a
/// atrapalha. É também por não existir código de material que a busca é só
/// por nome: não há identificador a consultar.
@Injectable()
export class ItemSuggestionsService {
  constructor(private readonly prisma: PrismaService) {}

  /// Materiais já pedidos que casam com o que está sendo digitado.
  ///
  /// A sugestão é SÓ O NOME. Unidade, quantidade e observação continuam
  /// digitadas — são decisões daquele pedido, não do material: a mesma tinta
  /// vem em lata numa compra e em galão na outra, e preencher a unidade da vez
  /// anterior colocaria um valor plausível e errado num campo que ninguém
  /// olharia de novo.
  ///
  /// **ORDEM DOS RESULTADOS**, e é onde mora a utilidade:
  ///
  ///   0. começa com o termo      "ci" -> "Cimento CP II"
  ///   1. alguma palavra começa   "cp" -> "Cimento CP II"
  ///   2. aparece no meio         "mento" -> "Cimento"
  ///
  /// e dentro de cada faixa, o mais pedido primeiro. Sem isso, digitar "ci"
  /// devolveria "Aditivo plastifiCIzante" acima de "Cimento" só porque aquele
  /// foi pedido mais vezes — o casamento mais forte tem de vencer a
  /// frequência, e a frequência só desempata entre iguais.
  ///
  /// **SQL cru, e não `groupBy` do Prisma.** Não basta agrupar: é preciso
  /// escolher UMA grafia entre as várias que existem para o mesmo material
  /// ("Cimento CP-II", "cimento cp2"), e ela tem de ser a mais recente.
  /// `groupBy` devolveria só as colunas agrupadas; `DISTINCT ON` do Postgres
  /// resolve numa passada.
  ///
  /// **ISOLAMENTO.** `r."companyId" = $1` está na consulta, não num filtro
  /// depois: o `LIMIT` corta antes de qualquer coisa em memória, então filtrar
  /// fora do banco deixaria sugestão de outra empresa ocupar as vagas — e
  /// vazar o que a concorrente compra.
  async search(companyId: string, search: string, limit = 8): Promise<ItemSuggestion[]> {
    const termo = normalizeForSearch(search);

    if (termo.length < MINIMO_DE_LETRAS) return [];

    const teto = Math.min(Math.max(limit, 1), 20);
    // Escapado para que `%` e `_` sejam procurados como texto, e não como
    // curinga. O termo já vai parametrizado — isto é sobre resultado correto,
    // não sobre injeção.
    const alvo = escapeLikePattern(termo);

    return this.prisma.$queryRaw<ItemSuggestion[]>`
      SELECT description,
             "timesUsed"
        FROM (
              SELECT DISTINCT ON (i."searchKey")
                     i.description,
                     COUNT(*) OVER (PARTITION BY i."searchKey")::int AS "timesUsed",
                     i."createdAt",
                     -- A FORÇA do casamento. Calculada uma vez por linha e
                     -- usada na ordenação de fora.
                     CASE
                       WHEN i."searchKey" LIKE ${alvo + '%'} ESCAPE '\\' THEN 0
                       WHEN i."searchKey" LIKE ${'% ' + alvo + '%'} ESCAPE '\\' THEN 1
                       ELSE 2
                     END AS relevancia
                FROM "PurchaseRequestItem" i
                JOIN "PurchaseRequest" r ON r.id = i."purchaseRequestId"
               WHERE r."companyId" = ${companyId}::uuid
                 AND r."deletedAt" IS NULL
                 -- As duas condições são deliberadas, e não redundantes: a
                 -- primeira é servida pelo índice de PREFIXO (que responde na
                 -- primeira letra, onde o trigram não alcança) e a segunda
                 -- pelo GIN trigram. O planejador usa os dois e junta.
                 AND (
                       i."searchKey" LIKE ${alvo + '%'} ESCAPE '\\'
                    OR i."searchKey" LIKE ${'%' + alvo + '%'} ESCAPE '\\'
                 )
               -- A ocorrência MAIS RECENTE de cada material vence: é dela que
               -- sai a grafia sugerida. Uma correção de ontem não deve ser
               -- sobreposta pela escrita errada do ano passado.
               ORDER BY i."searchKey", i."createdAt" DESC
             ) AS recentes
       -- Casamento mais forte primeiro; entre iguais, o mais pedido; e o uso
       -- mais recente desempata o resto.
       ORDER BY relevancia, "timesUsed" DESC, "createdAt" DESC
       LIMIT ${teto}
    `;
  }

  /// Insumos do CADASTRO que casam com o que está sendo digitado.
  ///
  /// A outra fonte do autocomplete da solicitação. As duas respondem a
  /// perguntas diferentes e por isso não se fundem numa consulta: o histórico
  /// diz "o que já pedimos", com a grafia de quem pediu; o cadastro diz "o que
  /// existe", com código e unidade canônicos. Escolher daqui é o que liga a
  /// linha ao insumo (`catalogItemId`).
  ///
  /// **Só ATIVO e não excluído.** Desativar é justamente tirar do uso: um
  /// insumo desativado não pode reaparecer como sugestão de pedido novo.
  ///
  /// **Só MATERIAL.** Desde o ORC-02 o cadastro também tem mão de obra e
  /// equipamento como recursos de COMPOSIÇÃO. "Pedreiro" não é algo que se
  /// pede numa solicitação de compra, e sugeri-lo ali ligaria a linha de
  /// compra a um recurso de orçamento. Contratar serviço é assunto de
  /// Terceirizados.
  ///
  /// **Mesma estratégia de busca do histórico e da tela de Insumos:** o termo
  /// passa pela normalização que gravou `searchKey` (`normalizeCatalogKey`), o
  /// prefixo é servido pelo índice btree desde a primeira letra e o trecho no
  /// meio pelo GIN trigram. O código também é procurado, em caixa alta, porque
  /// quem conhece o material costuma digitar "MAT-0007".
  ///
  /// **ISOLAMENTO** na consulta, pelo mesmo motivo de `search`: o `LIMIT`
  /// corta antes de qualquer filtro em memória.
  async searchCatalog(
    companyId: string,
    search: string,
    limit = 8,
  ): Promise<CatalogSuggestion[]> {
    const termo = normalizeCatalogKey(search);

    if (termo.length < MINIMO_DE_LETRAS) return [];

    const teto = Math.min(Math.max(limit, 1), 20);
    const alvo = escapeLikePattern(termo);
    const codigo = escapeLikePattern(search.trim().toUpperCase());

    return this.prisma.$queryRaw<CatalogSuggestion[]>`
      SELECT id, code, name, unit
        FROM "CatalogItem"
       WHERE "companyId" = ${companyId}::uuid
         AND "deletedAt" IS NULL
         AND active = true
         AND type = 'MATERIAL'
         AND (
               "searchKey" LIKE ${alvo + '%'} ESCAPE '\\'
            OR "searchKey" LIKE ${'%' + alvo + '%'} ESCAPE '\\'
            OR code LIKE ${codigo + '%'} ESCAPE '\\'
         )
       -- Mesmas faixas do histórico: começa com, alguma palavra começa, meio.
       -- Entre iguais, ordem alfabética — o cadastro não tem frequência.
       ORDER BY CASE
                  WHEN "searchKey" LIKE ${alvo + '%'} ESCAPE '\\'
                    OR code LIKE ${codigo + '%'} ESCAPE '\\' THEN 0
                  WHEN "searchKey" LIKE ${'% ' + alvo + '%'} ESCAPE '\\' THEN 1
                  ELSE 2
                END,
                name
       LIMIT ${teto}
    `;
  }
}
