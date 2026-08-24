import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { Prisma, type BankAccountType, type PixKeyType } from '../../../generated/prisma/client';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { hasValidCheckDigits, onlyDigits } from '../../common/utils/document.util';
import { PrismaService } from '../../prisma/prisma.service';
import type { BankAccountOwnerType } from './bank-account-owner';
import { BankAccountCryptoService } from './bank-account-crypto.service';
import {
  getPixKeyFormatMessage,
  isValidPixKey,
  maskAccountNumber,
  maskPixKey,
  normalizePixKey,
} from './bank-account.util';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { QueryBankAccountDto } from './dto/query-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

const NOT_FOUND_MESSAGE = 'Conta bancária não encontrada.';
const OWNER_NOT_FOUND_MESSAGE = 'Titular não encontrado.';
const PIX_PAIR_MESSAGE = 'Informe o tipo e a chave PIX juntos.';
const HOLDER_PAIR_MESSAGE =
  'Titular de terceiro exige nome e CPF/CNPJ. Deixe os dois em branco quando a conta for do próprio titular.';
const HOLDER_DOCUMENT_MESSAGE = 'CPF/CNPJ do titular inválido. Confira os dígitos.';

/// `entityType` das linhas de auditoria deste módulo (ver
/// `audit-log-modules.constant.ts`).
const AUDIT_ENTITY = 'BankAccount';

/// Titular exibido na tela. `isOwner` distingue os dois casos que a tela
/// precisa mostrar diferente: a conta do próprio (nome vem do cadastro) e a
/// conta de terceiro (nome e documento foram digitados).
export interface BankAccountHolder {
  name: string | null;
  document: string | null;
  isOwner: boolean;
}

/// Conta bancária como ela sai da API por padrão: MASCARADA.
///
/// Não existe caminho que devolva número de conta ou chave PIX inteiros por
/// engano — os campos completos nem fazem parte deste tipo. Quem precisa deles
/// chama `reveal`, que é outro endpoint, outra permissão e vira linha de
/// auditoria.
export interface BankAccountView {
  id: string;
  ownerType: BankAccountOwnerType;
  ownerId: string;
  bankCode: string;
  bankName: string;
  branch: string;
  branchDigit: string | null;
  accountType: BankAccountType;
  accountNumberMasked: string;
  accountDigit: string | null;
  pixKeyType: PixKeyType | null;
  pixKeyMasked: string | null;
  holder: BankAccountHolder;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/// Os valores completos, devolvidos uma vez por chamada explícita de `reveal`.
export interface RevealedBankAccount {
  id: string;
  accountNumber: string;
  accountDigit: string | null;
  pixKey: string | null;
}

interface OwnerRef {
  /// Coluna do arco exclusivo correspondente ao tipo de titular.
  column: 'userId' | 'employeeId' | 'contractorId';
  name: string;
  /// CPF/CNPJ do dono, quando o cadastro dele tem um. `User` não tem.
  document: string | null;
}

const selectArgs = Prisma.validator<Prisma.BankAccountDefaultArgs>()({
  select: {
    id: true,
    userId: true,
    employeeId: true,
    contractorId: true,
    bankCode: true,
    bankName: true,
    branch: true,
    branchDigit: true,
    accountType: true,
    accountNumberMasked: true,
    accountDigit: true,
    pixKeyType: true,
    pixKeyMasked: true,
    holderName: true,
    holderDocument: true,
    isActive: true,
    createdAt: true,
    updatedAt: true,
  },
});

type BankAccountRow = Prisma.BankAccountGetPayload<typeof selectArgs>;

/// Gestão das contas bancárias de quem recebe dinheiro da empresa.
///
/// Três decisões atravessam o arquivo inteiro:
///
///  1. **O padrão é mascarado.** `BankAccountView` não tem os campos
///     completos, então nenhuma listagem consegue vazá-los por descuido.
///  2. **A empresa entra em toda consulta.** Não há leitura por `id` sozinho:
///     é sempre `{ id, companyId }`, e o titular é conferido dentro da mesma
///     empresa antes de qualquer escrita.
///  3. **Nada é excluído.** Conta errada é desativada; o histórico de para
///     onde o dinheiro foi continua legível.
@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: BankAccountCryptoService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /// A tela usa para explicar que falta configurar a chave, em vez de deixar o
  /// usuário descobrir com um erro ao salvar.
  get encryptionConfigured(): boolean {
    return this.crypto.configured;
  }

  async findAllByOwner(companyId: string, query: QueryBankAccountDto): Promise<BankAccountView[]> {
    const owner = await this.resolveOwner(companyId, query.ownerType, query.ownerId);

    const rows = await this.prisma.bankAccount.findMany({
      where: { companyId, [owner.column]: query.ownerId },
      orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }],
      ...selectArgs,
    });

    return rows.map((row) => this.toView(row, owner));
  }

  async create(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    dto: CreateBankAccountDto,
  ): Promise<BankAccountView> {
    const owner = await this.resolveOwner(companyId, dto.ownerType, dto.ownerId);

    const pix = this.preparePix(dto.pixKeyType, dto.pixKey);
    const holder = this.prepareHolder(dto.holderName, dto.holderDocument);
    const accountNumber = dto.accountNumber;

    const created = await this.prisma.bankAccount.create({
      data: {
        companyId,
        [owner.column]: dto.ownerId,
        bankCode: dto.bankCode,
        bankName: dto.bankName.trim(),
        branch: dto.branch,
        branchDigit: this.normalizeDigit(dto.branchDigit),
        accountType: dto.accountType,
        accountNumber: this.crypto.encryptString(accountNumber),
        accountNumberMasked: maskAccountNumber(accountNumber),
        accountDigit: this.normalizeDigit(dto.accountDigit),
        pixKeyType: pix?.type ?? null,
        pixKey: pix ? this.crypto.encryptString(pix.key) : null,
        pixKeyMasked: pix?.masked ?? null,
        holderName: holder.name,
        holderDocument: holder.document,
        isActive: dto.isActive ?? true,
      },
      ...selectArgs,
    });

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'CREATE',
      entityType: AUDIT_ENTITY,
      entityId: created.id,
      ipAddress,
      changes: {
        bankCode: created.bankCode,
        bankName: created.bankName,
        branch: created.branch,
        accountType: created.accountType,
        // A forma mascarada é a ÚNICA que entra em auditoria — ela identifica
        // a conta sem permitir que alguém pague por ela.
        accountNumberMasked: created.accountNumberMasked,
        pixKeyMasked: created.pixKeyMasked,
        titularDeTerceiro: created.holderName !== null,
      },
    });

    return this.toView(created, owner);
  }

  /// Atualização parcial, com uma regra explícita para os dois pares:
  ///
  ///  - PIX e titular de terceiro são blocos. Mandar metade do par é erro.
  ///  - String vazia LIMPA o bloco (`pixKey: ''` remove a chave; `holderName:
  ///    ''` devolve a titularidade ao dono da conta). Omitir mantém o que
  ///    está gravado.
  ///
  /// Sem essa convenção não haveria como apagar uma chave PIX: um campo
  /// ausente é indistinguível de um campo que o formulário não enviou.
  async update(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
    dto: UpdateBankAccountDto,
  ): Promise<BankAccountView> {
    const current = await this.findRow(companyId, id);
    const owner = await this.resolveOwnerOfRow(companyId, current);

    const data: Prisma.BankAccountUpdateInput = {};
    const changes: Record<string, unknown> = {};

    if (dto.bankCode !== undefined) {
      data.bankCode = dto.bankCode;
      changes.bankCode = dto.bankCode;
    }
    if (dto.bankName !== undefined) {
      data.bankName = dto.bankName.trim();
      changes.bankName = data.bankName;
    }
    if (dto.branch !== undefined) {
      data.branch = dto.branch;
      changes.branch = dto.branch;
    }
    if (dto.branchDigit !== undefined) {
      data.branchDigit = this.normalizeDigit(dto.branchDigit);
    }
    if (dto.accountType !== undefined) {
      data.accountType = dto.accountType;
      changes.accountType = dto.accountType;
    }
    if (dto.accountNumber !== undefined) {
      data.accountNumber = this.crypto.encryptString(dto.accountNumber);
      data.accountNumberMasked = maskAccountNumber(dto.accountNumber);
      changes.accountNumberMasked = data.accountNumberMasked;
    }
    if (dto.accountDigit !== undefined) {
      data.accountDigit = this.normalizeDigit(dto.accountDigit);
    }
    if (dto.isActive !== undefined) {
      data.isActive = dto.isActive;
      changes.isActive = dto.isActive;
    }

    if (dto.pixKeyType !== undefined || dto.pixKey !== undefined) {
      if (dto.pixKey !== undefined && dto.pixKey.trim() === '') {
        data.pixKeyType = null;
        data.pixKey = null;
        data.pixKeyMasked = null;
        changes.pixKeyMasked = null;
      } else {
        const pix = this.preparePix(dto.pixKeyType, dto.pixKey);
        if (!pix) throw new BadRequestException(PIX_PAIR_MESSAGE);
        data.pixKeyType = pix.type;
        data.pixKey = this.crypto.encryptString(pix.key);
        data.pixKeyMasked = pix.masked;
        changes.pixKeyMasked = pix.masked;
      }
    }

    if (dto.holderName !== undefined || dto.holderDocument !== undefined) {
      if (dto.holderName !== undefined && dto.holderName.trim() === '') {
        data.holderName = null;
        data.holderDocument = null;
        changes.titularDeTerceiro = false;
      } else {
        const holder = this.prepareHolder(dto.holderName, dto.holderDocument);
        if (!holder.name) throw new BadRequestException(HOLDER_PAIR_MESSAGE);
        data.holderName = holder.name;
        data.holderDocument = holder.document;
        changes.titularDeTerceiro = true;
      }
    }

    const updated = await this.prisma.bankAccount.update({
      where: { id: current.id },
      data,
      ...selectArgs,
    });

    // Um update que não mudou nada não vira linha de auditoria — o log serve
    // para reconstruir o que mudou, não para contar cliques em "Salvar".
    if (Object.keys(changes).length > 0) {
      await this.auditLogger.log({
        companyId,
        userId: actingUserId,
        action: 'UPDATE',
        entityType: AUDIT_ENTITY,
        entityId: current.id,
        ipAddress,
        changes: changes as Prisma.InputJsonValue,
      });
    }

    return this.toView(updated, owner);
  }

  async updateStatus(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
    isActive: boolean,
  ): Promise<BankAccountView> {
    const current = await this.findRow(companyId, id);
    const owner = await this.resolveOwnerOfRow(companyId, current);

    const updated = await this.prisma.bankAccount.update({
      where: { id: current.id },
      data: { isActive },
      ...selectArgs,
    });

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'UPDATE',
      entityType: AUDIT_ENTITY,
      entityId: current.id,
      ipAddress,
      changes: { isActive },
    });

    return this.toView(updated, owner);
  }

  /// Devolve os valores completos — o único caminho que decifra qualquer coisa.
  ///
  /// Registra `READ` na auditoria ANTES de responder: se a gravação falhar, a
  /// resposta não sai. Consulta de dado protegido sem rastro é pior que
  /// consulta recusada.
  async reveal(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    id: string,
  ): Promise<RevealedBankAccount> {
    const row = await this.prisma.bankAccount.findFirst({
      where: { id, companyId },
      select: { id: true, accountNumber: true, accountDigit: true, pixKey: true },
    });
    if (!row) throw new NotFoundException(NOT_FOUND_MESSAGE);

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'READ',
      entityType: AUDIT_ENTITY,
      entityId: row.id,
      ipAddress,
      // Quais campos foram expostos, nunca o conteúdo deles.
      changes: { camposRevelados: row.pixKey ? ['accountNumber', 'pixKey'] : ['accountNumber'] },
    });

    return {
      id: row.id,
      accountNumber: this.crypto.decryptString(row.accountNumber),
      accountDigit: row.accountDigit,
      pixKey: row.pixKey ? this.crypto.decryptString(row.pixKey) : null,
    };
  }

  // ---------------------------------------------------------------------------

  private async findRow(companyId: string, id: string): Promise<BankAccountRow> {
    const row = await this.prisma.bankAccount.findFirst({
      where: { id, companyId },
      ...selectArgs,
    });
    if (!row) throw new NotFoundException(NOT_FOUND_MESSAGE);
    return row;
  }

  /// Confere que o titular existe DENTRO da empresa de quem está chamando.
  ///
  /// É o ponto onde o isolamento entre empresas se decide: sem esta conferência
  /// bastaria conhecer o id de um usuário da outra empresa para pendurar uma
  /// conta bancária nele.
  private async resolveOwner(
    companyId: string,
    ownerType: BankAccountOwnerType,
    ownerId: string,
  ): Promise<OwnerRef> {
    if (ownerType === 'USER') {
      const user = await this.prisma.user.findFirst({
        where: { id: ownerId, companyId, deletedAt: null },
        select: { name: true },
      });
      if (!user) throw new NotFoundException(OWNER_NOT_FOUND_MESSAGE);
      // O `User` do ERP não guarda CPF — ver o comentário do modelo.
      return { column: 'userId', name: user.name, document: null };
    }

    if (ownerType === 'EMPLOYEE') {
      const employee = await this.prisma.employee.findFirst({
        where: { id: ownerId, companyId, deletedAt: null },
        select: { name: true, cpf: true },
      });
      if (!employee) throw new NotFoundException(OWNER_NOT_FOUND_MESSAGE);
      return { column: 'employeeId', name: employee.name, document: employee.cpf };
    }

    const contractor = await this.prisma.contractor.findFirst({
      where: { id: ownerId, companyId, deletedAt: null },
      select: { legalName: true, tradeName: true, document: true },
    });
    if (!contractor) throw new NotFoundException(OWNER_NOT_FOUND_MESSAGE);
    return {
      column: 'contractorId',
      name: contractor.tradeName ?? contractor.legalName,
      document: contractor.document,
    };
  }

  private resolveOwnerOfRow(companyId: string, row: BankAccountRow): Promise<OwnerRef> {
    if (row.userId) return this.resolveOwner(companyId, 'USER', row.userId);
    if (row.employeeId) return this.resolveOwner(companyId, 'EMPLOYEE', row.employeeId);
    // O CHECK do banco garante que o terceiro é o que sobrou.
    return this.resolveOwner(companyId, 'CONTRACTOR', row.contractorId as string);
  }

  /// Normaliza, valida o formato conforme o tipo e já devolve a máscara.
  /// `undefined` quando não há PIX; erro quando veio metade do par.
  private preparePix(
    type: PixKeyType | undefined,
    key: string | undefined,
  ): { type: PixKeyType; key: string; masked: string } | undefined {
    if (type === undefined && (key === undefined || key.trim() === '')) return undefined;
    if (type === undefined || key === undefined || key.trim() === '') {
      throw new BadRequestException(PIX_PAIR_MESSAGE);
    }

    const normalized = normalizePixKey(type, key);
    if (!isValidPixKey(type, normalized)) {
      throw new BadRequestException(getPixKeyFormatMessage(type));
    }

    return { type, key: normalized, masked: maskPixKey(type, normalized) };
  }

  private prepareHolder(
    name: string | undefined,
    document: string | undefined,
  ): { name: string | null; document: string | null } {
    const trimmedName = name?.trim() ?? '';
    const digits = document ? onlyDigits(document) : '';

    if (trimmedName === '' && digits === '') return { name: null, document: null };
    if (trimmedName === '' || digits === '') throw new BadRequestException(HOLDER_PAIR_MESSAGE);
    // Dígito verificador, e não só comprimento: aqui alguém DIGITOU o
    // documento do titular, e é o banco que recusa a transferência depois.
    if (!hasValidCheckDigits(digits)) throw new BadRequestException(HOLDER_DOCUMENT_MESSAGE);

    return { name: trimmedName, document: digits };
  }

  /// "x" e "X" são o mesmo dígito verificador; guardar os dois jeitos faria a
  /// mesma conta parecer duas.
  private normalizeDigit(value: string | undefined): string | null {
    return value ? value.toUpperCase() : null;
  }

  private toView(row: BankAccountRow, owner: OwnerRef): BankAccountView {
    const ownerType: BankAccountOwnerType = row.userId
      ? 'USER'
      : row.employeeId
        ? 'EMPLOYEE'
        : 'CONTRACTOR';

    return {
      id: row.id,
      ownerType,
      ownerId: (row.userId ?? row.employeeId ?? row.contractorId) as string,
      bankCode: row.bankCode,
      bankName: row.bankName,
      branch: row.branch,
      branchDigit: row.branchDigit,
      accountType: row.accountType,
      accountNumberMasked: row.accountNumberMasked,
      accountDigit: row.accountDigit,
      pixKeyType: row.pixKeyType,
      pixKeyMasked: row.pixKeyMasked,
      holder: row.holderName
        ? { name: row.holderName, document: row.holderDocument, isOwner: false }
        : // Titular é o próprio dono: nome e documento saem do cadastro dele,
          // não de uma cópia guardada aqui.
          { name: owner.name, document: owner.document, isOwner: true },
      isActive: row.isActive,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}
