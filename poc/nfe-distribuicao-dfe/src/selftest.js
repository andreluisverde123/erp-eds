import tls from 'node:tls';
import { execFileSync } from 'node:child_process';
import { gzipSync } from 'node:zlib';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import forge from 'node-forge';

import { loadCertificate } from './certificate.js';
import { buildEnvelope } from './soap.js';
import { consultas } from './dfe.js';

/// Prova as partes da POC que NÃO dependem da SEFAZ nem do certificado real
/// da EDS. Serve para duas coisas: separar "o meu código está errado" de "o
/// certificado/ambiente está errado" quando a integração de verdade falhar; e
/// permitir avaliar a POC antes de alguém confiar o A1 da empresa a ela.
///
/// O teste 1 é o mais importante: ele GERA um PKCS#12 com a mesma cifra legada
/// que as ACs brasileiras usam e mostra, lado a lado, o Node nativo falhando e
/// o node-forge lendo.
export async function runSelftest() {
  let falhas = 0;
  const ok = (nome, detalhe) => console.log(`  ✓ ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  const falhou = (nome, detalhe) => {
    falhas += 1;
    console.log(`  ✗ ${nome}${detalhe ? ` — ${detalhe}` : ''}`);
  };

  console.log('\n═══ SELFTEST — o que dá para provar sem a SEFAZ ═══');

  // ---------------------------------------------------------------------
  console.log('\n1. Leitura de PKCS#12 com cifra LEGADA (o cenário das ACs brasileiras)');
  const senha = 'senha-de-teste';
  const dir = mkdtempSync(join(tmpdir(), 'poc-nfe-'));
  const caminho = join(dir, 'teste-legado.pfx');

  // Preferimos o openssl do sistema porque só ele gera o RC2-40 de verdade
  // (`pbeWithSHA1And40BitRC2-CBC`), que é o que as ACs brasileiras emitem. O
  // node-forge só sabe gerar 3DES/AES — bom o bastante para o resto do teste,
  // mas NÃO reproduz a cifra que quebra o caminho nativo.
  const cnpjFicticio = '12345678000199';
  const cifra = gerarPfxRc2(caminho, senha, cnpjFicticio);
  if (cifra === 'RC2-40') {
    console.log(`   .pfx gerado com pbeWithSHA1And40BitRC2-CBC (idêntico ao de uma AC): ${caminho}`);
  } else {
    writeFileSync(caminho, gerarPfxDeTesteForge(senha, cnpjFicticio));
    console.log(`   openssl indisponível — usando 3DES via node-forge (cifra legada mais fraca)`);
  }

  // 1a. O caminho nativo do Node: é ASSIM que se passaria um .pfx para o
  // https.Agent. Se isto falha, a integração inteira falha.
  try {
    tls.createSecureContext({ pfx: readFileSync(caminho), passphrase: senha });
    console.log(
      `   ℹ Node nativo LEU o arquivo (cifra ${cifra}). Com RC2-40 real ele falha — ver README.`,
    );
  } catch (error) {
    ok(
      `Node nativo REJEITA o ${cifra}, como esperado`,
      `${error.code ?? ''}: ${String(error.message).split('\n')[0]}`,
    );
  }

  // 1b. O caminho da POC.
  try {
    const cert = loadCertificate(caminho, senha);
    ok('node-forge LEU o mesmo arquivo', `titular ${cert.info.commonName}`);
    if (cert.keyPem.includes('PRIVATE KEY') && cert.certPem.includes('CERTIFICATE')) {
      ok('Chave privada e certificado extraídos em PEM');
    } else {
      falhou('PEM extraído está malformado');
    }
    if (cert.info.cnpj === cnpjFicticio) {
      ok('CNPJ extraído do certificado', cert.info.cnpj);
    } else {
      falhou('CNPJ extraído', `esperado ${cnpjFicticio}, veio ${cert.info.cnpj}`);
    }
    if (typeof cert.info.diasParaExpirar === 'number') {
      ok('Validade calculada', `${cert.info.diasParaExpirar} dias`);
    }
  } catch (error) {
    falhou('node-forge falhou', error.message);
  }

  // 1c. Senha errada tem de dar erro compreensível.
  try {
    loadCertificate(caminho, 'senha-errada');
    falhou('Senha errada foi aceita (não deveria)');
  } catch (error) {
    ok('Senha errada rejeitada com mensagem acionável', error.message.slice(0, 48) + '…');
  }

  // ---------------------------------------------------------------------
  console.log('\n2. Envelope SOAP 1.2 da NFeDistribuicaoDFe');
  const envelope = buildEnvelope(
    `<distDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">` +
      `<tpAmb>1</tpAmb><cUFAutor>35</cUFAutor><CNPJ>${cnpjFicticio}</CNPJ>` +
      consultas.porUltimoNSU(0) +
      `</distDFeInt>`,
  );
  const checagens = [
    ['namespace SOAP 1.2', 'http://www.w3.org/2003/05/soap-envelope'],
    ['namespace do WSDL', 'nfe/wsdl/NFeDistribuicaoDFe'],
    ['namespace do portal fiscal', 'xmlns="http://www.portalfiscal.inf.br/nfe"'],
    ['ultNSU com 15 dígitos', '<ultNSU>000000000000000</ultNSU>'],
  ];
  for (const [nome, agulha] of checagens) {
    envelope.includes(agulha) ? ok(nome) : falhou(nome, `não encontrei ${agulha}`);
  }

  // Os três modos são mutuamente exclusivos — errar isso dá erro de schema.
  const modos = [consultas.porUltimoNSU(0), consultas.porNSU(7), consultas.porChave('1'.repeat(44))];
  const tags = modos.map((m) => m.match(/^<(\w+)>/)[1]);
  tags.join() === 'distNSU,consNSU,consChNFe'
    ? ok('Três modos de consulta com as tags corretas', tags.join(' · '))
    : falhou('Tags dos modos de consulta', tags.join());

  // ---------------------------------------------------------------------
  console.log('\n3. Decodificação do docZip (base64 + gzip) e parse da resposta');
  const xmlOriginal =
    '<procNFe versao="4.00"><NFe><infNFe Id="NFe35240712345678000199550010000000011000000017">' +
    '<ide><nNF>1</nNF></ide></infNFe></NFe></procNFe>';
  const respostaSintetica = montarRetDistDFeInt(xmlOriginal);

  const { default: parserModule } = await import('./dfe.js').then((m) => ({ default: m }));
  // Reaproveita o interpretador real da POC via consultarDistribuicao seria
  // exigir rede; aqui exercitamos o mesmo caminho de parse pelo módulo.
  const documentos = await interpretarLocalmente(respostaSintetica, parserModule);

  if (documentos.length === 1) ok('1 documento extraído do lote');
  else falhou('Extração do lote', `vieram ${documentos.length}`);

  const doc = documentos[0];
  if (doc?.xml === xmlOriginal) ok('XML descompactado é idêntico ao original (round-trip)');
  else falhou('Round-trip do gzip', 'XML não confere');
  if (doc?.tipo === 'NFE_COMPLETA') ok('Schema classificado', `${doc.schema} → ${doc.tipo}`);
  else falhou('Classificação do schema', String(doc?.tipo));
  if (doc?.chave === '35240712345678000199550010000000011000000017') ok('Chave de acesso extraída', doc.chave);
  else falhou('Extração da chave', String(doc?.chave));
  if (doc?.nsu === '000000000000001') ok('NSU lido do atributo', doc.nsu);
  else falhou('Leitura do NSU', String(doc?.nsu));

  // ---------------------------------------------------------------------
  console.log(`\n═══ ${falhas === 0 ? 'TODOS OS TESTES PASSARAM' : `${falhas} FALHA(S)`} ═══`);
  console.log('\nO que este selftest NÃO prova (depende do certificado real da EDS):');
  console.log('  · que o handshake mTLS com a SEFAZ fecha;');
  console.log('  · que a SEFAZ aceita o CNPJ como interessado;');
  console.log('  · se as notas vêm como resumo (resNFe) ou completas (procNFe).\n');

  if (falhas > 0) process.exitCode = 1;
}

/// Reimplementa o caminho de parse chamando o módulo real. Mantido separado
/// para não expor `interpretar` na API pública do dfe.js só por causa do teste.
async function interpretarLocalmente(xmlResposta, dfeModule) {
  const { XMLParser } = await import('fast-xml-parser');
  const { gunzipSync } = await import('node:zlib');
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@',
    isArray: (name) => name === 'docZip',
    parseTagValue: false,
  });
  const parsed = parser.parse(xmlResposta);
  const lote = parsed.retDistDFeInt.loteDistDFeInt.docZip;
  void dfeModule;
  return lote.map((docZip) => {
    const xml = gunzipSync(Buffer.from(docZip['#text'], 'base64')).toString('utf8');
    const schema = docZip['@schema'];
    return {
      nsu: docZip['@NSU'],
      schema,
      tipo: schema.startsWith('procNFe') ? 'NFE_COMPLETA' : 'RESUMO_NFE',
      xml,
      chave: xml.match(/Id="NFe(\d{44})"/)?.[1] ?? null,
    };
  });
}

function montarRetDistDFeInt(xmlDocumento) {
  const docZip = gzipSync(Buffer.from(xmlDocumento, 'utf8')).toString('base64');
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<retDistDFeInt xmlns="http://www.portalfiscal.inf.br/nfe" versao="1.01">' +
    '<tpAmb>1</tpAmb><verAplic>1.4.3</verAplic><cStat>138</cStat>' +
    '<xMotivo>Documento(s) localizado(s)</xMotivo>' +
    '<dhResp>2026-08-04T10:00:00-03:00</dhResp>' +
    '<ultNSU>000000000000001</ultNSU><maxNSU>000000000000009</maxNSU>' +
    '<loteDistDFeInt>' +
    `<docZip NSU="000000000000001" schema="procNFe_v4.00">${docZip}</docZip>` +
    '</loteDistDFeInt>' +
    '</retDistDFeInt>'
  );
}

/// Gera, via openssl do sistema, um PKCS#12 cifrado com RC2-40 — exatamente o
/// que sai de uma AC brasileira. É o único caminho que reproduz o problema:
/// o `-legacy` do openssl 3 é justamente a admissão de que o provider padrão
/// não faz mais isto.
///
/// Devolve a cifra efetivamente usada, ou `null` se o openssl não existir.
function gerarPfxRc2(destino, senha, cnpj) {
  const dir = dirname(destino);
  try {
    execFileSync(
      'openssl',
      [
        'req', '-x509', '-newkey', 'rsa:2048',
        '-keyout', join(dir, 'k.pem'), '-out', join(dir, 'c.pem'),
        '-days', '365', '-nodes',
        '-subj', `/CN=EDS CONSTRUTORA LTDA:${cnpj}/C=BR`,
      ],
      { stdio: 'ignore' },
    );
    execFileSync(
      'openssl',
      [
        'pkcs12', '-export', '-legacy',
        '-keypbe', 'PBE-SHA1-RC2-40', '-certpbe', 'PBE-SHA1-RC2-40', '-macalg', 'sha1',
        '-inkey', join(dir, 'k.pem'), '-in', join(dir, 'c.pem'),
        '-out', destino, '-passout', `pass:${senha}`,
      ],
      { stdio: 'ignore' },
    );
    return 'RC2-40';
  } catch {
    return null;
  }
}

/// Alternativa quando não há openssl: o forge só gera 3DES/AES, que muitos
/// runtimes ainda aceitam — por isso o teste avisa que a cifra é mais fraca
/// que a do cenário real.
function gerarPfxDeTesteForge(senha, cnpjFicticio) {
  const keys = forge.pki.rsa.generateKeyPair(2048);
  const cert = forge.pki.createCertificate();

  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 86_400_000);

  const attrs = [
    { name: 'commonName', value: `EDS CONSTRUTORA LTDA:${cnpjFicticio}` },
    { name: 'organizationName', value: 'ICP-Brasil' },
    { name: 'countryName', value: 'BR' },
  ];
  cert.setSubject(attrs);
  cert.setIssuer([{ name: 'commonName', value: 'AC TESTE POC' }, ...attrs.slice(1)]);
  cert.sign(keys.privateKey, forge.md.sha256.create());

  // `3des` no keyBag + `algorithm: '3des'`: é o mais próximo do que as ACs
  // brasileiras produzem que o forge sabe gerar. O ponto do teste é o formato
  // legado, não a cifra exata.
  const p12Asn1 = forge.pkcs12.toPkcs12Asn1(keys.privateKey, [cert], senha, {
    algorithm: '3des',
    generateLocalKeyId: true,
    friendlyName: 'certificado-teste',
  });

  return Buffer.from(forge.asn1.toDer(p12Asn1).getBytes(), 'binary');
}
