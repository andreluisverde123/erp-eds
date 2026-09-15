import { execFile } from 'node:child_process';
import { constants } from 'node:fs';
import { access, chmod, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
import { promisify } from 'node:util';

import { path7za } from '7zip-bin';

const executar = promisify(execFile);

export interface ExtractedFile {
  name: string;
  buffer: Buffer;
}

/// O `7zip-bin` é o 7-Zip oficial empacotado para npm, com binário para
/// Linux (a imagem da API) e macOS. O SICRO só sai em .7z, e o Node não lê o
/// formato; o mesmo binário abre o zip do SINAPI.
///
/// O pacote chega do npm sem o bit de execução, por isso o ajuste na primeira
/// chamada. Na imagem o `node_modules` é do usuário `node`, que roda a API.
async function binario(): Promise<string> {
  try {
    await access(path7za, constants.X_OK);
  } catch {
    await chmod(path7za, 0o755);
  }
  return path7za;
}

/// Extrai os arquivos de um pacote cujo NOME (sem pasta) `aceitar` aprova.
/// Confere a integridade antes (`7za t`): um pacote truncado falha aqui, e
/// não no meio da leitura de uma planilha.
export async function extractFiles(
  pacote: Buffer,
  extensao: 'zip' | '7z',
  aceitar: (nome: string) => boolean,
): Promise<ExtractedFile[]> {
  const bin = await binario();
  const pasta = await mkdtemp(join(tmpdir(), 'bases-referenciais-'));
  try {
    const arquivo = join(pasta, `pacote.${extensao}`);
    const destino = join(pasta, 'conteudo');
    await writeFile(arquivo, pacote);
    await executar(bin, ['t', arquivo], { maxBuffer: 16 * 1024 * 1024 });
    await executar(bin, ['x', '-y', `-o${destino}`, arquivo], { maxBuffer: 16 * 1024 * 1024 });

    const escolhidos: ExtractedFile[] = [];
    for (const relativo of await readdir(destino, { recursive: true })) {
      const name = basename(relativo);
      if (!aceitar(name)) continue;
      escolhidos.push({ name, buffer: await readFile(join(destino, relativo)) });
    }
    return escolhidos.sort((a, b) => a.name.localeCompare(b.name));
  } finally {
    await rm(pasta, { recursive: true, force: true });
  }
}
