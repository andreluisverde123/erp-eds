import { readFileSync } from 'node:fs';
import https from 'node:https';
import { URL } from 'node:url';

const SOAP_ACTION =
  'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';
const WSDL_NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe';

/// Monta o envelope SOAP 1.2 da NFeDistribuicaoDFe.
///
/// Detalhe que custa horas: o `distDFeInt` tem o namespace do PORTAL FISCAL
/// (`.../nfe`), enquanto o elemento que o embrulha tem o namespace do WSDL
/// (`.../nfe/wsdl/NFeDistribuicaoDFe`). Trocar um pelo outro devolve uma falha
/// de schema genérica que não diz qual é o problema.
export function buildEnvelope(distDFeIntXml) {
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
    '<soap12:Body>' +
    `<nfeDistDFeInteresse xmlns="${WSDL_NS}">` +
    '<nfeDadosMsg>' +
    distDFeIntXml +
    '</nfeDadosMsg>' +
    '</nfeDistDFeInteresse>' +
    '</soap12:Body>' +
    '</soap12:Envelope>'
  );
}

/// POST autenticado por certificado (mTLS).
///
/// Não há login, token nem chave de API: a autenticação da SEFAZ É o handshake
/// TLS. O servidor pede o certificado do cliente, e é o CNPJ dentro dele que
/// determina quais documentos podem ser devolvidos. Por isso não existe
/// "resultado da autenticação" separado do resultado da conexão — se o
/// handshake fechou, você está autenticado.
export function postSoap({ endpoint, body, certificate, config, timeoutMs = 60_000 }) {
  const url = new URL(endpoint);

  const options = {
    host: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    key: certificate.keyPem,
    cert: certificate.certPem,
    // A cadeia do NOSSO certificado vai junto: sem a AC intermediária, o
    // servidor pode não conseguir construir o caminho até a raiz ICP-Brasil.
    ...(certificate.chainPem.length > 0 ? { ca: certificate.chainPem } : {}),
    // A SEFAZ exige TLS 1.2+. Fixar o mínimo evita negociar algo que o
    // servidor recusa depois, com um erro bem menos legível.
    minVersion: 'TLSv1.2',
    rejectUnauthorized: !config.inseguro,
    headers: {
      'Content-Type': `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
      'Content-Length': Buffer.byteLength(body),
      // Alguns nós da SEFAZ recusam requisição sem User-Agent.
      'User-Agent': 'poc-eds-nfe-distribuicao-dfe/0.0.0',
    },
    timeout: timeoutMs,
  };

  // A correção CORRETA para a cadeia ICP-Brasil do lado do servidor: um PEM
  // com as raízes, em vez de desligar a verificação.
  if (config.caPath) {
    const extraCa = readFileSync(config.caPath, 'utf8');
    options.ca = [...(options.ca ?? []), extraCa];
  }

  return new Promise((resolve, reject) => {
    const request = https.request(options, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        resolve({
          status: response.statusCode,
          headers: response.headers,
          body: Buffer.concat(chunks).toString('utf8'),
          tls: request.socket?.getPeerCertificate
            ? {
                protocol: request.socket.getProtocol?.(),
                cipher: request.socket.getCipher?.()?.name,
                autorizado: request.socket.authorized,
                erroAutorizacao: request.socket.authorizationError ?? null,
                servidor: request.socket.getPeerCertificate()?.subject?.CN ?? null,
                emissorServidor: request.socket.getPeerCertificate()?.issuer?.CN ?? null,
              }
            : null,
        });
      });
    });

    request.on('timeout', () => {
      request.destroy(new Error(`Timeout de ${timeoutMs}ms aguardando a SEFAZ.`));
    });
    request.on('error', reject);
    request.write(body);
    request.end();
  });
}
