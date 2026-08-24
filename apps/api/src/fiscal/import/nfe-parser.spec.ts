import { NfeParseError, parseFiscalDocument, type ParsedInvoice } from './nfe-parser';

const CHAVE = `3526080912345678000190550010000012341${'0'.repeat(7)}`;

function invoice(xml: string, schema: string): ParsedInvoice {
  const parsed = parseFiscalDocument(xml, schema);
  if (parsed.kind !== 'invoice') throw new Error('esperava uma nota');
  return parsed.data;
}

const PROC_COMPLETO = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
    <ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-08-01T10:00:00-03:00</dhEmi></ide>
    <emit>
      <CNPJ>12.345.678/0001-90</CNPJ>
      <xNome>CONSTRUTORA FORNECEDORA LTDA</xNome>
      <xFant>FORNECEDORA</xFant>
      <IE>0771234567</IE>
      <email>fiscal@fornecedora.com.br</email>
      <enderEmit>
        <xLgr>RUA DAS OBRAS</xLgr><nro>100</nro><xCpl>SALA 2</xCpl>
        <xBairro>CENTRO</xBairro><xMun>GOIANIA</xMun><UF>GO</UF>
        <CEP>74000-000</CEP><fone>(62) 3200-1000</fone>
      </enderEmit>
    </emit>
    <total><ICMSTot><vNF>1500.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

/// Emitente magro: só o obrigatório. É o que chega de MEI e de emitente que
/// não preenche os campos opcionais do layout.
const PROC_MINIMO = `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe">
  <NFe><infNFe Id="NFe${CHAVE}" versao="4.00">
    <ide><nNF>1234</nNF><serie>1</serie><dhEmi>2026-08-01T10:00:00-03:00</dhEmi></ide>
    <emit><CNPJ>12345678000190</CNPJ><xNome>EMITENTE SEM ENDERECO</xNome></emit>
    <total><ICMSTot><vNF>50.00</vNF></ICMSTot></total>
  </infNFe></NFe>
</nfeProc>`;

const RESUMO = `<?xml version="1.0" encoding="UTF-8"?>
<resNFe xmlns="http://www.portalfiscal.inf.br/nfe">
  <chNFe>${CHAVE}</chNFe>
  <CNPJ>12345678000190</CNPJ>
  <xNome>CONSTRUTORA FORNECEDORA LTDA</xNome>
  <IE>0771234567</IE>
  <dhEmi>2026-08-01T10:00:00-03:00</dhEmi>
  <vNF>1500.00</vNF>
  <cSitNFe>1</cSitNFe>
</resNFe>`;

describe('nfe-parser — emitente', () => {
  describe('procNFe', () => {
    it('extrai o endereço do emitente em campos separados', () => {
      const nota = invoice(PROC_COMPLETO, 'procNFe_v4.00');

      expect(nota).toMatchObject({
        supplierStreet: 'RUA DAS OBRAS',
        supplierNumber: '100',
        supplierComplement: 'SALA 2',
        supplierNeighborhood: 'CENTRO',
        supplierCity: 'GOIANIA',
        supplierState: 'GO',
      });
    });

    it('normaliza CNPJ, CEP e telefone para só dígitos', () => {
      const nota = invoice(PROC_COMPLETO, 'procNFe_v4.00');

      expect(nota.supplierDocument).toBe('12345678000190');
      expect(nota.supplierZipCode).toBe('74000000');
      expect(nota.supplierPhone).toBe('6232001000');
    });

    it('mantém o endereço em uma linha, que a conciliação já exibe', () => {
      const nota = invoice(PROC_COMPLETO, 'procNFe_v4.00');

      // Os campos separados são acréscimo, não substituição.
      expect(nota.supplierAddress).toBe('RUA DAS OBRAS, 100, SALA 2, CENTRO');
    });

    it('deixa nulo o que o XML não traz, sem inventar valor', () => {
      const nota = invoice(PROC_MINIMO, 'procNFe_v4.00');

      expect(nota.supplierName).toBe('EMITENTE SEM ENDERECO');
      expect(nota.supplierDocument).toBe('12345678000190');
      expect(nota).toMatchObject({
        supplierTradeName: null,
        supplierIe: null,
        supplierStreet: null,
        supplierNumber: null,
        supplierComplement: null,
        supplierNeighborhood: null,
        supplierCity: null,
        supplierState: null,
        supplierZipCode: null,
        supplierPhone: null,
        supplierEmail: null,
        supplierAddress: null,
      });
    });
  });

  describe('resNFe (resumo)', () => {
    it('traz razão social e IE, e nada de endereço, telefone ou e-mail', () => {
      const nota = invoice(RESUMO, 'resNFe_v1.01');

      expect(nota.supplierName).toBe('CONSTRUTORA FORNECEDORA LTDA');
      expect(nota.supplierIe).toBe('0771234567');
      expect(nota.isComplete).toBe(false);
      expect(nota).toMatchObject({
        supplierTradeName: null,
        supplierStreet: null,
        supplierNumber: null,
        supplierComplement: null,
        supplierNeighborhood: null,
        supplierCity: null,
        supplierState: null,
        supplierZipCode: null,
        supplierPhone: null,
        supplierEmail: null,
      });
    });
  });

  describe('documento inválido', () => {
    it('recusa XML malformado', () => {
      expect(() => parseFiscalDocument('<nfeProc><NFe>', 'procNFe_v4.00')).toThrow(NfeParseError);
    });

    it('recusa procNFe sem infNFe', () => {
      expect(() => parseFiscalDocument('<nfeProc></nfeProc>', 'procNFe_v4.00')).toThrow(
        /sem <infNFe>/,
      );
    });

    it('recusa chave de acesso que não tem 44 dígitos', () => {
      const truncada = PROC_COMPLETO.replace(`NFe${CHAVE}`, 'NFe123');
      expect(() => parseFiscalDocument(truncada, 'procNFe_v4.00')).toThrow(
        /Chave de acesso inválida/,
      );
    });

    it('recusa schema desconhecido', () => {
      expect(() => parseFiscalDocument(PROC_COMPLETO, 'algoNovo_v1.00')).toThrow(
        /Schema não reconhecido/,
      );
    });
  });
});
