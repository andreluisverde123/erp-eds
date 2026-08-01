import { Injectable, Logger, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestLoggerMiddleware implements NestMiddleware {
  private readonly logger = new Logger('HTTP');

  use(request: Request, response: Response, next: NextFunction) {
    const { method, originalUrl } = request;
    const start = Date.now();

    response.on('finish', () => {
      const durationMs = Date.now() - start;
      this.logger.log(`${method} ${originalUrl} ${response.statusCode} ${durationMs}ms`);
    });

    next();
  }
}
