import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/// Salva os XMLs recuperados.
///
/// O nome do arquivo começa pelo NSU com zeros à esquerda para que a ordem
/// alfabética no disco seja a ordem cronológica de chegada — é a mesma ordem
/// em que a SEFAZ os entrega, e é o que permite retomar de onde parou só
/// olhando a pasta.
export function salvarDocumentos(documentos, outDir) {
  mkdirSync(outDir, { recursive: true });

  return documentos
    .filter((doc) => doc.xml)
    .map((doc) => {
      const nome = `${String(doc.nsu).padStart(15, '0')}-${doc.tipo}${doc.chave ? `-${doc.chave}` : ''}.xml`;
      const caminho = join(outDir, nome);
      writeFileSync(caminho, doc.xml, 'utf8');
      return { ...doc, caminho, nome };
    });
}

/// Janela de silêncio depois de um `cStat 656`. A SEFAZ fala em "1 hora"; 65
/// minutos dão folga para diferença de relógio, porque errar para menos custa
/// mais uma hora de bloqueio.
const COOLDOWN_MS = 65 * 60 * 1000;

/// Guarda quando a última consulta bloqueada aconteceu.
///
/// Existe por um motivo prático: durante um bloqueio, CADA nova tentativa
/// reinicia o relógio de 1 hora. O reflexo natural de quem toma um erro é
/// tentar de novo — e é exatamente esse reflexo que transforma uma hora de
/// espera em três. A POC recusa a chamada em vez de deixar o usuário se
/// prejudicar sozinho.
export function registrarBloqueio(outDir, ultNSUSugerido) {
  mkdirSync(outDir, { recursive: true });
  writeFileSync(
    join(outDir, '_bloqueio.json'),
    JSON.stringify(
      { bloqueadoEm: new Date().toISOString(), liberaEm: new Date(Date.now() + COOLDOWN_MS).toISOString(), ultNSUSugerido },
      null,
      2,
    ),
  );
}

/// Devolve os minutos restantes de bloqueio, ou 0 se já pode consultar.
export function minutosDeBloqueioRestantes(outDir) {
  try {
    const raw = JSON.parse(readFileSync(join(outDir, '_bloqueio.json'), 'utf8'));
    const restante = new Date(raw.liberaEm).getTime() - Date.now();
    return restante > 0 ? Math.ceil(restante / 60_000) : 0;
  } catch {
    return 0;
  }
}

/// Registra o último NSU lido. Num sistema de verdade isto seria uma coluna;
/// aqui é um arquivo, porque a POC não pode criar banco.
export function salvarCursor(outDir, ultNSU, maxNSU) {
  mkdirSync(outDir, { recursive: true });
  const caminho = join(outDir, '_cursor.json');
  writeFileSync(
    caminho,
    JSON.stringify({ ultNSU, maxNSU, atualizadoEm: new Date().toISOString() }, null, 2),
  );
  return caminho;
}
