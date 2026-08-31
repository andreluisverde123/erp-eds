/// Redução de fotos antes do upload.
///
/// Uma foto de celular moderno tem 4–12 MB e 4000+ px de largura. Enviar isso
/// pelo 4G de um canteiro leva minutos, estoura o limite de 10 MB e não
/// acrescenta nada: ninguém amplia um RDO além do que 1920 px já mostram.
///
/// O processamento acontece no NAVEGADOR, e não na API, por dois motivos: o
/// aparelho já tem a imagem decodificada na mão (o custo ali é quase zero), e o
/// que trafega passa a ser o arquivo pequeno — que é justamente o gargalo.
///
/// **Orientação.** `createImageBitmap(blob, { imageOrientation: 'from-image' })`
/// aplica a rotação do EXIF ao rasterizar, então o pixel gravado já sai de pé.
/// É o que impede a foto tirada na vertical de aparecer deitada no relatório —
/// e é também por isso que o servidor NÃO lê EXIF: o arquivo que chega lá já
/// está endireitado, e girar de novo estragaria.
const MAX_DIMENSAO = 1920;

/// 0.82 em JPEG é o ponto em que o arquivo cai para uma fração do original sem
/// artefato visível numa trinca de parede ou numa etiqueta de material — que é
/// o tipo de detalhe que um RDO precisa comprovar. Abaixo de 0.7 a compressão
/// começa a comer justamente a textura fina que serve de evidência.
const QUALIDADE = 0.82;

/// Abaixo disto não vale recomprimir: o ganho é pequeno, e a perda de
/// qualidade sem necessidade, não.
const TAMANHO_MINIMO_PARA_COMPRIMIR = 512 * 1024;

/// Lado maior da miniatura.
///
/// 320px cobre com folga a grade de três colunas do celular (cada célula tem
/// ~105px em 375px de tela) e ainda serve para uma tela de densidade 3x. O
/// arquivo resultante fica entre 10 e 40 KB — contra 1 a 2 MB do original.
///
/// Ela é gerada AQUI, e não no servidor, porque o aparelho já tem a imagem
/// decodificada na mão: sai praticamente de graça no mesmo passo em que a foto
/// já é redimensionada. O monorepo não tem nenhuma biblioteca de processamento
/// de imagem, e as candidatas custariam ou um binário nativo na imagem Docker
/// (`sharp`) ou CPU da API num upload que já mantém o arquivo inteiro em
/// memória (`jimp`).
const MINIATURA_DIMENSAO = 320;

/// Qualidade mais baixa que a do original: numa imagem de 320px o olho não
/// distingue 0.7 de 0.82, e a diferença de tamanho é grande.
const MINIATURA_QUALIDADE = 0.7;

export interface CompressedImage {
  file: File;
  width: number;
  height: number;
  /// Miniatura para a grade. `null` quando o navegador não conseguiu gerá-la —
  /// e aí a grade cai no original, como antes.
  thumbnail: File | null;
}

/// Reduz a foto quando vale a pena. Devolve o arquivo ORIGINAL quando não
/// vale, ou quando o navegador não conseguiu processar — falhar aqui não pode
/// impedir o envio, porque a foto continua sendo uma evidência válida.
export async function compressImage(file: File): Promise<CompressedImage> {
  try {
    const bitmap = await carregar(file);
    const escala = Math.min(1, MAX_DIMENSAO / Math.max(bitmap.width, bitmap.height));

    // A miniatura é gerada SEMPRE, inclusive para a foto que já é pequena
    // demais para valer recompressão: o ganho da grade vem dela, não da
    // compressão do original.
    const thumbnail = await gerarMiniatura(bitmap, file.name);

    if (escala === 1 && file.size <= TAMANHO_MINIMO_PARA_COMPRIMIR) {
      const { width, height } = bitmap;
      fechar(bitmap);
      return { file, width, height, thumbnail };
    }

    const width = Math.round(bitmap.width * escala);
    const height = Math.round(bitmap.height * escala);

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;

    const contexto = canvas.getContext('2d');
    if (!contexto) {
      fechar(bitmap);
      return { ...semCompressao(file), thumbnail };
    }

    contexto.drawImage(bitmap, 0, 0, width, height);
    fechar(bitmap);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALIDADE),
    );
    if (!blob) return { ...semCompressao(file), thumbnail };

    // Recomprimir só compensa se o resultado for MENOR. Um PNG de captura de
    // tela pode virar um JPEG maior que o original.
    if (blob.size >= file.size && escala === 1) {
      return { file, width, height, thumbnail };
    }

    return {
      file: new File([blob], trocarExtensaoParaJpg(file.name), {
        type: 'image/jpeg',
        lastModified: Date.now(),
      }),
      width,
      height,
      thumbnail,
    };
  } catch {
    // Navegador antigo, formato exótico, memória insuficiente. A foto original
    // continua válida — o backend recusa se estiver acima do limite, e aí a
    // mensagem é clara.
    return semCompressao(file);
  }
}

/// `createImageBitmap` com orientação do EXIF é o caminho bom: rápido e sem
/// passar por um `<img>`. Quando ele não existe (Safari antigo), o `<img>`
/// serve — os navegadores atuais já aplicam a orientação EXIF ao renderizar.
async function carregar(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    return createImageBitmap(file, { imageOrientation: 'from-image' });
  }

  const url = URL.createObjectURL(file);
  try {
    const imagem = new Image();
    imagem.src = url;
    await imagem.decode();
    return imagem;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function fechar(bitmap: ImageBitmap | HTMLImageElement): void {
  if ('close' in bitmap) bitmap.close();
}

/// Desenha a miniatura a partir do bitmap que já foi decodificado para a
/// compressão — não há segunda decodificação.
///
/// Falhar aqui devolve `null` e o upload segue sem miniatura: a grade cai no
/// original, que é o comportamento anterior. Miniatura é otimização, não
/// conteúdo, e nunca pode custar a foto.
async function gerarMiniatura(
  bitmap: ImageBitmap | HTMLImageElement,
  nome: string,
): Promise<File | null> {
  try {
    const escala = Math.min(1, MINIATURA_DIMENSAO / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * escala));
    canvas.height = Math.max(1, Math.round(bitmap.height * escala));

    const contexto = canvas.getContext('2d');
    if (!contexto) return null;

    contexto.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', MINIATURA_QUALIDADE),
    );
    if (!blob) return null;

    return new File([blob], `thumb-${trocarExtensaoParaJpg(nome)}`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return null;
  }
}

function semCompressao(file: File): CompressedImage {
  return { file, width: 0, height: 0, thumbnail: null };
}

function trocarExtensaoParaJpg(nome: string): string {
  const semExtensao = nome.replace(/\.[^.]+$/, '');
  return `${semExtensao || 'foto'}.jpg`;
}

/// Duração do vídeo, lida pelo próprio navegador.
///
/// É metadado de exibição: o servidor a aceita como veio porque lê-la no back
/// exigiria um parser de contêiner, e mentir aqui só faz a tela mostrar um
/// número errado. Devolve `undefined` quando o navegador não consegue — nunca
/// impede o envio.
export function readVideoDuration(file: File): Promise<number | undefined> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');

    const encerrar = (valor: number | undefined) => {
      URL.revokeObjectURL(url);
      resolve(valor);
    };

    video.preload = 'metadata';
    video.onloadedmetadata = () =>
      encerrar(Number.isFinite(video.duration) ? Math.round(video.duration) : undefined);
    video.onerror = () => encerrar(undefined);
    video.src = url;
  });
}
