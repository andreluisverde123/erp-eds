# Diário de Obras — o que falta para produção

Documento de operação, escrito depois da validação de ponta a ponta contra um
PostgreSQL e um storage reais. Ele responde a duas perguntas: **o que já foi
verificado de verdade** e **o que ainda depende de alguém com acesso à
infraestrutura**.

---

## Os ambientes, como estão hoje

|            | Local                                       | Staging                                               | Produção                        |
| ---------- | ------------------------------------------- | ----------------------------------------------------- | ------------------------------- |
| Banco      | Postgres em container (`docker-postgres-1`) | Neon `ep-purple-hall-ac4vmsfe` (sa-east-1)            | **não existe**                  |
| Storage    | `local` (disco, `apps/api/uploads`)         | `local` (disco do container)                          | não definido                    |
| Domínio    | `localhost:5173` e `diario.localhost:5173`  | `staging.gestaoeds.com.br` (túnel Cloudflare nomeado) | `.env.production` é placeholder |
| `NODE_ENV` | `development`                               | `production`                                          | —                               |
| Exposição  | Vite + proxy `/api`                         | nginx (origem única) + cloudflared                    | —                               |

**`.env.production` ainda é um modelo**: usuário, senha e segredos são
`COLE_AQUI_...`, e o domínio nele (`erp.edsconstrutora.com.br`) não é o mesmo
que o resto do projeto usa (`gestaoeds.com.br`). Nada aponta para um banco de
produção real, e nenhum banco de produção foi criado.

---

## O que foi validado de verdade

Contra o Postgres local em container (`postgres:16-alpine`, a mesma imagem do
staging) e o `LocalStorageDriver` gravando em disco:

- **Migrations** — as 7 do Diário aplicadas com `prisma migrate deploy`.
  Tabelas, 6 enums, índices únicos, chaves estrangeiras e as regras de
  `ON DELETE` conferidas no catálogo do Postgres.
- **Seed** — roda completo; 8 usuários, 7 papéis, 4 vínculos usuário↔obra,
  4 RDOs com conteúdo.
- **Matriz de acesso** — pela API, com token real de cada usuário.
- **Fluxo E2E** — criar RDO, preencher as oito seções, subir foto e vídeo,
  finalizar, copiar.
- **Mídia** — upload, miniatura, `Range`, exclusão dos dois objetos do disco.
- **Autenticação** — login, refresh após recarga, rotação do token, logout,
  nos dois hosts locais.

## O que NÃO pôde ser validado aqui

- **`S3StorageDriver`** — nenhum ambiente usa `STORAGE_DRIVER=s3` hoje, e não há
  bucket configurado. O `Range` no S3 (`GetObjectCommand` com `Range`) nunca
  rodou contra um bucket; ele é exercitado apenas por dublê.
- **Banco de produção** — não existe.
- **Domínio de produção** — `diario.gestaoeds.com.br` não tem DNS.

---

## Publicar `diario.gestaoeds.com.br`

O que é preciso, e onde. Nenhum passo envolve duplicar a aplicação: o mesmo
build reconhece o host e monta a árvore de rotas do Diário.

| Onde                 | O que fazer                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **DNS / Cloudflare** | Adicionar o hostname `diario.<domínio>` ao MESMO túnel nomeado que já serve o ERP, apontando para o mesmo serviço `web:80`. Não é um túnel novo. |
| **nginx**            | Nada. `server_name _` já responde a qualquer host.                                                                                               |
| **CORS**             | `CORS_ORIGIN` passa a listar os dois hosts, separados por vírgula. Já preparado em `.env.staging`.                                               |
| **Cookie**           | Nada, se cada host tiver a própria sessão (ver abaixo).                                                                                          |
| **Frontend**         | Nada. `resolveAppEnvironment()` reconhece o prefixo `diario.` no host.                                                                           |
| **Backend**          | Nada.                                                                                                                                            |

### Sobre `REFRESH_COOKIE_DOMAIN`

Deixado **vazio**, de propósito.

Vazio, o cookie de refresh nasce _host-only_: quem entra no ERP entra de novo
no Diário. Não é um segundo cadastro nem uma segunda senha — é um segundo
login, uma vez por aparelho.

Preenchê-lo com `.gestaoeds.com.br` faz um login valer para os dois. **O preço:
o cookie de sessão passa a ser enviado a TODO subdomínio daquele domínio,
presente e futuro.** Se algum dia `algo.gestaoeds.com.br` for servido por outro
sistema — um site institucional, uma ferramenta de terceiro, um painel de
métricas —, ele recebe o cookie de sessão do ERP junto. Ligar isso é declarar
que todos os subdomínios do domínio pertencem a este sistema.

A recomendação é manter vazio até que o segundo login realmente incomode, e
tratá-lo então como decisão de segurança, não de conveniência.

---

## Storage em produção

Hoje tudo é `STORAGE_DRIVER=local`. **Isso não sobrevive a duas réplicas da
API**: a foto que subiu na instância A não existe para a B, e a miniatura falha
de forma intermitente. Também não sobrevive a um container sem volume — o
`docker-compose.prod.yml` declara `eds_uploads`, mas o Railway (onde o staging
roda hoje) recusou a instrução `VOLUME`.

Trocar para S3/R2 é configuração, não código: `STORAGE_DRIVER=s3` mais
`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` e, em
provedores compatíveis, `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE`. O bucket
continua **privado**: a mídia é servida pela API, não por URL pública nem
assinada.

Antes de confiar nele, é preciso exercitar upload, leitura, `Range` e exclusão
contra o bucket real — nada disso foi feito.

---

## Caminho de deploy

O projeto **não tem pipeline de deploy**. O CI (`.github/workflows/ci.yml`)
roda lint, type-check, build, testes, e2e contra Postgres e build das imagens
Docker — mas não publica nada.

Publicar é manual, e o runbook está em `docs/deploy.md`. Para o staging que
está no ar:

```
docker compose -f docker/docker-compose.prod.yml \
  --env-file apps/api/.env.staging --profile tunnel-named up -d --build
```

As migrations são um passo **separado e anterior**, com a imagem `migrate`.
Aplicar as 7 do Diário em staging é um comando; ele é aditivo (nenhuma coluna
alterada ou removida), mas continua sendo uma escrita num banco publicado.
