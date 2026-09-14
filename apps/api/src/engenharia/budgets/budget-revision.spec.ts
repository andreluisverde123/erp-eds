import { Prisma } from '../../../generated/prisma/client';
import { planRevision, type RevisionItem } from './budget-revision';

const D = (valor: string) => new Prisma.Decimal(valor);
const t = (ms: number) => new Date(Date.UTC(2026, 8, 1, 0, 0, 0, ms));

function item(parcial: Partial<RevisionItem>): RevisionItem {
  return {
    id: 'item',
    budgetId: 'v1',
    budgetNodeId: 'n1',
    position: 0,
    source: 'MANUAL',
    compositionId: null,
    catalogItemId: null,
    referencePriceId: null,
    sourceCode: null,
    catalogItemType: null,
    description: 'Item',
    unit: 'UN',
    quantity: D('1'),
    unitCost: D('1'),
    createdAt: t(0),
    updatedAt: t(0),
    referenceDatasetId: null,
    referenceItemId: null,
    referenceCompositionId: null,
    referenceSource: null,
    referenceKind: null,
    referenceCode: null,
    referenceCompetence: null,
    referenceUf: null,
    referenceLocality: null,
    referenceRegime: null,
    referenceVersionLabel: null,
    compositionPricing: null,
    components: [],
    referenceComponents: [],
    ...parcial,
  };
}

describe('Cópia da revisão', () => {
  let sequencia = 0;
  const novoId = () => `novo-${++sequencia}`;

  const nodes = [
    // O filho vem ANTES do pai na lista: a cópia precisa sair em pré-ordem.
    { id: 'n11', parentId: 'n1', name: 'Fundação', position: 0, createdAt: t(2) },
    { id: 'n1', parentId: null, name: 'Estrutura', position: 0, createdAt: t(1) },
  ];

  const itens = [
    item({
      id: 'i-ref',
      budgetNodeId: 'n11',
      source: 'REFERENCE',
      sourceCode: '104658',
      description: 'PISO PODOTÁTIL',
      unit: 'M2',
      quantity: D('12.5'),
      unitCost: D('208'),
      referenceDatasetId: 'ds',
      referenceCompositionId: 'rc',
      referenceSource: 'SINAPI',
      referenceKind: 'COMPOSITION',
      referenceCode: '104658',
      referenceCompetence: '2026-08',
      referenceUf: 'SP',
      referenceLocality: 'SAO PAULO',
      referenceRegime: 'NAO_DESONERADO',
      referenceVersionLabel: '',
      referenceComponents: [
        {
          id: 'rc1',
          budgetItemId: 'i-ref',
          position: 0,
          section: null,
          kind: 'INPUT',
          code: '36178',
          description: 'PISO TATIL',
          unit: 'UN',
          coefficient: D('6.4375'),
          unitPrice: D('20.33'),
          totalCost: D('130.87'),
          situation: 'COM PREÇO',
          metadata: {},
        },
      ],
    }),
    item({
      id: 'i-comp',
      budgetNodeId: 'n1',
      source: 'COMPOSITION',
      compositionId: 'comp',
      sourceCode: 'COMP-0001',
      compositionPricing: 'MIXED',
      components: [
        {
          id: 'c1',
          budgetItemId: 'i-comp',
          catalogItemId: 'bloco',
          code: 'MAT-0002',
          name: 'Bloco',
          type: 'MATERIAL',
          unit: 'UN',
          coefficient: D('25'),
          unitPrice: D('2'),
          position: 0,
          priceOrigin: 'HISTORICAL',
          referencePriceId: 'p1',
        },
      ],
    }),
  ];

  const plano = planRevision({ nodes, items: itens }, 'v2', novoId);

  it('copia a EAP com ids novos, pai antes do filho', () => {
    expect(plano.nodes.map((n) => n.name)).toEqual(['Estrutura', 'Fundação']);
    const [pai, filho] = plano.nodes;
    expect(filho!.parentId).toBe(pai!.id);
    expect(plano.nodes.every((n) => n.budgetId === 'v2' && !['n1', 'n11'].includes(n.id!))).toBe(true);
  });

  it('copia os itens com o snapshot inteiro, apontando para os nós novos', () => {
    const ref = plano.items.find((i) => i.sourceCode === '104658')!;
    expect(ref).toMatchObject({
      budgetId: 'v2',
      budgetNodeId: plano.nodes[1]!.id,
      source: 'REFERENCE',
      quantity: D('12.5'),
      unitCost: D('208'),
      referenceSource: 'SINAPI',
      referenceCompetence: '2026-08',
      referenceUf: 'SP',
      referenceRegime: 'NAO_DESONERADO',
      referenceCompositionId: 'rc',
    });
    expect(ref.id).not.toBe('i-ref');
    expect(plano.items.find((i) => i.source === 'COMPOSITION')!.compositionPricing).toBe('MIXED');
  });

  it('copia as linhas de composição e as analíticas da base, com a origem do preço', () => {
    const comp = plano.items.find((i) => i.source === 'COMPOSITION')!;
    expect(plano.components).toEqual([
      expect.objectContaining({ budgetItemId: comp.id, priceOrigin: 'HISTORICAL', referencePriceId: 'p1', unitPrice: D('2') }),
    ]);
    const ref = plano.items.find((i) => i.source === 'REFERENCE')!;
    expect(plano.referenceComponents).toEqual([
      expect.objectContaining({ budgetItemId: ref.id, code: '36178', totalCost: D('130.87') }),
    ]);
  });

  it('não altera a versão de origem', () => {
    expect(itens[0]!.id).toBe('i-ref');
    expect(nodes[0]!.id).toBe('n11');
  });

  it('item fora da EAP impede a cópia', () => {
    expect(() => planRevision({ nodes, items: [item({ budgetNodeId: 'outro' })] }, 'v2', novoId)).toThrow();
  });
});
