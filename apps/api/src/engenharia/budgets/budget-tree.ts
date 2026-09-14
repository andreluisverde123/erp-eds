import { Prisma } from '../../../generated/prisma/client';
import type { DecimalLike } from '../compositions/composition-cost';
import { lineTotalExact, sumExact } from './budget-cost';

/// A EAP do orçamento montada em memória, a partir de UMA consulta de nós e
/// UMA de itens. Módulo puro.
///
/// ## Código
///
/// "1", "1.2", "1.2.3": a posição entre irmãos, contada a partir de 1, com o
/// prefixo do pai. Derivado a cada leitura, nunca gravado — apagar o 2.1
/// renumera o 2.2 sozinho, e num orçamento fechado nada muda de lugar.
///
/// Irmãos ordenados por `position`, depois `createdAt`, depois `id`: duas
/// inclusões simultâneas podem gravar a mesma posição, e o empate precisa ter
/// resposta estável.
///
/// ## Subtotal
///
/// O subtotal EXATO de um nó é a soma dos exatos dos itens dele e dos
/// subtotais exatos dos filhos. Arredondar é trabalho de quem apresenta
/// (`budget-cost.ts`).
///
/// ## Profundidade
///
/// Sem limite. O percurso é recursivo; uma EAP de orçamento tem poucos níveis
/// na prática, e nenhum limite artificial foi posto.

export interface TreeNodeInput {
  id: string;
  parentId: string | null;
  position: number;
  createdAt: Date;
}

export interface TreeItemInput {
  id: string;
  budgetNodeId: string;
  quantity: DecimalLike;
  unitCost: DecimalLike;
}

export interface PlacedNode<N extends TreeNodeInput> {
  node: N;
  code: string;
  /// 1 para a raiz.
  depth: number;
  /// Itens do nó E dos descendentes.
  itemCount: number;
  subtotalExact: Prisma.Decimal;
}

export interface BudgetTree<N extends TreeNodeInput> {
  /// Em pré-ordem: cada nó seguido dos filhos, na ordem da EAP.
  nodes: PlacedNode<N>[];
  /// Soma exata de TODOS os itens do orçamento.
  totalExact: Prisma.Decimal;
  /// Nós que não se alcançam a partir de uma raiz (pai inexistente ou ciclo).
  /// O banco impede os dois; a lista existe para o fechamento conferir.
  orphanNodeIds: string[];
  /// Itens cujo nó não é deste orçamento.
  orphanItemIds: string[];
}

export function siblingOrder(a: TreeNodeInput, b: TreeNodeInput): number {
  return (
    a.position - b.position ||
    a.createdAt.getTime() - b.createdAt.getTime() ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function buildBudgetTree<N extends TreeNodeInput>(
  nodes: N[],
  items: TreeItemInput[],
): BudgetTree<N> {
  const existentes = new Set(nodes.map((node) => node.id));
  const raizes: N[] = [];
  const filhos = new Map<string, N[]>();

  for (const node of nodes) {
    if (node.parentId === null) raizes.push(node);
    else if (node.parentId !== node.id && existentes.has(node.parentId)) {
      filhos.set(node.parentId, [...(filhos.get(node.parentId) ?? []), node]);
    }
  }
  raizes.sort(siblingOrder);
  for (const lista of filhos.values()) lista.sort(siblingOrder);

  const exatosPorNo = new Map<string, Prisma.Decimal[]>();
  const orphanItemIds: string[] = [];
  for (const item of items) {
    if (!existentes.has(item.budgetNodeId)) {
      orphanItemIds.push(item.id);
      continue;
    }
    exatosPorNo.set(item.budgetNodeId, [
      ...(exatosPorNo.get(item.budgetNodeId) ?? []),
      lineTotalExact(item.quantity, item.unitCost),
    ]);
  }

  const colocados: PlacedNode<N>[] = [];
  const visitados = new Set<string>();

  const visitar = (node: N, code: string, depth: number) => {
    visitados.add(node.id);
    const indice = colocados.length;
    colocados.push({ node, code, depth, itemCount: 0, subtotalExact: new Prisma.Decimal(0) });

    const proprios = exatosPorNo.get(node.id) ?? [];
    let subtotal = sumExact(proprios);
    let quantidade = proprios.length;

    (filhos.get(node.id) ?? []).forEach((filho, i) => {
      if (visitados.has(filho.id)) return;
      const doFilho = visitar(filho, `${code}.${i + 1}`, depth + 1);
      subtotal = subtotal.plus(doFilho.subtotal);
      quantidade += doFilho.quantidade;
    });

    colocados[indice] = { node, code, depth, itemCount: quantidade, subtotalExact: subtotal };
    return { subtotal, quantidade };
  };

  raizes.forEach((raiz, i) => visitar(raiz, String(i + 1), 1));

  return {
    nodes: colocados,
    totalExact: sumExact(items.map((item) => lineTotalExact(item.quantity, item.unitCost))),
    orphanNodeIds: nodes.filter((node) => !visitados.has(node.id)).map((node) => node.id),
    orphanItemIds,
  };
}

/// O nó e todos os descendentes. Vazio se o nó não estiver na lista.
export function subtreeIds(
  nodes: { id: string; parentId: string | null }[],
  rootId: string,
): string[] {
  if (!nodes.some((node) => node.id === rootId)) return [];

  const ids = [rootId];
  const vistos = new Set(ids);
  for (let i = 0; i < ids.length; i++) {
    for (const node of nodes) {
      if (node.parentId === ids[i] && !vistos.has(node.id)) {
        vistos.add(node.id);
        ids.push(node.id);
      }
    }
  }
  return ids;
}
