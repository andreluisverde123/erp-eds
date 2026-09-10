import { BadRequestException, Injectable } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { inicioDoDia } from '../employee-allocations/allocation-period';
import {
  diasTrabalhados,
  montarChamada,
  type LinhaDaChamada,
} from './attendance-roster';
import { QueryAttendanceDayDto } from './dto/query-attendance-day.dto';
import { QueryAttendanceDto } from './dto/query-attendance.dto';
import { SaveAttendanceDayDto } from './dto/save-attendance-day.dto';

const includeArgs = Prisma.validator<Prisma.EmployeeAttendanceDefaultArgs>()({
  include: {
    employee: { select: { id: true, name: true, cpf: true, position: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
  },
});

export interface ChamadaDoDia {
  constructionSiteId: string;
  date: string;
  rows: LinhaDaChamada[];
}

@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: PrismaService) {}

  /// A chamada de uma obra num dia.
  ///
  /// Os candidatos vêm da ALOCAÇÃO daquela data — nunca do cadastro inteiro da
  /// empresa. Numa obra de vinte pessoas, listar os duzentos funcionários da
  /// construtora transformaria o apontamento numa caça ao nome.
  async day(companyId: string, query: QueryAttendanceDayDto): Promise<ChamadaDoDia> {
    await this.assertConstructionSite(companyId, query.constructionSiteId);
    const dia = inicioDoDia(new Date(query.date));

    // Quem estava alocado nesta obra neste dia: começou até o dia e ainda não
    // tinha terminado nele. Mesma regra de vigência do RH-02 — `endDate` é o
    // último dia, inclusive.
    const alocacoes = await this.prisma.employeeAllocation.findMany({
      where: {
        constructionSiteId: query.constructionSiteId,
        deletedAt: null,
        startDate: { lte: dia },
        OR: [{ endDate: null }, { endDate: { gte: dia } }],
        employee: { companyId, deletedAt: null },
      },
      include: {
        employee: {
          select: { id: true, name: true, position: true, status: true, terminationDate: true },
        },
      },
    });

    const presencas = await this.prisma.employeeAttendance.findMany({
      where: {
        constructionSiteId: query.constructionSiteId,
        date: dia,
        employee: { companyId },
      },
      select: { employeeId: true, present: true },
    });

    return {
      constructionSiteId: query.constructionSiteId,
      date: query.date.slice(0, 10),
      rows: montarChamada(
        alocacoes.map((a) => ({
          employeeId: a.employee.id,
          name: a.employee.name,
          position: a.employee.position,
          status: a.employee.status,
          terminationDate: a.employee.terminationDate,
        })),
        presencas,
        dia,
      ),
    };
  }

  /// Grava a chamada de um dia.
  ///
  /// `upsert` por `(funcionário, dia)`, que é a chave única: salvar o mesmo dia
  /// duas vezes ATUALIZA em vez de duplicar, e dois responsáveis salvando ao
  /// mesmo tempo terminam com uma linha por pessoa — o último a gravar vence,
  /// que é o comportamento previsível aqui. Sem a chave, os dois criariam
  /// registros contraditórios e nada acusaria.
  ///
  /// Tudo numa transação: meio dia apontado é pior que nenhum.
  async saveDay(companyId: string, dto: SaveAttendanceDayDto): Promise<ChamadaDoDia> {
    await this.assertConstructionSite(companyId, dto.constructionSiteId);
    const dia = inicioDoDia(new Date(dto.date));

    const idsInformados = dto.entries.map((e) => e.employeeId);
    if (new Set(idsInformados).size !== idsInformados.length) {
      throw new BadRequestException('O mesmo colaborador aparece duas vezes no apontamento.');
    }

    // Todos precisam ser da empresa da sessão. Uma consulta só, e a diferença
    // de contagem denuncia qualquer id estranho — inclusive de outro inquilino.
    // `compensationType` e `dailyRate` vêm junto porque é o backend, e nunca o
    // cliente, que decide qual diária congelar.
    const doTenant = await this.prisma.employee.findMany({
      where: { id: { in: idsInformados }, companyId, deletedAt: null },
      select: { id: true, compensationType: true, dailyRate: true },
    });
    if (doTenant.length !== idsInformados.length) {
      throw new BadRequestException('Há colaborador inválido no apontamento.');
    }
    const cadastro = new Map(doTenant.map((e) => [e.id, e]));

    // O que JÁ está congelado neste dia. Um snapshot existente nunca é
    // reescrito: é isso que impede um reajuste de diária de mudar o passado.
    const jaGravados = await this.prisma.employeeAttendance.findMany({
      where: { employeeId: { in: idsInformados }, date: dia },
      select: { employeeId: true, dailyRateApplied: true },
    });
    const snapshotExistente = new Map(jaGravados.map((r) => [r.employeeId, r.dailyRateApplied]));

    /// A diária a gravar neste apontamento.
    ///
    /// - Não é diarista → `null`. CLT não tem diária, e um número aqui seria
    ///   lido como verdade pelo custo.
    /// - Já congelada → mantém a que está. O reajuste de hoje não alcança o
    ///   dia de ontem.
    /// - Primeira vez → a diária vigente no cadastro. É o caso de marcar
    ///   presença agora, e também o de ausente que vira presente.
    const diariaDoDia = (employeeId: string): Prisma.Decimal | null => {
      const funcionario = cadastro.get(employeeId)!;
      if (funcionario.compensationType !== 'DAILY') return null;
      return snapshotExistente.get(employeeId) ?? funcionario.dailyRate ?? null;
    };

    await this.prisma.$transaction(
      dto.entries.map((entry) =>
        this.prisma.employeeAttendance.upsert({
          where: { employeeId_date: { employeeId: entry.employeeId, date: dia } },
          // A obra entra na atualização de propósito: corrigir a obra de um
          // apontamento lançado no lugar errado é troca, não linha nova — a
          // chave única não permitiria duas.
          update: {
            present: entry.present,
            notes: entry.notes,
            constructionSiteId: dto.constructionSiteId,
            dailyRateApplied: diariaDoDia(entry.employeeId),
          },
          create: {
            employeeId: entry.employeeId,
            constructionSiteId: dto.constructionSiteId,
            date: dia,
            present: entry.present,
            notes: entry.notes,
            dailyRateApplied: diariaDoDia(entry.employeeId),
          },
        }),
      ),
    );

    return this.day(companyId, { constructionSiteId: dto.constructionSiteId, date: dto.date });
  }

  /// Histórico de presença, paginado.
  async findAll(
    companyId: string,
    query: QueryAttendanceDto,
  ): Promise<PaginatedResult<Prisma.EmployeeAttendanceGetPayload<typeof includeArgs>>> {
    const { page, limit } = query;
    const where = this.buildWhere(companyId, query);

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeAttendance.findMany({
        where,
        ...includeArgs,
        orderBy: { date: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeAttendance.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  /// Quantos dias a pessoa trabalhou no período.
  ///
  /// Endpoint próprio, e não um campo da listagem, porque a listagem é paginada
  /// — somar a página daria um número errado e convincente.
  ///
  /// Devolve CONTAGEM, nada mais. Nenhuma multiplicação por diária acontece
  /// aqui: quanto vale um dia é assunto do RH-04, e a decisão de qual valor
  /// usar ainda não existe.
  async summary(companyId: string, query: QueryAttendanceDto) {
    const registros = await this.prisma.employeeAttendance.findMany({
      where: this.buildWhere(companyId, query),
      select: { date: true, present: true },
    });

    return {
      daysPresent: diasTrabalhados(registros),
      daysAbsent: registros.filter((r) => !r.present).length,
      daysRecorded: registros.length,
    };
  }

  private buildWhere(
    companyId: string,
    query: QueryAttendanceDto,
  ): Prisma.EmployeeAttendanceWhereInput {
    const { employeeId, constructionSiteId, from, to, present } = query;

    return {
      employeeId,
      constructionSiteId,
      // O isolamento nunca vem do cliente: sai da sessão e é aplicado por
      // relação, como no resto do RH.
      employee: { companyId },
      present: present === undefined ? undefined : present === 'true',
      date:
        from || to
          ? {
              gte: from ? inicioDoDia(new Date(from)) : undefined,
              lte: to ? inicioDoDia(new Date(to)) : undefined,
            }
          : undefined,
    };
  }

  private async assertConstructionSite(companyId: string, constructionSiteId: string) {
    const site = await this.prisma.constructionSite.findFirst({
      where: { id: constructionSiteId, companyId, deletedAt: null },
    });
    if (!site) {
      throw new BadRequestException('Obra informada não existe.');
    }
  }
}
