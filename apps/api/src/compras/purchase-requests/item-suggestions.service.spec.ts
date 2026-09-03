import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { PrismaService } from '../../prisma/prisma.service';
import { ItemSuggestionsService } from './item-suggestions.service';
import { escapeLikePattern, normalizeForSearch } from './search-key';

const EMPRESA_A = '11111111-1111-1111-1111-111111111111';

/// O que o `$queryRaw` recebeu, para o teste conferir a consulta sem banco.
interface ConsultaFeita {
  sql: string;
  valores: unknown[];
}

function makeService(resultado: { description: string; timesUsed: number }[] = []) {
  const consultas: ConsultaFeita[] = [];

  const prisma = {
    $queryRaw: jest.fn(async (strings: TemplateStringsArray, ...valores: unknown[]) => {
      consultas.push({ sql: strings.join('?'), valores });
      return resultado;
    }),
  } as unknown as PrismaService;

  return { service: new ItemSuggestionsService(prisma), prisma, consultas };
}

/// A MEMÓRIA DE INSUMOS do ERP.
///
/// Não há catálogo de materiais no sistema: a memória é o histórico de
/// solicitações. Estes testes cobrem como ele é consultado — quando a busca
/// dispara, o que ela procura, e em que ordem o resultado volta.
describe('Sugestão de material', () => {
  describe('1 e 2. A busca começa na primeira letra', () => {
    it('uma letra já consulta o banco', async () => {
      const { service, prisma } = makeService();

      await service.search(EMPRESA_A, 'c');

      // Era duas, e o motivo era técnico, não de produto: `ILIKE '%c%'` não
      // usa índice trigram abaixo de três caracteres.
      expect(prisma.$queryRaw).toHaveBeenCalled();
    });

    it('a segunda letra refina, sem deixar de consultar', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'ci');

      expect(consultas[0]!.valores).toContain('ci%');
    });

    it('termo vazio ou só espaços não vai ao banco', async () => {
      const { service, prisma } = makeService();

      expect(await service.search(EMPRESA_A, '')).toEqual([]);
      expect(await service.search(EMPRESA_A, '   ')).toEqual([]);
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });
  });

  describe('3, 4 e 5. O que a busca considera igual', () => {
    it('4. acento é ignorado — o termo é normalizado antes de comparar', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'CIMENTÔ');

      // O banco guarda `searchKey` já normalizada; o termo precisa passar pela
      // MESMA conta, senão "cimentô" nunca acharia "Cimento".
      expect(consultas[0]!.valores).toContain('cimento%');
    });

    it('5. maiúscula e minúscula dão a mesma busca', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'CiMeNtO');

      expect(consultas[0]!.valores).toContain('cimento%');
    });

    it('3. trecho no meio é procurado, além do prefixo', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'mento');

      // As duas formas viajam: o prefixo é servido pelo índice btree e o
      // trecho pelo GIN trigram.
      expect(consultas[0]!.valores).toContain('mento%');
      expect(consultas[0]!.valores).toContain('%mento%');
    });

    it('espaço nas pontas não muda a busca', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, '  cimento  ');

      expect(consultas[0]!.valores).toContain('cimento%');
    });
  });

  describe('7. Ordenação por relevância', () => {
    it('a consulta ordena por força do casamento ANTES da frequência', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'ci');

      // Sem isto, "Aditivo plastifiCIzante" pedido 40 vezes venceria "Cimento"
      // pedido 5 — a frequência só pode desempatar entre casamentos iguais.
      const sql = consultas[0]!.sql.replace(/\s+/g, ' ');
      expect(sql).toContain('ORDER BY relevancia, "timesUsed" DESC');
    });

    it('as três faixas de relevância existem na consulta', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'ci');

      const valores = consultas[0]!.valores;
      // 0 = começa com; 1 = alguma palavra começa; 2 = aparece no meio.
      expect(valores).toContain('ci%');
      expect(valores).toContain('% ci%');
      expect(valores).toContain('%ci%');
    });
  });

  describe('6. Material usado em várias solicitações', () => {
    it('devolve uma linha por material, com a contagem de usos', async () => {
      const { service } = makeService([
        { description: 'Cimento CP II', timesUsed: 12 },
        { description: 'Cimento Cola', timesUsed: 3 },
      ]);

      const resultado = await service.search(EMPRESA_A, 'ci');

      // O `DISTINCT ON (searchKey)` é o que impede o mesmo material aparecer
      // uma vez por solicitação em que foi pedido.
      expect(resultado).toHaveLength(2);
      expect(resultado[0]!.timesUsed).toBe(12);
    });
  });

  describe('8. Nenhum resultado', () => {
    it('devolve lista vazia, e não erro', async () => {
      const { service } = makeService([]);

      expect(await service.search(EMPRESA_A, 'xyz')).toEqual([]);
    });
  });

  describe('9. Isolamento entre empresas', () => {
    it('a empresa entra na CONSULTA, não num filtro depois', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'ci');

      // Filtrar fora do banco deixaria o `LIMIT` cortar antes: sugestão de
      // outra empresa ocuparia as vagas e vazaria o que a concorrente compra.
      expect(consultas[0]!.valores).toContain(EMPRESA_A);
      const sql = consultas[0]!.sql.replace(/\s+/g, ' ');
      expect(sql).toContain('r."companyId" =');
    });

    it('solicitação excluída não sugere nada', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'ci');

      expect(consultas[0]!.sql.replace(/\s+/g, ' ')).toContain('r."deletedAt" IS NULL');
    });
  });

  describe('10. A consulta não pode ficar cara', () => {
    it('o limite é sempre aplicado, e tem teto', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'c');
      expect(consultas[0]!.valores).toContain(8);

      await service.search(EMPRESA_A, 'c', 500);
      // Não devolver milhares de registros é requisito: o teto vale mesmo
      // quando o cliente pede mais.
      expect(consultas[1]!.valores).toContain(20);

      await service.search(EMPRESA_A, 'c', 0);
      expect(consultas[2]!.valores).toContain(1);
    });

    it('busca o PREFIXO explicitamente, e não só o trecho', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, 'ci');

      // É a condição de prefixo que o índice btree serve — e é ela que faz a
      // primeira letra ser barata. Só `%ci%` cairia em varredura de tabela.
      const sql = consultas[0]!.sql.replace(/\s+/g, ' ');
      expect(sql).toContain('LIKE');
      expect(consultas[0]!.valores).toContain('ci%');
    });
  });

  describe('curinga do LIKE não é aceito do usuário', () => {
    it('% e _ são procurados como texto', async () => {
      const { service, consultas } = makeService();

      await service.search(EMPRESA_A, '100%');

      // Sem escapar, digitar "%" sugeriria a base inteira — não é injeção (o
      // termo vai parametrizado), é resultado errado.
      expect(consultas[0]!.valores).toContain('100\\%%');
    });
  });
});

/// A normalização é a peça que as TRÊS pontas compartilham: a gravação de
/// `searchKey`, a consulta, e o `UPDATE` de backfill da migration. Se elas
/// divergirem, dados gravados por uma ficam inalcançáveis pela outra.
describe('normalizeForSearch', () => {
  it('tira acento, caixa e espaço das pontas', () => {
    expect(normalizeForSearch('  Cimento CP-II  ')).toBe('cimento cp-ii');
    expect(normalizeForSearch('CONCRETÔ')).toBe('concreto');
    expect(normalizeForSearch('Tubo PVC 100mm')).toBe('tubo pvc 100mm');
  });

  it('cobre os acentos do português', () => {
    // O backfill da migration usa `translate` com exatamente este conjunto.
    expect(normalizeForSearch('áàâãä éèêë íìîï óòôõö úùûü ç ñ')).toBe(
      'aaaaa eeee iiii ooooo uuuu c n',
    );
  });

  it('não mexe no MIOLO do texto', () => {
    // Hífen, número e barra fazem parte do nome do material ("CP-II", "1/2").
    expect(normalizeForSearch('Tê 90° 1/2"')).toBe('te 90° 1/2"');
  });
});

/// A CONSISTÊNCIA entre o TypeScript e o SQL do backfill.
///
/// A migration `20260903120000` preencheu `searchKey` das linhas antigas com
/// `translate(lower(...))`, e o service preenche as novas com
/// `normalizeForSearch`. Se os dois divergirem em um caractere, o material
/// gravado antes da migration fica inalcançável pela busca — e ninguém
/// relacionaria isso com um mapa de acentos incompleto.
describe('o backfill da migration concorda com o TypeScript', () => {
  const sql = readFileSync(
    join(
      __dirname,
      '../../../prisma/migrations/20260903120000_autocomplete_desde_a_primeira_letra/migration.sql',
    ),
    'utf8',
  );

  it('o mapa de acentos do SQL produz o mesmo que normalizeForSearch', () => {
    const [, de, para] =
      /translate\(\s*lower\("description"\),\s*'([^']+)',\s*'([^']+)'\s*\)/.exec(sql) ?? [];

    expect(de).toBeDefined();
    expect(de!.length).toBe(para!.length);

    // Caractere a caractere: o que o SQL troca, o TypeScript também troca.
    [...de!].forEach((acentuado, i) => {
      expect(normalizeForSearch(acentuado)).toBe(para![i]);
    });
  });

  it('a migration cria os DOIS índices, e derruba o que ficou órfão', () => {
    // O de prefixo é o que faz a primeira letra ser barata; o trigram cobre o
    // trecho no meio. O antigo, sobre `description`, perdeu o único consumidor.
    expect(sql).toContain('PurchaseRequestItem_searchKey_prefix_idx');
    expect(sql).toContain('text_pattern_ops');
    expect(sql).toContain('PurchaseRequestItem_searchKey_trgm_idx');
    expect(sql).toContain('gin_trgm_ops');
    expect(sql).toContain('DROP INDEX IF EXISTS "PurchaseRequestItem_description_trgm_idx"');
  });
});

describe('escapeLikePattern', () => {
  it('escapa os curingas do LIKE', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('a_b')).toBe('a\\_b');
    expect(escapeLikePattern('c:\\temp')).toBe('c:\\\\temp');
  });

  it('deixa o texto normal intacto', () => {
    expect(escapeLikePattern('cimento cp-ii')).toBe('cimento cp-ii');
  });
});
