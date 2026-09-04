import PDFDocument from 'pdfkit';

import { COLUNAS, LINHAS, paginarFotos } from './rdo-pdf-gallery';
import type { CelulaContagem, MidiaView, RdoPdfView, SecaoLista } from './rdo-pdf-view';

/// Aparência de documento técnico, não de painel.
///
/// Os números saem do template de referência: A4 retrato, margem estreita,
/// tipografia pequena e linhas finas cinza. Nada de canto arredondado, sombra
/// ou gradiente — isto é impresso, grampeado e arquivado em obra.
const MARGEM = 30;
const FONTE = 'Helvetica';
const FONTE_BOLD = 'Helvetica-Bold';

const TINTA = '#000000';
const CINZA = '#555555';
const LINHA = '#9a9a9a';
const LINHA_CLARA = '#c8c8c8';
const FAIXA = '#eeeeee';

const CORPO = 7.5;
const MIUDO = 6.5;

const ALTURA_LINHA = 13;
const ALTURA_FAIXA = 12;
const PADDING = 3;

/// Imagem já carregada. O buffer chega uma de cada vez, e é isso que mantém o
/// pico de memória em "o PDF + uma foto" mesmo num RDO de cinquenta.
export interface FotoCarregada {
  readonly view: MidiaView;
  readonly bytes: Buffer;
}

export interface RdoPdfEntrada {
  readonly view: RdoPdfView;
  readonly fotos: readonly FotoCarregada[];
  /// Bytes do logo da empresa (PNG ou JPEG), quando houver.
  ///
  /// `Buffer` já resolvido, e não a chave do storage: a montagem da view é
  /// pura e não faz I/O. Quem lê os bytes é o `RdoPdfService`, com o mesmo
  /// `loadCompanyLogo` que os documentos de Compras usam — inclusive a recusa
  /// de WEBP, que o pdfkit não desenha.
  readonly logo?: Buffer | null;
}

type Doc = PDFKit.PDFDocument;

export function renderRdoPdf(entrada: RdoPdfEntrada): Promise<Buffer> {
  const { view } = entrada;
  const doc = new PDFDocument({
    size: 'A4',
    margin: MARGEM,
    // O leitor de PDF mostra isto na barra de título e nas propriedades — é o
    // que identifica o arquivo depois que ele sai do sistema.
    info: { Title: `${view.cabecalhoCorrido} — ${view.empresa}`, Author: view.empresa },
    autoFirstPage: true,
    // Obrigatório para o rodapé `n / N`: sem isto o pdfkit fecha cada página ao
    // sair dela, e `switchToPage` — que é como o total só conhecido no fim
    // volta para numerar a primeira — falha em silêncio.
    bufferPages: true,
  });

  const pedacos: Buffer[] = [];
  const pronto = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (pedaco: Buffer) => pedacos.push(pedaco));
    doc.on('end', () => resolve(Buffer.concat(pedacos)));
    doc.on('error', reject);
  });

  const esquerda = MARGEM;
  const largura = doc.page.width - MARGEM * 2;

  desenharCabecalhoCorrido(doc, view, esquerda, largura);
  let y = MARGEM + 16;

  y = desenharIdentificacao(doc, entrada, esquerda, largura, y);
  y = desenharClima(doc, view, esquerda, largura, y + 6);
  y = desenharJornada(doc, view, esquerda, largura, y + 6);
  y = desenharContagens(doc, `Mão de obra (${view.maoDeObraTotal})`, view.maoDeObra, esquerda, largura, y + 6);
  y = desenharContagens(doc, `Equipamentos (${view.equipamentosTotal})`, view.equipamentos, esquerda, largura, y + 6);
  y = desenharLista(doc, view.atividades, esquerda, largura, y + 6, 0.78);
  y = desenharLista(doc, view.ocorrencias, esquerda, largura, y + 6, 0.86);
  y = desenharMateriais(doc, view, esquerda, largura, y + 6);
  y = desenharObservacoes(doc, view, esquerda, largura, y + 6);

  // A coordenada atravessa TODAS as seções explicitamente, inclusive as que
  // vêm depois da galeria. A primeira versão usava `doc.y` para as últimas, e o
  // pdfkit não sabe nada do desenho por coordenada: as assinaturas caíam sobre
  // as fotos da última página, porque `doc.y` ainda apontava para o fim da
  // página 1.
  y = desenharGaleria(doc, entrada, esquerda, largura, y);
  y = desenharVideos(doc, view, esquerda, largura, y);
  desenharAssinaturas(doc, view, esquerda, largura, y);
  numerarPaginas(doc, view, esquerda, largura);

  doc.end();
  return pronto;
}

// ---------------------------------------------------------------------------
// Primitivas
// ---------------------------------------------------------------------------

/// Caixa reservada à marca no cabeçalho, em pontos. Baixa de propósito: o RDO
/// é um documento denso, e cada ponto gasto aqui sai da tabela.
const MARCA_CAIXA = { largura: 104, altura: 34 };
/// Respiro entre a marca e o nome da empresa.
const MARCA_GAP = 10;

/// Desenha a marca e devolve quanto o texto precisa recuar.
///
/// Devolve `0` sem logo — e é o que mantém o cabeçalho centralizado de sempre
/// para empresa sem marca cadastrada, sem um segundo caminho de desenho.
///
/// O `try` existe porque o pdfkit LANÇA ao receber bytes que não sabe ler, e
/// quem carregou o arquivo confere a extensão, não o conteúdo: um PNG
/// corrompido chega até aqui. Um RDO sem marca é aceitável; um RDO que não
/// imprime, não — e este documento é o registro legal do dia na obra.
function desenharMarca(doc: Doc, logo: Buffer | null | undefined, x: number, y: number): number {
  if (!logo) return 0;

  try {
    const imagem = (
      doc as unknown as { openImage(src: Buffer): { width: number; height: number } }
    ).openImage(logo);
    const escala = Math.min(
      MARCA_CAIXA.largura / imagem.width,
      MARCA_CAIXA.altura / imagem.height,
    );
    const larguraReal = imagem.width * escala;

    doc.image(logo, x, y, { fit: [MARCA_CAIXA.largura, MARCA_CAIXA.altura] });
    return larguraReal + MARCA_GAP;
  } catch {
    return 0;
  }
}

function caixa(doc: Doc, x: number, y: number, w: number, h: number, preenchimento?: string) {
  if (preenchimento) doc.rect(x, y, w, h).fill(preenchimento);
  doc.rect(x, y, w, h).lineWidth(0.5).stroke(LINHA);
}

/// Faixa cinza de seção. É ela que dá o ritmo do documento: o olho encontra a
/// próxima seção sem precisar de espaço em branco entre elas, que é como o
/// template cabe tanta informação numa página só.
function faixaSecao(doc: Doc, x: number, y: number, w: number, titulo: string): number {
  doc.rect(x, y, w, ALTURA_FAIXA).fill(FAIXA);
  doc.rect(x, y, w, ALTURA_FAIXA).lineWidth(0.5).stroke(LINHA);
  doc
    .font(FONTE_BOLD)
    .fontSize(CORPO)
    .fillColor(TINTA)
    .text(titulo, x + PADDING, y + 3, { width: w - PADDING * 2, lineBreak: false });
  return y + ALTURA_FAIXA;
}

/// Altura que um texto ocupa numa largura dada, com um mínimo.
function alturaTexto(doc: Doc, texto: string, largura: number, fonte = FONTE, tamanho = CORPO) {
  const medida = doc.font(fonte).fontSize(tamanho).heightOfString(texto || ' ', {
    width: largura - PADDING * 2,
  });
  return Math.max(ALTURA_LINHA, medida + PADDING * 2);
}

function escrever(
  doc: Doc,
  texto: string,
  x: number,
  y: number,
  largura: number,
  opcoes: { fonte?: string; tamanho?: number; cor?: string; alinhar?: 'left' | 'center' | 'right' } = {},
) {
  doc
    .font(opcoes.fonte ?? FONTE)
    .fontSize(opcoes.tamanho ?? CORPO)
    .fillColor(opcoes.cor ?? TINTA)
    .text(texto, x + PADDING, y + PADDING, {
      width: largura - PADDING * 2,
      align: opcoes.alinhar ?? 'left',
    });
}

/// Reserva espaço; abre página nova quando não cabe, repetindo o cabeçalho
/// corrido. Evita a seção órfã — título no pé da página e conteúdo na seguinte.
function garantirEspaco(doc: Doc, view: RdoPdfView, y: number, altura: number, esquerda: number, largura: number): number {
  const limite = doc.page.height - MARGEM - 14;
  if (y + altura <= limite) return y;

  doc.addPage();
  desenharCabecalhoCorrido(doc, view, esquerda, largura);
  return MARGEM + 16;
}

// ---------------------------------------------------------------------------
// Seções
// ---------------------------------------------------------------------------

function desenharCabecalhoCorrido(doc: Doc, view: RdoPdfView, x: number, largura: number) {
  const y = MARGEM - 8;
  doc.font(FONTE).fontSize(MIUDO).fillColor(CINZA).text(view.cabecalhoCorrido, x, y, { lineBreak: false });

  // Status no canto, onde o template põe o carimbo de revisão. Um RDO em
  // rascunho impresso sem esta marca passa por documento fechado.
  const rotulo = `Status: ${view.statusRotulo}`;
  const w = doc.font(FONTE_BOLD).fontSize(MIUDO).widthOfString(rotulo) + 8;
  doc.rect(x + largura - w, y - 2, w, 10).fill(FAIXA);
  doc.rect(x + largura - w, y - 2, w, 10).lineWidth(0.5).stroke(LINHA);
  doc.font(FONTE_BOLD).fontSize(MIUDO).fillColor(TINTA).text(rotulo, x + largura - w + 4, y, { lineBreak: false });
}

/// Bloco de identificação: marca e título à esquerda, metadados à direita.
function desenharIdentificacao(
  doc: Doc,
  entrada: RdoPdfEntrada,
  x: number,
  largura: number,
  y0: number,
): number {
  const { view } = entrada;
  const larguraDireita = largura * 0.36;
  const larguraEsquerda = largura - larguraDireita;
  const xDireita = x + larguraEsquerda;

  const alturaDireita = view.metadados.length * ALTURA_LINHA;
  const alturaEsquerda = 34 + 14 + view.identificacao.length * ALTURA_LINHA;
  const altura = Math.max(alturaEsquerda, alturaDireita);

  // A MARCA, quando a empresa tem uma cadastrada.
  //
  // Até aqui era só tipografia, e o comentário anterior explicava por quê: não
  // havia logo em formato que o pdfkit embutisse. Deixou de ser verdade —
  // `Company.logoUrl` guarda um PNG ou JPEG desde que o upload passou a existir
  // em Configurações > Empresa, e os documentos de Compras já o imprimem.
  //
  // Fica à ESQUERDA, e o nome continua centralizado no que sobra: o bloco de
  // identificação é centrado por desenho, e empurrar tudo para a direita
  // desalinharia as quatro linhas de baixo (Obra, Local, Contratante,
  // Responsável), que nascem em `x`.
  const recuo = desenharMarca(doc, entrada.logo, x, y0 + 6);
  const larguraDoNome = larguraEsquerda - recuo;

  doc
    .font(FONTE_BOLD)
    .fontSize(16)
    .fillColor(TINTA)
    .text(view.empresa.toUpperCase(), x + recuo, y0 + 8, {
      width: larguraDoNome,
      align: 'center',
      lineBreak: false,
    });
  doc.font(FONTE_BOLD).fontSize(9.5).text(view.titulo, x + recuo, y0 + 30, {
    width: larguraDoNome,
    align: 'center',
    lineBreak: false,
  });

  let yEsq = y0 + 48;
  const rotuloW = 62;
  for (const linha of view.identificacao) {
    caixa(doc, x, yEsq, rotuloW, ALTURA_LINHA, FAIXA);
    escrever(doc, linha.rotulo, x, yEsq, rotuloW, { fonte: FONTE_BOLD });
    caixa(doc, x + rotuloW, yEsq, larguraEsquerda - rotuloW, ALTURA_LINHA);
    escrever(doc, linha.valor, x + rotuloW, yEsq, larguraEsquerda - rotuloW);
    yEsq += ALTURA_LINHA;
  }

  let yDir = y0;
  const rotuloDirW = larguraDireita * 0.58;
  for (const linha of view.metadados) {
    caixa(doc, xDireita, yDir, rotuloDirW, ALTURA_LINHA, FAIXA);
    escrever(doc, linha.rotulo, xDireita, yDir, rotuloDirW, { fonte: FONTE_BOLD });
    caixa(doc, xDireita + rotuloDirW, yDir, larguraDireita - rotuloDirW, ALTURA_LINHA);
    escrever(doc, linha.valor, xDireita + rotuloDirW, yDir, larguraDireita - rotuloDirW);
    yDir += ALTURA_LINHA;
  }

  return y0 + Math.max(altura, yEsq - y0, yDir - y0);
}

function desenharClima(doc: Doc, view: RdoPdfView, x: number, largura: number, y0: number): number {
  const colunas = [largura * 0.22, largura * 0.48, largura * 0.3];
  let y = y0;

  const cabecalhos = ['Condição climática', 'Tempo', 'Condição'];
  let cx = x;
  for (const [i, titulo] of cabecalhos.entries()) {
    doc.rect(cx, y, colunas[i]!, ALTURA_FAIXA).fill(FAIXA);
    doc.rect(cx, y, colunas[i]!, ALTURA_FAIXA).lineWidth(0.5).stroke(LINHA);
    doc.font(FONTE_BOLD).fontSize(CORPO).fillColor(TINTA).text(titulo, cx + PADDING, y + 3, {
      width: colunas[i]! - PADDING * 2,
      lineBreak: false,
    });
    cx += colunas[i]!;
  }
  y += ALTURA_FAIXA;

  for (const [periodo, tempo, condicao] of view.clima) {
    const h = Math.max(ALTURA_LINHA, alturaTexto(doc, tempo, colunas[1]!));
    cx = x;
    for (const [i, valor] of [periodo, tempo, condicao].entries()) {
      caixa(doc, cx, y, colunas[i]!, h);
      escrever(doc, valor, cx, y, colunas[i]!);
      cx += colunas[i]!;
    }
    y += h;
  }

  return y;
}

function desenharJornada(doc: Doc, view: RdoPdfView, x: number, largura: number, y0: number): number {
  let y = faixaSecao(doc, x, y0, largura, 'Jornada');
  const colunaW = largura / view.jornada.length;

  for (const [i, item] of view.jornada.entries()) {
    const cx = x + colunaW * i;
    caixa(doc, cx, y, colunaW, ALTURA_LINHA);
    doc.font(FONTE_BOLD).fontSize(MIUDO).fillColor(CINZA).text(`${item.rotulo}: `, cx + PADDING, y + 3.5, {
      continued: true,
      lineBreak: false,
    });
    doc.font(FONTE).fontSize(CORPO).fillColor(TINTA).text(item.valor, { lineBreak: false });
  }
  y += ALTURA_LINHA;

  if (view.jornadaObservacoes) {
    const h = alturaTexto(doc, view.jornadaObservacoes, largura);
    caixa(doc, x, y, largura, h);
    escrever(doc, view.jornadaObservacoes, x, y, largura, { cor: CINZA });
    y += h;
  }

  return y;
}

/// Grade de contagens: nome em cima, quantidade em negrito embaixo. É o formato
/// do template para mão de obra e equipamentos, e ele existe porque essas duas
/// listas são LIDAS DE RELANCE — quem confere quer o número, não a frase.
function desenharContagens(
  doc: Doc,
  titulo: string,
  itens: readonly CelulaContagem[],
  x: number,
  largura: number,
  y0: number,
): number {
  let y = faixaSecao(doc, x, y0, largura, titulo);

  if (itens.length === 0) {
    caixa(doc, x, y, largura, ALTURA_LINHA);
    escrever(doc, '—', x, y, largura, { cor: CINZA });
    return y + ALTURA_LINHA;
  }

  const porLinha = 6;
  const celulaW = largura / porLinha;
  const celulaH = 24;

  for (let i = 0; i < itens.length; i += porLinha) {
    const linha = itens.slice(i, i + porLinha);
    for (let c = 0; c < porLinha; c += 1) {
      const cx = x + celulaW * c;
      caixa(doc, cx, y, celulaW, celulaH);
      const item = linha[c];
      if (!item) continue;
      doc.font(FONTE).fontSize(MIUDO).fillColor(CINZA).text(item.nome, cx + 2, y + 4, {
        width: celulaW - 4,
        align: 'center',
        height: 9,
        ellipsis: true,
      });
      doc.font(FONTE_BOLD).fontSize(9).fillColor(TINTA).text(item.quantidade, cx + 2, y + 13, {
        width: celulaW - 4,
        align: 'center',
        lineBreak: false,
      });
    }
    y += celulaH;
  }

  return y;
}

/// Tabela de duas colunas com a direita estreita — atividades e ocorrências.
function desenharLista(
  doc: Doc,
  secao: SecaoLista,
  x: number,
  largura: number,
  y0: number,
  proporcaoEsquerda: number,
): number {
  let y = faixaSecao(doc, x, y0, largura, secao.titulo);

  if (secao.linhas.length === 0) {
    caixa(doc, x, y, largura, ALTURA_LINHA);
    escrever(doc, secao.vazio, x, y, largura, { cor: CINZA });
    return y + ALTURA_LINHA;
  }

  const esqW = largura * proporcaoEsquerda;
  for (const linha of secao.linhas) {
    const h = alturaTexto(doc, linha.esquerda, esqW);
    caixa(doc, x, y, esqW, h);
    escrever(doc, linha.esquerda, x, y, esqW);
    caixa(doc, x + esqW, y, largura - esqW, h);
    escrever(doc, linha.direita, x + esqW, y, largura - esqW, { tamanho: MIUDO, cor: CINZA });
    y += h;
  }

  return y;
}

/// Materiais recebidos e utilizados LADO A LADO, como no template. Separar em
/// duas seções empilhadas custaria meia página e desfaria a comparação que a
/// disposição lado a lado oferece de graça.
function desenharMateriais(doc: Doc, view: RdoPdfView, x: number, largura: number, y0: number): number {
  const metade = largura / 2;
  const alturas: number[] = [];

  for (const [i, secao] of [view.materiaisRecebidos, view.materiaisUtilizados].entries()) {
    const cx = x + metade * i;
    let y = faixaSecao(doc, cx, y0, metade, secao.titulo);

    for (const linha of secao.linhas) {
      const h = alturaTexto(doc, linha.esquerda, metade * 0.72);
      caixa(doc, cx, y, metade * 0.72, h);
      escrever(doc, linha.esquerda, cx, y, metade * 0.72);
      caixa(doc, cx + metade * 0.72, y, metade * 0.28, h);
      escrever(doc, linha.direita, cx + metade * 0.72, y, metade * 0.28, {
        tamanho: MIUDO,
        alinhar: 'right',
      });
      y += h;
    }
    alturas.push(y);
  }

  // As duas colunas terminam na mesma linha: sem isso, a próxima seção começa
  // torta quando um lado tem mais itens que o outro.
  const fim = Math.max(...alturas);
  for (const [i, ate] of alturas.entries()) {
    if (ate < fim) caixa(doc, x + metade * i, ate, metade, fim - ate);
  }
  return fim;
}

function desenharObservacoes(doc: Doc, view: RdoPdfView, x: number, largura: number, y0: number): number {
  // Sem conteúdo, sem seção: uma caixa "Observações" vazia só ocupa página.
  if (!view.observacoes) return y0;

  const y = faixaSecao(doc, x, y0, largura, 'Observações');
  const h = alturaTexto(doc, view.observacoes, largura);
  caixa(doc, x, y, largura, h);
  escrever(doc, view.observacoes, x, y, largura);
  return y + h;
}

/// Galeria 2×2, uma página por grupo de quatro.
function desenharGaleria(doc: Doc, entrada: RdoPdfEntrada, x: number, largura: number, y0: number): number {
  const { view, fotos } = entrada;
  if (fotos.length === 0) return y0;

  const paginas = paginarFotos(fotos);
  const celulaW = largura / COLUNAS;
  let fimDaGrade = y0;

  for (const [indicePagina, pagina] of paginas.entries()) {
    doc.addPage();
    desenharCabecalhoCorrido(doc, view, x, largura);

    let y = MARGEM + 16;
    // O título com o total aparece na PRIMEIRA página da galeria; repeti-lo em
    // todas faria o leitor achar que cada página tem esse tanto de fotos.
    if (indicePagina === 0) y = faixaSecao(doc, x, y, largura, `Fotos (${fotos.length})`);

    const disponivel = doc.page.height - MARGEM - 14 - y;
    const celulaH = disponivel / LINHAS;
    const legendaH = 16;
    let fimDaPagina = y;

    for (const [i, foto] of pagina.entries()) {
      const cx = x + celulaW * (i % COLUNAS);
      const cy = y + celulaH * Math.floor(i / COLUNAS);
      caixa(doc, cx, cy, celulaW, celulaH);

      const caixaW = celulaW - 8;
      const caixaH = celulaH - legendaH - 8;

      // A altura REAL que a foto vai ocupar, a partir das dimensões gravadas no
      // upload. É o que permite encostar a legenda na imagem em vez de fixá-la
      // no pé da célula: numa foto baixa e larga, a legenda no pé fica a um
      // palmo dela e deixa de se ler como legenda daquela foto.
      //
      // Sem dimensões (mídia antiga, gravada antes das colunas), cai no `fit`
      // do pdfkit e a legenda vai para o pé — arranjo pior, e ainda legível.
      const proporcaoConhecida = foto.view.largura !== null && foto.view.altura !== null;
      const escala = proporcaoConhecida
        ? Math.min(caixaW / foto.view.largura!, caixaH / foto.view.altura!)
        : 1;
      const desenhadaW = foto.view.largura !== null ? foto.view.largura * escala : caixaW;
      const desenhadaH = foto.view.altura !== null ? foto.view.altura * escala : caixaH;

      let yLegenda = cy + celulaH - legendaH + 3;

      try {
        if (proporcaoConhecida) {
          // Centralizada na horizontal, encostada no topo na vertical — como no
          // template, em que a foto começa no alto da célula.
          doc.image(foto.bytes, cx + 4 + (caixaW - desenhadaW) / 2, cy + 4, {
            width: desenhadaW,
            height: desenhadaH,
          });
          yLegenda = cy + 4 + desenhadaH + 3;
        } else {
          doc.image(foto.bytes, cx + 4, cy + 4, { fit: [caixaW, caixaH], align: 'center' });
        }
      } catch {
        // Imagem que o pdfkit não decodifica não derruba o relatório inteiro:
        // a célula vira um aviso e as outras seguem.
        doc.font(FONTE).fontSize(MIUDO).fillColor(CINZA).text('Imagem indisponível', cx, cy + celulaH / 2, {
          width: celulaW,
          align: 'center',
          lineBreak: false,
        });
      }

      doc.font(FONTE).fontSize(MIUDO).fillColor(TINTA).text(foto.view.legenda, cx + 4, yLegenda, {
        width: celulaW - 8,
        align: 'center',
        height: legendaH - 4,
        ellipsis: true,
      });

      // A base da última linha ocupada DESTA página. Acumular o máximo entre
      // páginas seria errado: uma página cheia no meio da galeria empurraria a
      // assinatura para o pé mesmo quando a última página tem duas fotos e
      // meia folha livre — e ela acabaria sozinha numa página nova.
      fimDaPagina = Math.max(fimDaPagina, cy + celulaH);
    }

    // Sobrescreve a cada página: o que interessa é onde a ÚLTIMA termina.
    fimDaGrade = fimDaPagina;
  }

  return fimDaGrade;
}

/// Vídeos como REGISTRO de evidência: o PDF não os reproduz, mas precisa provar
/// que existem. Sem esta seção, um RDO com dez vídeos e nenhuma foto exportaria
/// como se nada tivesse sido filmado.
function desenharVideos(doc: Doc, view: RdoPdfView, x: number, largura: number, y0: number): number {
  if (view.videos.length === 0) return y0;

  let y = garantirEspaco(doc, view, y0 + 10, 40 + view.videos.length * ALTURA_LINHA, x, largura);
  y = faixaSecao(doc, x, y, largura, `Vídeos (${view.videos.length})`);

  for (const video of view.videos) {
    const h = ALTURA_LINHA + 3;
    caixa(doc, x, y, largura * 0.7, h);
    escrever(doc, video.legenda, x, y, largura * 0.7);
    caixa(doc, x + largura * 0.7, y, largura * 0.3, h);
    escrever(doc, video.detalhe ?? '', x + largura * 0.7, y, largura * 0.3, {
      tamanho: MIUDO,
      cor: CINZA,
      alinhar: 'right',
    });
    y += h;
  }

  return y;
}

function desenharAssinaturas(doc: Doc, view: RdoPdfView, x: number, largura: number, y0: number) {
  const altura = 60;
  let y = garantirEspaco(doc, view, y0 + 24, altura, x, largura);

  doc.moveTo(x, y).lineTo(x + largura, y).lineWidth(0.5).stroke(LINHA_CLARA);
  y += 26;

  const colunaW = largura / Math.max(view.assinaturas.length, 2);
  for (const [i, nome] of view.assinaturas.entries()) {
    const cx = x + colunaW * i;
    const linhaW = colunaW - 24;
    doc.moveTo(cx + 12, y).lineTo(cx + 12 + linhaW, y).lineWidth(0.5).stroke(TINTA);
    doc.font(FONTE).fontSize(MIUDO).fillColor(TINTA).text(nome, cx + 12, y + 4, {
      width: linhaW,
      align: 'center',
      height: 10,
      ellipsis: true,
    });
  }
}

/// `n / N` no rodapé de todas as páginas.
///
/// Feito no fim, e não durante o desenho: só aqui o total é conhecido. É também
/// por isso que o rodapé não pode ser escrito junto com o conteúdo — a primeira
/// página precisaria adivinhar quantas fotos viriam.
function numerarPaginas(doc: Doc, view: RdoPdfView, x: number, largura: number) {
  const faixa = doc.bufferedPageRange();

  for (let i = 0; i < faixa.count; i += 1) {
    doc.switchToPage(faixa.start + i);

    // O rodapé fica ABAIXO da margem inferior, e o pdfkit reage a isso abrindo
    // uma página nova — foi assim que a primeira versão gerou uma folha em
    // branco no fim e ainda empurrou o "1 / 1" para ela. Zerar a margem de
    // baixo só enquanto se escreve o rodapé é o jeito suportado de dizer "eu
    // sei o que estou fazendo"; ela é restaurada logo em seguida para não
    // afetar mais nada.
    const margemOriginal = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;

    doc
      .font(FONTE)
      .fontSize(MIUDO)
      .fillColor(CINZA)
      .text(`${i + 1} / ${faixa.count}`, x, doc.page.height - MARGEM + 2, {
        width: largura,
        align: 'right',
        lineBreak: false,
      });

    doc.page.margins.bottom = margemOriginal;
  }
}
