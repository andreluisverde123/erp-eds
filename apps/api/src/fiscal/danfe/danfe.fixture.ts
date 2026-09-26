/// NF-e sintética no formato `procNFe`, para os testes do DANFE. Dados
/// inventados — nenhum CNPJ, chave ou protocolo aqui existe de verdade.
export const CHAVE_FIXTURE = '53260812345678000190550010000012341000012345';

export function nfeXml(options: { itens?: number; duplicatas?: number; infCpl?: string } = {}) {
  const itens = options.itens ?? 2;
  const duplicatas = options.duplicatas ?? 2;

  const det = Array.from({ length: itens }, (_, index) => {
    const n = index + 1;
    return `<det nItem="${n}">
      <prod><cProd>CIM-${n}</cProd><xProd>CIMENTO CP II-E-32 SACO 50KG ITEM ${n}</xProd><NCM>25232910</NCM>
        <CFOP>5102</CFOP><uCom>SC</uCom><qCom>10.0000</qCom><vUnCom>32.5000000000</vUnCom><vProd>325.00</vProd></prod>
      <imposto>
        <ICMS><ICMS00><orig>0</orig><CST>00</CST><vBC>325.00</vBC><pICMS>18.00</pICMS><vICMS>58.50</vICMS></ICMS00></ICMS>
        <IPI><cEnq>999</cEnq><IPITrib><CST>50</CST><vBC>325.00</vBC><pIPI>5.00</pIPI><vIPI>16.25</vIPI></IPITrib></IPI>
      </imposto>
      ${n === 1 ? '<infAdProd>Lote 2026-08 validade 90 dias</infAdProd>' : ''}
    </det>`;
  }).join('');

  const dup = Array.from(
    { length: duplicatas },
    (_, index) =>
      `<dup><nDup>00${index + 1}</nDup><dVenc>2026-09-${String(10 + index).padStart(2, '0')}</dVenc><vDup>100.00</vDup></dup>`,
  ).join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${CHAVE_FIXTURE}" versao="4.00">
    <ide><cUF>53</cUF><natOp>VENDA DE MERCADORIA ADQUIRIDA DE TERCEIROS</natOp><mod>55</mod><serie>1</serie>
      <nNF>1234</nNF><dhEmi>2026-08-04T23:40:12-03:00</dhEmi><dhSaiEnt>2026-08-05T08:00:00-03:00</dhSaiEnt>
      <tpNF>1</tpNF><tpAmb>1</tpAmb></ide>
    <emit><CNPJ>12345678000190</CNPJ><xNome>MATERIAIS DE CONSTRUCAO EXEMPLO LTDA</xNome><xFant>EXEMPLO MATERIAIS</xFant>
      <enderEmit><xLgr>SIA TRECHO 3</xLgr><nro>LOTE 1250</nro><xBairro>ZONA INDUSTRIAL</xBairro><xMun>BRASILIA</xMun>
        <UF>DF</UF><CEP>71200030</CEP><fone>6133334444</fone></enderEmit>
      <IE>0712345600123</IE><CRT>3</CRT></emit>
    <dest><CNPJ>98765432000110</CNPJ><xNome>CONSTRUTORA DESTINO LTDA</xNome>
      <enderDest><xLgr>QUADRA 102 NORTE</xLgr><nro>S/N</nro><xCpl>BLOCO A SALA 201</xCpl><xBairro>ASA NORTE</xBairro>
        <xMun>BRASILIA</xMun><UF>DF</UF><CEP>70722500</CEP><fone>61999998888</fone></enderDest>
      <IE>0798765400155</IE></dest>
    ${det}
    <total><ICMSTot><vBC>650.00</vBC><vICMS>117.00</vICMS><vBCST>0.00</vBCST><vST>0.00</vST><vProd>650.00</vProd>
      <vFrete>0.00</vFrete><vSeg>0.00</vSeg><vDesc>0.00</vDesc><vII>0.00</vII><vIPI>32.50</vIPI><vOutro>0.00</vOutro>
      <vNF>682.50</vNF><vTotTrib>150.12</vTotTrib></ICMSTot></total>
    <transp><modFrete>0</modFrete><transporta><CNPJ>11222333000144</CNPJ><xNome>TRANSPORTES RAPIDO LTDA</xNome>
      <IE>0711122200133</IE><xEnder>SIA TRECHO 5</xEnder><xMun>BRASILIA</xMun><UF>DF</UF></transporta>
      <veicTransp><placa>ABC1D23</placa><UF>DF</UF></veicTransp>
      <vol><qVol>20</qVol><esp>SACO</esp><pesoL>1000.000</pesoL><pesoB>1010.500</pesoB></vol></transp>
    <cobr><fat><nFat>1234</nFat><vOrig>682.50</vOrig><vLiq>682.50</vLiq></fat>${dup}</cobr>
    <infAdic><infCpl>${options.infCpl ?? 'Pedido 4567. Entrega na obra Residencial Exemplo.'}</infCpl></infAdic>
  </infNFe></NFe>
  <protNFe versao="4.00"><infProt><tpAmb>1</tpAmb><chNFe>${CHAVE_FIXTURE}</chNFe>
    <dhRecbto>2026-08-04T23:40:15-03:00</dhRecbto><nProt>353260000123456</nProt><cStat>100</cStat></infProt></protNFe>
</nfeProc>`;
}
