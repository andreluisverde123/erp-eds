import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractEmployeeDto } from './dto/create-contract-employee.dto';
import { QueryContractEmployeeDto } from './dto/query-contract-employee.dto';
import { UpdateContractEmployeeDto } from './dto/update-contract-employee.dto';

const includeArgs = Prisma.validator<Prisma.ContractEmployeeDefaultArgs>()({
  include: {
    contract: {
      select: {
        id: true,
        code: true,
        contractor: { select: { id: true, legalName: true, tradeName: true } },
        constructionSite: { select: { id: true, code: true, name: true } },
      },
    },
  },
});

@Injectable()
export class ContractEmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async create(companyId: string, dto: CreateContractEmployeeDto) {
    await this.assertContract(companyId, dto.contractId);

    const created = await this.prisma.contractEmployee.create({
      data: {
        contractId: dto.contractId,
        name: dto.name,
        role: dto.role,
        isActive: dto.isActive,
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryContractEmployeeDto,
  ): Promise<PaginatedResult<Prisma.ContractEmployeeGetPayload<typeof includeArgs>>> {
    const { page, limit, search, contractId, contractorId, constructionSiteId, status } = query;

    const where: Prisma.ContractEmployeeWhereInput = {
      deletedAt: null,
      contractId,
      isActive: status === 'ACTIVE' ? true : status === 'INACTIVE' ? false : undefined,
      contract: { companyId, contractorId, constructionSiteId },
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { contract: { contractor: { legalName: { contains: search, mode: 'insensitive' } } } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contractEmployee.findMany({
        where,
        ...includeArgs,
        orderBy: { name: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contractEmployee.count({ where }),
    ]);

    return paginate(data, total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const employee = await this.prisma.contractEmployee.findFirst({
      where: { id, deletedAt: null, contract: { companyId } },
      ...includeArgs,
    });
    if (!employee) {
      throw new NotFoundException('Funcionário terceirizado não encontrado.');
    }
    return employee;
  }

  async update(companyId: string, id: string, dto: UpdateContractEmployeeDto) {
    await this.assertExists(companyId, id);

    await this.prisma.contractEmployee.update({
      where: { id, contract: { companyId } },
      data: { name: dto.name, role: dto.role, isActive: dto.isActive },
    });

    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.contractEmployee.update({
      where: { id, contract: { companyId } },
      data: { deletedAt: new Date() },
    });
  }

  private async assertContract(companyId: string, contractId: string) {
    const contract = await this.prisma.contractorContract.findFirst({
      where: { id: contractId, companyId, deletedAt: null },
    });
    if (!contract) {
      throw new BadRequestException('Contrato informado não existe.');
    }
  }

  private async assertExists(companyId: string, id: string) {
    const employee = await this.prisma.contractEmployee.findFirst({
      where: { id, deletedAt: null, contract: { companyId } },
    });
    if (!employee) {
      throw new NotFoundException('Funcionário terceirizado não encontrado.');
    }
    return employee;
  }
}
