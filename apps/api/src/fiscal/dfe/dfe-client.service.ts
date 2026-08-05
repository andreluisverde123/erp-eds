import https from 'node:https';
import { URL } from 'node:url';
import { gunzipSync } from 'node:zlib';

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { XMLParser } from 'fast-xml-parser';

import type { FiscalDocumentType } from '../../../generated/prisma/client';
import type { CertificateMaterial } from '../certificate/fiscal-certificate.service';

const SOAP_ACTION =
  'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe/nfeDistDFeInteresse';
const WSDL_NS = 'http://www.portalfiscal.inf.br/nfe/wsdl/NFeDistribuicaoDFe';
const NFE_NS = 'http://www.portalfiscal.inf.br/nfe';

/// NFeDistribuicaoDFe é um serviço do AMBIENTE NACIONAL: o mesmo endereço
/// atende qualquer UF, e por isso a integração não precisa saber onde a
/// empresa está sediada para consultar.
const ENDPOINTS = {
  1: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  2: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
} as const;

/// Códigos que mudam o que o chamador deve fazer a seguir.
export const CSTAT = {
  DOCUMENTOS_LOCALIZADOS: '138',
  NENHUM_DOCUMENTO: '137',
  NSU_SUPERIOR_AO_MAXIMO: '589',
  CONSUMO_INDEVIDO: '656',
} as const;

export interface DfeDocument {
  nsu: string;
  schema: string;
  type: FiscalDocumentType;
  accessKey: string | null;
  xml: Buffer;
}

export interface DfeResult {
  httpStatus: number;
  cStat: string | null;
  xMotivo: string | null;
  ultNSU: string | null;
  maxNSU: string | null;
  documents: DfeDocument[];
  /// Erro de transporte/autenticação, já traduzido. `null` quando a SEFAZ
  /// respondeu — mesmo que com rejeição.
  transportError: string | null;
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  // Sem isto, um lote com UM documento vira objeto e com VÁRIOS vira array —
  // e o consumidor quebra justamente no caso de uma nota só.
  isArray: (name) => name === 'docZip',
  parseTagValue: false,
  trimValues: true,
});

/// Cliente da Distribuição DF-e.
///
/// A autenticação da SEFAZ É o handshake TLS: não há login, token nem chave de
/// API. O certificado apresentado determina quais documentos podem ser
/// devolvidos, e por isso o CNPJ da consulta tem de ser o do titular.
@Injectable()
export class DfeClientService {
  private readonly logger = new Logger(DfeClientService.name);
  private readonly tpAmb: 1 | 2;

  constructor(configService: ConfigService) {
    // Homologação NÃO devolve os documentos reais da empresa (base vazia), por
    // isso o padrão é produção — que é somente leitura e não emite nada.
    this.tpAmb = configService.get<string>('FISCAL_AMBIENTE') === 'homologacao' ? 2 : 1;
  }

  /// Lote a partir do último NSU conhecido. Devolve até ~50 documentos ou
  /// 1 MB, o que vier primeiro.
  async consultarPorUltimoNSU(
    certificate: CertificateMaterial,
    cUFAutor: number,
    ultNSU: string,
  ): Promise<DfeResult> {
    return this.consultar(
      certificate,
      cUFAutor,
      `<distNSU><ultNSU>${ultNSU.padStart(15, '0')}</ultNSU></distNSU>`,
    );
  }

  /// Consulta de UM NSU. Usada pelo "Testar Conexão": é a chamada mais barata
  /// que ainda prova o caminho inteiro (certificado, TLS, SOAP e schema) sem
  /// mexer no ponteiro da sincronização.
  async consultarPorNSU(
    certificate: CertificateMaterial,
    cUFAutor: number,
    nsu: string,
  ): Promise<DfeResult> {
    return this.consultar(
      certificate,
      cUFAutor,
      `<consNSU><NSU>${nsu.padStart(15, '0')}</NSU></consNSU>`,
    );
  }

  private async consultar(
    certificate: CertificateMaterial,
    cUFAutor: number,
    consulta: string,
  ): Promise<DfeResult> {
    const distDFeInt =
      `<distDFeInt xmlns="${NFE_NS}" versao="1.01">` +
      `<tpAmb>${this.tpAmb}</tpAmb>` +
      `<cUFAutor>${cUFAutor}</cUFAutor>` +
      `<CNPJ>${certificate.cnpj}</CNPJ>` +
      consulta +
      '</distDFeInt>';

    // O `distDFeInt` usa o namespace do PORTAL FISCAL enquanto o elemento que
    // o embrulha usa o do WSDL. Trocar um pelo outro devolve erro de schema
    // que não diz qual é o problema.
    const envelope =
      '<?xml version="1.0" encoding="utf-8"?>' +
      '<soap12:Envelope xmlns:soap12="http://www.w3.org/2003/05/soap-envelope">' +
      '<soap12:Body>' +
      `<nfeDistDFeInteresse xmlns="${WSDL_NS}">` +
      `<nfeDadosMsg>${distDFeInt}</nfeDadosMsg>` +
      '</nfeDistDFeInteresse>' +
      '</soap12:Body>' +
      '</soap12:Envelope>';

    try {
      const response = await this.post(envelope, certificate);
      return this.interpretar(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Falha de transporte na consulta à SEFAZ: ${message}`);
      return {
        httpStatus: 0,
        cStat: null,
        xMotivo: null,
        ultNSU: null,
        maxNSU: null,
        documents: [],
        transportError: message,
      };
    }
  }

  private post(
    body: string,
    certificate: CertificateMaterial,
  ): Promise<{ status: number; body: string }> {
    const url = new URL(ENDPOINTS[this.tpAmb]);

    return new Promise((resolve, reject) => {
      const request = https.request(
        {
          host: url.hostname,
          port: 443,
          path: url.pathname,
          method: 'POST',
          key: certificate.keyPem,
          cert: certificate.certPem,
          // A cadeia do NOSSO certificado: sem a AC intermediária, o servidor
          // pode não conseguir construir o caminho até a raiz.
          ...(certificate.chainPem.length > 0 ? { ca: certificate.chainPem } : {}),
          minVersion: 'TLSv1.2',
          headers: {
            'Content-Type': `application/soap+xml; charset=utf-8; action="${SOAP_ACTION}"`,
            'Content-Length': Buffer.byteLength(body),
            'User-Agent': 'ERP-EDS/fiscal-sync',
          },
          timeout: 60_000,
        },
        (response) => {
          const chunks: Buffer[] = [];
          response.on('data', (chunk: Buffer) => chunks.push(chunk));
          response.on('end', () =>
            resolve({
              status: response.statusCode ?? 0,
              body: Buffer.concat(chunks).toString('utf8'),
            }),
          );
        },
      );

      request.on('timeout', () => request.destroy(new Error('Timeout de 60s aguardando a SEFAZ.')));
      request.on('error', reject);
      request.write(body);
      request.end();
    });
  }

  private interpretar(response: { status: number; body: string }): DfeResult {
    const vazio = {
      httpStatus: response.status,
      cStat: null,
      xMotivo: null,
      ultNSU: null,
      maxNSU: null,
      documents: [],
    };

    // 403 é o caso que mais confunde: o handshake TLS FECHA e a recusa do
    // certificado só aparece na camada HTTP, como página do IIS. Quem espera
    // SOAP conclui "recebi HTML" e procura no lugar errado.
    if (response.status === 403) {
      return {
        ...vazio,
        transportError:
          'A SEFAZ recusou o certificado (HTTP 403). Verifique se é um e-CNPJ ICP-Brasil válido e não expirado.',
      };
    }
    if (response.status !== 200) {
      return { ...vazio, transportError: `A SEFAZ respondeu HTTP ${response.status}.` };
    }

    const ret = this.buscar(parser.parse(response.body), 'retDistDFeInt') as
      | Record<string, unknown>
      | null;
    if (!ret) {
      return { ...vazio, transportError: 'Resposta da SEFAZ sem retDistDFeInt.' };
    }

    const lote = (ret.loteDistDFeInt as { docZip?: unknown[] } | undefined)?.docZip ?? [];

    return {
      httpStatus: 200,
      cStat: String(ret.cStat ?? ''),
      xMotivo: String(ret.xMotivo ?? ''),
      ultNSU: ret.ultNSU ? String(ret.ultNSU) : null,
      maxNSU: ret.maxNSU ? String(ret.maxNSU) : null,
      documents: lote
        .map((docZip) => this.descompactar(docZip as Record<string, string>))
        .filter((doc): doc is DfeDocument => doc !== null),
      transportError: null,
    };
  }

  /// Cada documento vem como base64(gzip(xml)). O `schema` diz o que é —
  /// resumo ou documento completo — e essa é a ÚNICA classificação feita
  /// aqui: o conteúdo do XML não é interpretado nesta etapa.
  private descompactar(docZip: Record<string, string>): DfeDocument | null {
    const nsu = docZip['@NSU'];
    const schema = docZip['@schema'] ?? '';
    const conteudo = docZip['#text'];
    if (!nsu || !conteudo) return null;

    try {
      const xml = gunzipSync(Buffer.from(conteudo, 'base64'));
      return {
        nsu: nsu.padStart(15, '0'),
        schema,
        type: this.classificar(schema),
        accessKey: this.extrairChave(xml.toString('utf8')),
        xml,
      };
    } catch (error) {
      // Um documento corrompido não pode derrubar o lote inteiro: os outros
      // 49 continuam válidos, e a SEFAZ não os oferece de novo.
      this.logger.error(
        `NSU ${nsu} descartado — falha ao descompactar: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  private classificar(schema: string): FiscalDocumentType {
    if (schema.startsWith('procNFe')) return 'NFE_COMPLETA';
    if (schema.startsWith('resNFe')) return 'RESUMO_NFE';
    if (schema.startsWith('procEventoNFe')) return 'EVENTO_COMPLETO';
    if (schema.startsWith('resEvento')) return 'RESUMO_EVENTO';
    return 'DESCONHECIDO';
  }

  /// A chave de acesso é o ÚNICO dado lido de dentro do XML nesta sprint, e
  /// não por conveniência: a mesma nota chega duas vezes (resumo e depois
  /// completa) em NSUs diferentes, e sem a chave não há como o processamento
  /// da próxima sprint saber que são o mesmo documento.
  private extrairChave(xml: string): string | null {
    return xml.match(/<chNFe>(\d{44})<\/chNFe>/)?.[1] ?? xml.match(/Id="NFe(\d{44})"/)?.[1] ?? null;
  }

  /// A SEFAZ não é consistente entre `soap:`, `soap12:` e sem prefixo.
  private buscar(node: unknown, alvo: string): unknown {
    if (node === null || typeof node !== 'object') return null;
    for (const [chave, valor] of Object.entries(node)) {
      if (chave === alvo || chave.endsWith(`:${alvo}`)) return valor;
      const encontrado = this.buscar(valor, alvo);
      if (encontrado) return encontrado;
    }
    return null;
  }
}
