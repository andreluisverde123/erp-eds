import { CepService } from './cep.service';

/// Uma resposta do ViaCEP.
function respostaOk(corpo: Record<string, unknown>) {
  return { ok: true, json: async () => corpo } as Response;
}

function comFetch(impl: jest.Mock) {
  global.fetch = impl as unknown as typeof fetch;
  return new CepService();
}

const ENDERECO_VIACEP = {
  cep: '69312-218',
  logradouro: 'Avenida General Ataíde Teive',
  bairro: 'Caimbé',
  localidade: 'Boa Vista',
  uf: 'RR',
};

/// BUSCA DE ENDEREÇO POR CEP.
///
/// A regra que governa este arquivo: **nada aqui pode travar um cadastro**.
/// CEP inexistente, provedor fora do ar, resposta estranha — tudo devolve
/// `null`, e o formulário segue digitável à mão.
describe('Busca de endereço por CEP', () => {
  const fetchOriginal = global.fetch;
  afterEach(() => {
    global.fetch = fetchOriginal;
  });

  describe('o caminho feliz', () => {
    it('devolve logradouro, bairro, cidade e UF', async () => {
      const service = comFetch(jest.fn(async () => respostaOk(ENDERECO_VIACEP)));

      expect(await service.buscar('69312218')).toEqual({
        addressLine: 'Avenida General Ataíde Teive',
        neighborhood: 'Caimbé',
        city: 'Boa Vista',
        state: 'RR',
      });
    });

    it('aceita o CEP com máscara', async () => {
      const fetchMock = jest.fn(async () => respostaOk(ENDERECO_VIACEP));
      const service = comFetch(fetchMock);

      await service.buscar('69312-218');

      expect(fetchMock).toHaveBeenCalledWith(
        'https://viacep.com.br/ws/69312218/json/',
        expect.anything(),
      );
    });

    it('NÃO devolve número nem complemento', async () => {
      // Nenhuma base de CEP os conhece: são do imóvel, não do logradouro. É
      // por isso que a busca preenche o formulário em vez de substituí-lo.
      const service = comFetch(jest.fn(async () => respostaOk(ENDERECO_VIACEP)));

      const endereco = await service.buscar('69312218');

      expect(Object.keys(endereco!).sort()).toEqual([
        'addressLine',
        'city',
        'neighborhood',
        'state',
      ]);
    });

    it('CEP de cidade inteira vem sem logradouro, e isso não é erro', async () => {
      // Comum no interior: o CEP cobre o município todo.
      const service = comFetch(
        jest.fn(async () =>
          respostaOk({ logradouro: '', bairro: '', localidade: 'Rorainópolis', uf: 'RR' }),
        ),
      );

      expect(await service.buscar('69373000')).toEqual({
        addressLine: '',
        neighborhood: '',
        city: 'Rorainópolis',
        state: 'RR',
      });
    });
  });

  describe('nada disto pode travar o cadastro', () => {
    it('CEP inexistente devolve null', async () => {
      // O ViaCEP responde 200 com `{"erro": true}` — a falha NÃO vem no
      // status, e tratar só o status deixaria passar um endereço vazio.
      const service = comFetch(jest.fn(async () => respostaOk({ erro: true })));

      expect(await service.buscar('99999999')).toBeNull();
    });

    it('CEP com número errado de dígitos nem vai à rede', async () => {
      const fetchMock = jest.fn();
      const service = comFetch(fetchMock);

      expect(await service.buscar('123')).toBeNull();
      expect(await service.buscar('')).toBeNull();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('provedor fora do ar devolve null', async () => {
      const service = comFetch(
        jest.fn(async () => {
          throw new Error('ECONNREFUSED');
        }),
      );

      expect(await service.buscar('69312218')).toBeNull();
    });

    it('timeout devolve null', async () => {
      const service = comFetch(
        jest.fn(async () => {
          throw Object.assign(new Error('The operation was aborted'), { name: 'TimeoutError' });
        }),
      );

      expect(await service.buscar('69312218')).toBeNull();
    });

    it('resposta sem cidade devolve null', async () => {
      // Sem cidade e UF não há o que preencher, e devolver metade seria pior:
      // o formulário ficaria com bairro de um lugar e cidade de outro.
      const service = comFetch(jest.fn(async () => respostaOk({ logradouro: 'Rua X' })));

      expect(await service.buscar('69312218')).toBeNull();
    });

    it('status de erro devolve null', async () => {
      const service = comFetch(jest.fn(async () => ({ ok: false }) as Response));

      expect(await service.buscar('69312218')).toBeNull();
    });
  });

  describe('cache', () => {
    it('o mesmo CEP vai à rede uma vez só', async () => {
      // Numa construtora os CEPs se repetem muito: obras na mesma cidade,
      // fornecedores no mesmo distrito.
      const fetchMock = jest.fn(async () => respostaOk(ENDERECO_VIACEP));
      const service = comFetch(fetchMock);

      await service.buscar('69312218');
      await service.buscar('69312-218');
      await service.buscar('69312218');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('CEP inexistente também é lembrado', async () => {
      // Sem isto, cada tecla de uma digitação errada bateria fora.
      const fetchMock = jest.fn(async () => respostaOk({ erro: true }));
      const service = comFetch(fetchMock);

      await service.buscar('99999999');
      await service.buscar('99999999');

      expect(fetchMock).toHaveBeenCalledTimes(1);
    });
  });
});
