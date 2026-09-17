import PDFDocument from 'pdfkit';

import { tamanhoQueCabe } from './rdo-pdf-renderer';

/// O nome da empresa saía com corpo fixo e sem quebra: "EDS CONSTRUÇÕES E
/// IMOBILIÁRIA" passava da largura e a segunda linha era impressa por cima do
/// título "Relatório Diário de Obra (RDO)" (visto num RDO de 17/09/2026).
describe('tamanhoQueCabe — nome da empresa no cabeçalho do RDO', () => {
  const doc = new PDFDocument({ size: 'A4', margin: 30 });
  /// Num A4, o bloco da esquerda tem ~342 pt. Com a marca da empresa (104 pt
  /// mais o respiro) sobram ~229 pt para o nome — e é aí que o nome da EDS
  /// (281 pt no corpo 16) deixava de caber.
  const LARGURA = 342;
  const LARGURA_COM_MARCA = 229;

  it('mantém o corpo cheio quando o nome é curto', () => {
    expect(tamanhoQueCabe(doc, 'ENGEO', LARGURA)).toBe(16);
  });

  it('reduz o corpo até o nome caber numa linha (caso EDS, com marca)', () => {
    const nome = 'EDS CONSTRUÇÕES E IMOBILIÁRIA';

    expect(tamanhoQueCabe(doc, nome, LARGURA)).toBe(16);

    const comMarca = tamanhoQueCabe(doc, nome, LARGURA_COM_MARCA);
    expect(comMarca).toBeLessThan(16);
    expect(doc.font('Helvetica-Bold').fontSize(comMarca).widthOfString(nome)).toBeLessThanOrEqual(
      LARGURA_COM_MARCA,
    );
  });

  it('não desce abaixo de 10 — abaixo disso o cabeçalho ficaria ilegível', () => {
    const nome = 'CONSTRUTORA EXEMPLO DE NOME BEM MAIS LONGO ENGENHARIA E PARTICIPAÇÕES LTDA';

    expect(tamanhoQueCabe(doc, nome, LARGURA_COM_MARCA)).toBe(10);
  });
});
