import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/// Endpoints da NFeDistribuicaoDFe.
///
/// Este é um serviço do AMBIENTE NACIONAL, não da SEFAZ do estado: o mesmo
/// endereço serve qualquer UF. É por isso que a POC não precisa saber onde a
/// EDS está sediada para consultar — só o `cUFAutor` do XML muda.
export const ENDPOINTS = {
  producao: 'https://www1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
  homologacao: 'https://hom1.nfe.fazenda.gov.br/NFeDistribuicaoDFe/NFeDistribuicaoDFe.asmx',
};

/// ATENÇÃO: homologação NÃO devolve os documentos reais da empresa. Ela existe
/// para validar contrato/enveloped SOAP e responde com base vazia. A validação
/// de que "as notas da EDS chegam" só acontece em PRODUÇÃO (tpAmb=1) — e
/// consultar produção com certificado real é uma operação legítima e somente
/// de leitura, não emite nada.
export const TP_AMB = { producao: 1, homologacao: 2 };

/// Código IBGE da UF do autor da consulta. Só influencia roteamento interno.
const UF_CODES = {
  AC: 12, AL: 27, AP: 16, AM: 13, BA: 29, CE: 23, DF: 53, ES: 32, GO: 52,
  MA: 21, MT: 51, MS: 50, MG: 31, PA: 15, PB: 25, PR: 41, PE: 26, PI: 22,
  RJ: 33, RN: 24, RS: 43, RO: 11, RR: 14, SC: 42, SP: 35, SE: 28, TO: 17,
};

function readEnvFile() {
  // .env próprio, lido à mão: a POC não deve depender de nenhuma lib nem de
  // nenhuma configuração do ERP.
  try {
    const raw = readFileSync(resolve(ROOT, '.env'), 'utf8');
    const entries = raw
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .map((line) => {
        const index = line.indexOf('=');
        return [line.slice(0, index).trim(), line.slice(index + 1).trim().replace(/^["']|["']$/g, '')];
      });
    return Object.fromEntries(entries);
  } catch {
    return {};
  }
}

export function loadConfig() {
  const env = { ...readEnvFile(), ...process.env };

  const ambiente = env.NFE_AMBIENTE === 'homologacao' ? 'homologacao' : 'producao';
  const uf = (env.NFE_UF ?? 'SP').toUpperCase();

  return {
    ambiente,
    tpAmb: TP_AMB[ambiente],
    endpoint: ENDPOINTS[ambiente],
    uf,
    cUFAutor: UF_CODES[uf],
    /// Caminho do .pfx. O arquivo fica em `certs/`, que está no .gitignore.
    pfxPath: env.NFE_PFX_PATH ? resolve(ROOT, env.NFE_PFX_PATH) : resolve(ROOT, 'certs/certificado.pfx'),
    pfxPassword: env.NFE_PFX_PASSWORD ?? '',
    /// Quando vazio, é extraído do próprio certificado (ver certificate.js).
    cnpj: (env.NFE_CNPJ ?? '').replace(/\D/g, ''),
    /// Último NSU processado. "000000000000000" começa do zero — a SEFAZ
    /// devolve no máximo ~50 documentos (ou 1 MB) por chamada, então a carga
    /// inicial exige paginar até `ultNSU == maxNSU`.
    ultNSU: (env.NFE_ULT_NSU ?? '0').padStart(15, '0'),
    outDir: resolve(ROOT, 'out'),
    /// Desliga a verificação do certificado DO SERVIDOR (não o nosso).
    /// Existe porque a cadeia ICP-Brasil não vem no truststore do Node —
    /// ver README, seção "Cadeia ICP-Brasil". Default LIGADO (seguro).
    inseguro: env.NFE_INSEGURO === 'true',
    /// PEM adicional com a cadeia ICP-Brasil, quando disponível. É a correção
    /// correta para o problema acima.
    caPath: env.NFE_CA_PATH ? resolve(ROOT, env.NFE_CA_PATH) : null,
  };
}
