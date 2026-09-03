import { Readable } from 'node:stream';

import { loadCompanyLogo } from './company-logo';
import { PNG_1X1 } from './png-1x1.fixture';

function storageQueDevolve(conteudo: Buffer) {
  return { getStream: jest.fn(async () => Readable.from([conteudo])) };
}

/// O LOGO NO CABEÇALHO DOS DOCUMENTOS.
///
/// A regra que governa este arquivo inteiro: o logo é enfeite, a ordem de
/// compra é documento que vai ao fornecedor. NADA relacionado ao logo pode
/// impedir alguém de imprimir o pedido.
describe('Logo da empresa nos PDFs', () => {
  describe('o caminho feliz', () => {
    it('busca pela CHAVE do storage, não pela URL gravada no banco', async () => {
      const storage = storageQueDevolve(PNG_1X1);

      // O valor REAL de `Company.logoUrl` — é assim que `saveUpload` o grava.
      // O teste antigo passava a chave já pronta, e foi exatamente isso que
      // escondeu o defeito: em produção o PDF saía sem logo, em silêncio,
      // porque o driver procurava em `<raiz>/uploads/logos/…`.
      const logo = await loadCompanyLogo(
        storage,
        '/uploads/logos/715c6709-083b-4e57-bbaa-9670882ed9fd.png',
      );

      expect(logo).toEqual(PNG_1X1);
      expect(storage.getStream).toHaveBeenCalledWith(
        'logos/715c6709-083b-4e57-bbaa-9670882ed9fd.png',
      );
    });

    it('um valor já gravado como chave passa intacto', async () => {
      const storage = storageQueDevolve(PNG_1X1);

      await loadCompanyLogo(storage, 'logos/eds.png');

      expect(storage.getStream).toHaveBeenCalledWith('logos/eds.png');
    });

    it('aceita JPEG, nas duas grafias da extensão', async () => {
      const storage = storageQueDevolve(PNG_1X1);

      expect(await loadCompanyLogo(storage, '/uploads/logos/a.jpg')).not.toBeNull();
      expect(await loadCompanyLogo(storage, '/uploads/logos/b.jpeg')).not.toBeNull();
    });

    it('a extensão é lida sem depender de caixa', async () => {
      const storage = storageQueDevolve(PNG_1X1);

      expect(await loadCompanyLogo(storage, 'logos/EDS.PNG')).not.toBeNull();
    });
  });

  describe('empresa sem logo', () => {
    it('sem `logoUrl` não procura arquivo nenhum', async () => {
      const storage = storageQueDevolve(PNG_1X1);

      expect(await loadCompanyLogo(storage, null)).toBeNull();
      expect(await loadCompanyLogo(storage, undefined)).toBeNull();
      expect(await loadCompanyLogo(storage, '')).toBeNull();
      // É o caso NORMAL, não um erro: não custa uma ida ao storage.
      expect(storage.getStream).not.toHaveBeenCalled();
    });
  });

  describe('nada disto pode derrubar a impressão', () => {
    it('WEBP é recusado — o upload aceita, o pdfkit não lê', async () => {
      // O upload do logo aceita PNG, JPEG e WEBP. Entregar WEBP ao pdfkit faz
      // ele LANÇAR, e a ordem de compra deixaria de imprimir com um erro que
      // não fala em logo nenhum.
      const storage = storageQueDevolve(PNG_1X1);

      expect(await loadCompanyLogo(storage, 'logos/eds.webp')).toBeNull();
      expect(storage.getStream).not.toHaveBeenCalled();
    });

    it('SVG é recusado — o pdfkit desenha bitmap, não vetor', async () => {
      // É por isto que `apps/web/public/logo-eds.svg` não serve para o PDF.
      const storage = storageQueDevolve(PNG_1X1);

      expect(await loadCompanyLogo(storage, 'logos/logo-eds.svg')).toBeNull();
    });

    it('arquivo sumido do storage não impede o documento', async () => {
      const storage = {
        getStream: jest.fn(async () => {
          throw new Error('ENOENT: no such file or directory');
        }),
      };

      expect(await loadCompanyLogo(storage, 'logos/eds.png')).toBeNull();
    });

    it('falha no meio da leitura não impede o documento', async () => {
      // S3 caindo com o stream já aberto: o erro chega durante a iteração, e
      // não na chamada.
      const storage = {
        getStream: jest.fn(async () =>
          Readable.from(
            (async function* () {
              yield Buffer.from([0x89]);
              throw new Error('conexão perdida');
            })(),
          ),
        ),
      };

      expect(await loadCompanyLogo(storage, 'logos/eds.png')).toBeNull();
    });

    it('arquivo grande demais é descartado em vez de carregado na memória', async () => {
      const storage = storageQueDevolve(Buffer.alloc(3 * 1024 * 1024));

      // Um logo tem dezenas de KB. Acima do teto é engano — e três megabytes
      // por PDF gerado derrubariam a API antes de alguém achar o documento feio.
      expect(await loadCompanyLogo(storage, 'logos/enorme.png')).toBeNull();
    });

    it('arquivo vazio vira ausência de logo, não Buffer vazio', async () => {
      // `Buffer` de tamanho zero entregue ao pdfkit também lança.
      const storage = { getStream: jest.fn(async () => Readable.from([])) };

      expect(await loadCompanyLogo(storage, 'logos/eds.png')).toBeNull();
    });
  });
});
