import { BadRequestException, NotFoundException } from '@nestjs/common';

import { CompensationType, EmploymentType } from '../../../generated/prisma/client';
import type { PrismaService } from '../../prisma/prisma.service';
import { EmployeesService } from './employees.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OUTRA_EMPRESA = '22222222-2222-2222-2222-222222222222';
const COLABORADOR = '33333333-3333-3333-3333-333333333333';

const BASE = {
  name: 'André',
  cpf: '12345678901',
  position: 'Pedreiro',
  hireDate: '2026-09-01',
};

/// Dublê que guarda o `data` e o `where` recebidos — é o que os testes
/// inspecionam. `gravado` só existe para o `update`, que precisa de uma linha
/// anterior para resolver a regra de remuneração.
function makeService(gravado: Record<string, unknown> | null = null) {
  const employee = {
    create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: COLABORADOR,
      ...data,
    })),
    update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
      id: COLABORADOR,
      ...data,
    })),
    // Devolve a linha só quando a empresa do pedido bate com a dela: é assim
    // que o service enxerga "não existe" para um id de outro tenant.
    findFirst: jest.fn(async ({ where }: { where: Record<string, unknown> }) =>
      gravado && where.companyId === gravado.companyId ? gravado : null,
    ),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
  };

  const prisma = {
    employee,
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
  } as unknown as PrismaService;

  const service = new EmployeesService(prisma);
  return { service, employee };
}

const linhaGravada = (extra: Record<string, unknown> = {}) => ({
  id: COLABORADOR,
  companyId: EMPRESA,
  // `findOne` recarrega o registro depois de gravar e deriva a obra atual a
  // partir daqui. Vazio: alocação é assunto do RH-02.
  allocations: [],
  ...BASE,
  hireDate: new Date(BASE.hireDate),
  compensationType: CompensationType.CLT,
  dailyRate: null,
  employmentType: EmploymentType.OWN,
  ...extra,
});

describe('Cadastro de colaborador', () => {
  it('quem não informa vínculo nem remuneração cai no default de sempre', async () => {
    // É o que descreve todo colaborador já cadastrado antes deste campo
    // existir — mão de obra própria, mensalista. Por isso a migration pôde ser
    // aditiva sem tocar em nenhuma linha.
    const { service, employee } = makeService(linhaGravada());

    await service.create(EMPRESA, { ...BASE });

    const data = employee.create.mock.calls[0]![0].data;
    expect(data.compensationType).toBe(CompensationType.CLT);
    expect(data.employmentType).toBeUndefined();
  });

  it('diarista terceirizado grava vínculo, tipo e valor', async () => {
    // O exemplo do enunciado: André, pedreiro, R$ 180,00 a diária.
    const { service, employee } = makeService(linhaGravada());

    await service.create(EMPRESA, {
      ...BASE,
      employmentType: EmploymentType.OUTSOURCED,
      compensationType: CompensationType.DAILY,
      dailyRate: 180,
    });

    expect(employee.create.mock.calls[0]![0].data).toMatchObject({
      companyId: EMPRESA,
      employmentType: EmploymentType.OUTSOURCED,
      compensationType: CompensationType.DAILY,
      dailyRate: 180,
    });
  });

  it('a empresa vem da sessão, nunca do corpo do pedido', async () => {
    // O cliente não tem como escolher o tenant: `companyId` é escrito pelo
    // service a partir de quem está autenticado.
    const { service, employee } = makeService(linhaGravada());

    await service.create(EMPRESA, {
      ...BASE,
      companyId: OUTRA_EMPRESA,
    } as never);

    expect(employee.create.mock.calls[0]![0].data.companyId).toBe(EMPRESA);
  });

  it('diarista sem valor não chega ao banco', async () => {
    const { service, employee } = makeService(linhaGravada());

    await expect(
      service.create(EMPRESA, { ...BASE, compensationType: CompensationType.DAILY }),
    ).rejects.toThrow(BadRequestException);
    expect(employee.create).not.toHaveBeenCalled();
  });

  it('CLT não grava diária mesmo se o cliente mandar uma', async () => {
    const { service, employee } = makeService(linhaGravada());

    await service.create(EMPRESA, {
      ...BASE,
      compensationType: CompensationType.CLT,
      dailyRate: 180,
    });

    expect(employee.create.mock.calls[0]![0].data.dailyRate).toBeUndefined();
  });
});

describe('Edição', () => {
  it('mudar para CLT limpa a diária gravada', async () => {
    const { service, employee } = makeService(
      linhaGravada({ compensationType: CompensationType.DAILY, dailyRate: 180 }),
    );

    await service.update(EMPRESA, COLABORADOR, { compensationType: CompensationType.CLT });

    expect(employee.update.mock.calls[0]![0].data.dailyRate).toBeNull();
  });

  it('editar o nome de um diarista não reescreve a diária', async () => {
    const { service, employee } = makeService(
      linhaGravada({ compensationType: CompensationType.DAILY, dailyRate: 180 }),
    );

    await service.update(EMPRESA, COLABORADOR, { name: 'André Verde' });

    expect(employee.update.mock.calls[0]![0].data.dailyRate).toBeUndefined();
  });

  it('inativar é uma edição de status, e o colaborador continua existindo', async () => {
    // Inativo precisa continuar na base: o histórico de obra e de apontamento
    // aponta para ele.
    const { service, employee } = makeService(linhaGravada());

    await service.update(EMPRESA, COLABORADOR, { status: 'TERMINATED' });

    expect(employee.update.mock.calls[0]![0].data.status).toBe('TERMINATED');
    expect(employee.update.mock.calls[0]![0].data.deletedAt).toBeUndefined();
  });
});

describe('Isolamento entre empresas', () => {
  it('editar colaborador de outra empresa dá "não encontrado"', async () => {
    // Não é 403: quem não é do tenant não fica sabendo que o registro existe.
    const { service, employee } = makeService(linhaGravada({ companyId: OUTRA_EMPRESA }));

    await expect(service.update(EMPRESA, COLABORADOR, { name: 'X' })).rejects.toThrow(
      NotFoundException,
    );
    expect(employee.update).not.toHaveBeenCalled();
  });

  it('consultar colaborador de outra empresa dá "não encontrado"', async () => {
    const { service } = makeService(linhaGravada({ companyId: OUTRA_EMPRESA }));

    await expect(service.findOne(EMPRESA, COLABORADOR)).rejects.toThrow(NotFoundException);
  });

  it('excluir colaborador de outra empresa dá "não encontrado"', async () => {
    const { service, employee } = makeService(linhaGravada({ companyId: OUTRA_EMPRESA }));

    await expect(service.remove(EMPRESA, COLABORADOR)).rejects.toThrow(NotFoundException);
    expect(employee.update).not.toHaveBeenCalled();
  });

  it('a listagem sempre filtra pela empresa da sessão', async () => {
    const { service, employee } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(employee.findMany.mock.calls[0]![0].where).toMatchObject({
      companyId: EMPRESA,
      deletedAt: null,
    });
  });
});

describe('Filtros da listagem', () => {
  it('vínculo e remuneração chegam ao where', async () => {
    const { service, employee } = makeService();

    await service.findAll(EMPRESA, {
      page: 1,
      limit: 10,
      employmentType: EmploymentType.OUTSOURCED,
      compensationType: CompensationType.DAILY,
    });

    expect(employee.findMany.mock.calls[0]![0].where).toMatchObject({
      employmentType: EmploymentType.OUTSOURCED,
      compensationType: CompensationType.DAILY,
    });
  });

  it('sem filtro, nenhum dos dois entra no where', async () => {
    // `undefined` faz o Prisma ignorar a chave. Um valor padrão aqui esconderia
    // metade do cadastro sem ninguém ter pedido.
    const { service, employee } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    const where = employee.findMany.mock.calls[0]![0].where;
    expect(where.employmentType).toBeUndefined();
    expect(where.compensationType).toBeUndefined();
  });

  it('colaborador excluído logicamente fica fora da listagem', async () => {
    const { service, employee } = makeService();

    await service.findAll(EMPRESA, { page: 1, limit: 10 });

    expect(employee.findMany.mock.calls[0]![0].where.deletedAt).toBeNull();
  });
});
