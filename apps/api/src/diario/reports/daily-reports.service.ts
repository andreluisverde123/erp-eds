import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { SiteAccessService, diarioSiteSelect } from '../access/site-access.service';
import {
  DAILY_REPORT_STATUS_LABEL,
  NOT_EDITABLE_MESSAGE,
  assertCanSubmit,
  isEditable,
} from './daily-report-status';
import { CopyDailyReportDto } from './dto/copy-daily-report.dto';
import { CreateDailyReportDto } from './dto/create-daily-report.dto';
import { QueryDailyReportDto } from './dto/query-daily-report.dto';
import { UpdateDailyReportDto } from './dto/update-daily-report.dto';
import { parseReportDate, weekdayOf } from './report-date';
import { formatTimeOfDay } from './report-time';
import { buildReportSummary, type DailyReportSummary } from './report-summary';
import { assertReadyToSubmit } from './submission-readiness';
import { buildWorkSchedule } from './work-schedule';
import { allocateReportNumber } from './report-number';
import { buildReportSchedule, type ReportSchedule } from './report-schedule';

const listArgs = Prisma.validator<Prisma.DailyReportDefaultArgs>()({
  select: {
    id: true,
    number: true,
    reportDate: true,
    status: true,
    createdAt: true,
    updatedAt: true,
    constructionSite: { select: { id: true, code: true, name: true } },
    createdBy: { select: { id: true, name: true } },
  },
});

/// Ordem das listas dentro do relatório.
///
/// Atividades por `position`, com `createdAt` como desempate: duas atividades
/// podem receber a mesma posição se forem criadas ao mesmo instante, e uma
/// lista sem ordem determinística muda de forma a cada recarga. Aqui o empate
/// é inofensivo (é só ordem de exibição), ao contrário do número do RDO — por
/// isso um desempate resolve, e não é preciso o lock consultivo da numeração.
///
/// Ocorrências por horário, com as sem horário no fim: quem lê o diário lê a
/// linha do tempo do dia, e "chuva durante a tarde" (sem hora) não tem onde se
/// encaixar nela.
const childrenArgs = Prisma.validator<Prisma.DailyReportDefaultArgs>()({
  select: {
    labor: {
      select: { id: true, role: true, quantity: true },
      orderBy: { createdAt: 'asc' },
    },
    equipment: {
      select: { id: true, name: true, quantity: true, notes: true },
      orderBy: { createdAt: 'asc' },
    },
    activities: {
      select: { id: true, description: true, location: true, notes: true, position: true },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    },
    occurrences: {
      select: {
        id: true,
        type: true,
        description: true,
        occurredAtMinutes: true,
        notes: true,
      },
      orderBy: [{ occurredAtMinutes: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    },
    materials: {
      select: {
        id: true,
        name: true,
        quantity: true,
        unit: true,
        movementType: true,
        notes: true,
      },
      orderBy: { createdAt: 'asc' },
    },
    /// Cronológica, como todas as outras listas do RDO. O enunciado admitia
    /// "mais recentes primeiro OU a convenção do projeto", e a do projeto é
    /// esta — um diário se lê na ordem em que o dia aconteceu. Na prática dá no
    /// mesmo para quem acabou de enviar: o botão de adicionar fica no FIM da
    /// grade, então a foto nova aparece exatamente onde o dedo estava.
    ///
    /// `storageKey` NÃO entra na projeção: é detalhe de infraestrutura, e
    /// mandá-lo ao navegador só ensinaria a estrutura interna do bucket a quem
    /// não precisa dela.
    media: {
      select: {
        id: true,
        type: true,
        fileName: true,
        mimeType: true,
        sizeBytes: true,
        width: true,
        height: true,
        durationSeconds: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
    },
  },
});

const detailArgs = Prisma.validator<Prisma.DailyReportDefaultArgs>()({
  select: {
    ...listArgs.select,
    notes: true,
    submittedAt: true,
    submittedBy: { select: { id: true, name: true } },
    workStartMinutes: true,
    workBreakStartMinutes: true,
    workBreakEndMinutes: true,
    workEndMinutes: true,
    scheduleNotes: true,
    morningWeather: true,
    afternoonWeather: true,
    weatherNotes: true,
    constructionSite: { select: diarioSiteSelect },
    copiedFrom: { select: { id: true, number: true, reportDate: true } },
    ...childrenArgs.select,
  },
});

export type DailyReportListItem = Prisma.DailyReportGetPayload<typeof listArgs>;
type DailyReportRow = Prisma.DailyReportGetPayload<typeof detailArgs>;

/// O que a tela do RDO recebe. Tudo já resolvido pelo servidor — dia da
/// semana, rótulo de situação, se pode editar e o prazo da obra. O navegador
/// renderiza; não recalcula nada disso.
export type DailyReportDetail = Omit<
  DailyReportRow,
  'workStartMinutes' | 'workBreakStartMinutes' | 'workBreakEndMinutes' | 'workEndMinutes' | 'media'
> & {
  weekday: string;
  statusLabel: string;
  editable: boolean;
  schedule: ReportSchedule;
  /// Horário de trabalho já em `HH:MM`. O banco guarda minutos porque isso
  /// soma e compara; a resposta fala relógio porque é o que a tela mostra e o
  /// que o `<input type="time">` entende. A conversão acontece aqui, uma vez.
  workSchedule: {
    startTime: string | null;
    breakStartTime: string | null;
    breakEndTime: string | null;
    endTime: string | null;
  };
  /// Contagens derivadas das listas. Nada disso é armazenado — ver
  /// `report-summary.ts`.
  summary: DailyReportSummary;
  /// A mídia chega do banco numa lista só e sai separada por tipo: a tela tem
  /// uma seção para cada, e dividir aqui evita que os dois lados repitam o
  /// mesmo filtro (e discordem no dia em que um terceiro tipo aparecer).
  photos: DailyReportMediaItem[];
  videos: DailyReportMediaItem[];
};

export type DailyReportMediaItem = DailyReportRow['media'][number];

const NOT_FOUND_MESSAGE = 'Relatório não encontrado.';
const DUPLICATE_DATE_MESSAGE = 'Já existe um relatório desta obra para esta data.';

/// Campos que a cópia leva do relatório de origem.
///
/// Lista explícita, e não "tudo menos X": copiar por exclusão significa que
/// todo campo novo passa a ser copiado por omissão, sem ninguém decidir. Aqui
/// um campo só é copiado quando alguém o escreve nesta linha.
///
/// A regra que separa o que entra do que não entra: **copia-se o que descreve
/// o ARRANJO da obra, não o que descreve o DIA.** Jornada, efetivo e
/// equipamentos são o arranjo — na terça o time costuma ser o de segunda, e
/// redigitar tudo todo dia é o que faz o engenheiro desistir do diário. Clima,
/// atividades, ocorrências, materiais e observações gerais são o dia:
/// copiá-los fabricaria fato num documento que é prova contratual.
///
/// `notes` (observações gerais) SAIU da lista. Ela estava aqui desde a etapa
/// em que era o único campo de conteúdo do RDO, e era a única linha ambígua da
/// regra: "equipe trabalhou normalmente durante a manhã", copiada e não
/// revisada, é um fato inventado sobre um dia que ninguém observou.
///
/// Materiais nunca entraram, e não entram: 50 sacos de cimento recebidos no
/// dia 30 não foram recebidos de novo no dia 31.
const COPYABLE_FIELDS = [
  'workStartMinutes',
  'workBreakStartMinutes',
  'workBreakEndMinutes',
  'workEndMinutes',
  'scheduleNotes',
] as const;

/// Violação da unicidade `(obra, data)` — distinta da de `(obra, número)`.
///
/// As duas chegam como P2002 e precisam de tratamentos opostos: data duplicada
/// é erro do usuário (409, "já existe RDO deste dia"), número duplicado é falha
/// da alocação sob lock e deve subir como erro de verdade, não ser convertido
/// numa mensagem amigável que esconderia o defeito.
function isDuplicateReportDate(error: unknown): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') {
    return false;
  }

  // O formato de `meta.target` varia conforme o driver (string com o nome da
  // constraint no adapter `pg`, array de colunas no engine binário), então a
  // checagem cobre os dois em vez de apostar num.
  const target = (error.meta as { target?: string | string[] } | undefined)?.target;
  const texto = Array.isArray(target) ? target.join(',') : (target ?? '');
  return texto.includes('reportDate');
}

/// Relatórios diários.
///
/// Toda leitura e toda escrita passam pelo `SiteAccessService` antes de tocar
/// um relatório — não há caminho por onde um id vindo do cliente alcance uma
/// obra a que a pessoa não está vinculada.
@Injectable()
export class DailyReportsService {
  private readonly logger = new Logger(DailyReportsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly siteAccess: SiteAccessService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  async findAll(
    companyId: string,
    userId: string,
    query: QueryDailyReportDto,
  ): Promise<PaginatedResult<DailyReportListItem>> {
    const { page, limit, siteId, status, dateFrom, dateTo } = query;
    const constructionSiteId = await this.siteAccess.resolveSiteFilter(companyId, userId, siteId);

    // Sem nenhuma obra vinculada não há o que consultar — e um `IN ()` vazio,
    // além de gerar SQL inútil, é o tipo de caso que costuma ser esquecido e
    // vira "lista tudo" numa refatoração distraída.
    if (constructionSiteId.in.length === 0) {
      return paginate([], 0, page, limit);
    }

    const where: Prisma.DailyReportWhereInput = {
      companyId,
      deletedAt: null,
      constructionSiteId,
      status,
      reportDate: this.dateRange(dateFrom, dateTo),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.dailyReport.findMany({
        where,
        ...listArgs,
        orderBy: [{ reportDate: 'desc' }, { number: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.dailyReport.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  /// Os últimos relatórios das obras do usuário, para a Home. Sem paginação de
  /// propósito: é uma prévia, não a listagem.
  async findRecent(
    companyId: string,
    userId: string,
    siteIds: string[],
    take: number,
  ): Promise<DailyReportListItem[]> {
    if (siteIds.length === 0) return [];

    return this.prisma.dailyReport.findMany({
      where: { companyId, deletedAt: null, constructionSiteId: { in: siteIds } },
      ...listArgs,
      orderBy: [{ reportDate: 'desc' }, { number: 'desc' }],
      take,
    });
  }

  /// O acesso é checado pela OBRA do relatório, não pelo autor: um engenheiro
  /// vinculado à obra lê o RDO que o colega escreveu nela, e ninguém lê o RDO
  /// de uma obra que não é sua nem sabendo o UUID.
  async findOne(companyId: string, userId: string, id: string): Promise<DailyReportDetail> {
    return this.toDetail(await this.findRow(companyId, userId, id));
  }

  /// A LINHA do relatório, como está no banco, com o acesso já verificado.
  ///
  /// Existe separada de `findOne` porque a cópia precisa dos campos crus — em
  /// particular os minutos do horário, que `toDetail` troca por `HH:MM` e
  /// remove do objeto. Copiar a partir do detalhe mapeado significava ler
  /// `workStartMinutes` de um objeto que não o tem mais: a jornada saía nula
  /// na cópia, sem erro nenhum, e ninguém percebia até abrir o RDO copiado.
  private async findRow(companyId: string, userId: string, id: string): Promise<DailyReportRow> {
    const report = await this.prisma.dailyReport.findFirst({
      where: { id, companyId, deletedAt: null },
      ...detailArgs,
    });

    if (!report) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }

    await this.assertSiteAccessSilently(companyId, userId, report.constructionSite.id);

    return report;
  }

  /// Checa o vínculo com a obra e, ao negar, responde EXATAMENTE o que um
  /// relatório inexistente responderia.
  ///
  /// Sem isto as duas negativas se distinguem pela mensagem — "Obra não
  /// encontrada ou não vinculada ao seu acesso" só aparece quando o relatório
  /// FOI encontrado, e o texto vira um oráculo: com um token válido, alguém
  /// enumera quais ids de RDO existem na empresa sem conseguir abrir nenhum.
  /// Os dois códigos já eram 404; o que vazava era o texto.
  private async assertSiteAccessSilently(
    companyId: string,
    userId: string,
    siteId: string,
  ): Promise<void> {
    try {
      await this.siteAccess.assertSiteAccess(companyId, userId, siteId);
    } catch {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }
  }

  /// Cria o RDO já no ato em que obra e data são confirmadas — o relatório
  /// nasce em rascunho, com id no banco, e o preenchimento vem depois. É o que
  /// permite ao engenheiro sair do app no meio e voltar sem perder nada.
  async create(
    companyId: string,
    userId: string,
    dto: CreateDailyReportDto,
  ): Promise<DailyReportDetail> {
    const site = await this.siteAccess.assertSiteAccess(companyId, userId, dto.constructionSiteId);
    const reportDate = parseReportDate(dto.reportDate);

    const id = await this.createReport(companyId, userId, site.id, reportDate, {
      notes: dto.notes ?? null,
      copiedFromId: null,
    });

    return this.findOne(companyId, userId, id);
  }

  /// Cria um relatório novo a partir de outro.
  ///
  /// A obra do relatório novo vem do relatório de ORIGEM — nunca do cliente.
  /// Por isso "não copiar RDO de outra obra" não é uma validação que possa ser
  /// esquecida: não existe entrada por onde uma obra de destino chegue. O que
  /// é validado é o acesso à origem, com o mesmo chokepoint de sempre.
  async copy(
    companyId: string,
    userId: string,
    sourceId: string,
    dto: CopyDailyReportDto,
  ): Promise<DailyReportDetail> {
    // A LINHA crua, e não o detalhe mapeado: `toDetail` converte os minutos do
    // horário em `HH:MM` e remove as colunas originais, que são justamente as
    // que `COPYABLE_FIELDS` nomeia.
    const source = await this.findRow(companyId, userId, sourceId);
    const reportDate = parseReportDate(dto.reportDate);

    const copied = Object.fromEntries(
      COPYABLE_FIELDS.map((field) => [field, source[field] ?? null]),
    );

    const id = await this.createReport(companyId, userId, source.constructionSite.id, reportDate, {
      ...copied,
      copiedFromId: source.id,
      // Efetivo e equipamentos vêm junto, criados na MESMA transação do
      // relatório: uma cópia que nascesse sem eles e os recebesse num segundo
      // passo poderia falhar no meio e deixar o RDO pela metade.
      labor: {
        create: source.labor.map((linha) => ({ role: linha.role, quantity: linha.quantity })),
      },
      equipment: {
        create: source.equipment.map((linha) => ({
          name: linha.name,
          quantity: linha.quantity,
          notes: linha.notes,
        })),
      },
    });

    // O relatório de origem não é tocado em nenhum momento: a cópia só lê dele.
    return this.findOne(companyId, userId, id);
  }

  /// Atualização parcial — o endpoint do autosave. Recebe só o que mudou.
  async update(
    companyId: string,
    userId: string,
    id: string,
    dto: UpdateDailyReportDto,
  ): Promise<DailyReportDetail> {
    const atual = await this.assertWritable(companyId, userId, id);

    const data: Prisma.DailyReportUpdateInput = {
      // O horário é validado contra o resultado da junção do que já estava
      // gravado com o que veio no PATCH — um campo isolado não tem como saber
      // que o outro extremo da jornada já existe.
      ...buildWorkSchedule(dto, atual),
    };
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.scheduleNotes !== undefined) data.scheduleNotes = dto.scheduleNotes;
    if (dto.morningWeather !== undefined) data.morningWeather = dto.morningWeather;
    if (dto.afternoonWeather !== undefined) data.afternoonWeather = dto.afternoonWeather;
    if (dto.weatherNotes !== undefined) data.weatherNotes = dto.weatherNotes;

    // PATCH vazio é resposta válida, não erro: o autosave pode disparar com
    // nada de novo (o usuário desfez o que digitou), e responder 400 nesse
    // caso faria a tela mostrar erro sem nada ter dado errado.
    if (Object.keys(data).length > 0) {
      try {
        await this.prisma.dailyReport.update({ where: { id }, data });
      } catch (error) {
        if (isDuplicateReportDate(error)) {
          throw new ConflictException(DUPLICATE_DATE_MESSAGE);
        }
        throw error;
      }
    }

    return this.findOne(companyId, userId, id);
  }

  /// Finaliza o relatório: `DRAFT` -> `SUBMITTED`.
  ///
  /// **Ação de domínio, e não um PATCH de campo.** Finalizar valida
  /// pendências, carimba quem e quando, escreve auditoria e fecha o documento
  /// para sempre; expor isso como `PATCH { status }` convidaria o cliente a
  /// escolher qualquer estado do enum e transformaria a regra num `if` perdido
  /// no meio do salvamento automático.
  ///
  /// **A corrida é fechada pelo próprio UPDATE.** O `where` exige
  /// `status: 'DRAFT'`, então o banco decide quem chega primeiro: se dois
  /// usuários tocarem em "finalizar" ao mesmo tempo, o segundo atualiza zero
  /// linhas e recebe 409. Ler o status antes e escrever depois deixaria uma
  /// janela entre as duas coisas — pequena, mas suficiente para gravar
  /// `submittedAt` duas vezes com autores diferentes.
  ///
  /// A checagem prévia continua existindo porque produz a mensagem certa (e
  /// evita a consulta de pendências num relatório que já está fechado); ela é
  /// conveniência, e a garantia é a cláusula do UPDATE.
  async submit(companyId: string, userId: string, id: string): Promise<DailyReportDetail> {
    const report = await this.findRow(companyId, userId, id);

    assertCanSubmit(report.status);
    assertReadyToSubmit(report);

    const { count } = await this.prisma.dailyReport.updateMany({
      where: { id, companyId, deletedAt: null, status: 'DRAFT' },
      data: { status: 'SUBMITTED', submittedAt: new Date(), submittedById: userId },
    });

    if (count === 0) {
      // Alguém finalizou entre a leitura e a escrita. `assertCanSubmit` com o
      // estado que passou a valer produz a mesma mensagem que o outro usuário
      // veria.
      assertCanSubmit('SUBMITTED');
    }

    // Auditoria pelo mecanismo que o ERP já tem (`AuditLoggerService`), e não
    // por uma tabela nova. `DailyReport` fica de fora da extensão automática
    // do Prisma de propósito: ela registra todo `update`, e o autosave produz
    // um a cada frase digitada — a auditoria viraria ruído e esconderia
    // justamente o evento que importa, que é este.
    await this.auditLogger.log({
      companyId,
      userId,
      action: 'UPDATE',
      entityType: 'DailyReport',
      entityId: id,
      changes: { status: { de: 'DRAFT', para: 'SUBMITTED' } },
    });

    this.logger.log(
      `RDO ${report.number} da obra ${report.constructionSite.id} finalizado por ${userId}.`,
    );

    return this.findOne(companyId, userId, id);
  }

  /// Porta de entrada de TODA escrita no relatório — a dele mesmo e a de
  /// qualquer item filho (mão de obra, equipamentos, atividades, ocorrências).
  ///
  /// Faz as três perguntas na ordem certa: o relatório existe? é de uma obra
  /// vinculada a esta pessoa? ainda está em rascunho? Concentrá-las aqui é o
  /// que garante que uma seção nova, amanhã, não nasça sem uma delas — e o
  /// motivo de nenhum service de item falar com o `SiteAccessService` direto.
  ///
  /// Devolve o horário já gravado porque a validação da jornada precisa dele, e
  /// a obra porque a mídia usa o id dela para montar a chave no storage.
  async assertWritable(
    companyId: string,
    userId: string,
    id: string,
  ): Promise<{
    constructionSiteId: string;
    workStartMinutes: number | null;
    workBreakStartMinutes: number | null;
    workBreakEndMinutes: number | null;
    workEndMinutes: number | null;
  }> {
    const report = await this.prisma.dailyReport.findFirst({
      where: { id, companyId, deletedAt: null },
      select: {
        status: true,
        constructionSiteId: true,
        workStartMinutes: true,
        workBreakStartMinutes: true,
        workBreakEndMinutes: true,
        workEndMinutes: true,
      },
    });

    if (!report) {
      throw new NotFoundException(NOT_FOUND_MESSAGE);
    }

    await this.assertSiteAccessSilently(companyId, userId, report.constructionSiteId);

    if (!isEditable(report.status)) {
      throw new ConflictException(NOT_EDITABLE_MESSAGE);
    }

    return report;
  }

  /// Escrita comum a criar e copiar: uma transação, o número alocado sob lock
  /// e a inserção. Devolve só o id — a leitura completa acontece fora da
  /// transação, para não segurar o lock da obra durante os joins da resposta.
  private async createReport(
    companyId: string,
    userId: string,
    constructionSiteId: string,
    reportDate: Date,
    // Aberto o suficiente para a cópia mandar as listas filhas aninhadas. Os
    // campos que o servidor decide (número, situação, obra, autor) são
    // sobrescritos abaixo e não podem chegar por aqui.
    data: Omit<
      Prisma.DailyReportUncheckedCreateInput,
      'id' | 'companyId' | 'constructionSiteId' | 'number' | 'reportDate' | 'status' | 'createdById'
    >,
  ): Promise<string> {
    return this.prisma.$transaction(async (tx) => {
      const number = await allocateReportNumber(tx, constructionSiteId);

      try {
        const created = await tx.dailyReport.create({
          data: {
            companyId,
            constructionSiteId,
            number,
            reportDate,
            // Todo relatório nasce em rascunho. O status não é aceito do
            // cliente em nenhum endpoint — quem cria não escolhe já finalizado.
            status: 'DRAFT',
            createdById: userId,
            ...data,
          },
          select: { id: true },
        });

        return created.id;
      } catch (error) {
        if (isDuplicateReportDate(error)) {
          throw new ConflictException(DUPLICATE_DATE_MESSAGE);
        }
        // Duplicidade de NÚMERO não vira mensagem amigável: seria uma falha da
        // alocação sob lock, e transformá-la em 409 esconderia o defeito atrás
        // de um texto que culpa o usuário.
        throw error;
      }
    });
  }

  private toDetail(report: DailyReportRow): DailyReportDetail {
    const {
      workStartMinutes,
      workBreakStartMinutes,
      workBreakEndMinutes,
      workEndMinutes,
      media,
      ...resto
    } = report;

    return {
      ...resto,
      weekday: weekdayOf(report.reportDate),
      statusLabel: DAILY_REPORT_STATUS_LABEL[report.status],
      editable: isEditable(report.status),
      schedule: buildReportSchedule(report.constructionSite, report.reportDate),
      workSchedule: {
        startTime: formatTimeOfDay(workStartMinutes),
        breakStartTime: formatTimeOfDay(workBreakStartMinutes),
        breakEndTime: formatTimeOfDay(workBreakEndMinutes),
        endTime: formatTimeOfDay(workEndMinutes),
      },
      summary: buildReportSummary(report),
      photos: media.filter((arquivo) => arquivo.type === 'PHOTO'),
      videos: media.filter((arquivo) => arquivo.type === 'VIDEO'),
    };
  }

  private dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
    if (!from && !to) return undefined;

    return {
      ...(from ? { gte: parseReportDate(from, FAR_FUTURE) } : {}),
      ...(to ? { lte: parseReportDate(to, FAR_FUTURE) } : {}),
    };
  }
}

/// Referência de "hoje" usada só na validação das datas de FILTRO. Filtrar por
/// um período que inclui o futuro é legítimo ("de hoje até o fim do mês"), ao
/// contrário de registrar um relatório numa data futura — por isso o limite de
/// futuro do `parseReportDate` é neutralizado aqui, e apenas aqui.
const FAR_FUTURE = new Date('9999-12-31T00:00:00.000Z');
