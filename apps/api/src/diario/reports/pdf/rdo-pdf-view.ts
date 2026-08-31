import type { OccurrenceType, WeatherCondition } from '../../../../generated/prisma/client';

import type { DailyReportDetail } from '../daily-reports.service';
import { DAILY_REPORT_STATUS_LABEL } from '../daily-report-status';

/// Traço usado onde o dado NÃO EXISTE no domínio.
///
/// O template de referência tem campos que o nosso modelo não guarda — número
/// de contrato é o caso claro. A escolha é manter a linha visível com este
/// traço, e não preenchê-la com algo plausível: um RDO é documento de obra, e
/// um número de contrato inventado ali é pior que um campo vazio.
export const AUSENTE = '—';

export interface LinhaRotulada {
  readonly rotulo: string;
  readonly valor: string;
}

export interface CelulaContagem {
  readonly nome: string;
  readonly quantidade: string;
}

export interface LinhaTabela {
  readonly esquerda: string;
  readonly direita: string;
}

export interface SecaoLista {
  readonly titulo: string;
  readonly linhas: readonly LinhaTabela[];
  /// Frase exibida no lugar da tabela quando não há nada. O template mostra
  /// "Sem registros de ocorrências" em vez de uma área em branco.
  readonly vazio: string;
}

export interface MidiaView {
  readonly id: string;
  readonly legenda: string;
  readonly detalhe: string | null;
  /// Dimensões do arquivo, gravadas no upload. Servem para o renderizador
  /// calcular a altura REAL que a foto vai ocupar na célula e encostar a
  /// legenda nela — sem isso, uma foto baixa deixa um vão entre imagem e
  /// legenda, que é a "legenda separada da foto" que o layout precisa evitar.
  /// `null` em mídia antiga, gravada antes de a coluna existir.
  readonly largura: number | null;
  readonly altura: number | null;
}

/// Tudo que o renderizador precisa, já em texto.
///
/// Separado do desenho de propósito: aqui moram as decisões sobre o que existe
/// e como se escreve, e lá mora onde a tinta cai. É o que torna possível
/// afirmar em teste que "prazo contratual sem data de término vira travessão"
/// sem abrir um PDF.
export interface RdoPdfView {
  readonly nomeArquivo: string;
  readonly cabecalhoCorrido: string;
  readonly statusRotulo: string;
  readonly empresa: string;
  readonly titulo: string;
  readonly identificacao: readonly LinhaRotulada[];
  readonly metadados: readonly LinhaRotulada[];
  readonly clima: readonly (readonly [string, string, string])[];
  readonly jornada: readonly LinhaRotulada[];
  readonly jornadaObservacoes: string | null;
  readonly maoDeObra: readonly CelulaContagem[];
  readonly maoDeObraTotal: number;
  readonly equipamentos: readonly CelulaContagem[];
  readonly equipamentosTotal: number;
  readonly atividades: SecaoLista;
  readonly ocorrencias: SecaoLista;
  readonly materiaisRecebidos: SecaoLista;
  readonly materiaisUtilizados: SecaoLista;
  readonly observacoes: string | null;
  readonly fotos: readonly MidiaView[];
  readonly videos: readonly MidiaView[];
  readonly assinaturas: readonly string[];
}

/// Rótulos do clima e da ocorrência.
///
/// Tipados por `Record<Enum, string>` de propósito: acrescentar um valor ao
/// enum do banco passa a QUEBRAR A COMPILAÇÃO aqui, em vez de o PDF imprimir o
/// código cru (`STOPPAGE`) num documento que vai para o cliente. Foi
/// exatamente esse o erro na primeira versão.
///
/// Os textos espelham `apps/web/src/diario/components/report-content.ts`, que
/// é o mesmo vocabulário que a pessoa vê ao preencher — um RDO impresso não
/// pode chamar de outro nome o que a tela chamou de um.
const CLIMA: Record<WeatherCondition, string> = {
  SUNNY: 'Ensolarado',
  PARTLY_CLOUDY: 'Parcial',
  CLOUDY: 'Nublado',
  RAIN: 'Chuva',
  STORM: 'Tempestade',
};

const OCORRENCIA: Record<OccurrenceType, string> = {
  MATERIAL: 'Material',
  LABOR: 'Mão de obra',
  EQUIPMENT: 'Equipamento',
  WEATHER: 'Clima',
  DESIGN: 'Projeto',
  SAFETY: 'Segurança',
  SCHEDULE: 'Prazo',
  INSPECTION: 'Fiscalização',
  STOPPAGE: 'Paralisação',
  OTHER: 'Outro',
};

function texto(valor: string | null | undefined): string {
  const limpo = valor?.trim();
  return limpo && limpo.length > 0 ? limpo : AUSENTE;
}

function dias(valor: number | null): string {
  if (valor === null) return AUSENTE;
  // Negativo é prazo VENCIDO, e o sinal fica: trocar por "0 dias" esconderia
  // exatamente o que o documento precisa registrar.
  const absoluto = Math.abs(valor);
  const sufixo = absoluto === 1 ? 'dia' : 'dias';
  return valor < 0 ? `${absoluto} ${sufixo} em atraso` : `${valor} ${sufixo}`;
}

export function formatarDataBr(data: Date): string {
  // `UTC` porque `reportDate` é `@db.Date` — meia-noite UTC. Sem isso, um
  // servidor a oeste de Greenwich imprime o dia anterior.
  return data.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function minutosParaHora(minutos: number | null | undefined): string | null {
  if (minutos === null || minutos === undefined) return null;
  const h = String(Math.floor(minutos / 60)).padStart(2, '0');
  const m = String(minutos % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/// `RDO-OBR-001-002-2026-08-30.pdf`
///
/// Número com três dígitos para os arquivos ordenarem certo no Finder: sem o
/// zero à esquerda, o RDO 10 aparece antes do 2.
export function nomeArquivoPdf(codigoObra: string, numero: number, data: Date): string {
  const iso = data.toISOString().slice(0, 10);
  return `RDO-${codigoObra}-${String(numero).padStart(3, '0')}-${iso}.pdf`;
}

export function buildRdoPdfView(report: DailyReportDetail, empresa: string): RdoPdfView {
  const obra = report.constructionSite;
  const dataBr = formatarDataBr(report.reportDate);

  const local =
    [obra.addressLine, [obra.city, obra.state].filter(Boolean).join('/')]
      .filter((parte) => parte && parte.length > 0)
      .join(' — ') || AUSENTE;

  const maoDeObraTotal = report.labor.reduce((soma, linha) => soma + linha.quantity, 0);
  const equipamentosTotal = report.equipment.reduce((soma, linha) => soma + linha.quantity, 0);

  const materiais = (tipo: 'RECEIVED' | 'USED') =>
    report.materials
      .filter((item) => item.movementType === tipo)
      .map((item) => ({
        esquerda: item.name,
        // `Number` sobre o Decimal remove os zeros à direita que a coluna
        // guarda (30.000 vira 30) sem mexer no valor; a unidade sai do enum
        // como está gravada, sem tradução — é o código que a obra usa.
        direita: `${Number(item.quantity)} ${item.unit}`,
      }));

  return {
    nomeArquivo: nomeArquivoPdf(obra.code, report.number, report.reportDate),
    cabecalhoCorrido: `Relatório ${dataBr} n° ${report.number}`,
    statusRotulo: DAILY_REPORT_STATUS_LABEL[report.status],
    empresa,
    titulo: 'Relatório Diário de Obra (RDO)',

    identificacao: [
      { rotulo: 'Obra', valor: `${obra.code} — ${obra.name}` },
      { rotulo: 'Local', valor: local },
      { rotulo: 'Contratante', valor: texto(obra.clientName) },
      { rotulo: 'Responsável', valor: texto(obra.responsibleName) },
    ],

    metadados: [
      { rotulo: 'Relatório n°', valor: String(report.number) },
      { rotulo: 'Data do relatório', valor: dataBr },
      { rotulo: 'Dia da semana', valor: report.weekday },
      // O domínio NÃO tem número de contrato da obra. `ContractorContract`
      // existe, mas é outro conceito (contrato com terceirizado) e usá-lo aqui
      // só para preencher o template seria inventar o dado.
      { rotulo: 'Contrato', valor: AUSENTE },
      { rotulo: 'Prazo contratual', valor: dias(report.schedule.totalDays) },
      { rotulo: 'Prazo decorrido', valor: dias(report.schedule.elapsedDays) },
      { rotulo: 'Prazo a vencer', valor: dias(report.schedule.remainingDays) },
    ],

    // A terceira coluna ("Condição": praticável / impraticável no template de
    // referência) não tem origem no nosso modelo. Ela fica visível com um
    // travessão, e não vazia: célula em branco parece falha de geração, e
    // preenchê-la seria inventar um julgamento sobre o dia.
    clima: [
      ['Manhã', report.morningWeather ? CLIMA[report.morningWeather] : AUSENTE, AUSENTE],
      ['Tarde', report.afternoonWeather ? CLIMA[report.afternoonWeather] : AUSENTE, AUSENTE],
      // A observação do clima entra como LINHA da tabela, e não como texto
      // solto: fora dela, deixa de se ler como parte da condição climática.
      ...(report.weatherNotes?.trim()
        ? ([['Observações', report.weatherNotes.trim(), AUSENTE]] as const)
        : []),
    ],

    jornada: [
      { rotulo: 'Entrada', valor: texto(report.workSchedule.startTime) },
      {
        rotulo: 'Intervalo',
        valor:
          report.workSchedule.breakStartTime && report.workSchedule.breakEndTime
            ? `${report.workSchedule.breakStartTime} – ${report.workSchedule.breakEndTime}`
            : AUSENTE,
      },
      { rotulo: 'Saída', valor: texto(report.workSchedule.endTime) },
    ],
    jornadaObservacoes: report.scheduleNotes?.trim() || null,

    maoDeObra: report.labor.map((linha) => ({
      nome: linha.role,
      quantidade: String(linha.quantity),
    })),
    maoDeObraTotal,

    equipamentos: report.equipment.map((linha) => ({
      nome: linha.name,
      quantidade: String(linha.quantity),
    })),
    equipamentosTotal,

    atividades: {
      titulo: `Atividades (${report.activities.length})`,
      // Coluna direita = LOCAL, e não "Situação" como no template de
      // referência: atividade do nosso RDO não tem status. Uma coluna sempre
      // vazia ocuparia a página sem dizer nada, e preenchê-la seria inventar.
      linhas: report.activities.map((item) => ({
        esquerda: item.description,
        direita: item.location?.trim() ?? '',
      })),
      vazio: 'Sem atividades registradas',
    },

    ocorrencias: {
      titulo: `Ocorrências (${report.occurrences.length})`,
      linhas: report.occurrences.map((item) => {
        const hora = minutosParaHora(item.occurredAtMinutes);
        const tipo = OCORRENCIA[item.type];
        return {
          esquerda: `${tipo} — ${item.description}`,
          direita: hora ?? '',
        };
      }),
      vazio: 'Sem registros de ocorrências',
    },

    materiaisRecebidos: {
      titulo: `Materiais recebidos (${materiais('RECEIVED').length})`,
      linhas: materiais('RECEIVED'),
      vazio: '',
    },
    materiaisUtilizados: {
      titulo: `Materiais utilizados (${materiais('USED').length})`,
      linhas: materiais('USED'),
      vazio: '',
    },

    observacoes: report.notes?.trim() || null,

    fotos: report.photos.map((foto) => ({
      id: foto.id,
      // Não existe campo de legenda na mídia: o nome do arquivo é o que há.
      legenda: foto.fileName,
      detalhe: null,
      largura: foto.width,
      altura: foto.height,
    })),
    videos: report.videos.map((video) => ({
      id: video.id,
      legenda: video.fileName,
      largura: video.width,
      altura: video.height,
      detalhe: [
        video.durationSeconds !== null ? formatarDuracao(video.durationSeconds) : null,
        'Vídeo anexado ao RDO',
      ]
        .filter(Boolean)
        .join(' · '),
    })),

    // Só quem o domínio conhece. O template de referência traz seis nomes de
    // uma comissão; aqui não há cadastro de comissão nenhum, e escrever nomes
    // que o sistema não guarda seria fabricar um documento.
    assinaturas: [
      obra.responsibleName?.trim() ? `${obra.responsibleName.trim()} — Responsável pela obra` : null,
      'Responsável Técnico',
    ].filter((linha): linha is string => linha !== null),
  };
}

export function formatarDuracao(segundos: number): string {
  const m = Math.floor(segundos / 60);
  const s = segundos % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
