import { renderRdoPdf } from './rdo-pdf-renderer';
import type { RdoPdfView } from './rdo-pdf-view';

/// PNG 1×1 de verdade. O pdfkit DECODIFICA a imagem ao embutir, então um
/// buffer inventado faria o teste falhar por um motivo que não é o testado.
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const VAZIA = { titulo: '', linhas: [], vazio: '' };

/// O mínimo que o renderizador precisa. O conteúdo não é o assunto aqui.
const VIEW: RdoPdfView = {
  nomeArquivo: 'RDO-1.pdf',
  cabecalhoCorrido: 'Relatório 04/09/2026 n° 1',
  statusRotulo: 'Finalizado',
  empresa: 'Construtora Exemplo',
  titulo: 'Relatório Diário de Obra (RDO)',
  identificacao: [{ rotulo: 'Obra', valor: 'OBR-001 — Exemplo' }],
  metadados: [{ rotulo: 'Relatório n°', valor: '1' }],
  clima: [['Manhã', 'Ensolarado', '—']],
  jornada: [{ rotulo: 'Entrada', valor: '07:00' }],
  jornadaObservacoes: null,
  maoDeObra: [{ nome: 'Pedreiro', quantidade: '4' }],
  maoDeObraTotal: 4,
  equipamentos: [],
  equipamentosTotal: 0,
  atividades: { ...VAZIA, titulo: 'Atividades (0)', vazio: 'Sem atividades registradas' },
  ocorrencias: { ...VAZIA, titulo: 'Ocorrências (0)', vazio: 'Sem registros de ocorrências' },
  materiaisRecebidos: { ...VAZIA, titulo: 'Materiais recebidos (0)' },
  materiaisUtilizados: { ...VAZIA, titulo: 'Materiais utilizados (0)' },
  observacoes: null,
  fotos: [],
  videos: [],
  assinaturas: ['Fulano — Responsável pela obra'],
};

/// A MARCA DA EMPRESA no cabeçalho do RDO.
///
/// Até esta mudança o cabeçalho era só tipografia, e o comentário no
/// renderizador explicava por quê: não havia logo em formato que o pdfkit
/// embutisse. Deixou de ser verdade — `Company.logoUrl` guarda PNG ou JPEG
/// desde que o upload existe em Configurações > Empresa, e os documentos de
/// Compras já o imprimem.
///
/// A regra que governa este arquivo: **o logo é enfeite; o RDO é o registro do
/// dia na obra.** Nada relacionado à marca pode impedir a exportação.
describe('Logo no cabeçalho do RDO', () => {
  it('empresa sem marca cadastrada exporta como sempre', async () => {
    const bytes = await renderRdoPdf({ view: VIEW, fotos: [], logo: null });

    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('o campo é opcional — chamada antiga continua compilando e gerando', async () => {
    const bytes = await renderRdoPdf({ view: VIEW, fotos: [] });

    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('com marca, o PDF sai válido e mais pesado que sem ela', async () => {
    const com = await renderRdoPdf({ view: VIEW, fotos: [], logo: PNG_1X1 });
    const sem = await renderRdoPdf({ view: VIEW, fotos: [], logo: null });

    expect(com.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    // A imagem embutida pesa: é a prova de que ela foi desenhada, e não
    // silenciosamente ignorada pelo renderizador.
    expect(com.length).toBeGreaterThan(sem.length);
  });

  it('bytes que NÃO são imagem não impedem a exportação', async () => {
    // Quem carrega o arquivo confere a EXTENSÃO, não o conteúdo: um PNG
    // corrompido chega até aqui, e o pdfkit lança ao recebê-lo. O RDO precisa
    // sair mesmo assim.
    const bytes = await renderRdoPdf({
      view: VIEW,
      fotos: [],
      logo: Buffer.from('isto não é uma imagem'),
    });

    expect(bytes.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('a marca não empurra o documento para outra página', async () => {
    // O RDO é denso e cabe em uma página quando o conteúdo é curto. A marca
    // ocupa uma faixa que já existia em branco no cabeçalho — se passasse a
    // custar uma página, o ganho não valeria.
    const com = await renderRdoPdf({ view: VIEW, fotos: [], logo: PNG_1X1 });
    const sem = await renderRdoPdf({ view: VIEW, fotos: [], logo: null });

    const paginas = (pdf: Buffer) => (pdf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;
    expect(paginas(com)).toBe(paginas(sem));
  });
});
