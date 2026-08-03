# DEPLOY_ORDER — ERP EDS

Ordem de publicação. Cada etapa tem um portão de verificação: **não avance sem
ele**. A ordem não é arbitrária — está explicada em "Por que esta ordem".

```
  Banco  →  API  →  Frontend  →  DNS  →  Smoke Test  →  Entrega ao cliente
```

---

## Por que esta ordem

| Passo        | Depende de        | O que quebra se inverter                                                                   |
| ------------ | ----------------- | ------------------------------------------------------------------------------------------ |
| **Banco**    | nada              | API sobe e falha na primeira query; sem o bootstrap ninguém consegue entrar                |
| **API**      | schema aplicado   | o SPA carrega e todas as chamadas dão erro — o usuário vê uma casca vazia                  |
| **Frontend** | API respondendo   | idem: tela montada sobre uma API que não existe                                            |
| **DNS**      | API + Front de pé | apontar antes expõe um endereço quebrado, e o cache de DNS faz o erro durar mais que o bug |
| **Smoke**    | tudo publicado    | entregar sem verificar transfere a descoberta da falha para o cliente                      |
| **Entrega**  | smoke aprovado    | —                                                                                          |

Regra que atravessa tudo: **migrations nunca rodam no boot do container.** São um
job de pré-deploy separado. Com N réplicas subindo em paralelo, todas tentariam
migrar ao mesmo tempo.

---

## 0. Antes de começar

- [ ] `git status` limpo, na revisão que vai a produção
- [ ] Projeto Neon criado, região definida, decisão sobre scale-to-zero tomada
- [ ] `.env.prod` montado e **fora do Git** — ver a lista em
      `GO_LIVE_CHECKLIST.md` § "Pré-requisitos de ambiente"
- [ ] Certificado TLS válido para o domínio (não é opcional — cookie `Secure`)
- [ ] Janela de manutenção combinada com a EDS
- [ ] `ROLLBACK_PLAN.md` lido **antes**, não durante o incidente

Construa as três imagens já com uma tag imutável (nunca `latest` — é o que
permite voltar atrás):

```bash
TAG=$(git rev-parse --short HEAD)
docker build -f docker/api.Dockerfile                 -t eds-api:$TAG .
docker build -f docker/api.Dockerfile --target migrate -t eds-api-migrate:$TAG .
docker build -f docker/web.Dockerfile --build-arg VITE_API_URL=/api -t eds-web:$TAG .
```

> `VITE_API_URL` é assado no bundle em tempo de **build**. Passá-lo no
> `docker run` não tem efeito nenhum. Com `/api` (origem única) a mesma imagem
> serve qualquer domínio.

**Portão 0** — as três imagens existem com a mesma tag e o bundle não tem
`localhost`:

```bash
docker run --rm --entrypoint sh eds-web:$TAG -c "grep -rl 'localhost:3000' /usr/share/nginx/html || echo LIMPO"
```

---

## 1. BANCO

### 1.1 Ponto de retorno

```bash
# Neon: crie um branch a partir de main — é instantâneo e é o rollback do schema
neonctl branches create --name pre-golive-$TAG
```

- [ ] Branch/backup criado e **anotado o nome**

### 1.2 Migrations

```bash
docker run --rm \
  -e DIRECT_URL="postgresql://…@ep-xxxx.REGIÃO.aws.neon.tech/eds?sslmode=verify-full" \
  eds-api-migrate:$TAG
```

`DIRECT_URL` é o endpoint **sem** `-pooler`: o pooler em transaction mode não
suporta os comandos de DDL e advisory lock do Migrate.

### 1.3 Seed e primeiro acesso

```bash
docker run --rm \
  -e DATABASE_URL="…?sslmode=verify-full" -e DIRECT_URL="…?sslmode=verify-full" \
  -e BOOTSTRAP_ADMIN_EMAIL="admin@edsconstrutora.com.br" \
  -e BOOTSTRAP_ADMIN_PASSWORD="<senha forte, temporária>" \
  --entrypoint sh eds-api-migrate:$TAG -c "npx prisma db seed"
```

A senha é **temporária por desenho**: o usuário nasce com `mustChangePassword` e
a API bloqueia tudo até a troca. O seed é idempotente — num banco que já tem
usuário, não faz nada.

**Portão 1** — não avance sem os quatro:

```bash
docker run --rm -e DIRECT_URL="…?sslmode=verify-full" --entrypoint sh eds-api-migrate:$TAG \
  -c "npx prisma migrate status"      # → "Database schema is up to date!"
```

- [ ] 24 migrations aplicadas, **sem drift**
- [ ] `SELECT count(*) FROM "Company"` = 1
- [ ] `SELECT count(*) FROM "Role"` = 6 · `"Permission"` = 16
- [ ] `SELECT count(*) FROM "User"` = 1, com `mustChangePassword = true`

---

## 2. API

```bash
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d api
```

**Portão 2** — a API não sobe com configuração incompleta, e é assim que se quer:
se ela ficou de pé, o ambiente está válido.

- [ ] `docker compose ps` → `api` **healthy** (o `start-period` de 40s cobre o
      cold start do Neon)
- [ ] `GET /health/liveness` → 200
- [ ] `GET /health/readiness` → 200 — **confirma o Neon alcançável e o TLS negociado**
- [ ] `GET /health` → banco + heap + RSS
- [ ] Rota protegida sem token → 401
- [ ] Logs saindo em JSON com `request-id`, sem senha ou token

Se a API não subir, leia o erro: a validação reporta **todas** as variáveis
inválidas de uma vez. Falha comum: `sslmode` ausente na URL do Neon.

---

## 3. FRONTEND

```bash
docker compose -f docker/docker-compose.prod.yml --env-file .env.prod up -d web
```

**Portão 3** (ainda pelo IP/porta, antes do DNS):

- [ ] `GET /` → 200, HTML do SPA
- [ ] `GET /engenharia/obras/1` → 200 (fallback do SPA, não 404)
- [ ] Tela de login **renderiza** — logo EDS e vermelho institucional
- [ ] `index.html` com `no-cache, no-store`; `/assets/` com `immutable`
- [ ] `/api/health/liveness` responde **pelo nginx** (prova que o proxy funciona)

---

## 4. DNS

Só agora. Antes disto, um erro de configuração fica preso em cache de resolvers
por muito mais tempo do que leva para corrigi-lo.

- [ ] TTL **reduzido para 60s** algumas horas antes (encurta o rollback)
- [ ] Registro A/CNAME apontando para o host da stack
- [ ] Certificado TLS emitido e válido para o domínio
- [ ] `https://<domínio>` responde — **HTTPS, não HTTP**
- [ ] Redirecionamento HTTP → HTTPS ativo
- [ ] `CORS_ORIGIN` bate exatamente com o domínio publicado

> Sem HTTPS o cookie `Secure` do refresh é descartado pelo navegador: o login
> parece funcionar e a sessão morre 15 minutos depois. É o sintoma mais confuso
> que este sistema sabe produzir.

Depois que o DNS propagar, **eleve o TTL** para o valor normal.

---

## 5. SMOKE TEST

Pelo domínio real, em HTTPS, num navegador. Roteiro em
`GO_LIVE_CHECKLIST.md` § "Smoke Test".

- [ ] 1 · Acessar — a tela de login carrega
- [ ] 2 · Autenticar — login com o admin do bootstrap
- [ ] 3 · Trocar senha — a tela é obrigatória e conclui
- [ ] 4 · Navegar — sidebar e módulos abrem
- [ ] 5 · Criar — uma obra
- [ ] 6 · Editar — a mesma obra
- [ ] 7 · Excluir e restaurar pela lixeira
- [ ] 8 · Exportar — um relatório em PDF e um em Excel, **abrindo os arquivos**
- [ ] 9 · Upload — anexar um PDF a uma obra e baixá-lo de volta
- [ ] 10 · Sair — logout, e a sessão não volta com o botão "voltar"

**O teste que mais pega problema de configuração:** faça login e **espere 16
minutos** com a aba aberta, depois navegue. Se cair no login, o problema é
`REFRESH_COOKIE_PATH`, TLS ou `CORS_ORIGIN` — os três se manifestam do mesmo jeito.

- [ ] Sessão sobrevive além de 15 minutos
- [ ] Um usuário sem permissão não vê o módulo na sidebar

---

## 6. ENTREGA AO CLIENTE

- [ ] `BOOTSTRAP_ADMIN_PASSWORD` **removida do ambiente e do `.env.prod`**
- [ ] `PUBLIC_SIGNUP_ENABLED=false` confirmado
- [ ] `SEED_DEMO=false` confirmado — nenhum dado de demonstração no banco
- [ ] Credencial do administrador entregue por canal seguro (não por e-mail comum)
- [ ] Demais usuários criados em Configurações → Usuários, cada um com seu papel
- [ ] Backup automático do Neon configurado
- [ ] `ROLLBACK_PLAN.md` acessível a quem estiver de plantão
- [ ] Tag `$TAG` registrada como a versão em produção

**Avisar a EDS:** se alguma tela ficar branca depois de uma atualização,
**recarregue a página (F5)**. Não há error boundary ainda, e um F5 sempre carrega
a versão nova — o `index.html` nunca é cacheado. É o primeiro item da fila
técnica pós-deploy.

---

## Deploys seguintes

A ordem é a mesma, com um detalhe: **migrations sempre antes de trocar a imagem
da API**, e migrations aditivas (adicionar coluna nullable, criar tabela) antes
das destrutivas. Uma migration que remove coluna publicada junto com a API nova
deixa a réplica antiga quebrada durante a troca.

```
migrations aditivas → API nova → (validar) → frontend novo → migrations destrutivas
```
