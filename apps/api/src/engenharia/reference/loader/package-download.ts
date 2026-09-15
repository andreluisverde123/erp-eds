export type PackageKind = 'zip' | '7z';

/// Primeiros bytes de cada formato. Um HTML de erro com status 200 não passa.
const ASSINATURAS: Record<PackageKind, Buffer> = {
  zip: Buffer.from([0x50, 0x4b, 0x03, 0x04]),
  '7z': Buffer.from([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]),
};

export interface DownloadOptions {
  tentativas?: number;
  timeoutMs?: number;
  /// Espera antes da 2ª tentativa; cresce linearmente.
  esperaMs?: number;
  fetchImpl?: typeof fetch;
}

/// Baixa um pacote oficial.
///
/// - `null`: o pacote NÃO FOI PUBLICADO (404 no DNIT; redirecionamento para a
///   página inicial, em HTML, na CAIXA).
/// - erro: foi publicado, mas não veio íntegro depois de todas as tentativas.
///   Os servidores do governo cortam downloads longos com frequência — três
///   pacotes do SICRO vieram truncados na primeira carga —, por isso o
///   tamanho e a assinatura são conferidos antes de aceitar.
export async function downloadPackage(
  url: string,
  tipo: PackageKind,
  opcoes: DownloadOptions = {},
): Promise<Buffer | null> {
  const { tentativas = 3, timeoutMs = 15 * 60 * 1000, esperaMs = 5000, fetchImpl = fetch } = opcoes;
  let ultimoErro: unknown;

  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    try {
      const resposta = await fetchImpl(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'Mozilla/5.0 (ERP EDS; carga de bases referenciais)' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (resposta.status === 404) return null;
      if (resposta.ok && (resposta.headers.get('content-type') ?? '').includes('text/html')) {
        await resposta.body?.cancel();
        return null;
      }
      if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);

      const buffer = Buffer.from(await resposta.arrayBuffer());
      const tamanho = Number(resposta.headers.get('content-length'));
      // Com compressão de transporte o content-length é do corpo comprimido.
      if (!resposta.headers.get('content-encoding') && tamanho > 0 && buffer.length !== tamanho) {
        throw new Error(`download incompleto: ${buffer.length} de ${tamanho} bytes`);
      }
      const assinatura = ASSINATURAS[tipo];
      if (!buffer.subarray(0, assinatura.length).equals(assinatura)) {
        throw new Error(`o arquivo recebido não é um .${tipo}`);
      }
      return buffer;
    } catch (erro) {
      ultimoErro = erro;
      if (tentativa < tentativas)
        await new Promise((resolve) => setTimeout(resolve, esperaMs * tentativa));
    }
  }

  throw new Error(
    `Não foi possível baixar ${url} em ${tentativas} tentativa(s): ${ultimoErro instanceof Error ? ultimoErro.message : String(ultimoErro)}`,
  );
}
