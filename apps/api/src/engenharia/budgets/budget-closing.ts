import { bdiProblem } from './budget-bdi';
import { quantityProblem, unitCostProblem } from './budget-cost';
import { buildBudgetTree, type TreeItemInput, type TreeNodeInput } from './budget-tree';

export interface ClosingItem extends TreeItemInput {
  description: string;
  source: string;
  /// Quantas linhas de composição foram copiadas para o item.
  componentCount: number;
  /// Só REFERENCE: o snapshot mínimo e as linhas analíticas copiadas.
  referenceCode?: string | null;
  referenceKind?: string | null;
  referenceComponentCount?: number;
}

/// O que impede um orçamento de ser fechado. Lista vazia = pode fechar.
///
/// Confere o que um documento fechado não pode ter:
///
/// - nenhum item — um orçamento vazio não orça nada;
/// - estrutura quebrada — grupo sem pai no orçamento, ou item fora da EAP;
/// - valor inválido — quantidade que não seja positiva, custo negativo ou com
///   casas demais, BDI negativo ou fora da escala;
/// - item de composição sem as linhas copiadas — o custo dele não teria como
///   ser explicado depois;
/// - item de base referencial sem código, ou composição de base sem as linhas
///   analíticas copiadas.
///
/// **Grupo vazio NÃO impede.** Um grupo sem itens soma zero e não deixa o
/// documento incoerente; bloquear obrigaria a apagar grupos que a pessoa
/// mantém de propósito na estrutura. Os CHECK do banco já impedem quantidade
/// zero, custo negativo e BDI negativo; conferir aqui de novo é a defesa para
/// dados gravados por fora da API.
export function closingProblems(
  nodes: TreeNodeInput[],
  items: ClosingItem[],
  bdiPercent: unknown = 0,
): string[] {
  const problemas: string[] = [];

  if (items.length === 0) problemas.push('O orçamento não tem nenhum item.');

  const bdi = bdiProblem(bdiPercent);
  if (bdi) problemas.push(bdi);

  const arvore = buildBudgetTree(nodes, items);
  if (arvore.orphanNodeIds.length > 0) {
    problemas.push(`${arvore.orphanNodeIds.length} grupo(s) da EAP estão fora da estrutura.`);
  }
  if (arvore.orphanItemIds.length > 0) {
    problemas.push(`${arvore.orphanItemIds.length} item(ns) estão fora da EAP.`);
  }

  for (const item of items) {
    const quantidade = quantityProblem(item.quantity);
    if (quantidade) problemas.push(`"${item.description}": ${quantidade}`);
    const custo = unitCostProblem(item.unitCost);
    if (custo) problemas.push(`"${item.description}": ${custo}`);
    if (item.source === 'COMPOSITION' && item.componentCount === 0) {
      problemas.push(`"${item.description}": item de composição sem as linhas da composição.`);
    }
    if (item.source === 'REFERENCE') {
      if (!item.referenceCode) {
        problemas.push(`"${item.description}": item de base referencial sem o código da base.`);
      } else if (item.referenceKind === 'COMPOSITION' && (item.referenceComponentCount ?? 0) === 0) {
        problemas.push(`"${item.description}": composição de base referencial sem as linhas analíticas.`);
      }
    }
  }

  return problemas;
}
