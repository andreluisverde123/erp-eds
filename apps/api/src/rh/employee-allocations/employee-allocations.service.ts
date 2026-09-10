import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import {
  diaAnterior,
  fimAntesDoInicio,
  inicioDoDia,
  primeiroConflito,
  type Periodo,
} from './allocation-period';
import { CreateEmployeeAllocationDto } from './dto/create-employee-allocation.dto';
import { QueryEmployeeAllocationDto } from './dto/query-employee-allocation.dto';
import { TransferEmployeeDto } from './dto/transfer-employee.dto';
import { UpdateEmployeeAllocationDto } from './dto/update-employee-allocation.dto';

/// Formato de dia usado nas mensagens de conflito. Sem `Intl`, pelo mesmo
/// motivo do RDO: a saída depende dos dados de ICU do Node e varia entre a
/// imagem do contêiner e a máquina de quem desenvolve.
function diaLegivel(data: Date): string {
  const d = inicioDoDia(data);
  const dois = (n: number) => String(n).padStart(2, '0');
  return `${dois(d.getUTCDate())}/${dois(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
}

const includeArgs = Prisma.validator<Prisma.EmployeeAllocationDefaultArgs>()({
  include: {
    employee: { select: { id: true, name: true, cpf: true, position: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
    costCenter: { select: { id: true, code: true, name: true } },
  },
});

/// Traduz os filtros de data da consulta para um `where` do Prisma.
///
/// A pergunta é "quem esteve nesta obra entre tais dias", e a resposta são as
/// alocações que TOCAM o intervalo — não as contidas nele. Quem entrou em
/// agosto e continua até hoje aparece numa consulta de setembro, que é o
/// esperado por quem pergunta.
///
/// Em intervalos: `alocacao.inicio <= to && (alocacao.fim == null || alocacao.fim >= from)`.
function periodoDaConsulta(query: QueryEmployeeAllocationDto): Prisma.EmployeeAllocationWhereInput {
  const from = query.onDate ?? query.from;
  const to = query.onDate ?? query.to;

  const where: Prisma.EmployeeAllocationWhereInput = {};

  if (to) {
    where.startDate = { lte: inicioDoDia(new Date(to)) };
  }
  if (from) {
    // O `OR` é o que faz a alocação em aberto entrar: sem `endDate`, ela vale
    // de `startDate` em diante e cobre qualquer intervalo futuro.
    const limite = inicioDoDia(new Date(from));
    where.OR = [{ endDate: null }, { endDate: { gte: limite } }];
  }

  return where;
}

@Injectable()
export class EmployeeAllocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateEmployeeAllocationDto) {
    await this.assertEmployee(companyId, dto.employeeId);
    await this.assertConstructionContext(companyId, dto.constructionSiteId, dto.costCenterId);

    const periodo: Periodo = {
      inicio: new Date(dto.startDate),
      fim: dto.endDate ? new Date(dto.endDate) : null,
    };
    this.assertPeriodoValido(periodo);

    // A verificação de sobreposição e a escrita precisam ser atômicas. Sem
    // isso, dois pedidos simultâneos para o mesmo colaborador leem o mesmo
    // "não há conflito" e gravam os dois — a invariável cai justamente na
    // situação que ela existe para impedir.
    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, dto.employeeId);
      await this.assertSemSobreposicao(tx, dto.employeeId, periodo);

      return tx.employeeAllocation.create({
        data: {
          employeeId: dto.employeeId,
          constructionSiteId: dto.constructionSiteId,
          costCenterId: dto.costCenterId,
          startDate: periodo.inicio,
          endDate: periodo.fim ?? undefined,
        },
      });
    });

    return this.findOne(companyId, created.id);
  }

  /// Transferência de obra.
  ///
  /// Uma operação, e não "encerre aquela e crie esta" na mão do usuário: feito
  /// em dois pedidos, a falha do segundo deixa o colaborador sem obra nenhuma,
  /// e nada avisa. Aqui as duas escritas vivem na mesma transação e sob a mesma
  /// trava — ou as duas acontecem, ou nenhuma.
  ///
  /// O histórico é preservado por construção: a alocação anterior é ENCERRADA
  /// (ganha `endDate`), nunca alterada de obra nem removida.
  async transfer(companyId: string, dto: TransferEmployeeDto) {
    await this.assertEmployee(companyId, dto.employeeId);
    await this.assertConstructionContext(companyId, dto.constructionSiteId, dto.costCenterId);

    const inicio = inicioDoDia(new Date(dto.date));

    const created = await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, dto.employeeId);

      // A alocação de origem é a que cobre a véspera da transferência — e não
      // "a mais recente": transferir para uma data passada, corrigindo um
      // lançamento, tem de encerrar a alocação daquele momento.
      const vespera = diaAnterior(inicio);
      const anterior = await tx.employeeAllocation.findFirst({
        where: {
          employeeId: dto.employeeId,
          deletedAt: null,
          startDate: { lte: vespera },
          OR: [{ endDate: null }, { endDate: { gte: vespera } }],
        },
        orderBy: { startDate: 'desc' },
      });

      if (anterior) {
        await tx.employeeAllocation.update({
          where: { id: anterior.id },
          data: { endDate: vespera },
        });
      }

      // Conferida DEPOIS de encerrar a anterior, e de propósito: sem isso a
      // própria alocação de origem, ainda aberta, apareceria como conflito da
      // nova. Qualquer OUTRA sobreposição continua sendo recusada, e a
      // transação desfaz o encerramento junto.
      await this.assertSemSobreposicao(tx, dto.employeeId, { inicio, fim: null });

      return tx.employeeAllocation.create({
        data: {
          employeeId: dto.employeeId,
          constructionSiteId: dto.constructionSiteId,
          costCenterId: dto.costCenterId,
          startDate: inicio,
        },
      });
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryEmployeeAllocationDto,
  ): Promise<PaginatedResult<Prisma.EmployeeAllocationGetPayload<typeof includeArgs>>> {
    const { page, limit, employeeId, constructionSiteId } = query;

    const where: Prisma.EmployeeAllocationWhereInput = {
      deletedAt: null,
      employeeId,
      constructionSiteId,
      employee: { companyId },
      ...periodoDaConsulta(query),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employeeAllocation.findMany({
        where,
        ...includeArgs,
        orderBy: { startDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employeeAllocation.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const allocation = await this.prisma.employeeAllocation.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
      ...includeArgs,
    });

    if (!allocation) {
      throw new NotFoundException('Alocação não encontrada.');
    }

    return allocation;
  }

  async update(companyId: string, id: string, dto: UpdateEmployeeAllocationDto) {
    const existing = await this.assertExists(companyId, id);

    if (dto.costCenterId !== undefined) {
      await this.assertConstructionContext(
        companyId,
        existing.constructionSiteId,
        dto.costCenterId,
      );
    }

    // O período efetivo combina o que veio no PATCH com o que já está gravado:
    // mexer só na data de início pode criar sobreposição tanto quanto trocar as
    // duas, e reabrir uma alocação encerrada (`endDate: null`) mais ainda.
    const periodo: Periodo = {
      inicio: dto.startDate ? new Date(dto.startDate) : existing.startDate,
      fim: dto.endDate !== undefined ? (dto.endDate ? new Date(dto.endDate) : null) : existing.endDate,
    };
    this.assertPeriodoValido(periodo);

    await this.prisma.$transaction(async (tx) => {
      await this.lockEmployee(tx, existing.employeeId);
      // A própria alocação fica de fora da conferência — ela sempre se sobrepõe
      // a si mesma.
      await this.assertSemSobreposicao(tx, existing.employeeId, periodo, id);

      await tx.employeeAllocation.update({
        where: { id },
        data: {
          costCenterId: dto.costCenterId,
          startDate: dto.startDate ? new Date(dto.startDate) : undefined,
          endDate:
            dto.endDate !== undefined ? (dto.endDate ? new Date(dto.endDate) : null) : undefined,
        },
      });
    });

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.employeeAllocation.update({
      where: { id, employee: { companyId } },
      data: { deletedAt: new Date() },
    });
  }

  /// O funcionário existe, é desta empresa e está em atividade.
  ///
  /// O filtro por `companyId` é o que impede alocar alguém de outra empresa: um
  /// id válido de outro inquilino simplesmente não é encontrado.
  private async assertEmployee(companyId: string, employeeId: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, companyId, deletedAt: null },
      select: { status: true },
    });
    if (!employee) {
      throw new BadRequestException('Funcionário informado não existe.');
    }

    // Desligado não recebe alocação nova. O histórico dele continua intacto —
    // inativar não encerra nem apaga alocação nenhuma (ver RH_02_RESULT.md).
    if (employee.status === 'TERMINATED') {
      throw new BadRequestException(
        'Funcionário desligado não pode receber uma nova alocação. Reative o cadastro antes.',
      );
    }
  }

  private async assertConstructionContext(
    companyId: string,
    constructionSiteId: string,
    costCenterId?: string,
  ) {
    const constructionSite = await this.prisma.constructionSite.findFirst({
      where: { id: constructionSiteId, companyId, deletedAt: null },
    });
    if (!constructionSite) {
      throw new BadRequestException('Obra informada não existe.');
    }

    if (!costCenterId) return;

    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id: costCenterId, companyId, deletedAt: null },
      select: { constructionSiteId: true },
    });

    if (!costCenter) {
      throw new BadRequestException('Centro de custo informado não existe.');
    }

    if (costCenter.constructionSiteId !== constructionSiteId) {
      throw new BadRequestException('O centro de custo informado não pertence à obra selecionada.');
    }
  }

  private assertPeriodoValido(periodo: Periodo) {
    if (fimAntesDoInicio(periodo)) {
      throw new BadRequestException('A data de fim não pode ser anterior à data de início.');
    }
  }

  /// Trava a LINHA DO FUNCIONÁRIO enquanto a transação decide.
  ///
  /// Mesmo mecanismo do saldo da solicitação de compra: `FOR UPDATE` sem
  /// `NOWAIT`, então o segundo pedido espera o primeiro terminar e aí lê o
  /// estado já atualizado — que é como ele descobre que a obra mudou. É o
  /// funcionário, e não a obra, porque a invariável é "esta PESSOA não está em
  /// dois lugares ao mesmo tempo".
  private async lockEmployee(tx: Prisma.TransactionClient, employeeId: string) {
    await tx.$queryRaw`SELECT id FROM "Employee" WHERE id = ${employeeId}::uuid FOR UPDATE`;
  }

  /// A invariável central do RH-02: um colaborador não ocupa duas obras no
  /// mesmo dia.
  ///
  /// Carrega as alocações do funcionário e compara em memória, em vez de
  /// montar o intervalo em SQL. São poucas linhas por pessoa, o `endDate` nulo
  /// vira um caso especial ilegível em SQL, e a comparação passa a ser a MESMA
  /// função que os testes exercitam sem banco.
  private async assertSemSobreposicao(
    tx: Prisma.TransactionClient,
    employeeId: string,
    periodo: Periodo,
    ignorarId?: string,
  ) {
    const existentes = await tx.employeeAllocation.findMany({
      where: {
        employeeId,
        deletedAt: null,
        id: ignorarId ? { not: ignorarId } : undefined,
      },
      include: { constructionSite: { select: { name: true } } },
    });

    const conflito = primeiroConflito(
      periodo,
      existentes.map((a) => ({ inicio: a.startDate, fim: a.endDate, alocacao: a })),
    );
    if (!conflito) return;

    const { alocacao } = conflito;
    const fim = alocacao.endDate ? diaLegivel(alocacao.endDate) : 'em aberto';
    throw new ConflictException(
      `Período conflita com a alocação na obra "${alocacao.constructionSite.name}" ` +
        `(${diaLegivel(alocacao.startDate)} → ${fim}). Encerre-a antes, ou use a transferência.`,
    );
  }

  private async assertExists(companyId: string, id: string) {
    const allocation = await this.prisma.employeeAllocation.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
    });
    if (!allocation) {
      throw new NotFoundException('Alocação não encontrada.');
    }
    return allocation;
  }
}
