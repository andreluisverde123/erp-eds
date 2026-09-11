import { ForbiddenException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import type { PrismaService } from '../prisma/prisma.service';
import { AuthService } from './auth.service';

const SENHA = 'senha-certa-123';
// Custo baixo só para o teste não levar segundos por hash.
const HASH = bcrypt.hashSync(SENHA, 4);

function usuario(email: string, status: string) {
  return {
    id: 'u1',
    name: 'Fulano',
    email,
    companyId: 'c1',
    isActive: true,
    deletedAt: null,
    mustChangePassword: false,
    diarioEnabled: true,
    passwordHash: HASH,
    company: {
      status,
      deletedAt: null,
      tradeName: 'EDS',
      legalName: 'EDS Construtora',
      logoUrl: null,
      systemSettings: null,
    },
    userRoles: [],
  };
}

function servico(user: ReturnType<typeof usuario>) {
  const prisma = {
    user: { findUnique: jest.fn().mockResolvedValue(user) },
    refreshToken: { create: jest.fn().mockResolvedValue({}) },
  } as unknown as PrismaService;
  const config = {
    get: () => undefined,
    getOrThrow: () => 'segredo-de-teste-com-no-minimo-32-caracteres',
  } as unknown as ConfigService;

  return new AuthService(prisma, new JwtService(), config);
}

async function erroDoLogin(service: AuthService, email: string) {
  try {
    await service.login(email, SENHA);
  } catch (error) {
    return error as ForbiddenException;
  }
  throw new Error('o login deveria ter sido recusado');
}

/// Empresa `SUSPENDED` é o corte por falta de pagamento: ninguém entra, e o
/// web precisa do código `PAYMENT_PENDING` para mostrar o banner. A exceção é
/// quem administra o contrato pela Obrei, que entra sempre.
describe('AuthService — empresa suspensa', () => {
  it('recusa o login com PAYMENT_PENDING', async () => {
    const service = servico(usuario('fulano@eds.com.br', 'SUSPENDED'));

    const erro = await erroDoLogin(service, 'fulano@eds.com.br');

    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(erro.getResponse()).toMatchObject({ code: 'PAYMENT_PENDING' });
  });

  it('deixa o admin@obrei.com entrar mesmo suspensa', async () => {
    const service = servico(usuario('admin@obrei.com', 'SUSPENDED'));

    const sessao = await service.login('admin@obrei.com', SENHA);

    expect(sessao.user.email).toBe('admin@obrei.com');
  });

  it('empresa cancelada não é cobrança: mensagem genérica, sem código', async () => {
    const service = servico(usuario('fulano@eds.com.br', 'CANCELLED'));

    const erro = await erroDoLogin(service, 'fulano@eds.com.br');

    expect(erro).toBeInstanceOf(ForbiddenException);
    expect(erro.getResponse()).not.toMatchObject({ code: expect.anything() });
  });
});
