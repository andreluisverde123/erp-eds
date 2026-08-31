import { AUSENTE, buildRdoPdfView, nomeArquivoPdf } from './rdo-pdf-view';
import type { DailyReportDetail } from '../daily-reports.service';

const OBRA = {
  id: 'obra-1',
  code: 'OBR-001',
  name: 'Residencial Alpha',
  clientName: 'Construtora Horizonte',
  responsibleName: 'Marina Souza',
  addressLine: 'Rua das Obras, 100',
  city: 'Curitiba',
  state: 'PR',
  startDate: new Date('2026-01-01T00:00:00.000Z'),
  expectedEndDate: new Date('2026-12-31T00:00:00.000Z'),
};

function relatorio(over: Partial<DailyReportDetail> = {}): DailyReportDetail {
  return {
    id: 'rdo-1',
    number: 24,
    reportDate: new Date('2026-08-30T00:00:00.000Z'),
    status: 'DRAFT',
    weekday: 'Domingo',
    statusLabel: 'Rascunho',
    editable: true,
    notes: null,
    constructionSite: OBRA,
    schedule: { startDate: OBRA.startDate, expectedEndDate: OBRA.expectedEndDate, totalDays: 364, elapsedDays: 241, remainingDays: 123 },
    workSchedule: { startTime: '07:00', breakStartTime: '12:00', breakEndTime: '13:00', endTime: '17:00' },
    scheduleNotes: null,
    morningWeather: 'SUNNY',
    afternoonWeather: 'RAIN',
    weatherNotes: null,
    labor: [],
    equipment: [],
    activities: [],
    occurrences: [],
    materials: [],
    photos: [],
    videos: [],
    ...over,
  } as unknown as DailyReportDetail;
}

const EMPRESA = 'EDS Construtora';

describe('nomeArquivoPdf', () => {
  it('segue o padrão RDO-obra-numero-data', () => {
    expect(nomeArquivoPdf('OBR-001', 2, new Date('2026-08-30T00:00:00.000Z'))).toBe(
      'RDO-OBR-001-002-2026-08-30.pdf',
    );
  });

  it('preenche o número com zeros para ordenar certo no gerenciador de arquivos', () => {
    // Sem isso, o RDO 10 aparece antes do 2 numa pasta ordenada por nome.
    const nomes = [2, 10, 100].map((n) => nomeArquivoPdf('OBR-001', n, new Date('2026-08-30T00:00:00.000Z')));
    expect(nomes).toEqual([...nomes].sort());
  });
});

describe('buildRdoPdfView — o que NÃO se inventa', () => {
  it('número de contrato sai como travessão: a obra não guarda esse dado', () => {
    const view = buildRdoPdfView(relatorio(), EMPRESA);
    const contrato = view.metadados.find((linha) => linha.rotulo === 'Contrato');

    // `ContractorContract` existe no ERP, mas é contrato com terceirizado —
    // outro conceito. Usá-lo aqui encheria o campo com um número errado.
    expect(contrato?.valor).toBe(AUSENTE);
  });

  it('sem datas na obra, os três prazos ficam com travessão em vez de zero', () => {
    const semPrazo = relatorio({
      schedule: { startDate: null, expectedEndDate: null, totalDays: null, elapsedDays: null, remainingDays: null },
    });
    const view = buildRdoPdfView(semPrazo, EMPRESA);

    // "0 dias" seria uma afirmação falsa sobre o contrato; o traço diz "não sei".
    for (const rotulo of ['Prazo contratual', 'Prazo decorrido', 'Prazo a vencer']) {
      expect(view.metadados.find((l) => l.rotulo === rotulo)?.valor).toBe(AUSENTE);
    }
  });

  it('prazo vencido mostra o atraso, e não zero', () => {
    const atrasada = relatorio({
      schedule: { startDate: OBRA.startDate, expectedEndDate: OBRA.expectedEndDate, totalDays: 364, elapsedDays: 400, remainingDays: -36 },
    });
    const view = buildRdoPdfView(atrasada, EMPRESA);

    // Zerar esconderia exatamente o que o documento precisa registrar.
    expect(view.metadados.find((l) => l.rotulo === 'Prazo a vencer')?.valor).toBe('36 dias em atraso');
  });

  it('assinaturas trazem só quem o domínio conhece', () => {
    const view = buildRdoPdfView(relatorio(), EMPRESA);

    expect(view.assinaturas).toEqual(['Marina Souza — Responsável pela obra', 'Responsável Técnico']);
  });

  it('obra sem responsável não inventa um nome na assinatura', () => {
    const view = buildRdoPdfView(
      relatorio({ constructionSite: { ...OBRA, responsibleName: null } as never }),
      EMPRESA,
    );

    expect(view.assinaturas).toEqual(['Responsável Técnico']);
  });
});

describe('buildRdoPdfView — conteúdo', () => {
  it('carimba a situação do relatório', () => {
    expect(buildRdoPdfView(relatorio(), EMPRESA).statusRotulo).toBe('Rascunho');
    expect(
      buildRdoPdfView(relatorio({ status: 'SUBMITTED', statusLabel: 'Finalizado' }), EMPRESA).statusRotulo,
    ).toBe('Finalizado');
  });

  it('traz a jornada', () => {
    const view = buildRdoPdfView(relatorio(), EMPRESA);

    expect(view.jornada).toEqual([
      { rotulo: 'Entrada', valor: '07:00' },
      { rotulo: 'Intervalo', valor: '12:00 – 13:00' },
      { rotulo: 'Saída', valor: '17:00' },
    ]);
  });

  it('sem intervalo registrado, não exibe um intervalo fictício', () => {
    const view = buildRdoPdfView(
      relatorio({ workSchedule: { startTime: '07:00', breakStartTime: null, breakEndTime: null, endTime: '17:00' } }),
      EMPRESA,
    );

    expect(view.jornada.find((l) => l.rotulo === 'Intervalo')?.valor).toBe(AUSENTE);
  });

  it('traz o clima em português, e a observação DENTRO da tabela', () => {
    const view = buildRdoPdfView(relatorio({ weatherNotes: 'Chuva entre 14h e 15h.' }), EMPRESA);

    expect(view.clima[0]).toEqual(['Manhã', 'Ensolarado', AUSENTE]);
    expect(view.clima[1]).toEqual(['Tarde', 'Chuva', AUSENTE]);
    // Fora da tabela, a observação deixaria de se ler como parte da condição.
    expect(view.clima[2]).toEqual(['Observações', 'Chuva entre 14h e 15h.', AUSENTE]);
  });

  it('conta mão de obra por PESSOAS e equipamentos por UNIDADES', () => {
    const view = buildRdoPdfView(
      relatorio({
        labor: [{ role: 'Pedreiro', quantity: 8 }, { role: 'Servente', quantity: 6 }] as never,
        equipment: [{ name: 'Betoneira', quantity: 1 }, { name: 'Andaime', quantity: 4 }] as never,
      }),
      EMPRESA,
    );

    expect(view.maoDeObraTotal).toBe(14);
    expect(view.equipamentosTotal).toBe(5);
    // Funções com nomes parecidos não são agrupadas: cada linha é uma célula.
    expect(view.maoDeObra).toEqual([
      { nome: 'Pedreiro', quantidade: '8' },
      { nome: 'Servente', quantidade: '6' },
    ]);
  });

  it('traz atividades com o local na coluna estreita', () => {
    const view = buildRdoPdfView(
      relatorio({ activities: [{ description: 'Alvenaria', location: 'Pav. 03' }] as never }),
      EMPRESA,
    );

    expect(view.atividades.titulo).toBe('Atividades (1)');
    expect(view.atividades.linhas).toEqual([{ esquerda: 'Alvenaria', direita: 'Pav. 03' }]);
  });

  it('traduz o tipo da ocorrência e mostra a hora', () => {
    const view = buildRdoPdfView(
      relatorio({
        occurrences: [{ type: 'STOPPAGE', description: 'Chuva parou a frente', occurredAtMinutes: 870 }] as never,
      }),
      EMPRESA,
    );

    // O enum cru ("STOPPAGE") num documento que vai ao cliente é vazamento de
    // implementação — foi o defeito da primeira versão.
    expect(view.ocorrencias.linhas).toEqual([
      { esquerda: 'Paralisação — Chuva parou a frente', direita: '14:30' },
    ]);
  });

  it('sem ocorrências, usa a frase do template em vez de área vazia', () => {
    expect(buildRdoPdfView(relatorio(), EMPRESA).ocorrencias.vazio).toBe('Sem registros de ocorrências');
    expect(buildRdoPdfView(relatorio(), EMPRESA).ocorrencias.titulo).toBe('Ocorrências (0)');
  });

  it('separa materiais recebidos de utilizados, preservando a unidade gravada', () => {
    const view = buildRdoPdfView(
      relatorio({
        materials: [
          { name: 'Cimento CP-II', quantity: 30, unit: 'SC', movementType: 'RECEIVED' },
          { name: 'Argamassa', quantity: 15.5, unit: 'SC', movementType: 'USED' },
        ] as never,
      }),
      EMPRESA,
    );

    expect(view.materiaisRecebidos.titulo).toBe('Materiais recebidos (1)');
    expect(view.materiaisRecebidos.linhas).toEqual([{ esquerda: 'Cimento CP-II', direita: '30 SC' }]);
    // A unidade sai como está no banco: é o código que a obra usa, e converter
    // só na exportação criaria dois vocabulários para a mesma coisa.
    expect(view.materiaisUtilizados.linhas).toEqual([{ esquerda: 'Argamassa', direita: '15.5 SC' }]);
  });

  it('observações só existem quando há texto', () => {
    expect(buildRdoPdfView(relatorio(), EMPRESA).observacoes).toBeNull();
    expect(buildRdoPdfView(relatorio({ notes: '   ' }), EMPRESA).observacoes).toBeNull();
    expect(buildRdoPdfView(relatorio({ notes: 'Concretagem às 7h.' }), EMPRESA).observacoes).toBe(
      'Concretagem às 7h.',
    );
  });

  it('vídeo vira registro de evidência, com duração quando houver', () => {
    const view = buildRdoPdfView(
      relatorio({
        videos: [
          { id: 'v1', fileName: 'frente-01.mp4', durationSeconds: 137, width: null, height: null },
          { id: 'v2', fileName: 'frente-02.mp4', durationSeconds: null, width: null, height: null },
        ] as never,
      }),
      EMPRESA,
    );

    expect(view.videos[0]).toMatchObject({ legenda: 'frente-01.mp4', detalhe: '2:17 · Vídeo anexado ao RDO' });
    expect(view.videos[1]).toMatchObject({ legenda: 'frente-02.mp4', detalhe: 'Vídeo anexado ao RDO' });
  });

  it('leva as dimensões da foto, que a legenda usa para não descolar da imagem', () => {
    const view = buildRdoPdfView(
      relatorio({ photos: [{ id: 'p1', fileName: 'frente.jpg', width: 1600, height: 900 }] as never }),
      EMPRESA,
    );

    expect(view.fotos[0]).toEqual({ id: 'p1', legenda: 'frente.jpg', detalhe: null, largura: 1600, altura: 900 });
  });
});
