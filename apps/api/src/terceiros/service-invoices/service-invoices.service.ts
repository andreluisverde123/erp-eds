import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma } from '../../../generated/prisma/client';
import { AttachmentsService } from '../../attachments/attachments.service';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { onlyDigits } from '../../common/utils/document.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateServiceInvoiceDto } from './dto/create-service-invoice.dto';
import { QueryServiceInvoiceDto } from './dto/query-service-invoice.dto';
import {
  situationOf,
  whereForSituation,
  type ServiceInvoiceSituation,
} from './service-invoice-situation';

const rowArgs = Prisma.validator<Prisma.AccountPayableDefaultArgs>()({
  select: {
    id: true,
    documentNumber: true,
    description: true,
    notes: true,
    amount: true,
    issueDate: true,
    dueDate: true,
    status: true,
    createdAt: true,
    approvedForPaymentAt: true,
    approvedForPaymentBy: { select: { id: true, name: true } },
    launchedBy: { select: { id: true, name: true } },
    contractor: { select: { id: true, legalName: true, tradeName: true, document: true } },
    costCenter: { select: { id: true, code: true, name: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
  },
});

type Row = Prisma.AccountPayableGetPayload<typeof rowArgs>;

export type ServiceInvoice = Omit<Row, 'status'> & {
  situation: ServiceInvoiceSituation;
  attachmentsCount: number;
};

/// NOTAS DE SERVIÇO DE TERCEIRIZADO — pedido do cliente: "quem lança
/// terceirizado e nota é a engenharia (nós que contratamos); o financeiro só
/// vai pagar o que foi autorizado".
///
/// A nota vira uma conta a pagar COMUM (origem MANUAL), com o terceirizado e
/// quem lançou. Por isso cai sozinha na Programação de Pagamentos, onde o
/// responsável libera e o Financeiro paga — nenhum fluxo novo no Financeiro.
///
/// O recorte de acesso é o ponto: a Engenharia (`terceiros.*`) enxerga e mexe
/// SÓ nas contas com `contractorId` (as notas de serviço), nunca nas demais
/// contas da empresa. Todas as consultas daqui carregam esse filtro.
@Injectable()
export class ServiceInvoicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
  ) {}

  async findAll(
    companyId: string,
    query: QueryServiceInvoiceDto,
  ): Promise<PaginatedResult<ServiceInvoice>> {
    const { page, limit, search, contractorId, situation } = query;

    const where: Prisma.AccountPayableWhereInput = {
      companyId,
      deletedAt: null,
      contractorId: contractorId ?? { not: null },
      ...(situation ? whereForSituation(situation) : {}),
      OR: search
        ? [
            { documentNumber: { contains: search, mode: 'insensitive' } },
            { description: { contains: search, mode: 'insensitive' } },
            { contractor: { legalName: { contains: search, mode: 'insensitive' } } },
            { contractor: { tradeName: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accountPayable.findMany({
        where,
        ...rowArgs,
        orderBy: [{ createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.accountPayable.count({ where }),
    ]);

    const anexos = await this.countAttachments(
      companyId,
      rows.map((r) => r.id),
    );
    return paginate(
      rows.map((row) => this.toServiceInvoice(row, anexos.get(row.id) ?? 0)),
      total,
      page,
      limit,
    );
  }

  /// Obras e centros administrativos onde a nota pode entrar. A Engenharia não
  /// tem, necessariamente, acesso ao cadastro de centros de custo.
  async listCostCenters(companyId: string) {
    return this.prisma.costCenter.findMany({
      where: { companyId, deletedAt: null },
      select: {
        id: true,
        code: true,
        name: true,
        constructionSite: { select: { id: true, name: true } },
      },
      orderBy: [{ code: 'asc' }],
    });
  }

  async create(companyId: string, userId: string, dto: CreateServiceInvoiceDto) {
    const [contractor, costCenter] = await Promise.all([
      this.prisma.contractor.findFirst({
        where: { id: dto.contractorId, companyId, deletedAt: null },
      }),
      this.prisma.costCenter.findFirst({
        where: { id: dto.costCenterId, companyId, deletedAt: null },
        select: { id: true, constructionSiteId: true },
      }),
    ]);
    if (!contractor) throw new BadRequestException('Terceirizado não encontrado.');
    if (!costCenter) throw new BadRequestException('Obra ou centro de custo não encontrado.');

    const numero = dto.documentNumber.trim();
    const repetida = await this.prisma.accountPayable.findFirst({
      where: {
        companyId,
        deletedAt: null,
        contractorId: contractor.id,
        documentNumber: numero,
        status: { not: 'CANCELLED' },
      },
      select: { id: true },
    });
    if (repetida) {
      throw new ConflictException(
        `A nota ${numero} deste terceirizado já foi lançada. Cancele a anterior para lançar de novo.`,
      );
    }

    const supplierId = await this.supplierFor(companyId, contractor);

    const conta = await this.prisma.accountPayable.create({
      data: {
        companyId,
        origin: 'MANUAL',
        supplierId,
        contractorId: contractor.id,
        launchedById: userId,
        costCenterId: costCenter.id,
        constructionSiteId: costCenter.constructionSiteId,
        documentNumber: numero,
        description: dto.description.trim(),
        notes: dto.notes?.trim() || null,
        amount: dto.amount,
        dueDate: new Date(dto.dueDate),
        issueDate: dto.issueDate ? new Date(dto.issueDate) : null,
      },
      ...rowArgs,
    });

    return this.toServiceInvoice(conta, 0);
  }

  /// Cancela uma nota lançada por engano. Só enquanto ninguém mexeu nela:
  /// liberada para pagamento, é decisão de quem liberou; com pagamento, é
  /// assunto do Financeiro.
  async cancel(companyId: string, id: string) {
    const conta = await this.assertServiceInvoice(companyId, id);

    if (conta.status !== 'OPEN') {
      throw new BadRequestException(
        conta.status === 'CANCELLED'
          ? 'Esta nota já está cancelada.'
          : 'Esta nota já tem pagamento registrado. Fale com o Financeiro.',
      );
    }
    if (conta.approvedForPaymentAt) {
      throw new BadRequestException(
        'Esta nota já foi liberada para pagamento. Peça a quem liberou para desfazer a liberação antes de cancelar.',
      );
    }
    const pagamentos = await this.prisma.payment.count({
      where: { accountPayableId: id, deletedAt: null, status: { not: 'REFUNDED' } },
    });
    if (pagamentos > 0) {
      throw new BadRequestException(
        'Esta nota já tem pagamento registrado. Fale com o Financeiro.',
      );
    }

    const cancelada = await this.prisma.accountPayable.update({
      where: { id, companyId },
      data: { status: 'CANCELLED' },
      ...rowArgs,
    });
    return this.toServiceInvoice(cancelada, 0);
  }

  async uploadFile(companyId: string, userId: string, id: string, file: Express.Multer.File) {
    await this.assertServiceInvoice(companyId, id);
    return this.attachments.uploadForServiceInvoice(companyId, userId, id, file);
  }

  async listFiles(companyId: string, id: string) {
    await this.assertServiceInvoice(companyId, id);
    return this.attachments.listForServiceInvoice(companyId, id);
  }

  /// A conta existe, é desta empresa E é uma nota de serviço. Qualquer outra
  /// conta a pagar responde "não encontrada": a Engenharia não pode usar
  /// estas rotas para enxergar contas do Financeiro pelo id.
  private async assertServiceInvoice(companyId: string, id: string) {
    const conta = await this.prisma.accountPayable.findFirst({
      where: { id, companyId, deletedAt: null, contractorId: { not: null } },
      select: { id: true, status: true, approvedForPaymentAt: true },
    });
    if (!conta) throw new NotFoundException('Nota de serviço não encontrada.');
    return conta;
  }

  /// Toda conta a pagar tem fornecedor. O terceirizado vira (ou reencontra) o
  /// fornecedor com o mesmo CPF/CNPJ, que é como o Financeiro o enxerga na
  /// Programação de Pagamentos e nos relatórios.
  private async supplierFor(
    companyId: string,
    contractor: {
      legalName: string;
      tradeName: string | null;
      document: string;
      email: string | null;
      phone: string | null;
      city: string | null;
      state: string | null;
    },
  ): Promise<string> {
    const document = onlyDigits(contractor.document);
    const existente = await this.prisma.supplier.findFirst({
      where: { companyId, document, deletedAt: null },
      select: { id: true },
    });
    if (existente) return existente.id;

    const novo = await this.prisma.supplier.create({
      data: {
        companyId,
        legalName: contractor.legalName,
        tradeName: contractor.tradeName,
        document,
        email: contractor.email,
        phone: contractor.phone,
        city: contractor.city,
        state: contractor.state,
      },
      select: { id: true },
    });
    return novo.id;
  }

  private async countAttachments(companyId: string, ids: string[]): Promise<Map<string, number>> {
    if (ids.length === 0) return new Map();
    const grupos = await this.prisma.attachment.groupBy({
      by: ['entityId'],
      where: { companyId, entityType: 'AccountPayable', entityId: { in: ids }, deletedAt: null },
      _count: { _all: true },
    });
    return new Map(grupos.map((g) => [g.entityId, g._count._all]));
  }

  private toServiceInvoice(row: Row, attachmentsCount: number): ServiceInvoice {
    const { status, ...resto } = row;
    return {
      ...resto,
      situation: situationOf({ status, approvedForPaymentAt: row.approvedForPaymentAt }),
      attachmentsCount,
    };
  }
}
