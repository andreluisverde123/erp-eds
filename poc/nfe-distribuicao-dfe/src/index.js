import { existsSync } from 'node:fs';

import { loadCertificate } from './certificate.js';
import { loadConfig } from './config.js';
import { consultarDistribuicao, consultas } from './dfe.js';
import {
  minutosDeBloqueioRestantes,
  registrarBloqueio,
  salvarCursor,
  salvarDocumentos,
} from './storage.js';
import { runSelftest } from './selftest.js';
import { runDoctor } from './doctor.js';

const [, , comando, ...args] = process.argv;

const COMANDOS = {
  doctor: 'Diagnóstico do ambiente (não precisa de certificado)',
  selftest: 'Prova as partes que não dependem da SEFAZ (gera um .pfx de teste)',
  cert: 'Lê o certificado A1 e mostra titular, CNPJ e validade',
  distribuicao: 'Consulta a Distribuição DF-e a partir do último NSU',
  'consulta-nsu': 'Baixa um NSU específico — uso: consulta-nsu <nsu>',
  'download-chave': 'Baixa o XML de uma chave — uso: download-chave <44 dígitos>',
};

async function main() {
  if (!comando || comando === 'help') {
    console.log('\nPOC — Distribuição DF-e (NF-e) com certificado A1\n');
    for (const [nome, descricao] of Object.entries(COMANDOS)) {
      console.log(`  ${nome.padEnd(16)} ${descricao}`);
    }
    console.log('');
    return;
  }

  if (comando === 'doctor') return runDoctor();
  if (comando === 'selftest') return runSelftest();

  const config = loadConfig();

  if (!existsSync(config.pfxPath)) {
    console.error(`\n✗ Certificado não encontrado em: ${config.pfxPath}`);
    console.error('  Copie o .pfx para certs/ e configure .env (veja .env.example).');
    console.error('  Rode `npm run selftest` para validar a POC sem o certificado real.\n');
    process.exitCode = 1;
    return;
  }

  const certificate = loadCertificate(config.pfxPath, config.pfxPassword);
  mostrarCertificado(certificate.info);

  if (certificate.info.expirado) {
    console.error('\n✗ Certificado EXPIRADO. A SEFAZ recusará o handshake TLS.\n');
    process.exitCode = 1;
    return;
  }

  if (comando === 'cert') return;

  // O CNPJ da consulta tem de ser o do titular do certificado — a SEFAZ só
  // devolve documentos de quem se autenticou.
  if (!config.cnpj) {
    config.cnpj = certificate.info.cnpj;
    console.log(`  CNPJ da consulta extraído do certificado: ${config.cnpj ?? 'NÃO ENCONTRADO'}`);
  }
  if (!config.cnpj) {
    console.error('\n✗ Sem CNPJ. Defina NFE_CNPJ no .env.\n');
    process.exitCode = 1;
    return;
  }

  const consulta = montarConsulta(comando, args);
  if (!consulta) {
    console.error(`\n✗ Comando desconhecido ou argumento faltando: ${comando}\n`);
    process.exitCode = 1;
    return;
  }

  // Recusa a chamada durante um bloqueio conhecido: insistir reinicia a
  // contagem de 1 hora, então a tentativa "só para ver" custa outra hora.
  const bloqueioRestante = minutosDeBloqueioRestantes(config.outDir);
  if (bloqueioRestante > 0) {
    console.error(`\n✗ Bloqueio de consumo indevido ativo — faltam ${bloqueioRestante} min.`);
    console.error('  NÃO tente de novo antes disso: cada tentativa REINICIA a contagem.');
    console.error(`  Para ignorar (por sua conta e risco): apague ${config.outDir}/_bloqueio.json\n`);
    process.exitCode = 1;
    return;
  }

  console.log(`\n→ ${config.ambiente.toUpperCase()} · ${config.endpoint}`);
  console.log(`  CNPJ ${config.cnpj} · UF ${config.uf} (${config.cUFAutor})`);
  if (config.inseguro) {
    console.log('  ⚠ NFE_INSEGURO=true — verificação do certificado do SERVIDOR desligada.');
  }

  const resultado = await consultarDistribuicao({ config, certificate, consulta });

  mostrarTls(resultado.tls);
  mostrarResultado(resultado);

  if (resultado.documentos.length > 0) {
    const salvos = salvarDocumentos(resultado.documentos, config.outDir);
    console.log(`\n  XMLs salvos em ${config.outDir}:`);
    for (const doc of salvos) {
      console.log(`    ${doc.nome} (${doc.bytes} bytes)`);
    }
  }

  if (resultado.cStat === '656') {
    registrarBloqueio(config.outDir, resultado.ultNSU);
  }

  if (resultado.ultNSU) {
    salvarCursor(config.outDir, resultado.ultNSU, resultado.maxNSU);
  }
}

function montarConsulta(comando, args) {
  if (comando === 'distribuicao') return consultas.porUltimoNSU(loadConfig().ultNSU);
  if (comando === 'consulta-nsu' && args[0]) return consultas.porNSU(args[0]);
  if (comando === 'download-chave' && args[0]?.replace(/\D/g, '').length === 44) {
    return consultas.porChave(args[0].replace(/\D/g, ''));
  }
  return null;
}

function mostrarCertificado(info) {
  console.log('\n── Certificado ────────────────────────────────');
  console.log(`  Titular    : ${info.commonName ?? '—'}`);
  console.log(`  CNPJ       : ${info.cnpj ?? 'não identificado'}`);
  console.log(`  Emissor    : ${info.issuer.match(/CN=([^,]+)/)?.[1] ?? info.issuer}`);
  console.log(`  Válido até : ${info.notAfter.toISOString().slice(0, 10)} (${info.diasParaExpirar} dias)`);
  if (info.expirado) console.log('  ⚠ EXPIRADO');
  else if (info.diasParaExpirar < 30) console.log('  ⚠ Vence em menos de 30 dias.');
}

function mostrarTls(tls) {
  if (!tls) return;
  console.log('\n── Autenticação (mTLS) ────────────────────────');
  console.log(`  Handshake  : ${tls.protocol} · ${tls.cipher}`);
  console.log(`  Servidor   : ${tls.servidor ?? '—'} (emissor: ${tls.emissorServidor ?? '—'})`);
  console.log(`  Autorizado : ${tls.autorizado ? 'sim' : `não — ${tls.erroAutorizacao}`}`);
  console.log('  A SEFAZ não usa token nem login: o handshake TLS É a autenticação.');
}

function mostrarResultado(r) {
  console.log('\n── Consulta ───────────────────────────────────');
  if (!r.ok && r.erro) {
    console.log(`  ✗ ${r.erro}`);
    console.log(`    ${r.detalhe}`);
    return;
  }
  console.log(`  cStat      : ${r.cStat} — ${r.xMotivo}`);
  if (r.explicacao) console.log(`               (${r.explicacao})`);
  console.log(`  ultNSU     : ${r.ultNSU}   maxNSU: ${r.maxNSU}`);
  console.log(`  Documentos : ${r.documentos.length}`);
  console.log(`  Tempo      : ${r.tempoMs}ms`);

  if (r.cStat === '656') {
    console.log('\n  ⚠ CONSUMO INDEVIDO: a SEFAZ bloqueou este CNPJ por 1 hora.');
    console.log('    Duas causas possíveis, e elas exigem ações diferentes:');
    console.log('    (a) consultas repetidas sem respeitar o intervalo mínimo; ou');
    console.log('    (b) ultNSU muito atrás do que já foi consumido — pedir tudo de novo.');
    // Na rejeição a SEFAZ ECOA o ultNSU que se deve usar. É a informação mais
    // valiosa da resposta e passaria despercebida no meio do xMotivo.
    if (r.ultNSU && Number(r.ultNSU) > 0) {
      console.log(`\n    → A SEFAZ informou o ultNSU correto: ${r.ultNSU}`);
      console.log(`      Ponha NFE_ULT_NSU=${r.ultNSU} no .env e repita após 1 hora.`);
      console.log('      (esse número já foi consumido antes — ver README)');
    }
  }

  if (Number(r.ultNSU) < Number(r.maxNSU)) {
    console.log(`\n  ↻ Há mais documentos (${r.ultNSU} de ${r.maxNSU}). Rode de novo para paginar.`);
  }

  for (const doc of r.documentos) {
    console.log(`    NSU ${doc.nsu} · ${doc.tipo} · ${doc.schema} · chave ${doc.chave ?? '—'}`);
  }

  const completos = r.documentos.filter((d) => d.tipo === 'NFE_COMPLETA').length;
  const resumos = r.documentos.filter((d) => d.tipo === 'RESUMO_NFE').length;
  if (resumos > 0 && completos === 0) {
    console.log('\n  ℹ Só vieram RESUMOS (resNFe), nenhuma NF-e completa.');
    console.log('    Isto é esperado antes da Manifestação do Destinatário.');
    console.log('    Ver README, seção "Resumo x XML completo".');
  }
}

main().catch((error) => {
  console.error(`\n✗ ${error.message}`);
  if (process.env.DEBUG) console.error(error.stack);
  process.exitCode = 1;
});
