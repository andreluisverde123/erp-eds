import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import { Prisma, type AccountPayableStatus } from '../../../generated/prisma/client';
import { paginate, type PaginatedResult } from '../../common/types/paginated-result.type';
import { addDays, isSameDay, startOfDay } from '../../common/utils/date.util';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAccountPayableDto } from './dto/create-account-payable.dto';
import {
  buildTraceability,
  type AccountPayableTraceability,
  type TraceableAccountPayable,
} from './traceability.util';
import { QueryAccountPayableDto } from './dto/query-account-payable.dto';
import { UpdateAccountPayableDto } from './dto/update-account-payable.dto';

const includeArgs = Prisma.validator<Prisma.AccountPayableDefaultArgs>()({
  include: {
    /// O fornecedor sai da PRÓPRIA conta, não da nota. As contas avulsas não
    /// têm nota, e mesmo as que têm agora carregam o vínculo direto — assim a
    /// tela tem um caminho só para exibir a quem se deve.
    supplier: { select: { id: true, legalName: true, tradeName: true } },
    costCenter: { select: { id: true, code: true, name: true } },
    constructionSite: { select: { id: true, code: true, name: true } },
    /// Continua vindo quando existe: é a identificação do documento das
    /// contas nascidas de nota fiscal — e, desde a integração
    /// Engenharia -> Financeiro, o começo da travessia até a origem da
    /// despesa.
    ///
    /// A cadeia inteira é lida por RELACIONAMENTO, sem uma coluna nova sequer:
    /// conta -> nota -> ordem -> solicitação. Ela fica no include compartilhado
    /// (e não só no detalhe) de propósito: o Prisma carrega cada nível uma vez
    /// por PÁGINA, não uma vez por linha, então a listagem inteira ganha a
    /// origem ao custo de três consultas — barato o suficiente para o
    /// financeiro não precisar clicar em cada conta para saber de onde ela veio.
    invoice: {
      select: {
        id: true,
        number: true,
        series: true,
        status: true,
        purchaseOrder: {
          select: {
            id: true,
            code: true,
            status: true,
            purchaseRequest: { select: { id: true, code: true, status: true } },
          },
        },
        /// A NF-e como chegou da SEFAZ. Distinta da `Invoice`: esta é o
        /// documento capturado, aquela é o lançamento do financeiro.
        inboundInvoices: {
          select: { id: true, number: true, series: true, accessKey: true },
          orderBy: { issueDate: 'asc' },
        },
      },
    },
  },
});

type AccountPayableRow = Prisma.AccountPayableGetPayload<typeof includeArgs>;

/// Anexa a origem achatada à linha. Ver `traceability.util.ts` para o porquê
/// de achatar o que já vem aninhado.
function withTraceability<T extends TraceableAccountPayable>(row: T) {
  return { ...row, traceability: buildTraceability(row) };
}

export interface AccountPayableSummary {
  totalOpen: number;
  totalPaid: number;
  dueToday: number;
  dueThisWeek: number;
}

@Injectable()
export class AccountPayablesService {
  constructor(private readonly prisma: PrismaService) {}

  /// Cria a conta a pagar pelos DOIS caminhos.
  ///
  /// Com nota, o comportamento é o de sempre e tudo é derivado dela. Sem nota
  /// é o lançamento avulso: o Financeiro informa a quem se deve e a que a
  /// despesa pertence, porque não há documento de onde tirar isso.
  ///
  /// A conta nasce OPEN nos dois casos e segue pelo MESMO fluxo de pagamento
  /// e baixa que já existe — nada aqui cria caminho novo depois da criação.
  ///
  /// A autoria fica registrada pelo mecanismo de auditoria que já existe: a
  /// extensão do Prisma (`common/prisma/audit-extension.ts`) grava um CREATE
  /// em `AuditLog` com o usuário da requisição. Por isso este método usa
  /// `create` (que a extensão cobre) e não `createMany` (que ela não cobre).
  async create(companyId: string, dto: CreateAccountPayableDto) {
    const anchor = dto.invoiceId
      ? await this.resolveFromInvoice(companyId, dto.invoiceId)
      : await this.resolveManual(companyId, dto);

    const created = await this.prisma.accountPayable.create({
      data: {
        companyId,
        ...anchor,
        dueDate: new Date(dto.dueDate),
        amount: dto.amount,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : undefined,
        paymentMethod: dto.paymentMethod,
        documentNumber: dto.documentNumber,
        notes: dto.notes,
      },
    });

    return this.findOne(companyId, created.id);
  }

  /// Caminho de sempre: a nota dita fornecedor e atribuição de custo.
  private async resolveFromInvoice(companyId: string, invoiceId: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id: invoiceId, companyId, deletedAt: null },
      select: {
        id: true,
        supplierId: true,
        costCenterId: true,
        constructionSiteId: true,
        accountsPayable: {
          where: { deletedAt: null },
          select: { id: true },
        },
      },
    });

    if (!invoice) {
      throw new BadRequestException('Nota fiscal informada não existe.');
    }

    // Uma nota vira contas a pagar UMA vez, pelo caminho que a criou: a
    // conciliação (que gera as parcelas de acordo com a condição de pagamento)
    // ou a validação manual da nota. Chegar aqui com a nota já lançada
    // significa que alguém está criando um segundo lançamento para a mesma
    // despesa — o mesmo dinheiro sairia duas vezes.
    //
    // Recusar em vez de somar: o parcelamento existente é o lançamento certo.
    // Quem precisa de outra parcela edita o que existe; quem lançou errado
    // cancela e refaz.
    if (invoice.accountsPayable.length > 0) {
      throw new ConflictException(
        `Esta nota fiscal já tem ${invoice.accountsPayable.length} conta(s) a pagar lançada(s). ` +
          'Use o lançamento existente em vez de criar outro para a mesma despesa.',
      );
    }

    return {
      origin: 'INVOICE' as const,
      invoiceId: invoice.id,
      supplierId: invoice.supplierId,
      costCenterId: invoice.costCenterId,
      constructionSiteId: invoice.constructionSiteId,
      description: null,
    };
  }

  /// Lançamento avulso. Fornecedor e centro de custo são conferidos DENTRO da
  /// empresa: um id de outro tenant não encontra registro nenhum e é recusado
  /// com a mesma mensagem de "não existe" — sem contar a quem tentou que o
  /// registro existe em outro lugar.
  private async resolveManual(companyId: string, dto: CreateAccountPayableDto) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, companyId, deletedAt: null },
      select: { id: true },
    });
    if (!supplier) {
      throw new BadRequestException('Fornecedor informado não existe.');
    }

    const costCenter = await this.prisma.costCenter.findFirst({
      where: { id: dto.costCenterId, companyId, deletedAt: null },
      select: { id: true, constructionSiteId: true },
    });
    if (!costCenter) {
      throw new BadRequestException('Centro de custo informado não existe.');
    }

    return {
      origin: 'MANUAL' as const,
      invoiceId: null,
      supplierId: supplier.id,
      costCenterId: costCenter.id,
      // A obra vem do centro de custo, nunca escolhida à parte — mesma regra
      // da solicitação de compra e da conciliação sem ordem. Nula quando o
      // centro é administrativo.
      constructionSiteId: costCenter.constructionSiteId,
      description: dto.description ?? null,
    };
  }

  async findAll(
    companyId: string,
    query: QueryAccountPayableDto,
  ): Promise<PaginatedResult<AccountPayableRow & { traceability: AccountPayableTraceability }>> {
    const { page, limit, search, status, supplierId, origin, dueDateFrom, dueDateTo } = query;

    const where: Prisma.AccountPayableWhereInput = {
      companyId,
      deletedAt: null,
      status,
      dueDate:
        dueDateFrom || dueDateTo
          ? {
              gte: dueDateFrom ? new Date(dueDateFrom) : undefined,
              lte: dueDateTo ? new Date(dueDateTo) : undefined,
            }
          : undefined,
      // Filtro direto na conta. Antes ia por `invoice: { supplierId }`, o que
      // depois desta mudança esconderia toda conta avulsa — um filtro de
      // relação exige que a relação exista.
      supplierId,
      origin,
      OR: search
        ? [
            { description: { contains: search, mode: 'insensitive' } },
            { documentNumber: { contains: search, mode: 'insensitive' } },
            { invoice: { number: { contains: search, mode: 'insensitive' } } },
            { supplier: { legalName: { contains: search, mode: 'insensitive' } } },
            { supplier: { tradeName: { contains: search, mode: 'insensitive' } } },
          ]
        : undefined,
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.accountPayable.findMany({
        where,
        ...includeArgs,
        orderBy: { dueDate: 'asc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.accountPayable.count({ where }),
    ]);

    return paginate(data.map(withTraceability), total, page, limit);
  }

  async findOne(companyId: string, id: string) {
    const accountPayable = await this.prisma.accountPayable.findFirst({
      where: { id, companyId, deletedAt: null },
      ...includeArgs,
      include: {
        ...includeArgs.include,
        payments: { where: { deletedAt: null }, orderBy: { paidAt: 'desc' } },
      },
    });

    if (!accountPayable) {
      throw new NotFoundException('Conta a pagar não encontrada.');
    }

    return withTraceability(accountPayable);
  }

  async update(companyId: string, id: string, dto: UpdateAccountPayableDto) {
    const existing = await this.assertExists(companyId, id);

    if (existing.status !== 'OPEN') {
      throw new ConflictException(
        'Só é possível editar contas em aberto (sem pagamentos registrados).',
      );
    }

    await this.prisma.accountPayable.update({
      where: { id, companyId },
      data: {
        dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
        amount: dto.amount,
      },
    });

    return this.findOne(companyId, id);
  }

  async updateStatus(companyId: string, id: string, targetStatus: AccountPayableStatus) {
    const existing = await this.assertExists(companyId, id);

    if (targetStatus !== 'CANCELLED' || existing.status !== 'OPEN') {
      throw new BadRequestException(
        `Não é possível mudar de "${existing.status}" para "${targetStatus}".`,
      );
    }

    await this.prisma.accountPayable.update({
      where: { id, companyId },
      data: { status: 'CANCELLED' },
    });
    return this.findOne(companyId, id);
  }

  async remove(companyId: string, id: string): Promise<void> {
    await this.assertExists(companyId, id);
    await this.prisma.accountPayable.update({
      where: { id, companyId },
      data: { deletedAt: new Date() },
    });
  }

  /// Reconcilia o status da parcela a partir da soma dos pagamentos PAID
  /// vinculados a ela. Chamado pelo PaymentsService sempre que um pagamento
  /// é criado, editado ou removido — nunca setado à mão via API.
  async recalculateStatus(companyId: string, accountPayableId: string): Promise<void> {
    const accountPayable = await this.prisma.accountPayable.findFirst({
      where: { id: accountPayableId, companyId, deletedAt: null },
      include: { payments: { where: { deletedAt: null, status: 'PAID' } } },
    });

    if (!accountPayable || accountPayable.status === 'CANCELLED') return;

    const paidSum = accountPayable.payments.reduce(
      (sum, payment) => sum + Number(payment.amount),
      0,
    );
    const total = Number(accountPayable.amount);

    const status: AccountPayableStatus =
      paidSum <= 0 ? 'OPEN' : paidSum >= total ? 'PAID' : 'PARTIAL';

    if (status !== accountPayable.status) {
      await this.prisma.accountPayable.update({
        where: { id: accountPayableId },
        data: { status },
      });
    }
  }

  async getSummary(companyId: string): Promise<AccountPayableSummary> {
    const openAccounts = await this.prisma.accountPayable.findMany({
      where: { companyId, deletedAt: null, status: { in: ['OPEN', 'PARTIAL'] } },
      include: { payments: { where: { deletedAt: null, status: 'PAID' } } },
    });

    const today = startOfDay(new Date());
    const weekFromNow = addDays(today, 7);

    let totalOpen = 0;
    let dueToday = 0;
    let dueThisWeek = 0;

    for (const account of openAccounts) {
      const paid = account.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      const remaining = Number(account.amount) - paid;
      totalOpen += remaining;

      const dueDate = startOfDay(account.dueDate);
      if (isSameDay(dueDate, today)) dueToday += remaining;
      if (dueDate >= today && dueDate <= weekFromNow) dueThisWeek += remaining;
    }

    const paidAggregate = await this.prisma.accountPayable.aggregate({
      where: { companyId, deletedAt: null, status: 'PAID' },
      _sum: { amount: true },
    });

    return {
      totalOpen,
      totalPaid: Number(paidAggregate._sum.amount ?? 0),
      dueToday,
      dueThisWeek,
    };
  }

  private async assertExists(companyId: string, id: string) {
    const accountPayable = await this.prisma.accountPayable.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!accountPayable) {
      throw new NotFoundException('Conta a pagar não encontrada.');
    }
    return accountPayable;
  }
}
