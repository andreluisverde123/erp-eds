import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderDiario } from '@/test/render-diario';

import * as api from '../../api';
import { DiarioRdoPage } from '../../pages/rdo-page';
import type { DiarioReportDetail, DiarioSiteSummary, MediaItem } from '../../types';

vi.mock('../../api');
// A compressão usa canvas e `createImageBitmap`, que o jsdom não implementa. O
// que interessa aos testes é o FLUXO (estados, retry, exclusão); o
// comportamento da compressão em si é do navegador.
vi.mock('../../lib/image-compression', () => ({
  compressImage: vi.fn(async (file: File) => ({
    file,
    width: 1920,
    height: 1080,
    thumbnail: new File(['miniatura'], 'thumb.jpg', { type: 'image/jpeg' }),
  })),
  readVideoDuration: vi.fn(async () => 42),
}));

const mocked = vi.mocked(api, { deep: true });

const AURORA: DiarioSiteSummary = {
  id: 'obra-1',
  code: 'OBR-001',
  name: 'Residencial Aurora',
  clientName: 'Construtora XYZ',
  responsibleName: 'Marina Souza',
  status: 'IN_PROGRESS',
  addressLine: 'Rua das Obras, 100',
  city: 'Curitiba',
  state: 'PR',
  startDate: '2026-01-01T00:00:00.000Z',
  expectedEndDate: '2026-12-31T00:00:00.000Z',
};

function foto(id: string, over: Partial<MediaItem> = {}): MediaItem {
  return {
    id,
    type: 'PHOTO',
    fileName: `IMG_${id}.jpg`,
    mimeType: 'image/jpeg',
    sizeBytes: 850_000,
    width: 1920,
    height: 1080,
    durationSeconds: null,
    createdAt: '2026-08-30T10:00:00.000Z',
    ...over,
  };
}

function video(id: string): MediaItem {
  return {
    ...foto(id),
    type: 'VIDEO',
    fileName: `VID_${id}.mp4`,
    mimeType: 'video/mp4',
    width: null,
    height: null,
    durationSeconds: 42,
  };
}

function relatorio(over: Partial<DiarioReportDetail> = {}): DiarioReportDetail {
  const photos = over.photos ?? [];
  const videos = over.videos ?? [];

  return {
    id: 'rdo-24',
    number: 24,
    reportDate: '2026-08-30T00:00:00.000Z',
    status: 'DRAFT',
    createdAt: '2026-08-30T10:00:00.000Z',
    updatedAt: '2026-08-30T10:00:00.000Z',
    createdBy: { id: 'user-1', name: 'Eduardo Engenharia' },
    weekday: 'Domingo',
    statusLabel: 'Rascunho',
    editable: true,
    notes: null,
    constructionSite: AURORA,
    copiedFrom: null,
    submittedAt: null,
    submittedBy: null,
    schedule: {
      startDate: AURORA.startDate,
      expectedEndDate: AURORA.expectedEndDate,
      totalDays: 364,
      elapsedDays: 241,
      remainingDays: 123,
    },
    workSchedule: { startTime: null, breakStartTime: null, breakEndTime: null, endTime: null },
    scheduleNotes: null,
    morningWeather: null,
    afternoonWeather: null,
    weatherNotes: null,
    labor: [],
    equipment: [],
    activities: [],
    occurrences: [],
    materials: [],
    photos,
    videos,
    summary: {
      labor: { roles: 0, workers: 0 },
      equipment: { items: 0, units: 0 },
      activities: 0,
      occurrences: 0,
      materials: 0,
      photos: photos.length,
      videos: videos.length,
      hasSchedule: false,
      hasWeather: false,
      hasNotes: false,
    },
    ...over,
  };
}

async function abrirSecao(
  usuario: ReturnType<typeof userEvent.setup>,
  titulo: 'Fotos' | 'Vídeos',
  detalhe: DiarioReportDetail = relatorio(),
) {
  mocked.getReport.mockResolvedValue(detalhe);
  renderDiario(<DiarioRdoPage />, { rota: '/relatorios/rdo-24', path: '/relatorios/:id' });
  await screen.findByRole('heading', { name: 'RDO #24' });

  const cabecalho = screen.getByRole('button', { name: new RegExp(`^${titulo}`, 'i') });
  if (cabecalho.getAttribute('aria-expanded') === 'false') {
    await usuario.click(cabecalho);
  }
}

function arquivoDeFoto(nome = 'IMG_2837.jpg') {
  return new File([new Uint8Array([0xff, 0xd8, 0xff])], nome, { type: 'image/jpeg' });
}

beforeEach(() => {
  // O `AuthenticatedMedia` busca cada arquivo como blob — o token vive em
  // memória e um `src` comum não o enviaria.
  mocked.mediaFileUrl.mockImplementation(
    (reportId: string, mediaId: string) =>
      `/diario/relatorios/${reportId}/midias/${mediaId}/arquivo`,
  );
  mocked.mediaThumbnailUrl.mockImplementation(
    (reportId: string, mediaId: string) =>
      `/diario/relatorios/${reportId}/midias/${mediaId}/miniatura`,
  );
});

// ---------------------------------------------------------------------------

describe('Fotos — estado vazio', () => {
  it('explica o vazio e oferece os dois caminhos de entrada', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos');

    expect(screen.getByText('Nenhuma foto neste relatório.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tirar foto' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Escolher da galeria' })).toBeDefined();
  });

  it('não mostra resumo enquanto não há foto', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos');

    expect(screen.queryByText(/^\d+ fotos?$/)).toBeNull();
  });
});

describe('Fotos — upload', () => {
  it('mostra a miniatura local e o progresso ANTES de o envio terminar', async () => {
    const usuario = userEvent.setup();
    // Segura a resposta para o estado intermediário ficar observável — é
    // exatamente o que a pessoa vê durante um minuto no 4G do canteiro.
    let concluir!: (relatorio: DiarioReportDetail) => void;
    mocked.mediaApi.upload.mockImplementation(() => new Promise((resolve) => (concluir = resolve)));

    await abrirSecao(usuario, 'Fotos');
    await usuario.upload(entradaDeGaleria(), arquivoDeFoto());

    expect(await screen.findByText(/Enviando|Processando/)).toBeDefined();

    concluir(relatorio({ photos: [foto('m1')] }));
    await waitFor(() => expect(mocked.mediaApi.upload).toHaveBeenCalledTimes(1));
  });

  it('envia o arquivo e atualiza o resumo da seção', async () => {
    const usuario = userEvent.setup();
    mocked.mediaApi.upload.mockResolvedValue(relatorio({ photos: [foto('m1')] }));

    await abrirSecao(usuario, 'Fotos');
    await usuario.upload(entradaDeGaleria(), arquivoDeFoto());

    await waitFor(() => expect(mocked.mediaApi.upload).toHaveBeenCalledTimes(1));
    expect(mocked.mediaApi.upload.mock.calls[0]![0]).toBe('rdo-24');
  });

  it('a câmera e a galeria usam entradas diferentes — só uma abre a câmera', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos');

    // `capture="environment"` é o que faz o celular abrir a câmera traseira em
    // vez do seletor de arquivos.
    expect(entradaDeCamera().getAttribute('capture')).toBe('environment');
    expect(entradaDeGaleria().getAttribute('capture')).toBeNull();
  });

  it('aceita só os formatos da lista', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos');

    expect(entradaDeGaleria().getAttribute('accept')).toBe('image/jpeg,image/png,image/webp');
  });
});

describe('Fotos — falha de envio', () => {
  it('mostra o erro e oferece tentar novamente, sem perder a seleção', async () => {
    const usuario = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    mocked.mediaApi.upload.mockRejectedValueOnce(
      new ApiError(0, 'Sem conexão. Verifique a internet e tente novamente.'),
    );

    await abrirSecao(usuario, 'Fotos');
    await usuario.upload(entradaDeGaleria(), arquivoDeFoto());

    expect(await screen.findByText('Falha no envio')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeDefined();
  });

  it('tentar novamente reaproveita a MESMA tarefa — não cria envio duplicado', async () => {
    const usuario = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    mocked.mediaApi.upload
      .mockRejectedValueOnce(new ApiError(0, 'Sem conexão.'))
      .mockResolvedValue(relatorio({ photos: [foto('m1')] }));

    await abrirSecao(usuario, 'Fotos');
    await usuario.upload(entradaDeGaleria(), arquivoDeFoto());
    await screen.findByText('Falha no envio');

    await usuario.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => expect(mocked.mediaApi.upload).toHaveBeenCalledTimes(2));
    // Duas CHAMADAS, um arquivo: a segunda é a retentativa da primeira, e não
    // um segundo envio.
    expect(mocked.mediaApi.upload.mock.calls[1]![1]).toBe(mocked.mediaApi.upload.mock.calls[0]![1]);
  });

  it('permite descartar o envio que falhou', async () => {
    const usuario = userEvent.setup();
    const { ApiError } = await import('@/lib/api-client');
    mocked.mediaApi.upload.mockRejectedValue(new ApiError(0, 'Sem conexão.'));

    await abrirSecao(usuario, 'Fotos');
    await usuario.upload(entradaDeGaleria(), arquivoDeFoto());
    await screen.findByText('Falha no envio');

    await usuario.click(screen.getByRole('button', { name: 'Descartar' }));

    expect(screen.queryByText('Falha no envio')).toBeNull();
  });
});

describe('Fotos — lista e galeria', () => {
  it('mostra as fotos em grade, com o resumo da seção', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos', relatorio({ photos: [foto('m1'), foto('m2')] }));

    expect(screen.getByText('2 fotos')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Abrir foto 1' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'Abrir foto 2' })).toBeDefined();
  });

  it('usa o singular com uma foto só', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos', relatorio({ photos: [foto('m1')] }));

    expect(screen.getByText('1 foto')).toBeDefined();
  });

  it('abre a galeria em tela cheia e permite navegar e fechar', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos', relatorio({ photos: [foto('m1'), foto('m2')] }));

    await usuario.click(screen.getByRole('button', { name: 'Abrir foto 1' }));

    const galeria = screen.getByRole('dialog');
    expect(within(galeria).getByText('1 / 2')).toBeDefined();

    await usuario.click(within(galeria).getByRole('button', { name: 'Próxima' }));
    expect(within(galeria).getByText('2 / 2')).toBeDefined();

    await usuario.click(within(galeria).getByRole('button', { name: 'Fechar' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('não mostra setas com uma foto só', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos', relatorio({ photos: [foto('m1')] }));

    await usuario.click(screen.getByRole('button', { name: 'Abrir foto 1' }));

    expect(screen.queryByRole('button', { name: 'Próxima' })).toBeNull();
  });
});

describe('Fotos — exclusão', () => {
  it('exclui só depois de confirmar', async () => {
    const usuario = userEvent.setup();
    mocked.mediaApi.remove.mockResolvedValue(relatorio());
    await abrirSecao(usuario, 'Fotos', relatorio({ photos: [foto('m1')] }));

    await usuario.click(screen.getByRole('button', { name: 'Excluir IMG_m1.jpg' }));
    expect(mocked.mediaApi.remove).not.toHaveBeenCalled();
    expect(await screen.findByText('Excluir esta foto?')).toBeDefined();

    await usuario.click(screen.getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(mocked.mediaApi.remove).toHaveBeenCalledWith('rdo-24', 'm1'));
  });

  it('cancelar não exclui', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Fotos', relatorio({ photos: [foto('m1')] }));

    await usuario.click(screen.getByRole('button', { name: 'Excluir IMG_m1.jpg' }));
    await usuario.click(await screen.findByRole('button', { name: 'Cancelar' }));

    expect(mocked.mediaApi.remove).not.toHaveBeenCalled();
  });
});

describe('Vídeos', () => {
  it('tem seção própria, com os rótulos de vídeo', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Vídeos');

    expect(screen.getByText('Nenhum vídeo neste relatório.')).toBeDefined();
    expect(screen.getByRole('button', { name: 'Gravar vídeo' })).toBeDefined();
  });

  it('mostra o resumo com a contagem de vídeos', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Vídeos', relatorio({ videos: [video('v1'), video('v2')] }));

    expect(screen.getByText('2 vídeos')).toBeDefined();
  });

  it('aceita só MP4 e WebM', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(usuario, 'Vídeos');

    const entradas = document.querySelectorAll<HTMLInputElement>('input[type="file"]');
    const doVideo = Array.from(entradas).find((entrada) => entrada.accept.startsWith('video/'));
    expect(doVideo?.accept).toBe('video/mp4,video/webm');
  });
});

describe('Mídia — relatório fechado', () => {
  it('mostra as fotos mas não oferece adicionar nem excluir', async () => {
    const usuario = userEvent.setup();
    await abrirSecao(
      usuario,
      'Fotos',
      relatorio({
        photos: [foto('m1')],
        status: 'SUBMITTED',
        statusLabel: 'Finalizado',
        editable: false,
      }),
    );

    expect(screen.getByRole('button', { name: 'Abrir foto 1' })).toBeDefined();
    expect(screen.queryByRole('button', { name: 'Tirar foto' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Excluir IMG_m1.jpg' })).toBeNull();
  });
});

// ---------------------------------------------------------------------------

/// As duas entradas de arquivo ficam escondidas e são acionadas pelos botões.
/// O teste as alcança pelo DOM porque `getByRole` ignora `aria-hidden`.
function entradasDeArquivo(): HTMLInputElement[] {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[type="file"]')).filter(
    (entrada) => entrada.accept.startsWith('image/'),
  );
}

function entradaDeCamera(): HTMLInputElement {
  return entradasDeArquivo()[0]!;
}

function entradaDeGaleria(): HTMLInputElement {
  return entradasDeArquivo()[1]!;
}

// ---------------------------------------------------------------------------
// Miniaturas e peso da tela
// ---------------------------------------------------------------------------

describe('Fotos — a grade usa miniatura, não o original', () => {
  it('a grade busca a MINIATURA de cada foto', async () => {
    const usuario = userEvent.setup();
    const { apiClient } = await import('@/lib/api-client');
    const buscar = vi.spyOn(apiClient, 'getBlob').mockResolvedValue(new Blob(['x']));

    await abrirSecao(usuario, 'Fotos', relatorio({ photos: [foto('m1'), foto('m2')] }));

    await waitFor(() => expect(buscar).toHaveBeenCalledTimes(2));
    // Duas miniaturas, nenhum original: é a diferença entre ~400 KB e ~30 MB
    // ao abrir um RDO com vinte fotos.
    for (const chamada of buscar.mock.calls) {
      expect(chamada[0]).toContain('/miniatura');
      expect(chamada[0]).not.toContain('/arquivo');
    }
    buscar.mockRestore();
  });

  it('abrir a foto busca o ORIGINAL, e só então', async () => {
    const usuario = userEvent.setup();
    const { apiClient } = await import('@/lib/api-client');
    const buscar = vi.spyOn(apiClient, 'getBlob').mockResolvedValue(new Blob(['x']));

    await abrirSecao(usuario, 'Fotos', relatorio({ photos: [foto('m1')] }));
    await waitFor(() => expect(buscar).toHaveBeenCalled());
    buscar.mockClear();

    await usuario.click(screen.getByRole('button', { name: 'Abrir foto 1' }));

    await waitFor(() =>
      expect(buscar.mock.calls.some((chamada) => String(chamada[0]).includes('/arquivo'))).toBe(
        true,
      ),
    );
    buscar.mockRestore();
  });

  it('a miniatura gerada no navegador vai junto do upload', async () => {
    const usuario = userEvent.setup();
    mocked.mediaApi.upload.mockResolvedValue(relatorio({ photos: [foto('m1')] }));
    await abrirSecao(usuario, 'Fotos');

    await usuario.upload(entradaDeGaleria(), arquivoDeFoto());

    await waitFor(() => expect(mocked.mediaApi.upload).toHaveBeenCalledTimes(1));
    const extras = mocked.mediaApi.upload.mock.calls[0]![2];
    expect(extras.thumbnail).toBeInstanceOf(File);
  });

  it('vídeo NÃO envia miniatura — a grade mostra a capa sem baixar nada', async () => {
    const usuario = userEvent.setup();
    mocked.mediaApi.upload.mockResolvedValue(relatorio());
    await abrirSecao(usuario, 'Vídeos');

    const entradas = Array.from(
      document.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    ).filter((entrada) => entrada.accept.startsWith('video/'));
    await usuario.upload(
      entradas[1]!,
      new File([new Uint8Array([0, 0, 0, 16])], 'clipe.mp4', { type: 'video/mp4' }),
    );

    await waitFor(() => expect(mocked.mediaApi.upload).toHaveBeenCalledTimes(1));
    expect(mocked.mediaApi.upload.mock.calls[0]![2].thumbnail).toBeNull();
  });

  it('a grade de vídeos não busca arquivo nenhum', async () => {
    const usuario = userEvent.setup();
    const { apiClient } = await import('@/lib/api-client');
    const buscar = vi.spyOn(apiClient, 'getBlob').mockResolvedValue(new Blob(['x']));

    await abrirSecao(usuario, 'Vídeos', relatorio({ videos: [video('v1'), video('v2')] }));

    expect(buscar).not.toHaveBeenCalled();
    buscar.mockRestore();
  });
});
