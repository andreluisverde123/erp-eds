import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import type { PrismaService } from '../../prisma/prisma.service';
import { FiscalIntegrationController } from '../fiscal-integration.controller';
import { FiscalCertificateService } from './fiscal-certificate.service';

const EMPRESA = '11111111-1111-1111-1111-111111111111';

function emDias(dias: number): Date {
  return new Date(Date.now() + dias * 86_400_000);
}

/// Só o que `alertSummary` lê. O resto do serviço (cifra, upload, mTLS) não
/// participa desta conta.
function makeService(
  certificado: { notAfter: Date; isActive: boolean } | null,
): FiscalCertificateService {
  const prisma = {
    fiscalCertificate: { findUnique: jest.fn(async () => certificado) },
  } as unknown as PrismaService;

  return new FiscalCertificateService(prisma, {} as never, {} as never);
}

/// O AVISO DE VENCIMENTO DO CERTIFICADO na Home.
///
/// Existe porque a sincronização fiscal para sozinha e EM SILÊNCIO quando o
/// certificado vence: o job filtra por `notAfter > agora`, não acha empresa
/// elegível e volta sem gravar execução nem erro. Foram oito dias até alguém
/// notar a parada de 25/08/2026.
describe('Aviso de certificado vencendo', () => {
  describe('classificação', () => {
    it('certificado vencido é EXPIRED, com os dias em negativo', async () => {
      const service = makeService({ notAfter: emDias(-8), isActive: true });

      const alerta = await service.alertSummary(EMPRESA);

      expect(alerta.status).toBe('EXPIRED');
      // Negativo é o que permite a Home dizer "venceu há 8 dias".
      expect(alerta.diasParaExpirar).toBe(-8);
    });

    it('vencendo dentro de 30 dias é EXPIRING — ainda funciona, mas tem prazo', async () => {
      const service = makeService({ notAfter: emDias(29), isActive: true });

      expect((await service.alertSummary(EMPRESA)).status).toBe('EXPIRING');
    });

    it('o limite de 30 dias entra no aviso', async () => {
      // Renovar um A1 exige agendar validação com a autoridade certificadora;
      // a antecedência é o que torna o aviso acionável.
      const service = makeService({ notAfter: emDias(30), isActive: true });

      expect((await service.alertSummary(EMPRESA)).status).toBe('EXPIRING');
    });

    it('acima de 30 dias não avisa nada', async () => {
      const service = makeService({ notAfter: emDias(31), isActive: true });

      expect((await service.alertSummary(EMPRESA)).status).toBe('OK');
    });
  });

  describe('o que NÃO vira aviso', () => {
    it('empresa sem certificado não tem pendência', async () => {
      // Quem nunca configurou a integração fiscal não tem algo parado: tem uma
      // funcionalidade que não usa. Um aviso permanente e sem ação possível
      // treina a pessoa a ignorar o bloco inteiro.
      const service = makeService(null);

      const alerta = await service.alertSummary(EMPRESA);

      expect(alerta).toEqual({ status: 'OK', notAfter: null, diasParaExpirar: null });
    });

    it('certificado desativado não avisa — desligar é ato deliberado', async () => {
      const service = makeService({ notAfter: emDias(-8), isActive: false });

      expect((await service.alertSummary(EMPRESA)).status).toBe('OK');
    });
  });

  describe('o alerta não vaza a identidade da empresa', () => {
    it('devolve só situação, validade e dias', async () => {
      // A Home é aberta por toda pessoa que entra no sistema. Titular, emissor
      // e serial são do painel de Administração, não daqui.
      const service = makeService({ notAfter: emDias(-1), isActive: true });

      const alerta = await service.alertSummary(EMPRESA);

      expect(Object.keys(alerta).sort()).toEqual(['diasParaExpirar', 'notAfter', 'status']);
    });
  });

  describe('RBAC', () => {
    it('o aviso exige a permissão de quem pode RESOLVÊ-LO', () => {
      // Herdada da classe: a rota não tem decorator próprio, e `admin.
      // fiscal_integration` é a mesma permissão que abre o painel onde se sobe
      // o certificado novo. Avisar quem não tem como agir é ruído.
      const daClasse = Reflect.getMetadata(PERMISSIONS_KEY, FiscalIntegrationController) as
        | string[]
        | undefined;
      const doMetodo = Reflect.getMetadata(
        PERMISSIONS_KEY,
        FiscalIntegrationController.prototype.certificateAlert,
      ) as string[] | undefined;

      expect(daClasse).toEqual(['admin.fiscal_integration']);
      expect(doMetodo).toBeUndefined();
    });
  });
});
