import { Prisma } from '../../../generated/prisma/client';

/// Dublê do Prisma para o Diário de Obras, compartilhado pelos specs do
/// relatório e dos itens.
///
/// Ele **reproduz de verdade** o que o banco faz: o filtro por `userId`, o
/// `companyId` da obra, o `deletedAt`, as constraints únicas e o lock
/// consultivo da numeração. Um dublê que devolvesse a linha para qualquer
/// `where` faria todos os testes de isolamento passarem sem que o código
/// filtrasse coisa alguma — que é exatamente o defeito que eles existem para
/// pegar.
///
/// Fica em `src/**/testing/`, que `tsconfig.build.json` exclui: o arquivo é
/// linkado e tipado como o resto do código, mas não entra na imagem de
/// produção — e qualquer import dele a partir de código de produção quebra o
/// build, que é exatamente o aviso que se quer.

// ---------------------------------------------------------------------------
// Identificadores e massa
// ---------------------------------------------------------------------------

export const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
export const EMPRESA_B = '22222222-2222-4222-8222-222222222222';

export const ENGENHEIRO_A = 'aaaaaaaa-0000-4000-8000-000000000001';
export const ENGENHEIRO_B = 'aaaaaaaa-0000-4000-8000-000000000002';
export const FISCAL = 'aaaaaaaa-0000-4000-8000-000000000003';
export const SEM_OBRAS = 'aaaaaaaa-0000-4000-8000-000000000004';

export const ALPHA = 'bbbbbbbb-0000-4000-8000-000000000001';
export const BETA = 'bbbbbbbb-0000-4000-8000-000000000002';
export const GAMMA = 'bbbbbbbb-0000-4000-8000-000000000003';
/// Obra excluída (soft delete) — o vínculo continua na tabela, o acesso não.
export const OBRA_ARQUIVADA = 'bbbbbbbb-0000-4000-8000-000000000004';
/// Obra de OUTRA empresa, com vínculo gravado. Só existe por corrupção de
/// dados, e é por isso que precisa de teste: o filtro por `companyId` é a
/// última linha de defesa quando o dado já está errado.
export const OBRA_OUTRA_EMPRESA = 'bbbbbbbb-0000-4000-8000-000000000009';

export interface LinhaObra {
  id: string;
  companyId: string;
  deletedAt: Date | null;
  code: string;
  name: string;
  clientName: string | null;
  responsibleName: string | null;
  status: string;
  addressLine: string | null;
  city: string | null;
  state: string | null;
  startDate: Date | null;
  expectedEndDate: Date | null;
}

function obra(
  id: string,
  companyId: string,
  name: string,
  deletedAt: Date | null = null,
): LinhaObra {
  return {
    id,
    companyId,
    deletedAt,
    code: `OBR-${id.slice(-3)}`,
    name,
    clientName: 'Construtora XYZ',
    responsibleName: 'Marina Souza',
    status: 'IN_PROGRESS',
    addressLine: 'Rua das Obras, 100',
    city: 'Curitiba',
    state: 'PR',
    startDate: new Date('2026-01-01T00:00:00.000Z'),
    expectedEndDate: new Date('2026-12-31T00:00:00.000Z'),
  };
}

export const OBRAS: LinhaObra[] = [
  obra(ALPHA, EMPRESA_A, 'Residencial Aurora'),
  obra(BETA, EMPRESA_A, 'Edifício Central'),
  obra(GAMMA, EMPRESA_A, 'Condomínio Green Park'),
  obra(OBRA_ARQUIVADA, EMPRESA_A, 'Obra Arquivada', new Date('2026-01-01')),
  obra(OBRA_OUTRA_EMPRESA, EMPRESA_B, 'Obra de Outra Empresa'),
];

/// Engenheiro A → Alpha e Gamma. Engenheiro B → Beta. Fiscal → Alpha.
/// Disjunto de propósito: com obras compartilhadas, "vê só as suas" e "vê
/// todas" produziriam a mesma lista.
export const VINCULOS: {
  userId: string;
  constructionSiteId: string;
  role: 'ENGINEER' | 'INSPECTOR';
}[] = [
  { userId: ENGENHEIRO_A, constructionSiteId: ALPHA, role: 'ENGINEER' },
  { userId: ENGENHEIRO_A, constructionSiteId: GAMMA, role: 'ENGINEER' },
  { userId: ENGENHEIRO_A, constructionSiteId: OBRA_ARQUIVADA, role: 'ENGINEER' },
  { userId: ENGENHEIRO_A, constructionSiteId: OBRA_OUTRA_EMPRESA, role: 'ENGINEER' },
  { userId: ENGENHEIRO_B, constructionSiteId: BETA, role: 'ENGINEER' },
  { userId: FISCAL, constructionSiteId: ALPHA, role: 'INSPECTOR' },
];

// ---------------------------------------------------------------------------
// Linhas
// ---------------------------------------------------------------------------

export interface LinhaRdo {
  id: string;
  companyId: string;
  constructionSiteId: string;
  number: number;
  reportDate: Date;
  status: 'DRAFT' | 'SUBMITTED' | 'APPROVED';
  notes: string | null;
  workStartMinutes: number | null;
  workBreakStartMinutes: number | null;
  workBreakEndMinutes: number | null;
  workEndMinutes: number | null;
  scheduleNotes: string | null;
  morningWeather: string | null;
  afternoonWeather: string | null;
  weatherNotes: string | null;
  copiedFromId: string | null;
  submittedAt: Date | null;
  submittedById: string | null;
  createdById: string;
  createdAt: Date;
  updatedAt: Date;
  deletedAt: Date | null;
}

export interface LinhaFilha {
  id: string;
  dailyReportId: string;
  createdAt: Date;
  updatedAt: Date;
  [campo: string]: unknown;
}

/// Linha como o banco a cria quando nada é informado: todo campo opcional em
/// NULL. Base tanto do helper `rdo()` (que sobrepõe com massa de exemplo)
/// quanto das inserções feitas pelo próprio service.
const VAZIO: LinhaRdo = {
  id: 'rdo-vazio',
  companyId: EMPRESA_A,
  constructionSiteId: ALPHA,
  number: 1,
  reportDate: new Date('2026-08-29T00:00:00.000Z'),
  status: 'DRAFT',
  notes: null,
  workStartMinutes: null,
  workBreakStartMinutes: null,
  workBreakEndMinutes: null,
  workEndMinutes: null,
  scheduleNotes: null,
  morningWeather: null,
  afternoonWeather: null,
  weatherNotes: null,
  copiedFromId: null,
  submittedAt: null,
  submittedById: null,
  createdById: ENGENHEIRO_A,
  createdAt: new Date('2026-08-29T10:00:00.000Z'),
  updatedAt: new Date('2026-08-29T10:00:00.000Z'),
  deletedAt: null,
};

export function rdo(over: Partial<LinhaRdo> = {}): LinhaRdo {
  return {
    ...VAZIO,
    id: 'rdo-existente',
    number: 23,
    notes: 'Concretagem do 3º pavimento.',
    ...over,
  };
}

export interface BancoFalso {
  reports: LinhaRdo[];
  labor: LinhaFilha[];
  equipment: LinhaFilha[];
  activities: LinhaFilha[];
  occurrences: LinhaFilha[];
  materials: LinhaFilha[];
  media: LinhaFilha[];
}

export interface ControleDoDuble {
  /// Desliga o lock consultivo para provar que é ELE que fecha a corrida da
  /// numeração — sem esse par, a proteção poderia ser removida do código e a
  /// suíte continuaria verde.
  lockLigado: boolean;
  locksPedidos: number;
}

// ---------------------------------------------------------------------------
// Mecânica
// ---------------------------------------------------------------------------

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

/// Fila de espera assíncrona, uma por chave. Reproduz
/// `pg_advisory_xact_lock`: o segundo a pedir espera o primeiro soltar, e o
/// Postgres solta no fim da transação.
class Mutex {
  private tail: Promise<void> = Promise.resolve();

  acquire(): Promise<() => void> {
    let release!: () => void;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const anterior = this.tail;
    this.tail = this.tail.then(() => held);
    return anterior.then(() => release);
  }
}

/// Violação de unicidade na forma EXATA que o `@prisma/adapter-pg` devolve.
///
/// Este objeto foi copiado de um erro real do Postgres, não imaginado. A versão
/// anterior punha o nome da constraint em `meta.target` — plausível, e errado:
/// o adapter `pg` não preenche `target`, e a informação vem em
/// `driverAdapterError.cause`. Com o dublê mentindo, a suíte inteira passava
/// enquanto criar um RDO em data já usada devolvia 500 no ar.
///
/// Os nomes das colunas vêm entre aspas de propósito: é assim que o Postgres
/// os reporta, e quem lê isso procura substring.
/// Storage falso. O `DailyReportsService` só o usa para apagar os arquivos de
/// um relatório excluído, então um espião em `remove` cobre tudo que importa:
/// quais chaves saíram, e se saíram.
export function criarStorageMinimo() {
  return { remove: jest.fn(async (_key: string) => undefined) };
}

export function uniqueError(campo: string) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      modelName: 'DailyReport',
      driverAdapterError: {
        name: 'DriverAdapterError',
        cause: {
          kind: 'UniqueConstraintViolation',
          originalCode: '23505',
          originalMessage: `duplicate key value violates unique constraint "DailyReport_constructionSiteId_${campo}_key"`,
          constraint: { fields: ['"constructionSiteId"', `"${campo}"`] },
        },
      },
    },
  });
}

type Where = Record<string, unknown>;

function casaEscalar(bruto: object, campo: string, esperado: unknown): boolean {
  const linha = bruto as Record<string, unknown>;
  if (esperado === undefined) return true;

  if (esperado !== null && typeof esperado === 'object') {
    const filtro = esperado as { in?: unknown[]; gte?: Date; lte?: Date };
    if (filtro.in) return filtro.in.includes(linha[campo]);
    const valor = linha[campo] as Date | null;
    if (filtro.gte && (!valor || valor < filtro.gte)) return false;
    if (filtro.lte && (!valor || valor > filtro.lte)) return false;
    return true;
  }

  return linha[campo] === esperado;
}

function casa(linha: object, where: Where): boolean {
  return Object.entries(where).every(([campo, esperado]) => casaEscalar(linha, campo, esperado));
}

let contador = 0;
const novoId = (prefixo: string) => `${prefixo}-${++contador}`;

/// Delegate genérico de tabela filha. As quatro (mão de obra, equipamentos,
/// atividades, ocorrências) têm exatamente o mesmo comportamento de banco; o
/// que muda é a constraint única, passada em `unicoPor`.
function delegateFilho(linhas: LinhaFilha[], prefixo: string, unicoPor?: string) {
  const violaUnico = (candidata: LinhaFilha, ignorarId?: string) =>
    unicoPor !== undefined &&
    linhas.some(
      (linha) =>
        linha.id !== ignorarId &&
        linha.dailyReportId === candidata.dailyReportId &&
        linha[unicoPor] === candidata[unicoPor],
    );

  return {
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const linha: LinhaFilha = {
        id: novoId(prefixo),
        createdAt: new Date(Date.now() + linhas.length),
        updatedAt: new Date(),
        ...data,
      } as LinhaFilha;

      if (violaUnico(linha)) throw uniqueError(unicoPor!);
      linhas.push(linha);
      return linha;
    },
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      const alvos = linhas.filter((linha) => casa(linha, where));
      for (const alvo of alvos) {
        if (violaUnico({ ...alvo, ...data } as LinhaFilha, alvo.id)) throw uniqueError(unicoPor!);
      }
      alvos.forEach((alvo) => Object.assign(alvo, data, { updatedAt: new Date() }));
      return { count: alvos.length };
    },
    deleteMany: async ({ where }: { where: Where }) => {
      const restantes = linhas.filter((linha) => !casa(linha, where));
      const removidas = linhas.length - restantes.length;
      linhas.splice(0, linhas.length, ...restantes);
      return { count: removidas };
    },
    count: async ({ where }: { where: Where }) =>
      linhas.filter((linha) => casa(linha, where)).length,
    aggregate: async ({ where }: { where: Where }) => {
      const posicoes = linhas
        .filter((linha) => casa(linha, where))
        .map((linha) => linha.position as number);
      return { _max: { position: posicoes.length > 0 ? Math.max(...posicoes) : null } };
    },
  };
}

export function criarPrismaFalso(reports: LinhaRdo[] = [], filhos: Partial<BancoFalso> = {}) {
  const db: BancoFalso = {
    reports: reports.map((linha) => ({ ...linha })),
    labor: (filhos.labor ?? []).map((linha) => ({ ...linha })),
    equipment: (filhos.equipment ?? []).map((linha) => ({ ...linha })),
    activities: (filhos.activities ?? []).map((linha) => ({ ...linha })),
    occurrences: (filhos.occurrences ?? []).map((linha) => ({ ...linha })),
    materials: (filhos.materials ?? []).map((linha) => ({ ...linha })),
    media: (filhos.media ?? []).map((linha) => ({ ...linha })),
  };

  const mutexes = new Map<string, Mutex>();
  const controle: ControleDoDuble = { lockLigado: true, locksPedidos: 0 };

  const obraVisivel = (siteId: string, companyId: string) =>
    OBRAS.find((linha) => linha.id === siteId && linha.companyId === companyId && !linha.deletedAt);

  const vinculosDoUsuario = (userId: string, companyId: string) =>
    VINCULOS.filter(
      (vinculo) => vinculo.userId === userId && obraVisivel(vinculo.constructionSiteId, companyId),
    );

  const porRelatorio = (linhas: LinhaFilha[], reportId: string) =>
    linhas
      .filter((linha) => linha.dailyReportId === reportId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const projetar = (linha: LinhaRdo) => ({
    ...linha,
    constructionSite: OBRAS.find((o) => o.id === linha.constructionSiteId)!,
    createdBy: { id: linha.createdById, name: 'Autor de Teste' },
    submittedBy: linha.submittedById ? { id: linha.submittedById, name: 'Autor de Teste' } : null,
    copiedFrom: (() => {
      const origem = db.reports.find((o) => o.id === linha.copiedFromId);
      return origem
        ? { id: origem.id, number: origem.number, reportDate: origem.reportDate }
        : null;
    })(),
    labor: porRelatorio(db.labor, linha.id),
    equipment: porRelatorio(db.equipment, linha.id),
    // As duas ordens abaixo reproduzem os `orderBy` reais do service. Sem
    // isso, o dublê devolveria ordem de inserção e um teste de ordenação
    // passaria mesmo com o `orderBy` errado no código.
    activities: porRelatorio(db.activities, linha.id).sort(
      (a, b) => (a.position as number) - (b.position as number),
    ),
    materials: porRelatorio(db.materials, linha.id),
    media: porRelatorio(db.media, linha.id),
    occurrences: porRelatorio(db.occurrences, linha.id).sort((a, b) => {
      // `nulls: 'last'` — a ocorrência sem horário vai para o fim.
      const horaA = (a.occurredAtMinutes as number | null) ?? Number.POSITIVE_INFINITY;
      const horaB = (b.occurredAtMinutes as number | null) ?? Number.POSITIVE_INFINITY;
      return horaA - horaB || a.createdAt.getTime() - b.createdAt.getTime();
    }),
  });

  const inserirRelatorio = async (data: Record<string, unknown>): Promise<LinhaRdo> => {
    // A escrita também demora — é ENTRE ler o máximo e gravar que a corrida da
    // numeração mora. Sem este atraso, a primeira criação sempre insere antes
    // de a segunda ler, e o teste de controle nunca veria a colisão que existe
    // de verdade contra um Postgres.
    await tick();

    // Campos ausentes viram NULL, e não os valores de `rdo()`.
    //
    // Usar os defaults do helper aqui faria o dublê INVENTAR conteúdo que o
    // service não mandou — foi assim que um teste de "a cópia não leva as
    // observações" passou a falhar por culpa do dublê, e não do código. O
    // banco insere o que recebe; o dublê também.
    const linha: LinhaRdo = {
      ...VAZIO,
      ...(data as Partial<LinhaRdo>),
      id: `rdo-${data.number as number}-${String(data.constructionSiteId).slice(-3)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    };

    if (
      db.reports.some(
        (o) => o.constructionSiteId === linha.constructionSiteId && o.number === linha.number,
      )
    ) {
      throw uniqueError('number');
    }
    if (
      db.reports.some(
        (o) =>
          o.constructionSiteId === linha.constructionSiteId &&
          o.reportDate.getTime() === linha.reportDate.getTime(),
      )
    ) {
      throw uniqueError('reportDate');
    }

    db.reports.push(linha);

    // Escritas aninhadas (`labor: { create: [...] }`), usadas pela cópia.
    for (const [tabela, chave] of [
      ['labor', 'labor'],
      ['equipment', 'equipment'],
    ] as const) {
      const aninhado = data[chave] as { create?: Record<string, unknown>[] } | undefined;
      for (const filho of aninhado?.create ?? []) {
        await delegateFilho(db[tabela], tabela).create({
          data: { ...filho, dailyReportId: linha.id },
        });
      }
    }

    return linha;
  };

  const delegateRdo = {
    aggregate: async ({ where }: { where: { constructionSiteId: string } }) => {
      await tick();
      const numeros = db.reports
        .filter((linha) => linha.constructionSiteId === where.constructionSiteId)
        .map((linha) => linha.number);
      return { _max: { number: numeros.length > 0 ? Math.max(...numeros) : null } };
    },
    create: async ({ data }: { data: Record<string, unknown> }) => inserirRelatorio(data),
    /// Usado pela lista de obras ("último RDO" e contagem por obra).
    groupBy: async ({ where }: { where: Where }) => {
      const permitidas = (where.constructionSiteId as { in?: string[] })?.in ?? [];
      return permitidas
        .map((siteId) => {
          const doSite = db.reports.filter(
            (linha) => linha.constructionSiteId === siteId && !linha.deletedAt,
          );
          if (doSite.length === 0) return null;
          return {
            constructionSiteId: siteId,
            _max: {
              reportDate: doSite
                .map((linha) => linha.reportDate)
                .sort((a, b) => b.getTime() - a.getTime())[0]!,
            },
            _count: { _all: doSite.length },
          };
        })
        .filter((linha): linha is NonNullable<typeof linha> => linha !== null);
    },
    findFirst: async ({ where }: { where: Where }) => {
      const achado = db.reports.find((linha) => casa(linha, where));
      return achado ? projetar(achado) : null;
    },
    findMany: async ({ where }: { where: Where }) =>
      db.reports
        .filter((linha) => casa(linha, where))
        .sort((a, b) => b.reportDate.getTime() - a.reportDate.getTime() || b.number - a.number)
        .map(projetar),
    count: async ({ where }: { where: Where }) =>
      db.reports.filter((linha) => casa(linha, where)).length,
    /// Usado pela finalização. A cláusula `status: 'DRAFT'` no `where` é o que
    /// fecha a corrida no banco real — o dublê a respeita, senão o teste de
    /// concorrência passaria mesmo sem a proteção.
    updateMany: async ({ where, data }: { where: Where; data: Record<string, unknown> }) => {
      // A espera vem ANTES de selecionar, e não no meio.
      //
      // É onde a latência existe de verdade: a ida até o banco. O `UPDATE ...
      // WHERE` em si é atômico — o Postgres avalia a condição e escreve sob
      // trava de linha, sem janela entre as duas coisas. Um dublê que
      // esperasse no meio inventaria uma brecha que o banco não tem, e faria
      // o teste de concorrência acusar um defeito inexistente.
      await tick();
      const alvos = db.reports.filter((linha) => casa(linha, where));
      alvos.forEach((alvo) => Object.assign(alvo, data, { updatedAt: new Date() }));
      return { count: alvos.length };
    },
    /// Usado pela exclusão de rascunho. Mesma disciplina do `updateMany`: a
    /// espera vem ANTES de selecionar, porque `DELETE ... WHERE` também é
    /// atômico no Postgres. E a cascata dos filhos é feita aqui, porque no
    /// banco ela existe (`onDelete: Cascade`) — um dublê que deixasse mão de
    /// obra e mídia para trás esconderia justamente o vazamento que a cascata
    /// evita.
    deleteMany: async ({ where }: { where: Where }) => {
      await tick();
      const alvos = db.reports.filter((linha) => casa(linha, where));
      const ids = new Set(alvos.map((a) => a.id));
      if (ids.size === 0) return { count: 0 };

      // `splice`, e não reatribuição: quem montou o teste guarda a REFERÊNCIA
      // do array (`rdos`). Trocar `db.reports` por um array novo deixaria essa
      // referência apontando para a lista antiga, e o teste veria o relatório
      // ainda ali depois de uma exclusão que funcionou.
      for (let i = db.reports.length - 1; i >= 0; i -= 1) {
        if (ids.has(db.reports[i]!.id)) db.reports.splice(i, 1);
      }
      for (const filhos of [db.labor, db.equipment, db.activities, db.occurrences, db.materials, db.media]) {
        for (let i = filhos.length - 1; i >= 0; i -= 1) {
          if (ids.has(filhos[i]!.dailyReportId as string)) filhos.splice(i, 1);
        }
      }
      // `copiedFromId` é SET NULL no banco: a cópia sobrevive à exclusão da
      // origem, perdendo só o ponteiro.
      db.reports.forEach((linha) => {
        if (linha.copiedFromId && ids.has(linha.copiedFromId as string)) linha.copiedFromId = null;
      });

      return { count: alvos.length };
    },
    update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
      const linha = db.reports.find((o) => o.id === where.id)!;
      const futuro = { ...linha, ...data } as LinhaRdo;
      if (
        db.reports.some(
          (o) =>
            o.id !== linha.id &&
            o.constructionSiteId === futuro.constructionSiteId &&
            o.reportDate.getTime() === futuro.reportDate.getTime(),
        )
      ) {
        throw uniqueError('reportDate');
      }
      Object.assign(linha, data, { updatedAt: new Date() });
      return projetar(linha);
    },
  };

  const client = {
    dailyReport: delegateRdo,
    dailyReportLabor: delegateFilho(db.labor, 'labor', 'role'),
    dailyReportEquipment: delegateFilho(db.equipment, 'equip'),
    dailyReportActivity: delegateFilho(db.activities, 'act'),
    dailyReportOccurrence: delegateFilho(db.occurrences, 'occ'),
    dailyReportMaterial: delegateFilho(db.materials, 'mat'),
    dailyReportMedia: {
      ...delegateFilho(db.media, 'media'),
      findFirst: async ({ where }: { where: Where }) =>
        db.media.find((linha) => casa(linha, where)) ?? null,
      /// A exclusão do relatório lê as chaves daqui ANTES da cascata, para
      /// saber quais objetos apagar do storage.
      findMany: async ({ where }: { where: Where }) => db.media.filter((linha) => casa(linha, where)),
      delete: async ({ where }: { where: { id: string } }) => {
        const indice = db.media.findIndex((linha) => linha.id === where.id);
        const [removida] = db.media.splice(indice, 1);
        return removida;
      },
    },
    userConstructionSite: {
      findMany: async ({ where }: { where: Where }) => {
        const companyId = (where.constructionSite as { companyId: string }).companyId;
        return vinculosDoUsuario(where.userId as string, companyId).map((vinculo) => ({
          constructionSiteId: vinculo.constructionSiteId,
          role: vinculo.role,
          constructionSite: obraVisivel(vinculo.constructionSiteId, companyId)!,
        }));
      },
      findFirst: async ({ where }: { where: Where }) => {
        const companyId = (where.constructionSite as { companyId: string }).companyId;
        const vinculo = vinculosDoUsuario(where.userId as string, companyId).find(
          (linha) => linha.constructionSiteId === where.constructionSiteId,
        );
        return vinculo
          ? { constructionSite: obraVisivel(vinculo.constructionSiteId, companyId)! }
          : null;
      },
      findUniqueOrThrow: async ({ where }: { where: Where }) => {
        const chave = where.userId_constructionSiteId as {
          userId: string;
          constructionSiteId: string;
        };
        const vinculo = VINCULOS.find(
          (linha) =>
            linha.userId === chave.userId && linha.constructionSiteId === chave.constructionSiteId,
        );
        if (!vinculo) throw new Error('vínculo inexistente');
        return { role: vinculo.role };
      },
      deleteMany: async () => ({ count: 0 }),
      create: async ({ data }: { data: unknown }) => data,
    },
    constructionSite: {
      findFirst: async ({ where }: { where: { id: string; companyId: string } }) =>
        obraVisivel(where.id, where.companyId) ?? null,
    },
    /// A exportação em PDF lê o nome da empresa para a marca do cabeçalho.
    company: {
      findUniqueOrThrow: async () => ({ tradeName: 'EDS Construtora', legalName: 'EDS LTDA' }),
    },
    user: { count: async () => 0, findMany: async () => [] },
    $transaction: async (arg: unknown) => {
      if (Array.isArray(arg)) return Promise.all(arg);

      const soltar: (() => void)[] = [];
      const tx = {
        ...client,
        $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
          if (!strings.join('?').includes('pg_advisory_xact_lock')) return 1;
          controle.locksPedidos += 1;
          if (!controle.lockLigado) return 1;
          const chave = JSON.stringify(values);
          if (!mutexes.has(chave)) mutexes.set(chave, new Mutex());
          soltar.push(await mutexes.get(chave)!.acquire());
          return 1;
        },
      };

      try {
        return await (arg as (tx: unknown) => Promise<unknown>)(tx);
      } finally {
        // O Postgres solta o lock consultivo no fim da transação, dê certo ou
        // dê errado. O `finally` reproduz exatamente isso.
        soltar.forEach((release) => release());
      }
    },
  };

  return { client, db, controle };
}

/// Dublê do registrador de auditoria.
///
/// `AuditLoggerService` é o mecanismo que o ERP já tem para gravar em
/// `AuditLog`; os specs do Diário não testam o conteúdo do log, só precisam de
/// algo que não vá ao banco. `jest.fn()` para quem quiser conferir a chamada.
export function criarAuditLoggerFalso() {
  return { log: jest.fn(async () => undefined) };
}
