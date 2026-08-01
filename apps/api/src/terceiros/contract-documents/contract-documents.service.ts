import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { addDays, startOfDay } from '../../common/utils/date.util';
import { UploadPolicyService } from '../../common/uploads/upload-policy.service';
import { StorageService } from '../../storage/storage.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContractDocumentDto } from './dto/create-contract-document.dto';
import { QueryContractDocumentDto } from './dto/query-contract-document.dto';
import { UpdateContractDocumentDto } from './dto/update-contract-document.dto';
import { computeDocumentBadge, DOCUMENT_EXPIRING_WINDOW_DAYS } from './document-status.util';

/// Anexo do documento reaproveita o model genérico `Attachment` (mesmo
/// padrão do holerite em RH) — `entityType` fixo identifica a origem.
const ATTACHMENT_ENTITY_TYPE = 'ContractDocument';

export interface AttachmentSummary {
  id: string;
  fileName: string;
  fileUrl: string;
}

const includeArgs = Prisma.validator<Prisma.ContractDocumentDefaultArgs>()({
  include: {
    contract: {
      select: {
        id: true,
        code: true,
        contractor: { select: { id: true, legalName: true, tradeName: true } },
      },
    },
  },
});

type DocumentWithContract = Prisma.ContractDocumentGetPayload<typeof includeArgs>;

function withBadge(document: DocumentWithContract) {
  return { ...document, badgeStatus: computeDocumentBadge(document.expiresAt) };
}

@Injectable()
export class ContractDocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly uploadPolicy: UploadPolicyService,
  ) {}

  async create(companyId: string, dto: CreateContractDocumentDto) {
    await this.assertContract(companyId, dto.contractId);

    const created = await this.prisma.contractDocument.create({
      data: {
        contractId: dto.contractId,
        name: dto.name,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiresAt: new Date(dto.expiresAt),
      },
    });

    return this.findOne(companyId, created.id);
  }

  async findAll(
    companyId: string,
    query: QueryContractDocumentDto,
  ): Promise<
    PaginatedResult<ReturnType<typeof withBadge> & { attachment: AttachmentSummary | null }>
  > {
    const { page, limit, search, contractId, contractorId, badgeStatus } = query;
    const today = startOfDay(new Date());

    const where: Prisma.ContractDocumentWhereInput = {
      deletedAt: null,
      contractId,
      contract: { companyId, contractorId },
      OR: search
        ? [
            { name: { contains: search, mode: 'insensitive' } },
            { contract: { contractor: { legalName: { contains: search, mode: 'insensitive' } } } },
          ]
        : undefined,
    };

    if (badgeStatus === 'EXPIRED') {
      where.expiresAt = { lt: today };
    } else if (badgeStatus === 'EXPIRING') {
      where.expiresAt = { gte: today, lte: addDays(today, DOCUMENT_EXPIRING_WINDOW_DAYS) };
    } else if (badgeStatus === 'VALID') {
      where.expiresAt = { gt: addDays(today, DOCUMENT_EXPIRING_WINDOW_DAYS) };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.contractDocument.findMany({
        where,
        ...includeArgs,
        orderBy: { expiresAt: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.contractDocument.count({ where }),
    ]);

    const attachments = await this.loadAttachments(
      companyId,
      data.map((document) => document.id),
    );

    return paginate(
      data.map((document) => ({
        ...withBadge(document),
        attachment: attachments.get(document.id) ?? null,
      })),
      total,
      page,
      limit,
    );
  }

  async findOne(companyId: string, id: string) {
    const document = await this.prisma.contractDocument.findFirst({
      where: { id, deletedAt: null, contract: { companyId } },
      ...includeArgs,
    });
    if (!document) {
      throw new NotFoundException('Documento não encontrado.');
    }

    const attachments = await this.loadAttachments(companyId, [document.id]);
    return { ...withBadge(document), attachment: attachments.get(document.id) ?? null };
  }

  async update(companyId: string, id: string, dto: UpdateContractDocumentDto) {
    await this.assertExists(companyId, id);

    await this.prisma.contractDocument.update({
      where: { id, contract: { companyId } },
      data: {
        name: dto.name,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
      },
    });

    return this.findOne(companyId, id);
  }

  async attachFile(companyId: string, id: string, file: Express.Multer.File, uploadedById: string) {
    await this.uploadPolicy.assertUploadAllowed(companyId, file);
    const { fileUrl } = await this.storage.saveUpload('contract-documents', file);
    await this.assertExists(companyId, id);

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

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.contractDocument.update({
      where: { id, contract: { companyId } },
      data: { deletedAt: new Date() },
    });
  }

  /// Alimenta os alertas de documentos vencidos/próximos do vencimento na
  /// própria tela de Documentação.
  async getExpiringSummary(companyId: string) {
    const today = startOfDay(new Date());
    const windowEnd = addDays(today, DOCUMENT_EXPIRING_WINDOW_DAYS);

    const [expiredCount, expiringCount] = await this.prisma.$transaction([
      this.prisma.contractDocument.count({
        where: { deletedAt: null, contract: { companyId }, expiresAt: { lt: today } },
      }),
      this.prisma.contractDocument.count({
        where: {
          deletedAt: null,
          contract: { companyId },
          expiresAt: { gte: today, lte: windowEnd },
        },
      }),
    ]);

    return { expiredCount, expiringCount };
  }

  private async loadAttachments(
    companyId: string,
    documentIds: string[],
  ): Promise<Map<string, AttachmentSummary>> {
    const map = new Map<string, AttachmentSummary>();
    if (documentIds.length === 0) return map;

    const attachments = await this.prisma.attachment.findMany({
      where: {
        companyId,
        entityType: ATTACHMENT_ENTITY_TYPE,
        entityId: { in: documentIds },
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

  private async assertContract(companyId: string, contractId: string) {
    const contract = await this.prisma.contractorContract.findFirst({
      where: { id: contractId, companyId, deletedAt: null },
    });
    if (!contract) {
      throw new BadRequestException('Contrato informado não existe.');
    }
  }

  private async assertExists(companyId: string, id: string) {
    const document = await this.prisma.contractDocument.findFirst({
      where: { id, deletedAt: null, contract: { companyId } },
    });
    if (!document) {
      throw new NotFoundException('Documento não encontrado.');
    }
    return document;
  }
}
