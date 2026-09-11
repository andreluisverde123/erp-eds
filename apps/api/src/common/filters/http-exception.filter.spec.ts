import { ArgumentsHost, ForbiddenException } from '@nestjs/common';

import { HttpExceptionFilter } from './http-exception.filter';

function capturar(exception: unknown) {
  const json = jest.fn();
  const response = { status: jest.fn(() => ({ json })) };
  const host = {
    switchToHttp: () => ({
      getResponse: () => response,
      getRequest: () => ({ url: '/auth/login', method: 'POST' }),
    }),
  } as unknown as ArgumentsHost;

  new HttpExceptionFilter().catch(exception, host);
  return json.mock.calls[0][0] as Record<string, unknown>;
}

/// O filtro normaliza o corpo de erro e jogava fora tudo que não fosse
/// `message`. O login precisa do `code` para o web mostrar o banner de
/// pagamento pendente em vez de um erro genérico.
describe('HttpExceptionFilter', () => {
  it('repassa o `code` quando a exceção declara um', () => {
    const body = capturar(
      new ForbiddenException({ message: 'Acesso suspenso.', code: 'PAYMENT_PENDING' }),
    );

    expect(body).toMatchObject({
      statusCode: 403,
      message: 'Acesso suspenso.',
      code: 'PAYMENT_PENDING',
    });
  });

  it('não inventa `code` nos erros comuns', () => {
    const body = capturar(new ForbiddenException('Sem permissão.'));

    expect(body).not.toHaveProperty('code');
  });
});
