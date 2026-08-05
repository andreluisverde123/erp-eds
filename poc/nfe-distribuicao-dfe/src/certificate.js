import { readFileSync } from 'node:fs';
import forge from 'node-forge';

/// OID do "otherName" onde a ICP-Brasil grava o CNPJ do titular, dentro da
/// subjectAltName. É a fonte confiável — o CN é texto livre e varia por AC.
const OID_CNPJ_ICP_BRASIL = '2.16.76.1.3.3';

/// Lê um PKCS#12 (.pfx/.p12) e devolve chave privada e cadeia em PEM.
///
/// POR QUE node-forge E NÃO O `pfx` NATIVO DO NODE
/// ------------------------------------------------
/// O caminho óbvio seria passar o buffer do .pfx direto para `https.Agent`
/// (`{ pfx, passphrase }`), que o Node aceita. Só que a partir do OpenSSL 3 os
/// algoritmos antigos saíram do provider padrão, e a maioria das ACs
/// brasileiras ainda emite A1 cifrado com **RC2-40-CBC** (pbeWithSHA1And40Bit)
/// — herança do PKCS#12 dos anos 90. O resultado é um erro opaco na hora de
/// abrir o arquivo:
///
///     error:0308010C:digital envelope routines::unsupported
///
/// As saídas seriam rodar o Node com `--openssl-legacy-provider` (uma flag de
/// processo inteiro, que enfraquece o runtime todo) ou reembalar o certificado
/// com `openssl pkcs12 -legacy`(exige intervenção manual a cada renovação, que
/// é anual). node-forge implementa o PKCS#12 em JavaScript puro, sem passar
/// pelo OpenSSL, então lê o arquivo como ele vem da AC — e a POC continua
/// rodando em Node novo sem flag nenhuma.
///
/// O material só existe em memória: nada é escrito em disco.
export function loadCertificate(pfxPath, password) {
  const buffer = readFileSync(pfxPath);
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(buffer.toString('binary')));

  let p12;
  try {
    p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, password);
  } catch (error) {
    // A mensagem crua do forge ("Invalid password?") não distingue senha
    // errada de arquivo corrompido — e as duas dão o mesmo erro.
    throw new Error(
      `Não foi possível abrir o PKCS#12. Causas usuais, nesta ordem: senha incorreta; ` +
        `arquivo não é um .pfx/.p12 válido; certificado A3 (token/cartão), que não é ` +
        `exportável e não serve para esta POC. Detalhe: ${error.message}`,
    );
  }

  const keyBags = {
    ...p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag }),
    ...p12.getBags({ bagType: forge.pki.oids.keyBag }),
  };
  const privateKeyBag = Object.values(keyBags).flat().find((bag) => bag?.key);
  if (!privateKeyBag) {
    throw new Error('O arquivo não contém chave privada — é um certificado público, não um A1.');
  }

  const certBags = p12.getBags({ bagType: forge.pki.oids.certBag })[forge.pki.oids.certBag] ?? [];
  if (certBags.length === 0) {
    throw new Error('O arquivo não contém nenhum certificado.');
  }

  // O certificado do titular é o que casa com a chave privada; os demais são
  // a cadeia (AC intermediária + raiz). Enviar a cadeia junto importa: sem ela
  // o servidor da SEFAZ pode não conseguir validar o nosso certificado.
  const certificates = certBags.map((bag) => bag.cert).filter(Boolean);
  const publicKeyOfPrivate = forge.pki.setRsaPublicKey(
    privateKeyBag.key.n,
    privateKeyBag.key.e,
  );
  const ownerPem = forge.pki.publicKeyToPem(publicKeyOfPrivate);
  const owner =
    certificates.find((cert) => forge.pki.publicKeyToPem(cert.publicKey) === ownerPem) ??
    certificates[0];

  const chain = certificates.filter((cert) => cert !== owner);

  return {
    keyPem: forge.pki.privateKeyToPem(privateKeyBag.key),
    certPem: forge.pki.certificateToPem(owner),
    chainPem: chain.map((cert) => forge.pki.certificateToPem(cert)),
    info: describe(owner),
  };
}

function describe(cert) {
  const subject = cert.subject.attributes
    .map((attr) => `${attr.shortName ?? attr.name}=${attr.value}`)
    .join(', ');
  const issuer = cert.issuer.attributes
    .map((attr) => `${attr.shortName ?? attr.name}=${attr.value}`)
    .join(', ');

  const now = new Date();
  const notBefore = cert.validity.notBefore;
  const notAfter = cert.validity.notAfter;

  return {
    subject,
    issuer,
    commonName: cert.subject.getField('CN')?.value ?? null,
    notBefore,
    notAfter,
    /// Um A1 vale 1 ano. Saber quantos dias faltam é operacionalmente
    /// relevante: certificado vencido derruba a integração inteira sem aviso,
    /// e a renovação não é automática.
    diasParaExpirar: Math.floor((notAfter - now) / 86_400_000),
    expirado: now > notAfter,
    aindaNaoValido: now < notBefore,
    cnpj: extractCnpj(cert),
    serialNumber: cert.serialNumber,
  };
}

/// Extrai o CNPJ do titular. Tenta primeiro o otherName da ICP-Brasil (dado
/// estruturado, confiável) e cai para o CN, que por convenção das ACs vem como
/// "RAZAO SOCIAL LTDA:12345678000199".
function extractCnpj(cert) {
  const altName = cert.extensions?.find((ext) => ext.name === 'subjectAltName');

  for (const alt of altName?.altNames ?? []) {
    // otherName = tipo 0. O forge não decodifica o conteúdo, então varremos os
    // dígitos do valor cru atrás de uma sequência de 14.
    if (alt.type === 0) {
      const raw = String(alt.value ?? '');
      if (raw.includes(OID_CNPJ_ICP_BRASIL) || true) {
        const match = raw.replace(/\D/g, '').match(/\d{14}/);
        if (match) return match[0];
      }
    }
  }

  const cn = cert.subject.getField('CN')?.value ?? '';
  const fromCn = cn.split(':')[1]?.replace(/\D/g, '');
  if (fromCn?.length === 14) return fromCn;

  return null;
}
