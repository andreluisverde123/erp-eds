# ROLLBACK_PLAN — ERP EDS

Para ser lido **antes** do deploy, não durante o incidente.

---

## Decisão em 30 segundos

| Sintoma                                     | Ação                                             | Seção |
| ------------------------------------------- | ------------------------------------------------ | ----- |
| API não sobe (container reiniciando)        | ler o erro de validação — quase sempre é env     | § 1   |
| API de pé, `readiness` falha                | banco inalcançável — **não** faça rollback       | § 2   |
| Tela branca no navegador                    | F5 primeiro; se persistir, § 3                   | § 3   |
| Sessão cai a cada 15 min                    | configuração, não código — **não** faça rollback | § 4   |
| Erro funcional numa tela, resto funcionando | avalie; provavelmente não é rollback             | § 5   |
| Perda ou corrupção de dado                  | **PARE. Rollback completo.**                     | § 6   |
| Suspeita de brecha de segurança             | **PARE. Rollback completo + trocar segredos.**   | § 7   |

**Princípio:** rollback de aplicação é barato e reversível. Rollback de **banco**
é caro e pode perder dado gravado depois do deploy. Nunca reverta o banco por
causa de um bug de aplicação.

---

## Pré-requisitos (anotar antes de publicar)

```
TAG que vai a produção      : ____________________
TAG anterior (para voltar)  : ____________________
Branch Neon pré-deploy      : ____________________
Domínio / TTL do DNS        : ____________________
```

Sem a **TAG anterior** não existe rollback rápido. É por isso que
`DEPLOY_ORDER.md` proíbe publicar com `latest`.

---

## § 1 · API não sobe

**Diagnóstico primeiro** — este sistema falha no boot de propósito:

```bash
docker compose -f docker/docker-compose.prod.yml logs api | grep -i "Config validation"
```

A validação reporta **todas** as variáveis inválidas de uma vez. Causas em ordem
de frequência:

1. `sslmode` ausente na URL do Neon → `?sslmode=require`
2. `CORS_ORIGIN` faltando (obrigatória em produção)
3. Segredo JWT com menos de 32 caracteres
4. `DATABASE_URL`/`DIRECT_URL` trocadas entre si

**Isto quase nunca é rollback.** É corrigir o `.env.prod` e subir de novo. A API
não subiu, então nada foi publicado com defeito.

---

## § 2 · `readiness` falhando com a API de pé

Significa: processo vivo, banco inalcançável. **Não reverta a aplicação** — o
problema está fora dela.

```bash
curl https://<domínio>/api/health           # detalha qual indicador caiu
docker compose logs api --tail=50 | grep -i "error\|ssl\|connect"
```

- **Cold start do Neon** (scale-to-zero): espere ~30s. O healthcheck tem
  `start-period=40s`; um orquestrador externo pode ser mais impaciente.
- **TLS recusado**: a URL perdeu o `sslmode`, ou o Neon está exigindo o que a
  string não declara.
- **Neon indisponível**: verifique o status do provedor. Rollback da API não
  resolve — ela vai falhar igual.

---

## § 3 · Tela branca

**Primeiro: recarregue a página (F5).**

O sistema não tem error boundary (ver `GO_LIVE_CHECKLIST.md` § ressalva 1). O
caso mais comum não é bug: é o usuário com a aba aberta desde antes do deploy —
os chunks ganharam hash novo, e o `import()` da próxima navegação falha. O
`index.html` é servido com `no-store`, então **um F5 sempre carrega a versão
nova** e resolve.

Se persistir depois do F5, com a aba limpa, aí é erro de render de verdade:

```bash
# rollback só do frontend — a API continua no ar
docker compose -f docker/docker-compose.prod.yml stop web
docker tag eds-web:<TAG_ANTERIOR> eds-web:rollback
# aponte o compose para eds-web:rollback e suba
docker compose -f docker/docker-compose.prod.yml up -d web
```

Frontend é a peça **mais barata** de reverter: é estático, não tem estado e não
toca o banco. Reverta o web sozinho antes de pensar em mexer na API.

---

## § 4 · Sessão cai a cada 15 minutos

O sintoma mais confuso que este sistema produz — e **nunca é rollback**. O access
token expira em 15 min e o refresh não está chegando. Três causas, todas de
configuração:

| Causa                 | Verificação                                              |
| --------------------- | -------------------------------------------------------- |
| Sem HTTPS             | o cookie é `Secure`; em HTTP puro o navegador o descarta |
| `REFRESH_COOKIE_PATH` | com origem única precisa ser `/api/auth`, não `/auth`    |
| `CORS_ORIGIN`         | precisa bater **exatamente** com o domínio publicado     |

```bash
curl -i -X POST https://<domínio>/api/auth/login \
  -H 'Content-Type: application/json' -d '{"email":"…","password":"…"}' | grep -i set-cookie
# esperado: Path=/api/auth; HttpOnly; Secure; SameSite=Lax
```

Corrija a variável, reinicie a API. Os usuários logados precisarão entrar de novo.

---

## § 5 · Erro funcional numa tela

Sistema no ar, um módulo com defeito. **Pare e avalie** — rollback tem custo:
os registros criados desde o deploy continuam no banco, e a versão anterior pode
não saber lidar com eles.

Perguntas, nesta ordem:

1. O defeito **corrompe ou perde dado**? → § 6, rollback completo
2. Bloqueia trabalho da EDS **hoje**? → rollback da aplicação (§ 5.1)
3. É contornável? → registre, corrija no próximo deploy, avise a EDS

### § 5.1 Rollback da aplicação (sem tocar o banco)

Funciona quando **não houve migration** neste deploy, ou quando as migrations
foram apenas aditivas (coluna nullable, tabela nova) — a versão anterior
simplesmente ignora o que não conhece.

```bash
TAG_ANTERIOR=<sha>
docker tag eds-api:$TAG_ANTERIOR eds-api:rollback
docker tag eds-web:$TAG_ANTERIOR eds-web:rollback
# aponte o compose para as tags :rollback
docker compose -f docker/docker-compose.prod.yml up -d
```

Verificação: `readiness` 200 → login → uma tela de cada módulo → o registro
criado depois do deploy ainda abre.

**Se o deploy teve migration destrutiva** (coluna removida, tipo alterado,
constraint nova), o rollback da aplicação **não basta** — a versão anterior vai
quebrar contra o schema atual. Vá para § 6.

---

## § 6 · Perda ou corrupção de dado — rollback completo

**Pare o tráfego primeiro.** Cada minuto no ar é mais dado gravado sobre um
schema ou uma lógica errada.

```bash
docker compose -f docker/docker-compose.prod.yml stop web    # corta o acesso
docker compose -f docker/docker-compose.prod.yml stop api
```

1. **Preserve o estado atual antes de reverter** — o banco quebrado é a evidência
   e pode conter registros legítimos:
   ```bash
   neonctl branches create --name incidente-$(date +%Y%m%d-%H%M)
   ```
2. **Restaure o schema** para o branch pré-deploy anotado no § Pré-requisitos.
3. **Volte as imagens** para a TAG anterior (§ 5.1).
4. Suba `api` → verifique `readiness` → suba `web`.
5. Smoke test mínimo: login, uma tela, um registro conhecido.

**Custo real, assumido conscientemente:** tudo que foi gravado entre o deploy e o
rollback está no branch de incidente, **não no banco restaurado**. Reconciliar é
trabalho manual. É exatamente por isso que rollback de banco é último recurso.

---

## § 7 · Suspeita de brecha de segurança

1. **Corte o acesso** (`stop web`), não só a funcionalidade suspeita
2. **Rotacione os segredos JWT** — `JWT_ACCESS_SECRET` e `JWT_REFRESH_SECRET`.
   Isso invalida toda sessão ativa, que é o objetivo
3. **Troque a senha do banco** no Neon e atualize as duas URLs
4. Preserve os logs antes de reiniciar qualquer coisa:
   ```bash
   docker compose logs api > incidente-$(date +%Y%m%d-%H%M).log
   ```
5. Só então reverta a aplicação (§ 5.1)

Os logs são utilizáveis como evidência: são JSON com `request-id`, e foi
verificado que **não contêm senha, token nem cookie** (`redact` do pino).

---

## § 8 · DNS

Se o problema for o apontamento e não a aplicação, reverter o registro é o
caminho mais rápido — **desde que o TTL tenha sido reduzido para 60s antes do
deploy**, como manda `DEPLOY_ORDER.md`. Sem isso, o cache dos resolvers pode
segurar o endereço errado por horas, e o rollback de DNS deixa de ser uma opção
prática. Nesse caso, conserte no destino atual.

---

## Depois de qualquer rollback

- [ ] Confirmar com a EDS que o sistema voltou a funcionar
- [ ] Registrar: o que quebrou, o que o portão de verificação deixou passar
- [ ] Recuperar o que ficou no branch de incidente, se houver
- [ ] Só então investigar a causa — com o sistema estável, não sob pressão
- [ ] Adicionar ao `DEPLOY_ORDER.md` o portão que teria pego o problema
