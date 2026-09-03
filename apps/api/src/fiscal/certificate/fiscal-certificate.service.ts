import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import forge from 'node-forge';

import { AuditLoggerService } from '../../common/services/audit-logger.service';
import { PrismaService } from '../../prisma/prisma.service';
import { FiscalCryptoService } from '../crypto/fiscal-crypto.service';

/// OID onde a ICP-Brasil grava o CNPJ do titular. O CN é texto livre e varia
/// por AC; este é o dado estruturado.
const OID_CNPJ_ICP_BRASIL = '2.16.76.1.3.3';

/// O Prisma 7 tipa colunas `Bytes` como `Uint8Array<ArrayBuffer>`, e um
/// `Buffer` do Node não é atribuível a ele — o `ArrayBufferLike` do Buffer
/// admite `SharedArrayBuffer`, que o Prisma recusa. `from` copia para um
/// ArrayBuffer próprio; são poucos KB, e a alternativa (um cast) esconderia
/// uma incompatibilidade real de tipos.
function toBytes(buffer: Buffer): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(buffer);
}

/// Material do certificado pronto para uso em mTLS. NUNCA é serializado numa
/// resposta HTTP nem em log — só trafega entre serviços em memória.
export interface CertificateMaterial {
  keyPem: string;
  certPem: string;
  chainPem: string[];
  cnpj: string;
}

/// Quantos dias antes do vencimento o alerta da Home começa a aparecer.
///
/// 30 dias é a mesma antecedência que o alerta de contrato vencendo já usa, e
/// cabe no processo real: renovar um A1 exige agendar validação presencial ou
/// por vídeo com a autoridade certificadora, o que não se resolve na véspera.
const DIAS_DE_ANTECEDENCIA = 30;

/// Dias inteiros até o vencimento. Negativo quando já passou.
///
/// `trunc` e não `floor`, e a diferença só aparece do lado negativo — que é
/// justamente o do certificado JÁ VENCIDO.
///
/// Um certificado que venceu há oito dias e algumas horas dá `-8,3`. `floor`
/// arredonda para BAIXO, devolve `-9`, e a Home anuncia "venceu há 9 dias" —
/// um dia a mais do que a verdade, num número que a pessoa confere contra a
/// data do certificado. `trunc` corta a fração e devolve `-8`.
///
/// Do lado positivo os dois concordam, e é o comportamento certo: faltando
/// 12,9 dias, o aviso diz "vence em 12" — nunca arredonda o prazo para cima.
function diasAte(notAfter: Date, agora = new Date()): number {
  return Math.trunc((notAfter.getTime() - agora.getTime()) / 86_400_000);
}

/// O que a Home precisa saber sobre o certificado — e só isso.
///
/// Separado de `CertificateInfo` de propósito: aquele é o painel de
/// Administração e carrega titular, emissor e serial. A Home é consultada por
/// toda pessoa que entra no sistema, e não deve trafegar a identidade
/// jurídica da empresa para desenhar uma linha de aviso.
export interface CertificateAlert {
  /// `EXPIRED` — venceu, e a sincronização fiscal ESTÁ PARADA agora.
  /// `EXPIRING` — vence dentro da janela; ainda funciona.
  /// `OK` — nada a avisar.
  status: 'OK' | 'EXPIRING' | 'EXPIRED';
  notAfter: Date | null;
  /// Negativo quando já venceu — é o que permite dizer "vencido há 8 dias".
  diasParaExpirar: number | null;
}

export interface CertificateInfo {
  cnpj: string;
  subjectName: string;
  issuerName: string;
  serialNumber: string;
  notBefore: Date;
  notAfter: Date;
  isActive: boolean;
  expirado: boolean;
  diasParaExpirar: number;
  uploadedAt: Date;
}

@Injectable()
export class FiscalCertificateService {
  private readonly logger = new Logger(FiscalCertificateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: FiscalCryptoService,
    private readonly auditLogger: AuditLoggerService,
  ) {}

  /// Recebe o .pfx, valida abrindo com a senha e guarda AMBOS cifrados.
  ///
  /// A validação acontece ANTES de gravar de propósito: um certificado que não
  /// abre, ou já expirado, gravado no banco viraria uma sincronização que
  /// falha de hora em hora sem ninguém entender por quê.
  async upload(
    companyId: string,
    actingUserId: string,
    ipAddress: string | undefined,
    pfx: Buffer,
    password: string,
  ) {
    const parsed = this.parsePfx(pfx, password);

    if (parsed.notAfter < new Date()) {
      throw new BadRequestException(
        `Este certificado expirou em ${parsed.notAfter.toLocaleDateString('pt-BR')}. Envie um certificado válido.`,
      );
    }
    if (!parsed.cnpj) {
      throw new BadRequestException(
        'Não foi possível identificar o CNPJ no certificado. Confirme que é um e-CNPJ (A1), não um e-CPF.',
      );
    }

    await this.prisma.fiscalCertificate.upsert({
      where: { companyId },
      create: {
        companyId,
        encryptedPfx: toBytes(this.crypto.encryptBuffer(pfx)),
        encryptedPassword: this.crypto.encryptString(password),
        cnpj: parsed.cnpj,
        subjectName: parsed.subjectName,
        issuerName: parsed.issuerName,
        serialNumber: parsed.serialNumber,
        notBefore: parsed.notBefore,
        notAfter: parsed.notAfter,
        isActive: true,
        uploadedById: actingUserId,
      },
      update: {
        encryptedPfx: toBytes(this.crypto.encryptBuffer(pfx)),
        encryptedPassword: this.crypto.encryptString(password),
        cnpj: parsed.cnpj,
        subjectName: parsed.subjectName,
        issuerName: parsed.issuerName,
        serialNumber: parsed.serialNumber,
        notBefore: parsed.notBefore,
        notAfter: parsed.notAfter,
        isActive: true,
        uploadedById: actingUserId,
      },
    });

    // O log registra QUE houve troca e de qual titular — nunca o arquivo, a
    // senha ou o serial completo.
    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'UPDATE',
      entityType: 'FiscalCertificate',
      entityId: companyId,
      ipAddress,
      changes: { action: 'upload', cnpj: parsed.cnpj, notAfter: parsed.notAfter.toISOString() },
    });

    this.logger.log(
      `Certificado A1 instalado para o CNPJ ${parsed.cnpj}, válido até ${parsed.notAfter.toISOString().slice(0, 10)}.`,
    );

    return this.findInfo(companyId);
  }

  /// Dados do certificado para o painel. Só metadados — o material cifrado
  /// nunca sai por aqui.
  async findInfo(companyId: string): Promise<CertificateInfo | null> {
    const row = await this.prisma.fiscalCertificate.findUnique({
      where: { companyId },
      select: {
        cnpj: true,
        subjectName: true,
        issuerName: true,
        serialNumber: true,
        notBefore: true,
        notAfter: true,
        isActive: true,
        createdAt: true,
      },
    });
    if (!row) return null;

    const agora = new Date();
    return {
      cnpj: row.cnpj,
      subjectName: row.subjectName,
      issuerName: row.issuerName,
      // Só os 8 últimos: o serial completo identifica o certificado de forma
      // única e não precisa aparecer numa tela para cumprir seu papel aqui.
      serialNumber: `…${row.serialNumber.slice(-8)}`,
      notBefore: row.notBefore,
      notAfter: row.notAfter,
      isActive: row.isActive,
      expirado: row.notAfter < agora,
      diasParaExpirar: diasAte(row.notAfter, agora),
      uploadedAt: row.createdAt,
    };
  }

  /// O aviso de vencimento para a Home.
  ///
  /// **Por que existe.** A sincronização fiscal para SOZINHA e EM SILÊNCIO
  /// quando o certificado vence: o job filtra por `notAfter > agora`, não
  /// encontra empresa elegível e retorna sem gravar execução nem erro (ver
  /// `fiscal-sync.job.ts`). O painel de Administração sabe dizer
  /// `CERTIFICADO_EXPIRADO`, mas ninguém abre aquele painel todo dia — foram
  /// oito dias até alguém notar a parada de 25/08/2026.
  ///
  /// **Ausência de certificado NÃO alerta.** Empresa que nunca configurou a
  /// integração fiscal não tem uma pendência: tem uma funcionalidade que não
  /// usa. Um aviso permanente e sem ação possível treina a pessoa a ignorar o
  /// bloco inteiro — inclusive as linhas que importam.
  ///
  /// **Certificado desativado (`isActive: false`) também não alerta**: desligar
  /// é ato deliberado de quem administra. A lacuna é conhecida — a
  /// sincronização também para nesse caso — e fica registrada aqui em vez de
  /// virar um aviso que ninguém pediu.
  async alertSummary(companyId: string): Promise<CertificateAlert> {
    const row = await this.prisma.fiscalCertificate.findUnique({
      where: { companyId },
      select: { notAfter: true, isActive: true },
    });

    if (!row || !row.isActive) {
      return { status: 'OK', notAfter: null, diasParaExpirar: null };
    }

    // Mesma conta do `findInfo`, para o painel e a Home nunca discordarem em
    // um dia por arredondarem diferente.
    const diasParaExpirar = diasAte(row.notAfter);

    return {
      status:
        row.notAfter < new Date()
          ? 'EXPIRED'
          : diasParaExpirar <= DIAS_DE_ANTECEDENCIA
            ? 'EXPIRING'
            : 'OK',
      notAfter: row.notAfter,
      diasParaExpirar,
    };
  }

  /// Decifra o certificado para uso numa conexão mTLS. Chamado apenas pelo
  /// serviço de sincronização, nunca por um controller.
  async loadMaterial(companyId: string): Promise<CertificateMaterial> {
    const row = await this.prisma.fiscalCertificate.findUnique({ where: { companyId } });
    if (!row || !row.isActive) {
      throw new NotFoundException(
        'Nenhum certificado digital ativo configurado para esta empresa.',
      );
    }
    if (row.notAfter < new Date()) {
      throw new BadRequestException(
        `O certificado digital expirou em ${row.notAfter.toLocaleDateString('pt-BR')}. Envie um novo pelo painel de Integração Fiscal.`,
      );
    }

    const pfx = this.crypto.decryptBuffer(Buffer.from(row.encryptedPfx));
    const password = this.crypto.decryptString(row.encryptedPassword);
    const parsed = this.parsePfx(pfx, password);

    return {
      keyPem: parsed.keyPem,
      certPem: parsed.certPem,
      chainPem: parsed.chainPem,
      cnpj: row.cnpj,
    };
  }

  async remove(companyId: string, actingUserId: string, ipAddress: string | undefined) {
    const existing = await this.prisma.fiscalCertificate.findUnique({ where: { companyId } });
    if (!existing) {
      throw new NotFoundException('Nenhum certificado configurado.');
    }

    await this.prisma.fiscalCertificate.delete({ where: { companyId } });

    await this.auditLogger.log({
      companyId,
      userId: actingUserId,
      action: 'DELETE',
      entityType: 'FiscalCertificate',
      entityId: companyId,
      ipAddress,
      changes: { action: 'remove', cnpj: existing.cnpj },
    });

    this.logger.warn(`Certificado A1 removido (CNPJ ${existing.cnpj}). A sincronização vai parar.`);
  }

  /// Lê o PKCS#12 com node-forge, e NÃO com o `pfx` nativo do Node.
  ///
  /// Medido na POC com o certificado real da EDS (Node 25 / OpenSSL 3.6):
  /// `tls.createSecureContext({ pfx })` falha com
  /// `ERR_CRYPTO_UNSUPPORTED_OPERATION: Unsupported PKCS12 PFX data`, porque as
  /// ACs brasileiras cifram o arquivo com `pbeWithSHA1And40BitRC2-CBC` e esse
  /// algoritmo saiu do provider padrão do OpenSSL 3. O forge implementa
  /// PKCS#12 em JS puro e lê o arquivo como ele vem da AC — sem precisar da
  /// flag `--openssl-legacy-provider`, que enfraqueceria o processo inteiro.
  private parsePfx(pfx: Buffer, password: string) {
    let p12: forge.pkcs12.Pkcs12Pfx;
    try {
      const asn1 = forge.asn1.fromDer(forge.util.createBuffer(pfx.toString('binary')));
      p12 = forge.pkcs12.pkcs12FromAsn1(asn1, password);
    } catch {
      // A mensagem do forge não distingue senha errada de arquivo inválido —
      // e o usuário precisa saber o que tentar.
      throw new BadRequestException(
        'Não foi possível abrir o certificado. Verifique a senha e confirme que o arquivo é um .pfx/.p12 (A1). Certificado A3 em token não pode ser usado.',
      );
    }

    const keyBags = {
      ...p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
      ...p12.getBags({ bagType: forge.pki.oids.keyBag }),
    };
    const keyBag = Object.values(keyBags)
      .flat()
      .find((bag) => bag?.key);
    if (!keyBag?.key) {
      throw new BadRequestException(
        'O arquivo não contém chave privada — parece um certificado público, não um A1.',
      );
    }

    const certBagOid = forge.pki.oids.certBag as string;
    const certBags = p12.getBags({ bagType: certBagOid })[certBagOid] ?? [];
    const certificates = certBags.map((bag) => bag.cert).filter(Boolean) as forge.pki.Certificate[];
    if (certificates.length === 0) {
      throw new BadRequestException('O arquivo não contém nenhum certificado.');
    }

    const privateKey = keyBag.key as forge.pki.rsa.PrivateKey;
    const ownerPublicPem = forge.pki.publicKeyToPem(
      forge.pki.setRsaPublicKey(privateKey.n, privateKey.e),
    );
    const owner =
      certificates.find((cert) => forge.pki.publicKeyToPem(cert.publicKey) === ownerPublicPem) ??
      certificates[0]!;

    return {
      keyPem: forge.pki.privateKeyToPem(privateKey),
      certPem: forge.pki.certificateToPem(owner),
      chainPem: certificates
        .filter((cert) => cert !== owner)
        .map((cert) => forge.pki.certificateToPem(cert)),
      cnpj: this.extractCnpj(owner),
      subjectName: owner.subject.getField('CN')?.value ?? 'Desconhecido',
      issuerName: owner.issuer.getField('CN')?.value ?? 'Desconhecido',
      serialNumber: owner.serialNumber,
      notBefore: owner.validity.notBefore,
      notAfter: owner.validity.notAfter,
    };
  }

  private extractCnpj(cert: forge.pki.Certificate): string {
    const altName = cert.extensions?.find((ext) => ext.name === 'subjectAltName');

    for (const alt of (altName?.altNames ?? []) as { type: number; value?: string }[]) {
      if (alt.type === 0) {
        const digits = String(alt.value ?? '').replace(/\D/g, '');
        const match = digits.match(/\d{14}/);
        if (match) return match[0];
      }
    }
    void OID_CNPJ_ICP_BRASIL;

    // Convenção das ACs: CN = "RAZAO SOCIAL LTDA:12345678000199".
    const cn = cert.subject.getField('CN')?.value ?? '';
    const fromCn = cn.split(':')[1]?.replace(/\D/g, '');
    return fromCn?.length === 14 ? fromCn : '';
  }
}
