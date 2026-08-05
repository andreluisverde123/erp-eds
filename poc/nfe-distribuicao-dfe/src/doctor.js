import crypto from 'node:crypto';
import tls from 'node:tls';

import { ENDPOINTS } from './config.js';

/// Diagnóstico do ambiente. Roda sem certificado nenhum e responde às
/// perguntas que, se ficarem para depois, viram horas de depuração cega:
/// o Node desta máquina consegue abrir um .pfx da AC? A SEFAZ está de pé? A
/// cadeia do servidor dela valida contra o truststore padrão?
export async function runDoctor() {
  console.log('\n── Ambiente ───────────────────────────────────');
  console.log(`  Node       : ${process.version}`);
  console.log(`  OpenSSL    : ${process.versions.openssl}`);
  console.log(`  Plataforma : ${process.platform} ${process.arch}`);

  const openssl3 = Number(process.versions.openssl.split('.')[0]) >= 3;
  console.log('\n── PKCS#12 legado (cifra RC2-40 das ACs brasileiras) ──');
  if (openssl3) {
    console.log('  OpenSSL 3+ detectado: o provider padrão NÃO abre .pfx com cifra legada.');
    console.log('  A POC contorna lendo o PKCS#12 com node-forge (JS puro).');
  } else {
    console.log('  OpenSSL < 3: o caminho nativo provavelmente funcionaria.');
  }
  console.log(`  Providers legados disponíveis no crypto: ${temLegacyProvider() ? 'sim' : 'não'}`);

  for (const [ambiente, endpoint] of Object.entries(ENDPOINTS)) {
    await checarEndpoint(ambiente, endpoint);
  }

  console.log('\n  Próximo passo: `npm run selftest` prova o resto sem certificado real.\n');
}

function temLegacyProvider() {
  try {
    // RC2 é o marcador prático: se ele existe, o provider legado está ativo.
    return crypto.getCiphers().some((c) => c.includes('rc2'));
  } catch {
    return false;
  }
}

/// Abre um TLS até a SEFAZ SEM certificado de cliente. Serve para separar dois
/// problemas que costumam ser confundidos: "a SEFAZ está fora do ar" e "o meu
/// certificado foi recusado".
function checarEndpoint(ambiente, endpoint) {
  const host = new URL(endpoint).hostname;

  return new Promise((resolve) => {
    console.log(`\n── SEFAZ ${ambiente} (${host}) ──────────────`);
    const inicio = Date.now();

    // O servidor derruba a conexão logo depois do nosso `end()`, e o
    // ECONNRESET resultante chegava DEPOIS do diagnóstico — imprimindo um
    // "não alcançável" logo abaixo de um "alcançável: sim". Uma vez concluído,
    // nada mais reporta.
    let concluido = false;
    const finalizar = (fn) => (arg) => {
      if (concluido) return;
      concluido = true;
      fn(arg);
      resolve();
    };

    const socket = tls.connect(
      { host, port: 443, servername: host, minVersion: 'TLSv1.2', timeout: 15_000 },
      () => {
        const cert = socket.getPeerCertificate();
        console.log(`  Alcançável : sim (${Date.now() - inicio}ms)`);
        console.log(`  Protocolo  : ${socket.getProtocol()} · ${socket.getCipher()?.name}`);
        console.log(`  Servidor   : ${cert?.subject?.CN ?? '—'}`);
        console.log(`  Emissor    : ${cert?.issuer?.CN ?? '—'}`);
        console.log(`  Validade   : até ${cert?.valid_to ?? '—'}`);
        // ESTA é a pergunta que importa: a raiz do servidor está no truststore
        // do Node? Se não, toda requisição vai falhar com UNABLE_TO_VERIFY,
        // e a tentação será desligar a verificação em vez de instalar a cadeia.
        console.log(
          `  Cadeia OK  : ${socket.authorized ? 'sim (truststore padrão basta)' : `NÃO — ${socket.authorizationError}`}`,
        );
        console.log(
          `  Pede cert. : ${'—'} (só se sabe ao enviar a requisição; a SEFAZ exige na camada da aplicação)`,
        );
        socket.end();
      },
    );

    socket.on('secureConnect', finalizar(() => {}));
    socket.on(
      'timeout',
      finalizar(() => {
        console.log('  Alcançável : NÃO (timeout de 15s)');
        socket.destroy();
      }),
    );
    socket.on(
      'error',
      finalizar((error) => {
        console.log(`  Alcançável : NÃO — ${error.code ?? error.message}`);
        // Um erro de verificação ainda prova que o servidor respondeu.
        if (error.code?.startsWith('UNABLE_TO') || error.code === 'CERT_HAS_EXPIRED') {
          console.log('  (o servidor respondeu; o que falhou foi a validação da cadeia)');
        }
      }),
    );
  });
}
