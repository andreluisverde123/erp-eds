# Diário de Obras

Ambiente de campo do ERP EDS, servido em `diario.gestaoeds.com.br`.

Este documento cobre a **fundação**: autenticação, autorização, controle de
acesso por obra, roteamento por subdomínio e a Home Mobile First. O
preenchimento do RDO — clima, mão de obra, equipamentos, atividades,
ocorrências, materiais, fotos, vídeos, PDF e assinaturas — é a etapa seguinte
e ainda **não** existe.

---

## O que já existia, e foi reaproveitado

Nada de infraestrutura nova foi criado. O levantamento do que já havia:

| Assunto       | Onde vive                                   | Reaproveitado?                            |
| ------------- | ------------------------------------------- | ----------------------------------------- |
| Autenticação  | `src/auth/` — JWT + refresh cookie rotativo | Integralmente. Nenhuma credencial nova.   |
| Autorização   | `Permission`/`Role`/`RolePermission`        | Integralmente. Três permissões novas.     |
| Obras         | `ConstructionSite`                          | A MESMA tabela. Nenhuma obra duplicada.   |
| Usuários      | `User`                                      | A MESMA tabela. Nenhum usuário duplicado. |
| Banco         | Postgres via Prisma                         | O mesmo. Nenhum segundo banco.            |
| Design system | `packages/ui` (shadcn/Radix + tokens)       | Componentes e tokens; layout próprio.     |
| Deploy        | nginx servindo o SPA e repassando `/api`    | A mesma imagem, o mesmo container.        |

**O único elo que não existia** era a relação usuário↔obra. `EmployeeAllocation`
liga obra a `Employee` — o colaborador do RH, que na maioria dos casos nem tem
login —, e o schema documenta que `User` e `Employee` são entidades distintas
de propósito. Sem uma tabela nova, a regra "o engenheiro A não vê a obra do
engenheiro B" não teria como ser respondida pelo backend.

---

## A cadeia de acesso

```
USER  →  diario.access  →  UserConstructionSite  →  obras  →  DailyReport dessas obras
        (permissão, RBAC)      (vínculo)
```

As duas metades são independentes e as duas são obrigatórias:

- **Permissão** decide se a pessoa ENTRA no Diário. Está declarada no nível da
  classe em todos os controllers de `/diario` (`@RequirePermissions('diario.access')`)
  e é verificada pelo `PermissionsGuard` global.
- **Vínculo** decide QUAIS obras ela vê lá dentro. Passa por um único ponto,
  `SiteAccessService` — nenhum service do Diário lê obra ou RDO sem ele.

**Não há atalho por papel.** Administrador, Diretoria e SUPER_ADMIN também veem
apenas as obras em que foram colocados. O Diário é ferramenta de campo: "quem
está tocando esta obra" é uma lista de pessoas, não uma consequência de cargo.
Quem precisa da visão gerencial de todas as obras usa o ERP; quem precisa
DISTRIBUIR obras usa `diario.manage_access`, que é outra permissão e outro
controller.

### Negação por 404, não por 403

`SiteAccessService` devolve a mesma mensagem para "a obra não existe" e para "a
obra existe mas não é sua". Respostas diferentes transformariam a rota num
oráculo: com um token válido, alguém descobriria — um UUID por vez — quais
obras a construtora tem, sem conseguir abrir nenhuma. O log do servidor
registra a distinção; a resposta HTTP, não.

---

## Permissões e papéis

Três permissões novas no catálogo (`src/common/tenancy/default-roles.ts`):

| Código                 | O que abre                                            |
| ---------------------- | ----------------------------------------------------- |
| `diario.access`        | Entrar no Diário; ver obras e RDOs vinculados a você. |
| `diario.report.manage` | Criar e editar RDOs nas obras vinculadas.             |
| `diario.manage_access` | Definir quais usuários enxergam quais obras.          |

Distribuição pelos papéis padrão:

| Papel                 | `access` | `report.manage` | `manage_access` |
| --------------------- | -------- | --------------- | --------------- |
| Administrador         | ✅       | ✅              | ✅              |
| Engenharia            | ✅       | ✅              | ✅              |
| **Fiscal de Obra**    | ✅       | ✅              | —               |
| Diretoria             | ✅       | —               | ✅              |
| Compras/Financeiro/RH | —        | —               | —               |

**"Fiscal de Obra" é papel novo**, não apelido de Engenharia: o fiscal não
cadastra obra, não abre solicitação de compra e não vê terceirizados. Também
não recebe `relatorios.view` — é a única exceção ao conjunto base — porque
esses são os indicadores executivos de todos os módulos, e o fiscal é externo à
operação da construtora.

> **Cuidado com a palavra "fiscal".** O módulo `src/fiscal/` do código é
> TRIBUTÁRIO (NF-e, certificado digital, DF-e). O fiscal DE OBRA é outra coisa
> inteiramente. No banco o valor se chama `SITE_INSPECTOR`/`INSPECTOR`
> justamente para a distinção não depender de contexto.

### Papel na obra ≠ papel no sistema

`UserConstructionSite.role` (`ENGINEER` | `INSPECTOR`) diz como a pessoa
participa DAQUELA obra — quem assina o diário como responsável técnico e quem
assina como fiscal. O `Role` do RBAC diz o que ela pode FAZER no sistema. São
perguntas diferentes: a mesma pessoa pode ser engenheira numa obra e fiscal em
outra, e nenhum papel de RBAC expressa isso.

---

## Subdomínio

O Diário **não** é uma segunda aplicação. É o mesmo bundle, a mesma API, o
mesmo banco e a mesma sessão; o que muda é qual árvore de rotas o React monta,
decidido no boot por `resolveAppEnvironment()` (`apps/web/src/lib/app-mode.ts`).

Duas portas de entrada:

1. **Subdomínio** — `diario.gestaoeds.com.br`. A forma de produção. O nginx já
   responde a qualquer host (`server_name _`), então publicar o Diário é
   apontar um registro DNS para a MESMA stack. Sem segunda imagem, segundo
   build ou segundo deploy.
2. **Prefixo `/diario`** — rota de escape. Serve para abrir o Diário de um
   desktop já logado no ERP e para ambientes onde criar um subdomínio não é
   prático (túnel temporário, preview). O router recebe `basename="/diario"`,
   então nenhum `<Link>` do Diário precisa saber por qual porta entrou.

O bundle é dividido por ambiente: quem abre o Diário baixa ~8 kB de casca em
vez dos ~30 kB do ERP, e o mapa de rotas do sistema administrativo não desce
junto.

### Publicar o subdomínio

1. Registro DNS `diario` → o mesmo destino do ERP (mesmo nginx/serviço).
2. Certificado TLS cobrindo o novo host (wildcard, ou um certificado a mais).
3. `CORS_ORIGIN` da API passa a listar os dois endereços, separados por vírgula.
4. Opcional, para sessão compartilhada: `REFRESH_COOKIE_DOMAIN`.

Nenhuma alteração no `nginx.conf` é necessária.

### Sessão compartilhada entre ERP e Diário

Sem `REFRESH_COOKIE_DOMAIN`, o cookie do refresh token nasce **host-only**: o
navegador não o envia para o outro subdomínio, e quem entra no ERP precisa
entrar de novo no Diário — com as mesmas credenciais, por pura mecânica de
cookie. Não é um segundo cadastro nem uma segunda senha, mas é um segundo
login.

Definindo `REFRESH_COOKIE_DOMAIN=.gestaoeds.com.br`, um login vale para os
dois. **O que isso implica:** o cookie passa a ser entregue a TODO subdomínio
daquele domínio, presente e futuro. Ligar é declarar "todos os subdomínios
deste domínio são meus". Por isso o padrão é vazio.

---

## Como testar localmente

```bash
docker compose -f docker/docker-compose.yml up -d      # Postgres local
npm run migrate:local  --workspace api                 # aplica a migration nova
npm run seed:local     --workspace api                 # SEED_DEMO=true no .env.local
npm run dev                                            # API na 3000, Vite na 5173
```

Endereços:

| O quê               | Endereço                     |
| ------------------- | ---------------------------- |
| ERP                 | http://localhost:5173        |
| Diário (subdomínio) | http://diario.localhost:5173 |
| Diário (prefixo)    | http://localhost:5173/diario |

`*.localhost` é resolvido para 127.0.0.1 pelos navegadores sozinhos — não é
preciso mexer em `/etc/hosts`.

> **Origem única no local.** `VITE_API_URL` passou a ser `/api`, e o
> `server.proxy` do Vite repassa para a API — o mesmo arranjo do nginx em
> produção. Antes, local era o único ambiente com front e API em origens
> diferentes, e isso deixou de funcionar quando o Diário ganhou subdomínio: de
> `diario.localhost:5173`, uma chamada para `localhost:3000` é **cross-site**
> para o navegador, e o cookie `SameSite=Lax` do refresh token não seria
> enviado — a sessão morreria a cada recarga, só na máquina do desenvolvedor.
> O par obrigatório disso é `REFRESH_COOKIE_PATH=/api/auth` na API (já está nos
> `.env` e nos exemplos).

### O caminho completo, ponta a ponta

1. Entre em `http://diario.localhost:5173` como `engenharia@eds.app`.
2. Toque em **+ Criar relatório**.
3. Escolha **Residencial Aurora** (só as obras vinculadas aparecem).
4. Escolha a data — o dia da semana aparece embaixo, calculado.
5. **Do zero** ou **Copiar anterior**; copiando, escolha o RDO de origem.
6. **Criar relatório** → o RDO abre já com número, situação e cabeçalho.
7. Preencha o **horário** (o seletor é o do próprio celular) e toque no clima
   da manhã e da tarde — cada toque salva sozinho.
8. Em **Mão de obra**, toque em _Adicionar função_: o painel sobe da borda de
   baixo, sem sair da lista. Repita para equipamentos, atividades, ocorrências
   e materiais. O total de profissionais aparece calculado, e não há campo para
   digitá-lo; em materiais, "50" com unidade "Saco" vira **50 sacos** na lista.
9. Escreva em **Observações gerais** e pare de digitar: aparece "Salvando…" e
   depois "Salvo às HH:MM". Não há botão de salvar em lugar nenhum.
10. Feche as seções: cada uma mostra no cabeçalho o que já tem
    ("2 funções · 14 pessoas") e um ✓ quando preenchida.
11. Em **Fotos**, toque em _Tirar foto_: o celular abre a câmera traseira. A
    miniatura aparece na hora, com o progresso por cima, enquanto o arquivo
    sobe. Toque nela para abrir em tela cheia.
12. Volte para **Relatórios**: o rascunho está lá, com **Continuar** — e tudo
    que você digitou e fotografou continua lá dentro.
13. No fim da tela do RDO, toque em **Finalizar RDO** e confirme. A tela vira
    somente leitura na hora: os botões de adicionar somem, os campos travam, e
    o rodapé passa a dizer quando e por quem foi finalizado.

Para ver o isolamento funcionando: copie o id do RDO da Aurora, saia, entre
como `engenharia2@eds.app` (vinculada só à Norte) e abra
`/relatorios/<aquele-id>`. A tela mostra "Relatório não encontrado ou não
vinculado ao seu acesso" — a mesma mensagem que um id inexistente produziria.

### Usuários do seed de demonstração

Senha de todos: `Eds@12345`.

| E-mail                | Papel          | Obras no Diário                          |
| --------------------- | -------------- | ---------------------------------------- |
| `engenharia@eds.app`  | Engenharia     | Residencial Alpha, Condomínio Green Park |
| `engenharia2@eds.app` | Engenharia     | Centro Empresarial Norte                 |
| `fiscal@eds.app`      | Fiscal de Obra | Residencial Alpha (como fiscal)          |
| `admin@eds.app`       | Administrador  | **nenhuma**                              |
| `compras@eds.app`     | Compras        | — (sem `diario.access`)                  |

A massa foi montada para o isolamento ser verificável abrindo o app:

- Entrando como `engenharia@eds.app`, a Norte não aparece — nem na lista, nem
  colando o UUID dela na URL.
- Entrando como `engenharia2@eds.app`, a Alpha não aparece, e o RDO #24 dela
  não é legível nem pelo id.
- `admin@eds.app` entra no Diário e vê a Home com o estado vazio de obras —
  administrar o sistema não vincula ninguém a obra nenhuma.
- `compras@eds.app` entra e recebe a tela "Sem acesso ao Diário", não um
  redirecionamento de volta ao login (que faria a pessoa achar que errou a
  senha).

---

## Endpoints

| Método | Rota                            | Permissão                |
| ------ | ------------------------------- | ------------------------ |
| GET    | `/diario/home`                  | `diario.access`          |
| GET    | `/diario/obras`                 | `diario.access`          |
| GET    | `/diario/obras/:id`             | `diario.access`          |
| GET    | `/diario/relatorios`            | `diario.access`          |
| GET    | `/diario/relatorios/:id`        | `diario.access`          |
| POST   | `/diario/relatorios`            | + `diario.report.manage` |
| PATCH  | `/diario/relatorios/:id`        | + `diario.report.manage` |
| POST   | `/diario/relatorios/:id/copia`  | + `diario.report.manage` |
| GET    | `/diario/acessos/candidatos`    | `diario.manage_access`   |
| GET    | `/diario/acessos/obras/:siteId` | `diario.manage_access`   |
| PUT    | `/diario/acessos/obras/:siteId` | `diario.manage_access`   |

Ler e escrever são permissões distintas: um perfil de acompanhamento (a
Diretoria, hoje) abre os relatórios das obras dele sem poder alterá-los.

`/diario/home` devolve obras e RDOs recentes numa requisição só. Três chamadas
separadas seriam mais "REST", e mais três handshakes numa conexão de canteiro
de obra — a tela inteira depende das mesmas obras vinculadas, então elas são
resolvidas uma vez e reaproveitadas.

As listas do RDO ficam sob o relatório, e são só de escrita — a leitura vem
junto de `GET /diario/relatorios/:id`:

| Método            | Rota                                            |
| ----------------- | ----------------------------------------------- |
| POST/PATCH/DELETE | `/diario/relatorios/:id/mao-de-obra[/:itemId]`  |
| POST/PATCH/DELETE | `/diario/relatorios/:id/equipamentos[/:itemId]` |
| POST/PATCH/DELETE | `/diario/relatorios/:id/atividades[/:itemId]`   |
| POST/PATCH/DELETE | `/diario/relatorios/:id/ocorrencias[/:itemId]`  |

Todas exigem `diario.access` + `diario.report.manage`, e **todas devolvem o
relatório inteiro** com o resumo recalculado. São mais bytes, e é de propósito:
a tela precisa do "5 funções · 18 pessoas" atualizado a cada mudança, e
devolver só o item obrigaria a uma segunda requisição — numa conexão de
canteiro, uma ida a mais custa mais que os bytes a mais.

Não há endpoint novo para "consultar RDOs anteriores da obra": é
`GET /diario/relatorios?siteId=...`, que já existia e já valida o vínculo.

---

## Ciclo de vida do RDO

### Situações e o ciclo de vida

O ciclo tem **dois estados e uma transição**:

```
DRAFT ──POST /finalizar──> SUBMITTED
```

| Banco       | Tela       | Editável | Alcançável |
| ----------- | ---------- | -------- | ---------- |
| `DRAFT`     | Rascunho   | sim      | nascimento |
| `SUBMITTED` | Finalizado | não      | finalizar  |
| `APPROVED`  | Aprovado   | não      | **não**    |

`APPROVED` continua no enum como o degrau da conferência pelo
fiscal/contratante, que ainda não existe — nenhum código o produz. Está ali
porque removê-lo e recolocá-lo depois custaria duas migrations para chegar ao
mesmo lugar.

**Não existe estado "em revisão", e não é esquecimento.** Um estado
intermediário só se justifica quando alguém age sobre ele; enquanto a aprovação
não existir, REVIEW seria um beco — o relatório entraria e não teria como sair.
O fluxo cresce quando aparecer o ator que o justifica.

> Os rótulos mudaram nesta etapa: `SUBMITTED` era "Em revisão" e `APPROVED`,
> "Finalizado". Chamar de "Em revisão" o estado em que o autor ENTREGA o
> relatório prometia uma conferência que o sistema não faz.

As transições permitidas estão numa tabela (`daily-report-status.ts`), e não
num `if`: é ela que torna óbvio que só existe um caminho, e que a aprovação,
quando existir, entra como uma linha nova em vez de um `else` no meio de um
service.

### Finalizar

`POST /diario/relatorios/:id/finalizar` — rota própria, e não `PATCH { status }`.
Finalizar valida pendências, carimba autor e instante, escreve auditoria e
fecha o documento para sempre; expor isso como PATCH convidaria o cliente a
escolher qualquer estado do enum e transformaria a regra num `if` perdido no
meio do autosave.

Mesma permissão da edição (`diario.report.manage`). Não foi criada uma
`diario.report.finalize`: hoje quem preenche é quem fecha, e uma permissão a
mais só existiria para separar dois papéis que ainda são um só.

**A corrida é fechada pelo próprio UPDATE:**

```sql
UPDATE "DailyReport" SET status = 'SUBMITTED', ... WHERE id = $1 AND status = 'DRAFT'
```

Se dois usuários tocarem em "finalizar" ao mesmo tempo, o segundo atualiza zero
linhas e recebe 409. Ler o status antes e escrever depois deixaria uma janela
entre as duas coisas — pequena, mas suficiente para gravar `submittedAt` duas
vezes com autores diferentes. A checagem prévia continua existindo porque
produz a mensagem certa; a garantia é a cláusula do UPDATE.

`submittedAt` e `submittedById` são preenchidos **só** na transição.
`createdAt` não serviria: um RDO aberto às 7h e finalizado às 17h tem dois
instantes distintos, e o documento precisa dizer quando foi fechado.

A finalização é registrada em `AuditLog` pelo `AuditLoggerService` que o ERP já
tem. `DailyReport` fica **fora** da extensão automática de auditoria do Prisma
de propósito: ela registra todo `update`, e o autosave produz um a cada frase
digitada — a auditoria viraria ruído e esconderia justamente o evento que
importa.

### O que impede finalizar

Só três coisas, e a decisão é registrada porque o domínio não tinha nenhuma:

1. **Obra e data** — estruturais, garantidas na criação.
2. **Jornada (início e término)** — um diário sem horário não comprova
   expediente, e é a primeira coisa que uma medição contratual procura. O
   intervalo continua opcional.
3. **Pelo menos uma atividade** — um dia sem serviço executado é um dia que não
   aconteceu. Se de fato não houve trabalho (chuva, paralisação), isso se
   registra como atividade ou ocorrência.

**Deliberadamente não exigidos:** clima, mão de obra, equipamentos,
ocorrências, materiais, observações, fotos e vídeos. Todos são legítimos
vazios; obrigá-los faria o engenheiro inventar conteúdo para conseguir fechar,
que é o oposto do que um diário serve.

A mensagem de erro traz **todas** as pendências de uma vez — uma de cada vez
faria a pessoa tentar, corrigir, tentar de novo e descobrir a segunda, num
aparelho em campo com conexão ruim.

### Depois de finalizado

**Um único ponto fecha tudo.** `assertWritable` já era a porta de entrada de
toda escrita — o PATCH do relatório, as cinco listas e o upload de mídia. Como
ele consulta `isEditable`, a finalização bloqueia as doze operações de uma vez,
sem uma linha de regra repetida em service nenhum.

Na tela, `editable: false` desliga tudo: inputs viram `disabled`/`readOnly`,
os CTAs de adicionar somem, editar e excluir somem, o upload some — e o
**autosave nem arma o temporizador** (`useAutosave` recebe `enabled: false`).
Não é "manda o PATCH e recebe erro": a interface sabe que o relatório está
fechado.

A **leitura continua**: quem tem `diario.access` abre o relatório normalmente,
e o bloco no fim da tela diz quando e por quem foi finalizado. "Não dá para
editar" vira uma explicação em vez de um bloqueio sem motivo aparente.

### A data não muda

`UpdateDailyReportDto` não tem `reportDate`, e a ausência é a regra: um RDO
**é** um dia específico. Mudar a data transformaria o documento em outro, com o
mesmo número — que é sequencial por obra e foi emitido para aquela data.

> Uma versão anterior permitia corrigir a data enquanto o relatório fosse
> rascunho. Foi removido. Errar a data não custa mais um relatório preso na
> lista: a saída é **excluir o rascunho** e refazer — a data volta a ficar
> livre no mesmo instante.

### Um relatório por obra por dia

A regra não foi inventada: o modelo já a afirmava em três lugares — o nome
(relatório **diário** de obra), o tipo da coluna (`DATE`, sem hora) e a
numeração por obra. O que faltava era o banco impedir, e agora há um índice
único em `(constructionSiteId, reportDate)`.

Sem ele, dois toques no botão de criar produzem dois RDOs da mesma data, e a
segunda pessoa a preencher só descobre quando o dia já passou.

> **Foi essa constraint que decidiu a forma da exclusão.** Ela não ignora
> `deletedAt`, então um soft delete deixaria a data ocupada e recriá-la daria
> 409 — anulando o motivo de existir a exclusão. Liberar a data exigiria um
> índice parcial (`WHERE "deletedAt" IS NULL`) que o Prisma não expressa no
> schema e que todo `migrate dev` seguinte tentaria trocar de volta pelo comum,
> derrubando esta garantia em silêncio. Por isso a exclusão de rascunho é
> **definitiva**.

### Quem entra no Diário

Duas portas independentes, e as duas precisam estar abertas:

1. **A permissão `diario.access`**, que vem do PAPEL (Configurações → Perfis).
   É coletiva: marcá-la em "Engenharia" vale para toda a engenharia.
2. **O interruptor por pessoa** (Administração → Usuários → *pessoa* → Diário de
   Obras). Existe porque o papel é de time: todo engenheiro precisa das
   permissões do ERP, mas nem todo engenheiro vai a campo preencher RDO. Sem
   ele, o único ajuste possível seria tirar a permissão do papel — derrubando
   quem depende dela.

O interruptor **só tira**. Ligado, não concede `diario.access` a quem o papel
não deu; ele apenas deixa de retirar. A direção única mantém o papel como fonte
da verdade e impede que o campo vire uma segunda tabela de permissões,
invisível na tela de perfis.

Onde isso é aplicado: `effectivePermissions`, chamado por
`AuthService.toPublicUser` — o único lugar onde o conjunto efetivo é montado, e
que alimenta tanto o token quanto o objeto que a interface recebe. Por isso o
`PermissionsGuard` e o frontend não sabem que o campo existe: para eles a
permissão simplesmente não está lá.

Duas consequências práticas:

- **O efeito não é instantâneo para quem já está logado.** As permissões viajam
  no token de acesso, que vale 15 minutos; desligar alcança a pessoa na próxima
  renovação. É o mesmo comportamento de qualquer mudança de permissão de papel.
- **Entrar não é ver.** Quem passa pelas duas portas e não tem vínculo com obra
  nenhuma (`UserConstructionSite`) entra numa tela vazia. Os vínculos são
  definidos dentro do Diário, obra a obra, por quem tem `diario.manage_access`.

A coluna `User.diarioEnabled` nasceu `false` — liberar passou a ser um ato
explícito. A migration marcou `true` para quem já tinha vínculo com obra: essas
pessoas estavam usando o Diário, e deixá-las de fora teria sido uma remoção de
acesso disfarçada de recurso novo.

### Excluir rascunho

`DELETE /diario/relatorios/:id`, exigindo `diario.report.manage` — a mesma
permissão da escrita, sem código próprio, pela razão já aplicada à finalização.

Só **rascunho**. Relatório finalizado é o documento do dia e não sai por
nenhum caminho; desfazê-lo exigiria uma reabertura, que não existe.

O que vai junto, por `onDelete: Cascade`: mão de obra, equipamentos,
atividades, ocorrências, materiais e mídia — e os arquivos das mídias saem do
storage, original e miniatura. Os RDOs copiados deste apenas perdem o ponteiro
de origem (`copiedFromId` é `SET NULL`); a cópia é um relatório próprio.

Duas consequências que valem saber:

- **A prestação de contas fica na auditoria**, não numa linha morta: o
  `AuditLoggerService` registra quem excluiu, o número e a data.
- **O número volta para o próximo**, se o excluído era o último da obra —
  `MAX(number) + 1` conta só o que existe. Não afeta relatório finalizado, que
  não se exclui, então nenhum número já citado em ata ou medição se repete.

A corrida com a finalização é fechada por `DELETE ... WHERE status = 'DRAFT'`,
o mesmo desenho do `UPDATE` da finalização. As duas ordens são legítimas; o que
não acontece é as duas darem certo. Se a exclusão vence, quem finalizava recebe
"foi excluído por alguém enquanto você o editava" — e não "já foi finalizado",
que faria a pessoa acreditar que o relatório está salvo.

### Numeração sequencial e concorrência

O número é gerado **no servidor**, dentro da transação da criação:

```
pg_advisory_xact_lock(4747, hashtext(<obra>))   -- trava a obra
MAX(number) + 1                                  -- lê o último
INSERT                                           -- grava
```

Três decisões por trás disso:

- **`MAX(number) + 1`, não `count() + 1`.** É o que
  `nextSequentialCode` faz para os códigos de solicitação, e lá o próprio
  comentário admite a janela de corrida. Aqui não é aceitável: dois RDOs #24 na
  mesma obra são um documento de obra duplicado. Além disso `count()` erra
  sozinho — basta um relatório excluído para a contagem e o último número
  deixarem de coincidir.
- **Lock consultivo por obra, tirado antes da leitura.** O Postgres o libera no
  commit ou no rollback, então não há caminho de código que esqueça de soltá-lo.
  A chave é a obra: dois RDOs de obras diferentes não esperam um pelo outro. E
  ele vive no servidor de banco, não no processo Node — continua valendo com
  várias instâncias da API atrás do balanceador, que é justamente o cenário em
  que um mutex em memória daria a falsa sensação de resolvido.
- **Números não são reaproveitados.** O máximo é lido sem filtrar `deletedAt`:
  um RDO #24 excluído não devolve o 24 para o próximo. A numeração de um
  documento de obra precisa ser estável para quem a citou em ata ou medição.

Se por qualquer motivo o lock não segurar, o índice único
`(constructionSiteId, number)` recusa o duplicado — a criação falha com erro,
em vez de gravar dois relatórios com o mesmo número. Esse erro **não** é
convertido em mensagem amigável: seria uma falha da alocação, e um 409 a
esconderia atrás de um texto que culpa o usuário.

O teste `daily-reports.spec.ts` prova isso com um par: um caso com o lock
ligado (números 24 e 25) e um caso de controle com o lock desligado (uma das
duas criações falha). Sem o segundo, a proteção poderia ser removida do código
e a suíte continuaria verde.

### Salvamento incremental

`PATCH /diario/relatorios/:id` aceita atualização parcial — é o endpoint do
autosave. Ele **não** aceita `constructionSiteId`: mover um relatório de obra
mudaria o dono do documento, invalidaria a numeração (sequencial por obra) e
furaria o isolamento de acesso. A obra de um RDO é definida no nascimento.

Do lado do navegador, `useAutosave` (`apps/web/src/diario/hooks/`) resolve
quatro problemas que a versão ingênua não resolve:

1. **Não salva na abertura** — o hook guarda o valor que veio do servidor e só
   grava quando a tela diverge dele.
2. **Não sobrepõe requisições** — enquanto uma gravação está no ar, uma mudança
   nova entra na fila. Sem isso, duas respostas fora de ordem deixariam o
   servidor com o texto antigo: o clássico "sumiu o que eu escrevi".
3. **Descarrega ao sair** — trocar de app, bloquear a tela ou navegar para
   outro RDO dispara a gravação na hora, em vez de descartar o que estava no
   debounce. `visibilitychange` é o evento que funciona no Safari do iOS.
4. **Erro não é silencioso** — o estado vira `error` e a tela oferece tentar de
   novo, nunca "salvo" sobre uma gravação que falhou.

O debounce é de 1200 ms: longo o bastante para não mandar um request por tecla,
curto o bastante para o texto estar salvo antes de o celular voltar para o
bolso.

O campo que exercita tudo isso é `notes` (Observações) — o primeiro campo de
conteúdo do RDO, e por enquanto o único. Ele existe agora porque uma
infraestrutura de autosave sem nenhum campo que a percorra não é
infraestrutura, é código que nunca rodou.

### Cópia

`POST /diario/relatorios/:id/copia` cria um relatório novo a partir de outro.
O corpo traz **só a data**.

A obra do relatório novo é **derivada da origem**, nunca informada pelo
cliente. Isso torna "nunca copiar RDO de outra obra" uma impossibilidade
estrutural em vez de uma validação que alguém pode esquecer de escrever: não
existe campo por onde uma obra de destino entre. O que é validado é o acesso à
origem, com o mesmo chokepoint de sempre.

O que a cópia leva está numa lista explícita (`COPYABLE_FIELDS`), e não numa
regra de exclusão. Copiar "tudo menos X" significa que todo campo novo passa a
ser copiado por omissão, sem ninguém decidir. Hoje a lista tem `notes`; quando
clima, mão de obra e equipamentos chegarem, cada um entra por decisão própria —
e fotos, vídeos e ocorrências, por natureza, nunca entram: são registros do que
aconteceu naquele dia específico.

A cópia nasce em rascunho, com número novo, data nova e autor novo. O relatório
de origem não é tocado; `copiedFromId` registra de onde ele veio.

---

## Conteúdo do RDO

Dez blocos preenchidos em campo: horário, clima, mão de obra, equipamentos,
atividades, ocorrências, materiais, observações, fotos e vídeos. O editor do
RDO está completo — o que vier depois é fluxo (fechamento, PDF, assinatura),
não conteúdo.

### Onde cada coisa mora, e por quê

| Bloco                       | Onde                     | Por quê                                                        |
| --------------------------- | ------------------------ | -------------------------------------------------------------- |
| Horário, clima, observações | colunas em `DailyReport` | 1:1 com o relatório — uma tabela seria um join a troco de nada |
| Mão de obra                 | `DailyReportLabor`       | lista, uma linha por função                                    |
| Equipamentos                | `DailyReportEquipment`   | lista, com situação por linha                                  |
| Atividades                  | `DailyReportActivity`    | lista ordenada (`position`)                                    |
| Ocorrências                 | `DailyReportOccurrence`  | lista classificada (`OccurrenceType`)                          |

Nada foi para um campo JSON. O clima é `enum`, não texto: "quantos dias de
chuva esta obra teve em março" é pergunta de medição contratual, e ela não se
responde sobre uma coluna onde cabem "chuva", "Chuvoso" e um emoji.

### Horário em minutos, não em `TIME`

`workStartMinutes`, `workEndMinutes` e `occurredAtMinutes` são `INTEGER` —
minutos desde a meia-noite (0–1439).

Um horário de expediente não tem data nem fuso: "07:00" é sete da manhã na
obra. Guardá-lo como timestamp obrigaria a inventar um dia e um fuso que não
significam nada, e a errar em uma hora quando o servidor mudasse de zona.
(`TimeEntry`, no RH, usa `DateTime` porque lá o valor **é** um instante — a
batida do ponto. Aqui é uma hora do relógio.) De quebra, inteiro é o formato em
que "horas trabalhadas no mês" sai como uma soma, e não como um parse.

A API fala `"07:00"` nas duas direções; a conversão vive em `report-time.ts`.

**Limitação assumida:** turno virando a meia-noite não é representável — a
validação exige `término >= início`. O diário registra jornada diurna, e
aceitar a inversão silenciosamente transformaria todo erro de digitação num
dado plausível. Quando houver obra em turno noturno, a saída é uma marcação
explícita de "vira o dia", não relaxar a regra.

A coerência é conferida contra o horário **resultante** (o gravado + o que veio
no PATCH), não só contra o que chegou. Sem isso, mandar o término sozinho num
relatório que já tinha início às 07:00 passaria batido com "término 05:00":
cada campo, isolado, é válido; o conjunto é que não é.

### Nenhum total é armazenado

Não existe `totalWorkers`. O total é a soma das linhas, calculada em
`report-summary.ts` e devolvida no campo `summary` do relatório. Dois números
para a mesma verdade divergem no primeiro item editado, e o que diverge é
sempre o que ninguém está olhando. A tela também não deixa digitar o total.

O mesmo `summary` alimenta o resumo de cada seção fechada ("2 funções · 14
pessoas") e o "✓" de preenchida. Ele é calculado no backend porque aparece em
duas telas e vai aparecer no PDF — três implementações da mesma soma é como
"18 pessoas" e "16 pessoas" acabam na mesma página.

### Unicidade: mão de obra sim, equipamento não

`DailyReportLabor` tem índice único em `(dailyReportId, role)`. A mesma função
duas vezes no mesmo dia é sempre engano: "Pedreiro 8" e "Pedreiro 3" deveriam
ser "Pedreiro 11".

`DailyReportEquipment` **não** tem. Ali a repetição é informação: "Betoneira 1
(operando)" e "Betoneira 1 (em manutenção)" são dois registros legítimos.

### Materiais: diário, não estoque

`DailyReportMaterial` responde uma pergunta só — "o que aconteceu com os
materiais na obra hoje?". Não há saldo, entrada fiscal, fornecedor, custo,
almoxarifado nem inventário: esses conceitos pertencem a Compras e Financeiro,
que já os têm, e duplicá-los aqui criaria uma segunda verdade sobre o estoque.
O histórico de uma obra se lê percorrendo os RDOs dela; nenhum acumulado é
mantido, e o `summary` conta **movimentações**, não quantidades — somar 50
sacos com 2,5 m³ não significa nada.

Sem vínculo com atividade, também de propósito: uma obra recebe cimento sem que
ninguém queira dizer a qual serviço ele pertence, e obrigar a associação faria
o usuário escolher uma atividade qualquer para conseguir salvar.

**Unidade é `enum`, ao contrário de `PurchaseRequestItem.unit`.** Lá o campo é
`String` porque o seed já havia gravado abreviações do setor antes de existir
catálogo, e enumerá-lo hoje exigiria migrar dado. Aqui a tabela nasce vazia: dá
para exigir valor válido desde o primeiro registro, e passa a ser o banco a
recusar unidade inventada — não a boa vontade da tela.

Os códigos que existem nos dois lugares são os **mesmos** de `MEASUREMENT_UNITS`
(`apps/web/src/lib/measurement-units.ts`): `SC`, `CX`, `PCT`, e não
`SACO`/`CAIXA`/`PACOTE`. No dia em que alguém quiser abrir uma solicitação de
compra a partir do material faltante de um RDO, a unidade atravessa sem tabela
de tradução.

**Quantidade é `Decimal(12,3)`**, o mesmo de `PurchaseRequestItem.quantity`.
Decimal e não inteiro porque 2,5 m³ de concreto e 150,75 kg de vergalhão são
quantidades normais de obra; e não `Float` porque quantidade que entra em
medição não pode carregar erro binário. Ela chega ao navegador como **string**
(convenção do projeto para todo Decimal) e é formatada na apresentação:
`"50.000"` vira "50 sacos", `"2.500"` vira "2,5 m³", `"1200.000"` vira
"1.200 un". O valor armazenado nunca vira texto no caminho de ida.

Sem unicidade por nome, ao contrário da mão de obra: o mesmo material aparece
legitimamente duas vezes no mesmo dia quando parte foi recebida e parte foi
utilizada — são movimentações distintas, não engano.

### Fotos e vídeos

**O binário não entra no Postgres.** `DailyReportMedia` guarda a referência
(`storageKey`) e os metadados; o arquivo vive no `StorageService`, que o ERP já
tinha e que já abstrai disco local e bucket S3. O Diário não conhece SDK de
provider nenhum, e nenhuma segunda infraestrutura de storage foi criada.

#### URLs: servidas pela API, não assinadas

O arquivo sai por `GET /diario/relatorios/:id/midias/:mediaId/arquivo`, que
passa pelo mesmo `SiteAccessService` de sempre. Quem não tem vínculo com a obra
recebe 404 **mesmo tendo o endereço em mãos**.

Foi a escolha em vez de URL assinada, e ela é mais estrita, não menos: uma URL
assinada é um portador — vale por tempo, funciona para quem a receber e escapa
dos guards. É a mesma decisão que o ERP já havia registrado em
`s3-storage.driver.ts` e aplicado no `FilesController` aos anexos.

Custa banda do servidor. É a troca aceita.

No navegador, isso implica buscar cada arquivo como **blob** (o token vive em
memória, e um `<img src>` comum não o enviaria) — o mesmo caminho que o ERP já
usa para o logo da empresa.

#### Upload: uma requisição, não três

Não há "pedir URL / enviar / confirmar". Duas razões:

1. Esta abstração de storage não emite URL assinada, e o driver `local` não
   teria como emitir — ele grava em disco.
2. O caminho de três passos cria justamente o problema que se quer evitar: um
   registro no banco esperando um upload que talvez nunca termine.

Aqui a linha só nasce **depois** de o arquivo estar gravado. Upload
interrompido não deixa rastro: nem registro pendente, nem estado a limpar. É
por isso que não existe garbage collection a construir.

#### Falha parcial

| Cenário                         | Estratégia                                                   |
| ------------------------------- | ------------------------------------------------------------ |
| Storage OK, DB erro             | O arquivo recém-gravado é removido (compensação). Erro sobe. |
| Storage erro                    | Nenhuma linha é criada — o banco só é tocado depois.         |
| DB OK, storage erro na exclusão | A mídia já saiu do relatório; o órfão fica logado.           |

A ordem da exclusão — linha primeiro, arquivo depois — é escolhida pelo pior
caso de cada uma. Órfão no bucket é invisível, inofensivo e recuperável por uma
varredura que compare bucket e tabela. Na ordem inversa, uma linha apontando
para arquivo inexistente quebraria a tela do usuário.

#### Formatos, limites e validação

|       | Formatos                                | Limite |
| ----- | --------------------------------------- | ------ |
| Foto  | `image/jpeg`, `image/png`, `image/webp` | 10 MB  |
| Vídeo | `video/mp4`, `video/webm`               | 25 MB  |

Lista de **permissão**, ao contrário de `attachment-content.ts`, que bloqueia.
A diferença é o propósito: anexo de obra pode ser projeto, planilha ou CAD que
não cabe numa lista fechada; aqui o conteúdo é evidência visual, e quatro
formatos cobrem tudo que uma câmera de celular produz. SVG está ausente de
propósito — é o único formato de imagem que é documento com script.

**O tipo vem da assinatura do arquivo**, nunca do `mimetype` do multipart (que
é um campo de texto que o cliente preenche) nem da extensão. `media-signature.ts`
lê os primeiros bytes de JPEG, PNG, WebP, MP4 e WebM — e, do mesmo cabeçalho,
extrai largura e altura da imagem. Um HTML com nome `.jpg` e
`Content-Type: image/jpeg` é recusado.

Os **limites** saem da infraestrutura, não de um número escolhido no vácuo: o
nginx declara `client_max_body_size 25m` no `location /api/`, e o
`AttachmentsController` já usava 25 MB como teto do processo. Os 100 MB
sugeridos para vídeo não foram adotados porque (a) o nginx recusaria antes,
(b) o upload usa `memoryStorage()` — o arquivo inteiro fica em RAM —, e (c) o
caminho que tornaria 100 MB razoável, o upload direto ao bucket, não existe
nesta abstração. Subir o limite é mudar três linhas juntas, e vale a pena
quando houver upload direto.

`allowAttachments` (Configurações → Sistema) continua valendo para os dois:
quem desligou o envio de arquivos desligou para tudo. Já `maxUploadSizeMb` só
se aplica à FOTO — aquele número foi escrito para documento (10 MB por
omissão) e tornaria a seção de vídeo inutilizável.

#### Miniaturas: geradas no navegador

A grade de fotos busca a **miniatura** (~20 KB); só abrir a foto baixa o
original (1–2 MB). Num RDO com vinte fotos, é a diferença entre ~400 KB e
~30 MB para abrir a tela.

**Por que no navegador, e não no servidor.** O monorepo não tem nenhuma
biblioteca de processamento de imagem, e as duas candidatas cobram caro:
`sharp` é binário nativo por plataforma (complica a imagem Docker e o CI), e
`jimp` é JavaScript puro e lento — CPU da API num upload que já mantém o
arquivo inteiro em memória. O aparelho, ao contrário, **já tem a imagem
decodificada na mão**: a miniatura sai do mesmo `ImageBitmap` que a compressão
usa, a 320px e qualidade 0.7. Custo perto de zero, nenhuma dependência nova, e
funciona igual com o driver `local` e o `s3`.

**O que se abre mão.** O servidor não verifica se a miniatura retrata o
original — isso exigiria decodificar as duas imagens, que é exatamente o custo
evitado. Ela é validada como qualquer arquivo (assinatura, tipo de imagem, teto
de 200 KB), e o risco é contido: a miniatura só é exibida a quem já tem acesso
ao original, então o pior caso é alguém pôr uma imagem enganosa no próprio
relatório. O original, que é a prova, continua intacto.

**Objeto separado, rota separada.** A miniatura vive em
`diario/<empresa>/<obra>/<relatório>/miniaturas/<uuid>.jpg`; o original nunca é
alterado nem substituído. A rota própria (em vez de `?variant=thumb`) faz o
cache do navegador distinguir os dois pela URL — e ela é **tão protegida
quanto o original**: mesma checagem de vínculo com a obra, mesmo 404
indistinguível. Não há bucket público nem rota aberta.

`thumbnailKey` é anulável e nasceu **sem backfill**: foto sem miniatura cai no
original, e vídeo nunca tem uma (a grade mostra a capa com o ícone, sem baixar
nada).

#### Vídeo: Range no servidor, progresso no cliente

A rota do arquivo passou a honrar `Range`, com `Accept-Ranges`,
`Content-Range`, `Content-Length` e `416` para faixa impossível. Os dois
drivers implementam: o local via `createReadStream({ start, end })`, o S3
repassando o header ao bucket. O tamanho total sai de `sizeBytes`, que o banco
já guardava — nenhuma consulta a mais ao storage.

A autorização acontece **antes** de qualquer conta sobre a faixa: quem não tem
vínculo com a obra recebe 404 com ou sem `Range`.

**O que ainda não muda no navegador, e por quê.** Um `<video src>` comum não
envia o `Authorization`, porque o token desta aplicação vive em memória — então
o player não consegue, sozinho, aproveitar o Range. Enquanto isso, o vídeo
continua sendo baixado como blob, mas agora **com progresso real** ("Carregando
vídeo… 45%") em vez de um spinner mudo por um minuto.

Fechar essa lacuna exige dar ao `<video>` uma credencial que ele saiba
transportar — um cookie de sessão com escopo na rota de mídia, ou um token
de curta duração na URL. As duas são decisões de segurança, não de UI, e por
isso ficaram fora deste prompt. **Próxima etapa.**

#### Compressão e orientação, no cliente

Uma foto de celular tem 4–12 MB e 4000+ px. `image-compression.ts` reduz para
1920 px na maior dimensão, JPEG a 0,82 — o ponto em que o arquivo cai para uma
fração do original sem comer a textura fina de uma trinca ou de uma etiqueta,
que é o que um RDO precisa comprovar.

Roda no NAVEGADOR: o aparelho já tem a imagem decodificada, e o que trafega
passa a ser o arquivo pequeno — que é o gargalo real no 4G do canteiro.

A **orientação** sai resolvida do mesmo passo:
`createImageBitmap(blob, { imageOrientation: 'from-image' })` aplica a rotação
do EXIF ao rasterizar, então o pixel gravado já sai de pé. É também por isso
que o servidor **não** lê EXIF — o arquivo que chega já está endireitado, e
girar de novo estragaria.

Falhar na compressão nunca impede o envio: o arquivo original segue, e o limite
do backend dá a mensagem se for grande demais.

#### Conexão ruim

O upload usa `XMLHttpRequest` e não `fetch`, por um motivo só: `fetch` não
reporta progresso de ENVIO no Safari do iOS, que é metade dos aparelhos em
obra — e uma barra que não anda é pior que nenhuma quando o envio leva dois
minutos.

A fila (`use-media-upload.ts`) envia **um de cada vez** (três simultâneos num
4G ruim fazem os três falharem), mostra a miniatura local **antes** de o envio
terminar (sem isso a pessoa toca de novo e envia duplicado), e mantém a tarefa
em erro com o arquivo em memória até alguém tentar de novo ou descartar. A
retentativa reaproveita a mesma tarefa — não existe caminho que crie uma
segunda.

### Excluir item pede confirmação

Vale para as **cinco** listas, não só materiais. Um alvo de 44px ao lado do de
editar, numa tela usada de pé e às vezes com luva, é tocado por engano — e item
de RDO não tem soft delete para desfazer. Comportamentos diferentes na mesma
tela ensinariam o usuário errado.

### Autosave: um mecanismo, todos os campos

Observações, jornada e clima passam pelo MESMO `PATCH /diario/relatorios/:id` e
pelo MESMO hook (`useReportDraft`). Não existe um segundo caminho de gravação.

A diferença entre os campos é só quando o envio dispara:

| Campo                                       | Quando grava        |
| ------------------------------------------- | ------------------- |
| Observações, obs. da jornada, obs. do clima | 1200 ms de silêncio |
| Horário, clima                              | na hora             |

Digitar letra a letra pede debounce; escolher "13:00" ou tocar em "Chuva" é um
evento completo, e esperar ali só atrasaria o "Salvo" sem poupar requisição.

Quatro garantias — e as três primeiras foram **defeitos corrigidos na revisão**:

1. **Uma requisição por pausa, não por tecla.** Os `<textarea>` de observação
   da jornada e do clima estavam ligados direto à mutação: cada letra virava um
   PATCH.
2. **Uma gravação em voo por vez.** Dois toques rápidos no clima disparavam
   dois PATCH simultâneos, e a resposta que chegasse por último vencia — que
   podia ser a do primeiro toque. Agora o que muda durante uma gravação entra
   no envio seguinte, e cada envio leva só o _diff_ entre o rascunho e o que o
   servidor confirmou.
3. **Erro visível, com o texto do servidor.** Um horário recusado ("o término
   não pode ser anterior ao início") deixava o campo mostrando o valor inválido
   sem aviso nenhum. Agora o indicador mostra a mensagem e oferece tentar de
   novo — e o valor recusado continua na tela para ser corrigido.
4. **Descarrega ao sair.** Trocar de app, bloquear a tela ou navegar para outro
   RDO grava o pendente na hora, em vez de descartar o debounce.

O indicador fica no **cabeçalho** do RDO: com várias seções salvando sozinhas,
"salvou?" é uma pergunta sobre o relatório inteiro.

As listas (mão de obra, equipamentos, atividades, ocorrências, materiais) e a
mídia salvam por AÇÃO — adicionar, editar, excluir —, que é o momento em que a
informação está completa.

### Cascata

As quatro tabelas filhas usam `ON DELETE CASCADE`, seguindo o padrão que o
sistema já usa para item de documento (`PurchaseRequestItem` →
`PurchaseRequest`): elas não existem sem o relatório. Nenhuma tem `deletedAt` —
exclusão de item de RDO é definitiva, como já é a de item de solicitação de
compra. O soft delete existe no documento, que é o que precisa ser recuperável.

### O que a cópia leva

A regra que separa o que entra do que não entra: **copia-se o que descreve o
ARRANJO da obra, não o que descreve o DIA.**

| Copia                          | Não copia                          |
| ------------------------------ | ---------------------------------- |
| Jornada (horário + observação) | Clima                              |
| Mão de obra                    | Atividades executadas              |
| Equipamentos                   | Ocorrências                        |
| Observações gerais             | (fotos e vídeos, quando existirem) |

Na terça o time costuma ser o de segunda, e redigitar o efetivo todo dia é o
que faz o engenheiro desistir do diário. Já clima, atividades e ocorrências são
o dia: copiá-los fabricaria fato num documento que é prova contratual.

> Observações gerais está do lado "copia" por herança da etapa anterior, e é a
> única linha ambígua da tabela — ela às vezes descreve o dia. Mudar de lado é
> apagar uma string de `COPYABLE_FIELDS`.

---

## Decisões que valem registrar

**As seções que faltam continuam visíveis.** Materiais, fotos e vídeos aparecem
na tela marcadas como próximas etapas, em vez de simplesmente não existirem:
quem abre o RDO precisa ver de cara o tamanho do documento que vai preencher, e
uma tela que ganha seções novas a cada semana muda de forma debaixo do usuário.

**O número do RDO é sequencial por obra**, não global: em campo o relatório é
"o RDO 24 da Aurora", nunca "o RDO 1.842 do sistema".

**Nenhum campo novo foi criado em `ConstructionSite`.** Contratante é
`clientName`, local é `addressLine`/`city`/`state`, prazo é
`startDate`/`expectedEndDate`, responsável é `responsibleName`. Não existe
"número do contrato" na obra — o único `contractNumber` do sistema é o do
contrato com empresa TERCEIRIZADA, que é outro documento, com outra parte.
Exibir aquele número no RDO mostraria um dado errado com aparência de certo, e
criar uma coluna só para preencher a tela seria decidir modelagem pela
interface. A linha entra quando o dado existir no lugar certo.

**O prazo é calculado no backend, a partir da data DO RELATÓRIO** — não de
hoje. Reabrir o RDO de 12/03 em setembro precisa mostrar o prazo como ele
estava em 12/03, senão o documento muda de conteúdo depois de escrito. O
navegador recebe os números prontos: duas implementações da mesma conta é como
"prazo decorrido" passa a ter dois valores diferentes na mesma tela.

**O dia da semana também vem do servidor**, de uma tabela fixa e não do `Intl`.
A saída do `Intl` depende dos dados de ICU embarcados no Node, que variam entre
a imagem `node:22-slim` e a máquina de quem desenvolve — o dia da semana do RDO
não pode mudar de grafia conforme onde a API está rodando. (A tela de criação
formata o dia da semana da data ESCOLHIDA no próprio navegador: ali não há
relatório ainda, e pedir uma ida ao servidor para descobrir que 30/08/2026 é
domingo seria gastar a rede com o calendário gregoriano.)

**A distribuição de obras substitui a lista inteira** (`PUT`), em vez de
adicionar/remover item a item. É como a tela funciona: quem distribui vê a
equipe de uma obra e a edita como um conjunto. Com rotas granulares, dois
coordenadores editando ao mesmo tempo produzem uma equipe que nenhum dos dois
montou. Toda substituição é registrada em `AuditLog` — "por que este usuário viu
esta obra em março?" precisa ter resposta.

---

## Revisão de consistência

Os pontos abaixo foram encontrados relendo o módulo inteiro e corrigidos. Ficam
registrados porque cada um tem um jeito de voltar.

| Problema                                     | Onde                       | Correção                                                 |
| -------------------------------------------- | -------------------------- | -------------------------------------------------------- |
| PATCH por tecla digitada                     | obs. da jornada e do clima | tudo passa pelo `useReportDraft`                         |
| PATCH concorrentes, resposta antiga vencendo | horário e clima            | uma gravação em voo, envio por diff                      |
| Erro de validação invisível                  | horário e clima            | mensagem do servidor no indicador, com retry             |
| Miniatura de vídeo girando para sempre       | `AuthenticatedMedia`       | o componente decide sozinho; a seção não duplica a regra |
| Sem caminho de "obra" para "RDOs da obra"    | tela da obra               | link + filtro por `?obra=` na URL                        |
| Dois botões "Todas" idênticos na mesma tela  | filtros da lista           | "Todas as obras" / "Todas as situações" + `role="group"` |
| Alvo de toque de 36px no excluir de mídia    | grade de fotos             | 44px                                                     |
| `aria-label` num `<svg>` sem `role`          | selo de seção preenchida   | texto `sr-only`                                          |
| Foco preso atrás da galeria em tela cheia    | visualizador               | foco inicial no botão de fechar                          |
| Campo escondido pelo teclado no bottom sheet | `ItemSheet`                | rola o campo focado para o centro                        |
| "Tentar de novo" × "Tentar novamente"        | Home × demais telas        | um rótulo só                                             |

## Testes

| Arquivo                                          | O que cobre                                        |
| ------------------------------------------------ | -------------------------------------------------- |
| `api/src/diario/diario-access.spec.ts`           | Cadeia de acesso e permissões declaradas nas rotas |
| `api/src/diario/reports/daily-reports.spec.ts`   | Criação, numeração, concorrência, edição e cópia   |
| `api/src/diario/reports/report-date.spec.ts`     | Data pura, calendário, futuro e dia da semana      |
| `api/src/diario/reports/report-schedule.spec.ts` | Prazo contratual, decorrido e a vencer             |
| `web/src/diario/hooks/use-autosave.test.ts`      | Debounce, fila, descarga ao sair e erro            |
| `web/src/diario/pages/diario-flow.test.tsx`      | Home, criação, cópia, lista, continuação e estados |

O dublê do Prisma vive em `apps/api/src/diario/testing/diario-fixture.ts`,
compartilhado pelos specs — dois dublês para o mesmo banco divergem, e o que
diverge deixa de testar. Ele **reproduz de verdade** os filtros (`userId`,
`companyId` da obra, `deletedAt`), as constraints únicas, as ordenações e o
lock consultivo: um dublê que devolvesse a linha para qualquer `where` faria
todos os testes de isolamento passarem sem que o código filtrasse coisa alguma.

A pasta `src/**/testing/` é excluída em `tsconfig.build.json` — o dublê é
tipado como o resto do código, mas não entra na imagem de produção, e um import
dele a partir de código de produção quebra o build.

```bash
npm test                                 # os dois apps
npm test --workspace api                 # só a API
npx jest src/diario --workspace api      # só o Diário, na API
npm test --workspace web                 # só o front
```

O front passou a ter runner de teste nesta etapa (Vitest + Testing Library +
jsdom, em `apps/web/vitest.config.ts`). O `npx turbo run test` do CI já os
executa sem alteração no workflow.
