import { BRAZILIAN_UFS } from '../parsing/locations';
import { previousCompetences, SICRO_UF_PATHS, sicroPackageUrl, sinapiPackageUrl } from './official-sources';

describe('Endereços das bases oficiais', () => {
  it('SINAPI: zip nacional do mês', () => {
    expect(sinapiPackageUrl('2026-08')).toBe(
      'https://www.caixa.gov.br/Downloads/sinapi-relatorios-mensais/SINAPI-2026-08-formato-xlsx.zip',
    );
  });

  it('SICRO: pacote da UF pela região, ano e mês por extenso', () => {
    expect(sicroPackageUrl('SP', '2026-04')).toBe(
      'https://www.gov.br/dnit/pt-br/assuntos/planejamento-e-pesquisa/custos-referenciais/sistemas-de-custos/sicro/relatorios/relatorios-sicro/sudeste/sao-paulo/2026/abril/sp-04-2026.7z',
    );
    expect(sicroPackageUrl('RR', '2026-03')).toMatch(/\/norte\/roraima\/2026\/marco\/rr-03-2026\.7z$/);
  });

  it('todas as 27 UFs têm página no SICRO', () => {
    expect(Object.keys(SICRO_UF_PATHS).sort()).toEqual([...BRAZILIAN_UFS].sort());
  });

  it('janela: meses anteriores ao corrente, virando o ano, pelo horário de Brasília', () => {
    expect(previousCompetences(3, new Date('2026-02-14T12:00:00Z'))).toEqual(['2026-01', '2025-12', '2025-11']);
    // 1º de março 01h UTC ainda é fevereiro em Brasília.
    expect(previousCompetences(1, new Date('2026-03-01T01:00:00Z'))).toEqual(['2026-01']);
  });
});
