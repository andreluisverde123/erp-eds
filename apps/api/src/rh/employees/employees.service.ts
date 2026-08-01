import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { mangleDeletedCode } from '../../common/utils/soft-delete.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateEmployeeDto } from './dto/create-employee.dto';
import { QueryEmployeeDto } from './dto/query-employee.dto';
import { UpdateEmployeeDto } from './dto/update-employee.dto';

const DUPLICATE_CPF_MESSAGE = 'Já existe um funcionário com este CPF.';

const currentAllocationArgs = Prisma.validator<Prisma.EmployeeAllocationDefaultArgs>()({
  include: { constructionSite: { select: { id: true, code: true, name: true } } },
});

type EmployeeWithAllocations = Prisma.EmployeeGetPayload<object> & {
  allocations: Prisma.EmployeeAllocationGetPayload<typeof currentAllocationArgs>[];
};

/// A "obra atual" de um funcionário é derivada (não é um campo de banco):
/// a alocação mais recente sem data fim ou com data fim futura.
function withCurrentAllocation(employee: EmployeeWithAllocations) {
  const { allocations, ...rest } = employee;
  return { ...rest, currentAllocation: allocations[0] ?? null };
}

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateEmployeeDto) {
    try {
      const created = await this.prisma.employee.create({
        data: {
          companyId,
          name: dto.name,
          cpf: dto.cpf,
          position: dto.position,
          hireDate: new Date(dto.hireDate),
          terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : undefined,
          baseSalary: dto.baseSalary,
        },
      });
      return this.findOne(companyId, created.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_CPF_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryEmployeeDto,
  ): Promise<PaginatedResult<ReturnType<typeof withCurrentAllocation>>> {
    const { page, limit, search, status, position, constructionSiteId } = query;
    const today = new Date();

    const where: Prisma.EmployeeWhereInput = {
      companyId,
      deletedAt: null,
      status,
      position,
      allocations: constructionSiteId
        ? {
            some: {
              constructionSiteId,
              deletedAt: null,
              OR: [{ endDate: null }, { endDate: { gte: today } }],
            },
          }
        : undefined,
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { cpf: { contains: search, mode: 'insensitive' } },
            { position: { contains: search, mode: 'insensitive' } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({
        where,
        include: {
          allocations: {
            where: { deletedAt: null, OR: [{ endDate: null }, { endDate: { gte: today } }] },
            orderBy: { startDate: 'desc' },
            take: 1,
            ...currentAllocationArgs,
          },
        },
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.employee.count({ where }),
    ]);

    return paginate(data.map(withCurrentAllocation), total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const today = new Date();
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
      include: {
        allocations: {
          where: { deletedAt: null, OR: [{ endDate: null }, { endDate: { gte: today } }] },
          orderBy: { startDate: 'desc' },
          take: 1,
          ...currentAllocationArgs,
        },
      },
    });

    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado.');
    }

    return withCurrentAllocation(employee);
  }

  /// Valores distintos de cargo já cadastrados — alimenta o filtro "Cargo"
  /// no frontend sem precisar de uma lista fixa.
  async positions(companyId: string): Promise<string[]> {
    const rows = await this.prisma.employee.findMany({
      where: { companyId, deletedAt: null },
      distinct: ['position'],
      select: { position: true },
      orderBy: { position: 'asc' },
    });
    return rows.map((row) => row.position);
  }

  async update(companyId: string, id: string, dto: UpdateEmployeeDto) {
    await this.assertExists(companyId, id);

    try {
      await this.prisma.employee.update({
        where: { id, companyId },
        data: {
          name: dto.name,
          cpf: dto.cpf,
          position: dto.position,
          status: dto.status,
          hireDate: dto.hireDate ? new Date(dto.hireDate) : undefined,
          terminationDate: dto.terminationDate ? new Date(dto.terminationDate) : undefined,
          baseSalary: dto.baseSalary,
        },
      });
      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_CPF_MESSAGE);
      }
      throw error;
    }
  }

  async remove(companyId: string, id: string): Promise<void> {
    const employee = await this.assertExists(companyId, id);
    await this.prisma.employee.update({
      where: { id, companyId },
      data: { deletedAt: new Date(), cpf: mangleDeletedCode(employee.cpf, employee.id) },
    });
  }

  private async assertExists(companyId: string, id: string) {
    const employee = await this.prisma.employee.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!employee) {
      throw new NotFoundException('Funcionário não encontrado.');
    }
    return employee;
  }
}
