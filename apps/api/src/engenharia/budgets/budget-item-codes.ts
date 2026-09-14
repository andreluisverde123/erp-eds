/// Código EAP de cada ITEM. Módulo puro.
///
/// Os grupos já têm código (`budget-tree.ts`): "1", "1.2". O item recebe o
/// código do grupo mais a posição dele: o 3º item do grupo 1.2 é "1.2.3".
///
/// Num grupo que tem subgrupos E itens, os subgrupos ocupam 1.2.1…1.2.n; os
/// itens continuam a contagem depois deles (1.2.n+1…). Os códigos nunca
/// colidem, e o dos subgrupos continua o mesmo do ORC-04.
///
/// Derivado, como o dos grupos: nada é gravado.

export interface CodedNode {
  node: { id: string };
  code: string;
}

export interface CodableItem {
  id: string;
  budgetNodeId: string;
  position: number;
  createdAt?: Date;
}

export function itemOrder(a: CodableItem, b: CodableItem): number {
  return (
    a.position - b.position ||
    (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0) ||
    (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  );
}

export function buildItemCodes(
  placed: CodedNode[],
  nodes: { id: string; parentId: string | null }[],
  items: CodableItem[],
): Map<string, string> {
  const codigoDoNo = new Map(placed.map((colocado) => [colocado.node.id, colocado.code]));
  const subgrupos = new Map<string, number>();
  for (const node of nodes) {
    if (node.parentId) subgrupos.set(node.parentId, (subgrupos.get(node.parentId) ?? 0) + 1);
  }

  const porNo = new Map<string, CodableItem[]>();
  for (const item of items) porNo.set(item.budgetNodeId, [...(porNo.get(item.budgetNodeId) ?? []), item]);

  const codigos = new Map<string, string>();
  for (const [nodeId, lista] of porNo) {
    const base = codigoDoNo.get(nodeId);
    if (!base) continue;
    const deslocamento = subgrupos.get(nodeId) ?? 0;
    [...lista].sort(itemOrder).forEach((item, indice) => {
      codigos.set(item.id, `${base}.${deslocamento + indice + 1}`);
    });
  }
  return codigos;
}
