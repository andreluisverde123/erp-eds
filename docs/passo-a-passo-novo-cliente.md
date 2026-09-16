# Passo a passo: colocar o sistema no ar para um cliente novo

Guia em linguagem simples. Siga na ordem. Cada cliente recebe o **mesmo
sistema** da EDS, com o nome, a marca, os usuários e os dados dele.

> **Pré-requisito:** a retirada da marca EDS do código (branch
> `feat/white-label`) precisa estar publicada. Depois disso, a marca de cada
> cliente é só uma pasta com três arquivos (Passo 1B).

---

## Como funciona, numa imagem

Pense em cada cliente como uma **loja própria**, construída com a mesma planta:

| Peça | Para que serve | Onde fica | Um por cliente? |
| --- | --- | --- | --- |
| **Código** | o sistema em si | GitHub (repositório `erp-eds`) | **Não**, é um só para todos |
| **Domínio** | o endereço que o cliente digita | Registro.br + Cloudflare | Sim |
| **Banco de dados** | onde ficam obras, compras, usuários… | Neon | Sim |
| **Arquivos** | fotos, PDFs, logos, anexos | Cloudflare R2 | Sim |
| **Hospedagem** | o "computador" que roda o sistema | Railway | Sim |
| **Senhas do sistema** | chaves secretas de segurança | cofre de senhas | Sim, **nunca repetir** |

Quando você melhora o sistema, a melhoria vai para **todos** os clientes, porque
o código é o mesmo.

---

## Contas que você precisa ter (uma vez só)

Você já usa todas na EDS. Só confira se tem acesso:

- [ ] **GitHub**: onde está o código
- [ ] **Railway** (railway.com): hospedagem
- [ ] **Neon** (neon.tech): banco de dados
- [ ] **Cloudflare** (cloudflare.com): arquivos (R2) e endereço (DNS)
- [ ] **Registro.br**: compra de domínios `.com.br`
- [ ] **Um cofre de senhas** (Bitwarden, 1Password…) para guardar as chaves de
      cada cliente

---

## Passo 1 — Pegar as informações do cliente

Peça ao cliente e guarde numa pasta com o nome dele:

- [ ] **Dados da empresa:** razão social, nome fantasia, CNPJ, inscrição
      estadual, endereço completo, telefone, e-mail, site
- [ ] **Responsável legal:** nome do dono ou diretor que assina os contratos
- [ ] **Nome do sistema:** como ele quer chamar o sistema (ex.: "Gestão
      Construtora X")
- [ ] **Logo em dois formatos:**
  - **SVG**, para as telas (peça ao designer dele);
  - **PNG com fundo transparente**, para os PDFs.
- [ ] **Símbolo quadrado** (só o ícone, sem o nome), para a aba do navegador
- [ ] **Cor principal da marca:** o código da cor, algo como `#1E5AA8`
- [ ] **Endereço desejado:** ex. `gestao.construtorax.com.br`
- [ ] **Vai usar o Diário de Obras no celular?** Se sim, em
      `diario.construtorax.com.br` ou em `gestao.construtorax.com.br/diario`?
- [ ] **Lista de usuários:** nome, e-mail e função de cada um (engenheiro,
      compras, financeiro, RH, diretoria)
- [ ] **Cidade do foro** para os contratos
- [ ] **Nota fiscal (se for usar):** o certificado digital A1 (arquivo `.pfx`)
      e a senha dele

---

## Passo 1B — Cadastrar a marca do cliente (eu faço)

Com o material do Passo 1, eu crio a pasta do cliente no sistema:

```
apps/web/brands/construtorax/
  brand.json    nome do sistema, nome curto, construtora, descrição e cor
  logo.svg      o logo horizontal
  favicon.svg   o símbolo quadrado
```

O nome da pasta (`construtorax`) é o **código da marca**: letras minúsculas,
sem espaço nem acento. Ele vai numa variável do Railway (Passo 5A,
`VITE_BRAND`), e é ela que diz ao sistema qual marca mostrar.

Antes de publicar, eu gero um print da tela de login com a marca do cliente
para você aprovar.

---

## Passo 2 — O endereço (domínio)

**O jeito mais fácil:** usar um "subendereço" do site que o cliente **já
tem**. Se o site dele é `construtorax.com.br`, o sistema fica em
`gestao.construtorax.com.br`. Assim você **não precisa comprar nada**, só pedir
a quem cuida do site dele para criar um apontamento (Passo 7).

**Se precisar comprar um domínio novo:**

1. Entre no **registro.br** e pesquise o nome.
2. Um `.com.br` precisa ser registrado **no CNPJ de alguém**. O ideal é que
   fique **no CNPJ do cliente** (o domínio é dele). Se ficar no seu, deixe
   isso combinado em contrato.
3. Pague (a renovação é anual; anote a data).
4. Leve o domínio para a **Cloudflare**, como foi feito com `gestaoeds.com.br`:
   1. na Cloudflare, "Adicionar site", digite o domínio e escolha o plano Free;
   2. a Cloudflare mostra **dois endereços de servidor** (nameservers);
   3. no registro.br, em "DNS" do domínio, troque os servidores pelos dois da
      Cloudflare;
   4. espere algumas horas até a Cloudflare mostrar "Ativo".

---

## Passo 3 — O banco de dados (Neon)

1. Entre no **Neon** e clique em **New Project**.
2. **Nome:** `erp-<cliente>` (ex.: `erp-construtorax`).
3. **Região:** **AWS São Paulo (sa-east-1)**, a mesma da EDS.
4. Crie o projeto.
5. Em **Connect**, copie **duas** conexões e guarde no cofre:
   - a com **"Connection pooling" ligado**, que vira a `DATABASE_URL`;
   - a com **pooling desligado**, que vira a `DIRECT_URL`.
6. **Plano:** o gratuito tem só 0,5 GB e já está apertado na EDS. Para um
   cliente pagante, use o plano pago e ligue o **backup com restauração**
   (voltar o banco a um horário anterior).

> O banco nasce **vazio**. As tabelas são criadas no Passo 6.

---

## Passo 4 — O lugar dos arquivos (Cloudflare R2)

1. Na Cloudflare, vá em **R2** → **Create bucket**.
2. **Nome:** `erp-<cliente>` · **Local:** automático · deixe **privado** (não
   ligue acesso público).
3. Em **R2 → Manage API Tokens → Create API Token**:
   - permissão: **Object Read & Write**;
   - **somente este bucket** (nunca "todos os buckets");
   - crie o token.
4. Guarde no cofre:
   - **Access Key ID**;
   - **Secret Access Key** (só aparece uma vez);
   - o **endereço (endpoint)**, algo como
     `https://<número-da-conta>.r2.cloudflarestorage.com`.

---

## Passo 5 — A hospedagem (Railway)

Aqui o sistema é "ligado". São **duas peças**: a **API** (o cérebro) e o
**site** (a tela).

1. No Railway, clique em **New Project** → **Deploy from GitHub repo** →
   escolha `erp-eds`.
2. Nomeie o projeto `erp-<cliente>`.
3. Crie o **primeiro serviço**, a API:
   - **nome:** `api`;
   - em Settings, **Dockerfile path:** `docker/api.Dockerfile`;
   - **branch:** `main`;
   - em Networking → Private Networking, renomeie o endereço interno para
     `api`;
   - **não** crie domínio público para ele.
4. Crie o **segundo serviço**, o site:
   - **nome:** `web`;
   - **Dockerfile path:** `docker/web.Dockerfile`;
   - **branch:** `main`.
5. **Variáveis:** use a lista do **Passo 5A**. O jeito mais seguro é abrir o
   projeto da EDS ao lado e copiar **o nome** de cada variável, **nunca o
   valor**.

### Passo 5A — Variáveis de cada serviço

**Serviço `api`:**

| Variável | Valor |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | conexão **com** pooling (Passo 3) |
| `DIRECT_URL` | conexão **sem** pooling (Passo 3) |
| `CORS_ORIGIN` | `https://gestao.construtorax.com.br` (e o do Diário, se houver, separado por vírgula) |
| `TRUST_PROXY` | `1` |
| `REFRESH_COOKIE_PATH` | `/api/auth` |
| `REFRESH_COOKIE_DOMAIN` | só se o Diário for por subdomínio: `.construtorax.com.br`; senão, deixe vazio |
| `JWT_ACCESS_SECRET` | **gerar novo** (Passo 5B) |
| `JWT_REFRESH_SECRET` | **gerar novo** |
| `FISCAL_CERT_ENCRYPTION_KEY` | **gerar novo**, e **guardar no cofre** |
| `BANK_DATA_ENCRYPTION_KEY` | **gerar novo**, e **guardar no cofre** |
| `STORAGE_DRIVER` | `s3` |
| `S3_BUCKET` | nome do bucket (Passo 4) |
| `S3_REGION` | `auto` |
| `S3_ENDPOINT` | endereço do R2 (Passo 4) |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` | as chaves do Passo 4 |
| `S3_FORCE_PATH_STYLE` | igual ao da EDS |
| `FISCAL_SYNC_ENABLED` | `false` (ligar só depois de cadastrar o certificado) |
| `REFERENCE_BASES_AUTO_UPDATE` | `false` |
| `SEED_DEMO` | `false` |
| `PUBLIC_SIGNUP_ENABLED` | `false` |
| `BOOTSTRAP_ADMIN_EMAIL` | e-mail do primeiro administrador |
| `BOOTSTRAP_ADMIN_PASSWORD` | senha temporária forte (ele troca no 1º acesso) |
| `BOOTSTRAP_COMPANY_NAME` | nome da construtora (**obrigatório**; sem ele, o sistema recusa criar o administrador) |

**Serviço `web`:**

| Variável | Valor |
| --- | --- |
| `VITE_API_URL` | `/api` (sem isso o login não funciona) |
| `VITE_BRAND` | o código da marca do Passo 1B, ex.: `construtorax` (**obrigatório**; sem ele, o site nem é publicado) |
| `EDS_RESOLVER` | igual ao da EDS |
| `EDS_API_UPSTREAM` | igual ao da EDS (aponta para o serviço `api`) |

> **Atenção:** `FISCAL_CERT_ENCRYPTION_KEY` e `BANK_DATA_ENCRYPTION_KEY` são
> como a chave de um cofre. Se forem perdidas, o certificado digital e os
> dados bancários gravados **não abrem mais**. Guarde no cofre de senhas com o
> nome do cliente.

### Passo 5B — Gerar as chaves secretas

No Terminal do Mac, rode **uma vez para cada chave** (são 4) e copie o
resultado:

```
openssl rand -base64 48
```

Cada chave é diferente, e nenhuma pode ser igual à da EDS ou à de outro
cliente.

---

## Passo 6 — Criar as tabelas e o primeiro usuário

O banco está vazio. Este passo cria a estrutura e o administrador.

**Isto eu preparo para você.** Eu crio um arquivo de configuração do cliente e
o comando pronto; você só roda no terminal com o `!` na frente. Ele faz duas
coisas:

1. cria todas as tabelas no banco do cliente (as "migrations");
2. cria a empresa (com o nome de `BOOTSTRAP_COMPANY_NAME`), os papéis padrão
   e o **administrador** com o e-mail e a senha do Passo 5A.

Depois disso, o Railway publica o sistema sozinho.

**Como conferir:**

- [ ] No Railway, os dois serviços aparecem **verdes** ("Active").

---

## Passo 7 — Ligar o endereço ao sistema

1. No Railway, abra o serviço **`web`** → Settings → Networking → **Custom
   Domain** → digite `gestao.construtorax.com.br`.
2. O Railway mostra um **apontamento do tipo CNAME** (um nome e um destino).
3. Na **Cloudflare** (ou no painel de quem cuida do domínio do cliente), em
   **DNS → Add record**:
   - **Tipo:** `CNAME`;
   - **Nome:** `gestao`;
   - **Destino:** o que o Railway mostrou;
   - **Proxy:** **desligado** (nuvem **cinza**, "DNS only"). Com a nuvem
     laranja, o Railway não consegue criar o cadeado de segurança.
4. Espere alguns minutos, até o Railway mostrar o domínio como **verificado**,
   com o cadeado.
5. Diário por subdomínio: repita para `diario`.
   **Pegadinha:** o Railway tem limite de domínios por serviço. Se não couber,
   use `/diario` no mesmo endereço.

**Como conferir:**

- [ ] Abra `https://gestao.construtorax.com.br`: aparece a tela de login.

---

## Passo 8 — Primeiro acesso e configuração

1. **Entre** com o e-mail e a senha do administrador. O sistema pede para
   trocar a senha.
2. **Configurações → Empresa:** preencha **tudo** (razão social, CNPJ, IE,
   endereço, contatos, responsável) e envie o **logo em PNG**. É daqui que os
   PDFs (ordem de compra, contrato, RDO) tiram os dados. Sem isso, eles saem
   com lacunas.
3. **Configurações → Sistema:** nome do sistema do cliente.
4. **Administração → Usuários:** crie os usuários da lista, cada um com o
   papel certo. Eles recebem senha temporária. Para quem vai a campo, ligue o
   **Diário de Obras**. O Diário é liberado direto aqui, na produção: não
   precisa ser testado antes no staging do cliente.
5. **Engenharia → Obras:** cadastre as primeiras obras e, em cada uma, a
   **equipe do Diário**. Se a obra já tinha diários em outro sistema,
   preencha **Número do primeiro RDO** (ex.: 58) **antes** do primeiro RDO:
   depois dele o campo trava.
6. **Nota fiscal:** cadastre o certificado A1 e depois peça para ligar
   `FISCAL_SYNC_ENABLED`.

---

## Passo 9 — Testar antes de entregar

Confira com os próprios olhos:

- [ ] Login funciona e, ao recarregar a página, continua logado
- [ ] Nome, logo e cor **do cliente**, e **nenhum "EDS"** em lugar nenhum:
      aba do navegador, login, menu, PDFs
- [ ] Ordem de compra em PDF com logo, CNPJ e endereço do cliente
- [ ] Contrato em PDF completo, sem linhas em branco
- [ ] Diário: criar um RDO no celular, tirar foto, finalizar, baixar o PDF
- [ ] Anexar um arquivo, sair, voltar e ele continua lá (prova que o R2 está
      funcionando)
- [ ] Apagar os registros de teste

---

## Passo 10 — Entregar

- [ ] Enviar o endereço e a senha do administrador por um canal seguro (nunca
      por e-mail aberto)
- [ ] Treinar as pessoas-chave
- [ ] Anotar na **planilha de clientes**: nome, endereço, projeto Railway,
      projeto Neon, bucket R2, data de renovação do domínio, data de entrega
- [ ] Conferir que as 4 chaves secretas estão no cofre

---

## Depois de entregue: como ficam as atualizações

1. Toda melhoria é testada **no staging da EDS**.
2. Aprovada, antes de publicar, a estrutura do banco é atualizada em **cada
   cliente** (eu preparo um comando único que atualiza todos).
3. O código sobe para a `main`, e **todos os clientes** recebem a novidade ao
   mesmo tempo.
4. Um teste rápido em cada cliente.

**Cliente que não paga:** o sistema tem um bloqueio que mostra "Pagamento
pendente" no login. Hoje ele é ligado por comando no banco. Eu faço quando
você pedir.
