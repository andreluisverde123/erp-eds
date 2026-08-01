import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { isUniqueConstraintError } from '../../common/utils/prisma-error.util';
import { UploadPolicyService } from '../../common/uploads/upload-policy.service';
import { StorageService } from '../../storage/storage.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { QueryPayslipDto } from './dto/query-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';

const DUPLICATE_MESSAGE = 'Já existe um holerite deste funcionário para esta competência.';

/// Anexo do PDF é feito via o model genérico `Attachment` (não um FK direto
/// em Payslip), seguindo o mesmo padrão polimórfico já usado no resto do
/// sistema — `entityType` fixo identifica a origem.
const ATTACHMENT_ENTITY_TYPE = 'Payslip';

type PayslipStatus = 'PENDING' | 'PAID';

export interface AttachmentSummary {
  id: string;
  fileName: string;
  fileUrl: string;
}

function withStatus<T extends { paidAt: Date | null }>(payslip: T): T & { status: PayslipStatus } {
  return { ...payslip, status: payslip.paidAt ? 'PAID' : 'PENDING' };
}

const includeArgs = Prisma.validator<Prisma.PayslipDefaultArgs>()({
  include: { employee: { select: { id: true, name: true, cpf: true } } },
});

@Injectable()
export class PayslipsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly uploadPolicy: UploadPolicyService,
  ) {}

  async create(companyId: string, dto: CreatePayslipDto) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, companyId, deletedAt: null },
    });
    if (!employee) {
      throw new BadRequestException('Funcionário informado não existe.');
    }

    try {
      const created = await this.prisma.payslip.create({
        data: {
          employeeId: dto.employeeId,
          referenceYear: dto.referenceYear,
          referenceMonth: dto.referenceMonth,
          grossSalary: dto.grossSalary,
          deductions: dto.deductions,
          netSalary: dto.netSalary,
        },
      });
      return this.findOne(companyId, created.id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_MESSAGE);
      }
      throw error;
    }
  }

  async findAll(
    companyId: string,
    query: QueryPayslipDto,
  ): Promise<
    PaginatedResult<ReturnType<typeof withStatus> & { attachment: AttachmentSummary | null }>
  > {
    const { page, limit, search, employeeId, referenceYear, referenceMonth } = query;

    const where: Prisma.PayslipWhereInput = {
      deletedAt: null,
      employeeId,
      referenceYear,
      referenceMonth,
      employee: {
        companyId,
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { cpf: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.payslip.findMany({
        where,
        ...includeArgs,
        orderBy: [{ referenceYear: 'desc' }, { referenceMonth: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.payslip.count({ where }),
    ]);

    const attachments = await this.loadAttachments(
      companyId,
      data.map((payslip) => payslip.id),
    );

    return paginate(
      data.map((payslip) => ({
        ...withStatus(payslip),
        attachment: attachments.get(payslip.id) ?? null,
      })),
      total,
      page,
      limit,
    );
  }

  async findOne(companyId: string, id: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
      ...includeArgs,
    });

    if (!payslip) {
      throw new NotFoundException('Holerite não encontrado.');
    }

    const attachments = await this.loadAttachments(companyId, [payslip.id]);
    return { ...withStatus(payslip), attachment: attachments.get(payslip.id) ?? null };
  }

  async update(companyId: string, id: string, dto: UpdatePayslipDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.paidAt) {
      throw new ConflictException('Não é possível editar um holerite já marcado como pago.');
    }

    try {
      await this.prisma.payslip.update({
        where: { id, employee: { companyId } },
        data: {
          referenceYear: dto.referenceYear,
          referenceMonth: dto.referenceMonth,
          grossSalary: dto.grossSalary,
          deductions: dto.deductions,
          netSalary: dto.netSalary,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : undefined,
        },
      });
      return this.findOne(companyId, id);
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_MESSAGE);
      }
      throw error;
    }
  }

  async attachFile(companyId: string, id: string, file: Express.Multer.File, uploadedById: string) {
    await this.assertExists(companyId, id);

    await this.uploadPolicy.assertUploadAllowed(companyId, file);

    // Grava primeiro: se o storage falhar, o banco não fica com um anexo
    // apontando para um arquivo que não existe.
    const { fileUrl } = await this.storage.saveUpload('payslips', file);

    await this.prisma.attachment.updateMany({
      where: { companyId, entityType: ATTACHMENT_ENTITY_TYPE, entityId: id, deletedAt: null },
      data: { deletedAt: new Date() },
    });

    await this.prisma.attachment.create({
      data: {
        companyId,
        entityType: ATTACHMENT_ENTITY_TYPE,
        entityId: id,
        fileName: file.originalname,
        fileUrl,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        uploadedById,
      },
    });

    return this.findOne(companyId, id);
  }

  // Soft delete permanente aqui: a chave única (employeeId, referenceYear,
  // referenceMonth) não é um código de texto, então `mangleDeletedCode` não
  // se aplica — recriar a mesma competência exige limpar o registro antigo.
  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.payslip.update({
      where: { id, employee: { companyId } },
      data: { deletedAt: new Date() },
    });
  }

  private async loadAttachments(
    companyId: string,
    payslipIds: string[],
  ): Promise<Map<string, AttachmentSummary>> {
    const map = new Map<string, AttachmentSummary>();
    if (payslipIds.length === 0) return map;

    const attachments = await this.prisma.attachment.findMany({
      where: {
        companyId,
        entityType: ATTACHMENT_ENTITY_TYPE,
        entityId: { in: payslipIds },
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, entityId: true, fileName: true, fileUrl: true },
    });

    for (const attachment of attachments) {
      if (!map.has(attachment.entityId)) {
        map.set(attachment.entityId, {
          id: attachment.id,
          fileName: attachment.fileName,
          fileUrl: attachment.fileUrl,
        });
      }
    }
    return map;
  }

  private async assertExists(companyId: string, id: string) {
    const payslip = await this.prisma.payslip.findFirst({
      where: { id, deletedAt: null, employee: { companyId } },
    });
    if (!payslip) {
      throw new NotFoundException('Holerite não encontrado.');
    }
    return payslip;
  }
}
