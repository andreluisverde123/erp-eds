import type { PrismaService } from '../../prisma/prisma.service';
import { ConstructionSitesService } from './construction-sites.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';
const OBRA = '22222222-2222-2222-2222-222222222222';

/// Dublê que GUARDA o `data` recebido — é ele que o teste inspeciona.
///
/// O `data` do Prisma é montado campo a campo no service, e é justamente aí
/// que um campo pode sumir: ele passa pela validação do DTO, chega ao service e
/// simplesmente não é copiado. O banco nunca fica sabendo.
function makeService() {
  const gravados: Record<string, unknown>[] = [];

  const prisma = {
    constructionSite: {
      findFirst: jest.fn(async () => ({ id: OBRA, companyId: EMPRESA, code: 'OBR-001' })),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        gravados.push(data);
        return { id: OBRA };
      }),
      update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
        gravados.push(data);
        return { id: OBRA };
      }),
    },
    userConstructionSite: { upsert: jest.fn(async () => ({})) },
    user: { findFirst: jest.fn(async () => null) },
  } as unknown as PrismaService;

  const service = new ConstructionSitesService(prisma);
  // `findOne` recarrega a obra depois de gravar; o que ele devolve não é o
  // assunto deste teste.
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: OBRA } as never);

  return { service, gravados };
}

const ENDERECO = {
  zipCode: '69312218',
  addressLine: 'AV. GENERAL ATAÍDE TEIVE',
  addressNumber: '3996',
  addressComplement: 'CANTEIRO DE OBRAS',
  neighborhood: 'CAIMBÉ',
  city: 'BOA VISTA',
  state: 'RR',
};

/// O ENDEREÇO DE ENTREGA DA OBRA chega ao banco.
///
/// Defeito real, relatado em uso: a pessoa editava o endereço, salvava, fechava
/// e reabria — e o endereço não estava lá. A tela mandava, o DTO validava, e o
/// service montava o `data` campo a campo SEM copiar nenhum dos cinco campos
/// novos. Nada falhava; o dado só era descartado no caminho.
///
/// Estes testes existem porque nenhum dos outros pegaria isso: os do PDF
/// recebem o endereço pronto, e os do formulário param no envio.
describe('Endereço da obra chega ao banco', () => {
  it('a CRIAÇÃO grava os cinco campos de endereço', async () => {
    const { service, gravados } = makeService();

    await service.create(EMPRESA, { code: 'OBR-001', name: 'Torre B', ...ENDERECO });

    expect(gravados[0]).toMatchObject(ENDERECO);
  });

  it('a EDIÇÃO grava os cinco campos de endereço', async () => {
    // É o caminho do relato: obra já existente, endereço preenchido depois.
    const { service, gravados } = makeService();

    await service.update(EMPRESA, OBRA, ENDERECO);

    expect(gravados[0]).toMatchObject(ENDERECO);
  });

  it('nenhum dos campos é esquecido individualmente', async () => {
    // Um a um, e não só o objeto inteiro: o defeito original era a AUSÊNCIA de
    // uma linha por campo no `data`, então esquecer só o bairro produziria
    // exatamente o mesmo sintoma e passaria num teste de objeto parcial.
    const { service, gravados } = makeService();

    await service.update(EMPRESA, OBRA, ENDERECO);

    for (const campo of Object.keys(ENDERECO)) {
      expect(gravados[0]).toHaveProperty(campo, ENDERECO[campo as keyof typeof ENDERECO]);
    }
  });

  it('editar sem mandar endereço não apaga o que está gravado', async () => {
    // `undefined` no Prisma significa "não mexa neste campo". Trocar por `null`
    // aqui limparia o endereço de toda obra a cada edição de nome.
    const { service, gravados } = makeService();

    await service.update(EMPRESA, OBRA, { name: 'Outro nome' });

    expect(gravados[0]!.addressLine).toBeUndefined();
    expect(gravados[0]!.neighborhood).toBeUndefined();
    expect(gravados[0]!.zipCode).toBeUndefined();
  });
});
