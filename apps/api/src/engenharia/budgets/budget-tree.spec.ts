import { closingProblems, type ClosingItem } from './budget-closing';
import { buildBudgetTree, subtreeIds, type TreeNodeInput } from './budget-tree';

let relogio = 0;
function no(id: string, parentId: string | null, position: number): TreeNodeInput & { name: string } {
  return { id, parentId, position, name: id, createdAt: new Date(Date.UTC(2026, 8, 14, 12, 0, 0, relogio++)) };
}

function item(id: string, budgetNodeId: string, quantity: string, unitCost: string): ClosingItem {
  return { id, budgetNodeId, quantity, unitCost, description: id, source: 'MANUAL', componentCount: 0 };
}

/// A EAP do enunciado, criada fora de ordem de propósito.
function eapDoEnunciado() {
  return [
    no('estrutura', null, 2),
    no('preliminares', null, 0),
    no('fundacao', null, 1),
    no('locacao', 'preliminares', 1),
    no('canteiro', 'preliminares', 0),
    no('concreto', 'fundacao', 1),
    no('escavacao', 'fundacao', 0),
    no('pilares', 'estrutura', 0),
    no('vigas', 'estrutura', 1),
    no('lajes', 'estrutura', 2),
  ];
}

describe('EAP', () => {
  it('numera pela posição entre irmãos, em qualquer nível', () => {
    const arvore = buildBudgetTree(eapDoEnunciado(), []);

    expect(arvore.nodes.map((n) => `${n.code} ${n.node.id}`)).toEqual([
      '1 preliminares',
      '1.1 canteiro',
      '1.2 locacao',
      '2 fundacao',
      '2.1 escavacao',
      '2.2 concreto',
      '3 estrutura',
      '3.1 pilares',
      '3.2 vigas',
      '3.3 lajes',
    ]);
    expect(arvore.nodes.find((n) => n.node.id === 'vigas')!.depth).toBe(2);
  });

  it('não tem limite de profundidade', () => {
    const nos = [no('n0', null, 0)];
    for (let i = 1; i < 60; i++) nos.push(no(`n${i}`, `n${i - 1}`, 0));

    const arvore = buildBudgetTree(nos, [item('fundo', 'n59', '1', '10')]);

    const maisFundo = arvore.nodes.at(-1)!;
    expect(maisFundo.depth).toBe(60);
    expect(maisFundo.code.split('.')).toHaveLength(60);
    expect(arvore.nodes[0]!.subtotalExact.toString()).toBe('10');
  });

  it('empate de posição é resolvido pela ordem de criação', () => {
    const arvore = buildBudgetTree([no('a', null, 0), no('b', null, 0)], []);

    expect(arvore.nodes.map((n) => n.code + n.node.id)).toEqual(['1a', '2b']);
  });

  it('apagar um irmão renumera os seguintes: o código não é gravado', () => {
    const semCanteiro = eapDoEnunciado().filter((n) => n.id !== 'canteiro');

    const arvore = buildBudgetTree(semCanteiro, []);

    expect(arvore.nodes.find((n) => n.node.id === 'locacao')!.code).toBe('1.1');
  });
});

describe('Totais', () => {
  const itens = () => [
    item('tapume', 'canteiro', '100', '45'), // 4.500
    item('gabarito', 'locacao', '1', '850.5'), // 850,50
    item('escavar', 'escavacao', '30', '42.3333'), // 1.269,999
    item('concretar', 'concreto', '12.5', '480'), // 6.000
    item('pilar', 'pilares', '3', '1000'), // 3.000
  ];

  it('subtotal do nó soma os itens dele e de todos os descendentes', () => {
    const arvore = buildBudgetTree(eapDoEnunciado(), itens());
    const subtotal = (id: string) => arvore.nodes.find((n) => n.node.id === id)!;

    expect(subtotal('canteiro').subtotalExact.toString()).toBe('4500');
    expect(subtotal('preliminares').subtotalExact.toString()).toBe('5350.5');
    expect(subtotal('fundacao').subtotalExact.toString()).toBe('7269.999');
    expect(subtotal('fundacao').itemCount).toBe(2);
    expect(subtotal('vigas').subtotalExact.toString()).toBe('0');
  });

  it('item no próprio grupo e nos subgrupos somam juntos', () => {
    const arvore = buildBudgetTree(eapDoEnunciado(), [
      ...itens(),
      item('mobilizacao', 'preliminares', '1', '1000'),
    ]);

    expect(arvore.nodes.find((n) => n.node.id === 'preliminares')!.subtotalExact.toString()).toBe(
      '6350.5',
    );
  });

  it('o total geral é a soma exata de todos os itens, igual à soma das raízes', () => {
    const arvore = buildBudgetTree(eapDoEnunciado(), itens());
    const raizes = arvore.nodes.filter((n) => n.depth === 1);

    expect(arvore.totalExact.toString()).toBe('15620.499');
    expect(raizes.reduce((s, n) => s.plus(n.subtotalExact), arvore.totalExact.minus(arvore.totalExact)).toString()).toBe(
      '15620.499',
    );
  });
});

describe('Integridade da estrutura', () => {
  it('nó com pai que não é do orçamento fica fora da árvore e é apontado', () => {
    const arvore = buildBudgetTree([no('a', null, 0), no('perdido', 'de-outro-orcamento', 0)], []);

    expect(arvore.nodes.map((n) => n.node.id)).toEqual(['a']);
    expect(arvore.orphanNodeIds).toEqual(['perdido']);
  });

  it('ciclo não trava a montagem e é apontado', () => {
    const arvore = buildBudgetTree([no('x', 'y', 0), no('y', 'x', 0)], []);

    expect(arvore.orphanNodeIds.sort()).toEqual(['x', 'y']);
  });

  it('item de nó que não é do orçamento é apontado', () => {
    const arvore = buildBudgetTree([no('a', null, 0)], [item('i', 'fantasma', '1', '1')]);

    expect(arvore.orphanItemIds).toEqual(['i']);
  });

  it('a subárvore de um nó inclui todos os descendentes', () => {
    expect(subtreeIds(eapDoEnunciado(), 'estrutura').sort()).toEqual(['estrutura', 'lajes', 'pilares', 'vigas']);
    expect(subtreeIds(eapDoEnunciado(), 'inexistente')).toEqual([]);
  });
});

describe('Pode fechar?', () => {
  it('orçamento com itens válidos pode', () => {
    expect(closingProblems(eapDoEnunciado(), [item('tapume', 'canteiro', '100', '45')])).toEqual([]);
  });

  it('grupo vazio não impede', () => {
    // "Vigas" e "Lajes" sem item nenhum.
    expect(closingProblems(eapDoEnunciado(), [item('pilar', 'pilares', '1', '1')])).toEqual([]);
  });

  it('sem nenhum item, não pode', () => {
    expect(closingProblems(eapDoEnunciado(), [])).toEqual(['O orçamento não tem nenhum item.']);
  });

  it('estrutura quebrada não pode', () => {
    const problemas = closingProblems(
      [no('a', null, 0), no('perdido', 'fora', 0)],
      [item('ok', 'a', '1', '1'), item('solto', 'fantasma', '1', '1')],
    );

    expect(problemas).toEqual([
      '1 grupo(s) da EAP estão fora da estrutura.',
      '1 item(ns) estão fora da EAP.',
    ]);
  });

  it('quantidade zero, custo negativo e composição sem linhas não podem', () => {
    const problemas = closingProblems(
      [no('a', null, 0)],
      [
        item('zerado', 'a', '0', '10'),
        item('negativo', 'a', '1', '-1'),
        { ...item('alvenaria', 'a', '1', '75'), source: 'COMPOSITION', componentCount: 0 },
      ],
    );

    expect(problemas).toEqual([
      '"zerado": A quantidade deve ser maior que zero.',
      '"negativo": O custo unitário não pode ser negativo.',
      '"alvenaria": item de composição sem as linhas da composição.',
    ]);
  });
});
