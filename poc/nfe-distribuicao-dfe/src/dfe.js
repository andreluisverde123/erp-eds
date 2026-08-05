import { gunzipSync } from 'node:zlib';
import { XMLParser } from 'fast-xml-parser';

import { buildEnvelope, postSoap } from './soap.js';

const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';

/// Códigos de retorno que importam operacionalmente. A lista completa está na
/// NT 2014.002; estes são os que mudam o que o chamador deve fazer a seguir.
export const CSTAT = {
  138: 'Documento(s) localizado(s)',
  137: 'Nenhum documento localizado',
  589: 'NSU informado é maior que o maior NSU da base',
  656: 'CONSUMO INDEVIDO — acesso bloqueado por 1 hora',
};

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // `resNFe` pode vir 1 ou N vezes; sem isto o parser devolve objeto quando é
  // um só e array quando são vários, e o consumidor quebra no caso de uma nota.
  isArray: (name) => name === 'docZip',
  parseTagValue: false,
  trimValues: true,
});

function buildDistDFeInt({ tpAmb, cUFAutor, cnpj, consulta }) {
  return (
    `<distDFeInt xmlns="${NFE_NS}" versao="1.01">` +
    `<tpAmb>${tpAmb}</tpAmb>` +
    `<cUFAutor>${cUFAutor}</cUFAutor>` +
    `<CNPJ>${cnpj}</CNPJ>` +
    consulta +
    '</distDFeInt>'
  );
}

/// Os três modos de consulta são MUTUAMENTE EXCLUSIVOS: o schema aceita
/// exatamente um por requisição.
export const consultas = {
  /// Lote a partir do último NSU conhecido. É o modo de sincronização: devolve
  /// até ~50 documentos ou 1 MB por chamada, o que vier primeiro.
  porUltimoNSU: (ultNSU) => `<distNSU><ultNSU>${String(ultNSU).padStart(15, '0')}</ultNSU></distNSU>`,
  /// Um NSU específico.
  porNSU: (nsu) => `<consNSU><NSU>${String(nsu).padStart(15, '0')}</NSU></consNSU>`,
  /// Por chave de acesso. É o caminho para baixar o XML completo de UMA nota —
  /// sujeito à manifestação do destinatário (ver README).
  porChave: (chave) => `<consChNFe><chNFe>${chave}</chNFe></consChNFe>`,
};

export async function consultarDistribuicao({ config, certificate, consulta }) {
  const xml = buildDistDFeInt({
    tpAmb: config.tpAmb,
    cUFAutor: config.cUFAutor,
    cnpj: config.cnpj,
    consulta,
  });

  const enviadoEm = Date.now();
  const response = await postSoap({
    endpoint: config.endpoint,
    body: buildEnvelope(xml),
    certificate,
    config,
  });

  return {
    ...interpretar(response),
    tempoMs: Date.now() - enviadoEm,
    httpStatus: response.status,
    tls: response.tls,
    rawRequest: xml,
    rawResponse: response.body,
  };
}

function interpretar(response) {
  if (response.status !== 200) {
    // 403 é o caso que mais confunde: o handshake TLS FECHA normalmente e a
    // recusa do certificado de cliente só aparece na camada HTTP, como uma
    // página de erro do IIS. Sem tratar isto em separado, o diagnóstico vira
    // "recebi HTML em vez de XML" — que não aponta para o certificado.
    if (response.status === 403) {
      return {
        ok: false,
        erro: 'HTTP 403 — certificado de cliente recusado pela SEFAZ',
        detalhe:
          'O TLS fechou, mas a SEFAZ não aceitou o certificado na camada da aplicação. ' +
          'Causas, em ordem de probabilidade: (1) o certificado não é ICP-Brasil (autoassinado ' +
          'ou de AC não credenciada); (2) o certificado expirou; (3) e-CNPJ de outra empresa ' +
          'sem procuração eletrônica para este CNPJ. A resposta é HTML do IIS, não SOAP — ' +
          'não espere um cStat aqui.',
        documentos: [],
      };
    }

    return {
      ok: false,
      erro: `HTTP ${response.status}`,
      // O corpo de erro costuma ser HTML ou SOAP Fault; recortar evita
      // despejar uma página inteira no terminal.
      detalhe: response.body.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 400),
      documentos: [],
    };
  }

  const parsed = parser.parse(response.body);
  const ret = buscar(parsed, 'retDistDFeInt');

  if (!ret) {
    const fault = buscar(parsed, 'Fault') ?? buscar(parsed, 'soap:Fault');
    return {
      ok: false,
      erro: fault ? 'SOAP Fault' : 'Resposta sem retDistDFeInt',
      detalhe: JSON.stringify(fault ?? parsed).slice(0, 800),
      documentos: [],
    };
  }

  const cStat = String(ret.cStat);
  const lote = ret.loteDistDFeInt?.docZip ?? [];

  return {
    ok: cStat === '138' || cStat === '137',
    cStat,
    xMotivo: ret.xMotivo,
    explicacao: CSTAT[Number(cStat)] ?? null,
    /// Onde a nossa leitura parou. É este valor que precisa ser persistido
    /// entre execuções — sem ele, toda sincronização recomeça do zero.
    ultNSU: ret.ultNSU ?? null,
    /// O maior NSU existente na base da SEFAZ para este CNPJ. Enquanto
    /// `ultNSU < maxNSU`, há mais páginas a buscar.
    maxNSU: ret.maxNSU ?? null,
    dhResp: ret.dhResp ?? null,
    verAplic: ret.verAplic ?? null,
    documentos: lote.map(descompactar),
  };
}

/// Cada documento vem como base64(gzip(xml)). O `schema` diz o que é: um
/// RESUMO (`resNFe`) ou a NOTA COMPLETA (`procNFe`) — distinção central desta
/// POC, porque só a segunda serve para lançar a nota no ERP.
function descompactar(docZip) {
  const nsu = docZip['@NSU'];
  const schema = docZip['@schema'] ?? '';
  const conteudo = typeof docZip === 'string' ? docZip : docZip['#text'];

  try {
    const xml = gunzipSync(Buffer.from(conteudo, 'base64')).toString('utf8');
    return {
      nsu,
      schema,
      tipo: classificar(schema),
      xml,
      chave: extrairChave(xml),
      bytes: Buffer.byteLength(xml),
    };
  } catch (error) {
    return { nsu, schema, tipo: 'ERRO', erro: error.message, xml: null };
  }
}

function classificar(schema) {
  if (schema.startsWith('procNFe')) return 'NFE_COMPLETA';
  if (schema.startsWith('resNFe')) return 'RESUMO_NFE';
  if (schema.startsWith('procEventoNFe')) return 'EVENTO_COMPLETO';
  if (schema.startsWith('resEvento')) return 'RESUMO_EVENTO';
  return schema || 'DESCONHECIDO';
}

function extrairChave(xml) {
  return (
    xml.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1] ??
    xml.match(/Id="NFe(\d{44})"/)?.[1] ??
    null
  );
}

/// Busca uma tag em qualquer profundidade, ignorando prefixo de namespace —
/// a SEFAZ não é consistente entre `soap:`, `soap12:` e sem prefixo.
function buscar(node, alvo) {
  if (node === null || typeof node !== 'object') return null;
  for (const [chave, valor] of Object.entries(node)) {
    if (chave === alvo || chave.endsWith(`:${alvo}`)) return valor;
    const encontrado = buscar(valor, alvo);
    if (encontrado) return encontrado;
  }
  return null;
}
