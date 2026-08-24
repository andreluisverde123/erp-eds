import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import type { AuditLogEntry } from '../../common/services/audit-logger.service';
import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { BankAccountCryptoService } from './bank-account-crypto.service';
import { BankAccountsController } from './bank-accounts.controller';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

const EMPRESA_A = '11111111-1111-4111-8111-111111111111';
const EMPRESA_B = '22222222-2222-4222-8222-222222222222';

const USUARIO_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const USUARIO_B = 'bbbbbbbb-0000-4000-8000-000000000001';
const FUNCIONARIO_A = 'cccccccc-0000-4000-8000-000000000001';
const ADMIN = 'dddddddd-0000-4000-8000-000000000001';
const IP = '203.0.113.10';

/// Chave de teste. Só existe aqui — nenhum ambiente usa este valor.
const CHAVE_TESTE = 'a'.repeat(64);

const USUARIOS = [
  { id: USUARIO_A, companyId: EMPRESA_A, name: 'João da Silva' },
  { id: USUARIO_B, companyId: EMPRESA_B, name: 'Maria de Souza' },
];

const FUNCIONARIOS = [
  { id: FUNCIONARIO_A, companyId: EMPRESA_A, name: 'Pedro Alves', cpf: '52998224725' },
];

const CONTA_VALIDA = {
  ownerType: 'USER' as const,
  ownerId: USUARIO_A,
  bankCode: '341',
  bankName: 'Itaú Unibanco',
  branch: '1234',
  accountType: 'CHECKING' as const,
  accountNumber: '567890',
  accountDigit: '1',
};

interface LinhaConta {
  id: string;
  companyId: string;
  userId: string | null;
  employeeId: string | null;
  contractorId: string | null;
  [campo: string]: unknown;
}

/// Dublê do Prisma que REPRODUZ o filtro por `companyId`.
///
/// Um mock que devolvesse a linha para qualquer empresa faria os testes de
/// isolamento passarem sem que o código filtrasse nada — que é exatamente a
/// falha que eles existem para pegar.
function makeService() {
  const linhas: LinhaConta[] = [];
  const auditoria: AuditLogEntry[] = [];
  let sequencia = 0;

  const escopo =
    <T extends { id: string; companyId: string }>(registros: T[]) =>
    async ({ where }: { where: { id?: string; companyId: string } }) =>
      registros.find((r) => r.id === where.id && r.companyId === where.companyId) ?? null;

  const prisma = {
    user: { findFirst: jest.fn(escopo(USUARIOS)) },
    employee: { findFirst: jest.fn(escopo(FUNCIONARIOS)) },
    contractor: { findFirst: jest.fn(async () => null) },
    bankAccount: {
      create: jest.fn(async ({ data }: { data: Partial<LinhaConta> }) => {
        sequencia += 1;
        const linha: LinhaConta = {
          companyId: '',
          userId: null,
          employeeId: null,
          contractorId: null,
          branchDigit: null,
          accountDigit: null,
          pixKeyType: null,
          pixKey: null,
          pixKeyMasked: null,
          holderName: null,
          holderDocument: null,
          isActive: true,
          createdAt: new Date('2026-08-24T12:00:00Z'),
          updatedAt: new Date('2026-08-24T12:00:00Z'),
          ...data,
          id: `conta-${sequencia}`,
        };
        linhas.push(linha);
        return linha;
      }),
      findFirst: jest.fn(
        async ({ where }: { where: { id: string; companyId: string } }) =>
          linhas.find((l) => l.id === where.id && l.companyId === where.companyId) ?? null,
      ),
      findMany: jest.fn(async ({ where }: { where: Record<string, string> }) =>
        linhas.filter((l) => Object.entries(where).every(([campo, valor]) => l[campo] === valor)),
      ),
      update: jest.fn(
        async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
          const linha = linhas.find((l) => l.id === where.id)!;
          Object.assign(linha, data);
          return linha;
        },
      ),
    },
  } as unknown as PrismaService;

  const crypto = new BankAccountCryptoService({
    get: () => CHAVE_TESTE,
  } as unknown as ConfigService);

  const auditLogger = {
    log: jest.fn(async (entrada: AuditLogEntry) => {
      auditoria.push(entrada);
    }),
  } as unknown as AuditLoggerService;

  return {
    service: new BankAccountsService(prisma, crypto, auditLogger),
    crypto,
    linhas,
    auditoria,
  };
}

describe('BankAccountsService — dados bancários', () => {
  describe('1. Cadastrar', () => {
    it('grava a conta do usuário e devolve o número mascarado', async () => {
      const { service } = makeService();

      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      expect(conta.bankName).toBe('Itaú Unibanco');
      expect(conta.accountNumberMasked).toBe('****7890');
      expect(conta.isActive).toBe(true);
      // O tipo devolvido nem tem o campo completo: não há como vazá-lo aqui.
      expect(conta as unknown as Record<string, unknown>).not.toHaveProperty('accountNumber');
    });

    it('cifra o número da conta — o texto puro não chega ao banco', async () => {
      const { service, linhas, crypto } = makeService();

      await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      const gravado = linhas[0]!.accountNumber as string;
      expect(gravado).not.toContain('567890');
      // `iv:authTag:ciphertext`, o mesmo formato do cofre fiscal.
      expect(gravado.split(':')).toHaveLength(3);
      expect(crypto.decryptString(gravado)).toBe('567890');
    });

    it('aceita PIX junto da conta tradicional, normalizado e cifrado', async () => {
      const { service, linhas, crypto } = makeService();

      const conta = await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        pixKeyType: 'PHONE',
        pixKey: '(11) 99999-8888',
      });

      expect(conta.pixKeyMasked).toBe('****8888');
      expect(crypto.decryptString(linhas[0]!.pixKey as string)).toBe('11999998888');
    });

    it('recusa metade do par de PIX', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA, pixKey: '11999998888' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa chave PIX com formato incompatível com o tipo', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, ADMIN, IP, {
          ...CONTA_VALIDA,
          pixKeyType: 'CPF',
          pixKey: '11999998888',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('4. Titularidade', () => {
    it('sem titular informado, o nome vem do cadastro do dono — não de uma cópia', async () => {
      const { service, linhas } = makeService();

      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      expect(conta.holder).toEqual({ name: 'João da Silva', document: null, isOwner: true });
      // Nada foi duplicado na linha.
      expect(linhas[0]!.holderName).toBeNull();
    });

    it('o `User` não tem CPF no cadastro, e o titular do próprio sai sem documento', async () => {
      const { service } = makeService();

      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      expect(conta.holder.document).toBeNull();
    });

    it('funcionário traz o CPF do cadastro do RH', async () => {
      const { service } = makeService();

      const conta = await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        ownerType: 'EMPLOYEE',
        ownerId: FUNCIONARIO_A,
      });

      expect(conta.holder).toEqual({ name: 'Pedro Alves', document: '52998224725', isOwner: true });
    });

    it('titular de terceiro exige nome E documento', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA, holderName: 'Ana Silva' }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('recusa documento de titular com dígito verificador errado', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, ADMIN, IP, {
          ...CONTA_VALIDA,
          holderName: 'Ana Silva',
          holderDocument: '123.456.789-08',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('guarda o documento do terceiro só com dígitos', async () => {
      const { service } = makeService();

      const conta = await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        holderName: '  Ana Silva ',
        holderDocument: '123.456.789-09',
      });

      expect(conta.holder).toEqual({
        name: 'Ana Silva',
        document: '12345678909',
        isOwner: false,
      });
    });
  });

  describe('2. Editar', () => {
    it('troca o número e refaz a máscara', async () => {
      const { service, crypto, linhas } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      const editada = await service.update(EMPRESA_A, ADMIN, IP, conta.id, {
        accountNumber: '112233',
      });

      expect(editada.accountNumberMasked).toBe('****2233');
      expect(crypto.decryptString(linhas[0]!.accountNumber as string)).toBe('112233');
    });

    it('campo omitido não é apagado', async () => {
      const { service } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        pixKeyType: 'EMAIL',
        pixKey: 'joao@eds.com.br',
      });

      const editada = await service.update(EMPRESA_A, ADMIN, IP, conta.id, { bankName: 'Itaú' });

      expect(editada.pixKeyMasked).toBe('j***@eds.com.br');
    });

    it('chave vazia REMOVE o PIX — é a única forma de apagá-lo', async () => {
      const { service, linhas } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        pixKeyType: 'EMAIL',
        pixKey: 'joao@eds.com.br',
      });

      const editada = await service.update(EMPRESA_A, ADMIN, IP, conta.id, { pixKey: '' });

      expect(editada.pixKeyType).toBeNull();
      expect(editada.pixKeyMasked).toBeNull();
      expect(linhas[0]!.pixKey).toBeNull();
    });

    it('nome de titular vazio devolve a titularidade ao dono da conta', async () => {
      const { service } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        holderName: 'Ana Silva',
        holderDocument: '12345678909',
      });

      const editada = await service.update(EMPRESA_A, ADMIN, IP, conta.id, { holderName: '' });

      expect(editada.holder).toEqual({ name: 'João da Silva', document: null, isOwner: true });
    });

    it('não existe caminho para trocar o DONO da conta', async () => {
      // Mudar de titular é cadastrar outra conta, não editar esta. O DTO de
      // edição não declara `ownerType`/`ownerId`, então o `whitelist` +
      // `forbidNonWhitelisted` do pipe global recusa o corpo que os traga.
      const erros = await validate(
        plainToInstance(UpdateBankAccountDto, { bankName: 'Itaú', ownerId: USUARIO_B }),
        { whitelist: true, forbidNonWhitelisted: true },
      );

      expect(erros.map((erro) => erro.property)).toContain('ownerId');
    });
  });

  describe('3. Visualizar completo (reveal)', () => {
    it('devolve os valores inteiros', async () => {
      const { service } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        pixKeyType: 'EMAIL',
        pixKey: 'joao@eds.com.br',
      });

      const revelada = await service.reveal(EMPRESA_A, ADMIN, IP, conta.id);

      expect(revelada.accountNumber).toBe('567890');
      expect(revelada.pixKey).toBe('joao@eds.com.br');
    });

    it('registra a consulta na auditoria, sem o conteúdo consultado', async () => {
      const { service, auditoria } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      await service.reveal(EMPRESA_A, ADMIN, IP, conta.id);

      const leitura = auditoria.find((e) => e.action === 'READ')!;
      expect(leitura).toMatchObject({
        companyId: EMPRESA_A,
        userId: ADMIN,
        entityType: 'BankAccount',
        entityId: conta.id,
        ipAddress: IP,
      });
      expect(JSON.stringify(leitura.changes)).not.toContain('567890');
    });

    it('não revela conta de outra empresa', async () => {
      const { service } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      await expect(service.reveal(EMPRESA_B, ADMIN, IP, conta.id)).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('7 e 8. Isolamento entre empresas', () => {
    it('não pendura conta em titular de outra empresa', async () => {
      const { service } = makeService();

      await expect(
        service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA, ownerId: USUARIO_B }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('a conta nasce carimbada com a empresa de quem cadastrou', async () => {
      const { service, linhas } = makeService();

      await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      expect(linhas[0]!.companyId).toBe(EMPRESA_A);
      expect(linhas[0]!.userId).toBe(USUARIO_A);
    });

    it('empresa B não lê, não edita e não desativa conta da empresa A', async () => {
      const { service } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      await expect(
        service.update(EMPRESA_B, ADMIN, IP, conta.id, { bankName: 'Outro' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.updateStatus(EMPRESA_B, ADMIN, IP, conta.id, false),
      ).rejects.toBeInstanceOf(NotFoundException);
      await expect(
        service.findAllByOwner(EMPRESA_B, { ownerType: 'USER', ownerId: USUARIO_A }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('9. Auditoria não guarda valor bancário', () => {
    it('o cadastro registra a máscara, nunca o número', async () => {
      const { service, auditoria } = makeService();

      await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        pixKeyType: 'EMAIL',
        pixKey: 'joao@eds.com.br',
      });

      const registro = JSON.stringify(auditoria[0]!.changes);
      expect(registro).toContain('****7890');
      expect(registro).not.toContain('567890');
      expect(registro).not.toContain('joao@eds.com.br');
    });

    it('a edição registra a máscara nova, nunca o número novo', async () => {
      const { service, auditoria } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      await service.update(EMPRESA_A, ADMIN, IP, conta.id, {
        accountNumber: '112233',
        pixKeyType: 'CPF',
        pixKey: '12345678909',
      });

      const registro = JSON.stringify(auditoria.at(-1)!.changes);
      expect(registro).toContain('****2233');
      expect(registro).not.toContain('112233');
      expect(registro).not.toContain('12345678909');
    });

    it('o CPF do titular de terceiro não entra na auditoria', async () => {
      const { service, auditoria } = makeService();

      await service.create(EMPRESA_A, ADMIN, IP, {
        ...CONTA_VALIDA,
        holderName: 'Ana Silva',
        holderDocument: '12345678909',
      });

      expect(JSON.stringify(auditoria[0]!.changes)).not.toContain('12345678909');
    });

    it('edição sem mudança nenhuma não vira linha de auditoria', async () => {
      const { service, auditoria } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });
      const antes = auditoria.length;

      await service.update(EMPRESA_A, ADMIN, IP, conta.id, { branchDigit: '7' });

      expect(auditoria).toHaveLength(antes);
    });
  });

  describe('11 e 12. Sem conta, e desativação em vez de exclusão', () => {
    it('usuário sem dados bancários devolve lista vazia, não erro', async () => {
      const { service } = makeService();

      await expect(
        service.findAllByOwner(EMPRESA_A, { ownerType: 'USER', ownerId: USUARIO_A }),
      ).resolves.toEqual([]);
    });

    it('titular inexistente é erro, e não lista vazia', async () => {
      const { service } = makeService();

      await expect(
        service.findAllByOwner(EMPRESA_A, {
          ownerType: 'USER',
          ownerId: '99999999-0000-4000-8000-000000000009',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('desativar preserva a linha — o histórico de para onde o dinheiro foi continua legível', async () => {
      const { service, linhas } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });

      const desativada = await service.updateStatus(EMPRESA_A, ADMIN, IP, conta.id, false);

      expect(desativada.isActive).toBe(false);
      expect(linhas).toHaveLength(1);
      expect(linhas[0]!.accountNumber).toBeDefined();
    });

    it('a conta desativada continua listada, depois das ativas', async () => {
      const { service } = makeService();
      const conta = await service.create(EMPRESA_A, ADMIN, IP, { ...CONTA_VALIDA });
      await service.updateStatus(EMPRESA_A, ADMIN, IP, conta.id, false);

      const lista = await service.findAllByOwner(EMPRESA_A, {
        ownerType: 'USER',
        ownerId: USUARIO_A,
      });

      expect(lista).toHaveLength(1);
      expect(lista[0]!.isActive).toBe(false);
    });

    it('o service não expõe nenhum método de exclusão', () => {
      const { service } = makeService();

      expect((service as unknown as Record<string, unknown>).remove).toBeUndefined();
      expect((service as unknown as Record<string, unknown>).delete).toBeUndefined();
    });
  });

  describe('6. Validação de formato (DTO)', () => {
    const validar = async (payload: Record<string, unknown>) =>
      validate(plainToInstance(CreateBankAccountDto, { ...CONTA_VALIDA, ...payload }));

    it('aceita o cadastro completo', async () => {
      expect(await validar({})).toHaveLength(0);
    });

    it('exige código de banco com 3 dígitos', async () => {
      expect(await validar({ bankCode: '41' })).not.toHaveLength(0);
      expect(await validar({ bankCode: 'itau' })).not.toHaveLength(0);
      expect(await validar({ bankCode: '001' })).toHaveLength(0);
    });

    it('recusa agência e conta com letra ou pontuação', async () => {
      expect(await validar({ branch: '12-34' })).not.toHaveLength(0);
      expect(await validar({ accountNumber: '5678-90' })).not.toHaveLength(0);
    });

    it('aceita "X" como dígito verificador', async () => {
      expect(await validar({ accountDigit: 'X' })).toHaveLength(0);
      expect(await validar({ accountDigit: '12' })).not.toHaveLength(0);
    });

    it('recusa tipo de conta e tipo de chave fora do enum', async () => {
      expect(await validar({ accountType: 'POUPANCA' })).not.toHaveLength(0);
      expect(await validar({ pixKeyType: 'TELEFONE' })).not.toHaveLength(0);
    });

    it('nenhuma mensagem de validação repete o valor recebido', async () => {
      const erros = await validar({ accountNumber: '5678-90', branch: '12-34' });
      const mensagens = JSON.stringify(erros.map((erro) => erro.constraints));

      expect(mensagens).not.toContain('5678-90');
      expect(mensagens).not.toContain('12-34');
    });
  });

  describe('3 e 4. Permissões (RBAC existente)', () => {
    /// Teste de metadado: o `PermissionsGuard` já é exercitado pelo framework,
    /// e o que pode quebrar aqui é alguém REMOVER o decorator.
    const permissaoDe = (metodo: keyof BankAccountsController) =>
      Reflect.getMetadata(PERMISSIONS_KEY, BankAccountsController.prototype[metodo]) as
        string[] | undefined;

    it('consultar exige `dados_bancarios.view`', () => {
      expect(Reflect.getMetadata(PERMISSIONS_KEY, BankAccountsController)).toEqual([
        'dados_bancarios.view',
      ]);
    });

    it('cadastrar, editar e desativar exigem `dados_bancarios.manage`', () => {
      for (const metodo of ['create', 'update', 'updateStatus'] as const) {
        expect(permissaoDe(metodo)).toEqual(['dados_bancarios.view', 'dados_bancarios.manage']);
      }
    });

    it('ver o número completo exige a permissão própria, que `manage` não dá', () => {
      expect(permissaoDe('reveal')).toEqual(['dados_bancarios.view', 'dados_bancarios.reveal']);
      // Quem cadastra não passa a poder ler o que já estava lá.
      expect(permissaoDe('create')).not.toContain('dados_bancarios.reveal');
    });

    it('as três permissões deste módulo são as únicas exigidas', () => {
      const usadas = (['findAll', 'create', 'update', 'updateStatus', 'reveal'] as const).flatMap(
        (metodo) => permissaoDe(metodo) ?? [],
      );

      expect(new Set(usadas)).toEqual(
        new Set(['dados_bancarios.view', 'dados_bancarios.manage', 'dados_bancarios.reveal']),
      );
    });
  });
});
