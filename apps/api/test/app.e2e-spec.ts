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

  /// O teste que faltava. Um banco recém-migrado, com o seed rodado, precisa
  /// ter alguém capaz de entrar — o seed de produção populava só o catálogo de
  /// permissões e deixava a instalação sem empresa, sem papéis e sem usuário.
  /// O sintoma era invisível para todos os outros testes daqui: os healthchecks
  /// passam, a rota protegida devolve 401 corretamente, e o sistema é
  /// inutilizável.
  ///
  /// Depende das variáveis de bootstrap estarem no ambiente do seed (o job
  /// `e2e` do CI as define). Sem elas, não há o que verificar.
  const bootstrapEmail = process.env.BOOTSTRAP_ADMIN_EMAIL;
  const bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  const itWithBootstrap = bootstrapEmail && bootstrapPassword ? it : it.skip;

  itWithBootstrap('o administrador criado pelo seed consegue fazer login', () => {
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: bootstrapEmail, password: bootstrapPassword })
      .expect(200)
      .expect(({ body }) => {
        expect(body.accessToken).toEqual(expect.any(String));
        // Senha vinda de variável de ambiente é temporária por definição.
        expect(body.user.mustChangePassword).toBe(true);
      });
  });
});
