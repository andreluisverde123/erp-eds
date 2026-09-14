import { buildItemCodes } from './budget-item-codes';
import { buildBudgetTree } from './budget-tree';

const t = (ms: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, 0, ms));

describe('Código EAP dos itens', () => {
  const nodes = [
    { id: 'g1', parentId: null, position: 0, createdAt: t(1) },
    { id: 'g2', parentId: null, position: 1, createdAt: t(2) },
    { id: 'g21', parentId: 'g2', position: 0, createdAt: t(3) },
  ];

  it('item do grupo folha: código do grupo + posição', () => {
    const items = [
      { id: 'b', budgetNodeId: 'g1', position: 1, quantity: 1, unitCost: 1 },
      { id: 'a', budgetNodeId: 'g1', position: 0, quantity: 1, unitCost: 1 },
      { id: 'c', budgetNodeId: 'g21', position: 0, quantity: 1, unitCost: 1 },
    ];
    const arvore = buildBudgetTree(nodes, items);
    const codigos = buildItemCodes(arvore.nodes, nodes, items);
    expect(codigos.get('a')).toBe('1.1');
    expect(codigos.get('b')).toBe('1.2');
    expect(codigos.get('c')).toBe('2.1.1');
  });

  it('grupo com subgrupos e itens: os itens continuam a contagem depois dos subgrupos', () => {
    const items = [{ id: 'x', budgetNodeId: 'g2', position: 0, quantity: 1, unitCost: 1 }];
    const arvore = buildBudgetTree(nodes, items);
    expect(arvore.nodes.find((n) => n.node.id === 'g21')!.code).toBe('2.1');
    expect(buildItemCodes(arvore.nodes, nodes, items).get('x')).toBe('2.2');
  });
});
