import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from './../src/app.module';

/// Smoke test de deploy: sobe o AppModule inteiro (validação de env, todos os
/// módulos, guards globais) contra um Postgres real e confere que os endpoints
/// que um orquestrador consulta respondem. É o teste que quebra quando uma
/// variável obrigatória some do ambiente ou uma migration não foi aplicada.
describe('Bootstrap da aplicação (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / responde sem autenticação', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!');
  });

  it('GET /health/liveness responde ok', () => {
    return request(app.getHttpServer())
      .get('/health/liveness')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
      });
  });

  it('GET /health/readiness confirma conexão com o banco', () => {
    return request(app.getHttpServer())
      .get('/health/readiness')
      .expect(200)
      .expect(({ body }) => {
        expect(body.status).toBe('ok');
        expect(body.info.database.status).toBe('up');
      });
  });

  it('rota protegida sem token responde 401', () => {
    return request(app.getHttpServer()).get('/construction-sites').expect(401);
  });
});
