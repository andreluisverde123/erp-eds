import type { Prisma } from '../../../generated/prisma/client';
import { buildBudgetTree } from './budget-tree';

/// A CÓPIA de um orçamento fechado para a nova versão. Módulo puro.
///
/// Copia a EAP, os itens com todos os campos de snapshot (descrição, unidade,
/// quantidade, custo, origem, referência SINAPI/SICRO, precificação da
/// composição) e as linhas copiadas de cada item. Nada é recalculado: a
/// revisão começa IGUAL à versão de origem, e o que mudar muda no rascunho.
///
/// Ids novos para tudo, gerados aqui, para os pais e os itens poderem apontar
/// para os nós novos numa escrita em lote. Os nós saem em pré-ordem — o pai
/// antes do filho —, então nem um lote partido em dois comandos encontraria
/// um filho sem pai.

export interface RevisionNode {
  id: string;
  parentId: string | null;
  name: string;
  position: number;
  createdAt: Date;
}

export type RevisionItem = Prisma.BudgetItemGetPayload<{
  include: { components: true; referenceComponents: true };
}>;

export interface RevisionPlan {
  nodes: Prisma.BudgetNodeCreateManyInput[];
  items: Prisma.BudgetItemCreateManyInput[];
  components: Prisma.BudgetItemComponentCreateManyInput[];
  referenceComponents: Prisma.BudgetItemReferenceComponentCreateManyInput[];
}

export function planRevision(
  source: { nodes: RevisionNode[]; items: RevisionItem[] },
  budgetId: string,
  newId: () => string,
): RevisionPlan {
  const arvore = buildBudgetTree(source.nodes, []);
  if (arvore.orphanNodeIds.length > 0) {
    throw new Error('A EAP da versão de origem tem grupos fora da estrutura.');
  }

  const novoNo = new Map(arvore.nodes.map(({ node }) => [node.id, newId()]));

  const nodes = arvore.nodes.map(({ node }) => ({
    id: novoNo.get(node.id)!,
    budgetId,
    parentId: node.parentId ? novoNo.get(node.parentId)! : null,
    name: node.name,
    position: node.position,
  }));

  const items: Prisma.BudgetItemCreateManyInput[] = [];
  const components: Prisma.BudgetItemComponentCreateManyInput[] = [];
  const referenceComponents: Prisma.BudgetItemReferenceComponentCreateManyInput[] = [];

  for (const item of source.items) {
    const budgetNodeId = novoNo.get(item.budgetNodeId);
    if (!budgetNodeId) throw new Error('Um item da versão de origem está fora da EAP.');
    const id = newId();

    items.push({
      id,
      budgetId,
      budgetNodeId,
      position: item.position,
      source: item.source,
      compositionId: item.compositionId,
      catalogItemId: item.catalogItemId,
      referencePriceId: item.referencePriceId,
      sourceCode: item.sourceCode,
      catalogItemType: item.catalogItemType,
      description: item.description,
      unit: item.unit,
      quantity: item.quantity,
      unitCost: item.unitCost,
      referenceDatasetId: item.referenceDatasetId,
      referenceItemId: item.referenceItemId,
      referenceCompositionId: item.referenceCompositionId,
      referenceSource: item.referenceSource,
      referenceKind: item.referenceKind,
      referenceCode: item.referenceCode,
      referenceCompetence: item.referenceCompetence,
      referenceUf: item.referenceUf,
      referenceLocality: item.referenceLocality,
      referenceRegime: item.referenceRegime,
      referenceVersionLabel: item.referenceVersionLabel,
      compositionPricing: item.compositionPricing,
    });

    for (const linha of item.components) {
      components.push({
        budgetItemId: id,
        catalogItemId: linha.catalogItemId,
        code: linha.code,
        name: linha.name,
        type: linha.type,
        unit: linha.unit,
        coefficient: linha.coefficient,
        unitPrice: linha.unitPrice,
        position: linha.position,
        priceOrigin: linha.priceOrigin,
        referencePriceId: linha.referencePriceId,
      });
    }

    for (const linha of item.referenceComponents) {
      referenceComponents.push({
        budgetItemId: id,
        position: linha.position,
        section: linha.section,
        kind: linha.kind,
        code: linha.code,
        description: linha.description,
        unit: linha.unit,
        coefficient: linha.coefficient,
        unitPrice: linha.unitPrice,
        totalCost: linha.totalCost,
        situation: linha.situation,
        metadata: linha.metadata as Prisma.InputJsonValue,
      });
    }
  }

  return { nodes, items, components, referenceComponents };
}
