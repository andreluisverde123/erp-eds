/// Um PNG VÁLIDO de 1×1 pixel, para os testes que precisam de bytes que o
/// pdfkit consiga realmente decodificar.
///
/// Bytes de verdade, e não um `Buffer.from('logo')`: o pdfkit LANÇA ao receber
/// algo que não é imagem, então um dublê falso faria o teste do cabeçalho
/// exercitar o caminho de erro achando que exercita o de sucesso.
export const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
