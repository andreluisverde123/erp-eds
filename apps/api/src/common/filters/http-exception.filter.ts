import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

/// Normaliza toda resposta de erro (validação, guards, exceções não tratadas)
/// para um formato único e nunca vaza detalhes internos em erros 5xx.
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const isHttpException = exception instanceof HttpException;
    // P2025 = "registro não encontrado" num update/delete. Depois que os
    // update/delete passaram a repetir o escopo do tenant no `where`
    // (`{ id, companyId }`), este erro é o que sobra quando alguém tenta
    // alterar registro de outra empresa — e a resposta certa para isso é 404,
    // não 500: o registro simplesmente não existe para quem perguntou.
    const isRecordNotFound = !isHttpException && isPrismaNotFound(exception);

    const status = isHttpException
      ? exception.getStatus()
      : isRecordNotFound
        ? HttpStatus.NOT_FOUND
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = isHttpException
      ? extractMessage(exception.getResponse())
      : isRecordNotFound
        ? 'Registro não encontrado.'
        : 'Erro interno do servidor.';

    if (!isHttpException && !isRecordNotFound) {
      this.logger.error(exception instanceof Error ? exception.stack : exception);
    } else if (isRecordNotFound) {
      // Não é erro de servidor, mas nunca deveria acontecer: significa que
      // alguma checagem de posse foi removida/reordenada antes da mutação.
      this.logger.warn(
        `Mutação bloqueada pelo escopo do tenant em ${request.method} ${request.url}`,
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}

/// Checagem estrutural em vez de `instanceof PrismaClientKnownRequestError`:
/// o Prisma Client é gerado em `generated/prisma`, e importar a classe só para
/// um `instanceof` amarraria o filtro global ao caminho do client gerado.
function isPrismaNotFound(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    'code' in exception &&
    (exception as { code: unknown }).code === 'P2025'
  );
}

function extractMessage(body: unknown): string | string[] {
  if (typeof body === 'string') return body;
  if (body && typeof body === 'object' && 'message' in body) {
    return (body as { message: string | string[] }).message;
  }
  return 'Erro inesperado.';
}
