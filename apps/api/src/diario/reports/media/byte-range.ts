import type { ByteRange } from '../../../storage/storage.types';

/// Resultado da leitura do header `Range`.
export type RangeResult =
  | { kind: 'none' }
  | { kind: 'range'; range: ByteRange }
  /// Sintaxe válida, mas a faixa não existe no arquivo. O HTTP exige 416 —
  /// devolver o arquivo inteiro faria o player achar que o servidor não
  /// entende Range e continuar pedindo do zero, para sempre.
  | { kind: 'unsatisfiable' };

/// Interpreta `Range: bytes=<início>-<fim>`.
///
/// Suporta as três formas que um player de vídeo realmente usa:
///
///   `bytes=0-`        do começo até o fim (o primeiro pedido do `<video>`)
///   `bytes=500-999`   um trecho fechado (busca no meio do vídeo)
///   `bytes=-500`      os últimos N bytes (alguns players leem o índice do
///                     MP4 no fim do arquivo antes de tocar)
///
/// Faixas múltiplas (`bytes=0-99,200-299`) NÃO são suportadas: exigiriam
/// resposta `multipart/byteranges`, nenhum navegador as pede para vídeo, e
/// aceitá-las pela metade seria pior que recusá-las. Elas caem em `none`, e a
/// resposta é o arquivo inteiro — que é o que o HTTP manda fazer com um
/// `Range` que o servidor não compreende.
export function parseRange(header: string | undefined, size: number): RangeResult {
  if (!header) return { kind: 'none' };

  const casa = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!casa) return { kind: 'none' };

  const [, inicioTexto, fimTexto] = casa;

  // `bytes=-` casa no regex mas não pede nada: não tem início nem sufixo. O
  // RFC 9110 chama isso de sintaxe inválida, e sintaxe inválida deve ser
  // IGNORADA (arquivo inteiro), não respondida com 416 — 416 significa "a
  // faixa que você pediu não existe", e aqui não houve faixa nenhuma.
  if (inicioTexto === '' && fimTexto === '') return { kind: 'none' };

  // Arquivo vazio: nenhuma faixa é satisfazível, nem `bytes=0-`.
  if (size <= 0) return { kind: 'unsatisfiable' };

  let start: number;
  let end: number;

  if (inicioTexto === '') {
    // Sufixo: os últimos N bytes. `bytes=-0` não pede nada.
    const quantidade = Number(fimTexto);
    if (quantidade <= 0) return { kind: 'unsatisfiable' };
    start = Math.max(0, size - quantidade);
    end = size - 1;
  } else {
    start = Number(inicioTexto);
    // Fim ausente ou além do arquivo é recortado no último byte — é o que o
    // HTTP manda, e é o caso do `bytes=0-` que todo player manda primeiro.
    end = fimTexto === '' ? size - 1 : Math.min(Number(fimTexto), size - 1);
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start >= size || start > end) {
    return { kind: 'unsatisfiable' };
  }

  return { kind: 'range', range: { start, end } };
}
