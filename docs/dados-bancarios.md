# Dados bancários

Onde o ERP guarda a conta de quem **recebe** dinheiro da empresa, como o dado é
protegido e quem pode vê-lo. Etapa de 24/08/2026. Complementa
`docs/auditoria-necessidades-operacionais.md` (item 6 da ordem recomendada).

Esta etapa **não** paga ninguém: não há remessa CNAB, PIX automático, folha de
pagamento nem aprovação de pagamento. Ela cria o destino; o uso vem depois.

## Onde fica na tela

**Administração → Usuários → (abrir um usuário) → Dados bancários.**

Um cartão dentro do cadastro do usuário, não um módulo novo. Cada conta aparece
como uma linha com banco, agência, tipo, **conta mascarada**, **PIX mascarado**
e titular, mais os botões Editar, Desativar/Ativar e — para quem tem a
permissão — Ver completo.

## A quem a conta pertence

O prompt pedia para usar o `User` se ele já representasse "a pessoa". Ele não
representa. O ERP tem **três** entidades de pessoa, e quem recebe pagamento não
é o `User`:

| Entidade     | O que é                             | Como é pago           |
| ------------ | ----------------------------------- | --------------------- |
| `User`       | login no sistema                    | ninguém paga um login |
| `Employee`   | funcionário CLT, tem `cpf`, salário | `Payslip` (holerite)  |
| `Contractor` | terceirizado                        | `ContractorContract`  |

Conta no `User` deixaria o pedreiro — que não tem login — sem onde receber, e
daria campo de conta ao contador externo, que nunca será pago por aqui.

A decisão foi **tabela própria com arco exclusivo**: `BankAccount` aponta para
`userId` **ou** `employeeId` **ou** `contractorId`, exatamente um, garantido por
`CHECK (num_nonnulls(...) = 1)` no banco — não só por validação de service.

Hoje **só a tela do usuário escreve**. As outras duas colunas existem para que
RH e Terceiros liguem as telas deles sem migration nova.

## O que é cifrado

| Campo                           | Como fica                                    |
| ------------------------------- | -------------------------------------------- |
| Número da conta, chave PIX      | **AES-256-GCM** (`BANK_DATA_ENCRYPTION_KEY`) |
| Forma mascarada dos dois        | texto (`****1234`, `j***@eds.com.br`)        |
| Banco, agência, tipo, dígitos   | texto                                        |
| CPF/CNPJ do titular de terceiro | texto, só dígitos                            |

Banco e agência ficam legíveis de propósito: sozinhos não pagam ninguém, e é
por eles que se reconhece uma conta na tela.

A **máscara é gravada em coluna própria**, em vez de derivada na leitura. Dois
motivos: a listagem não decifra nada (a chave só é usada quando alguém revela
de fato), e uma troca de chave — que torna o texto cifrado ilegível — não apaga
a tela, o usuário continua vendo `****1234` e sabe qual conta é.

Nenhuma criptografia nova foi escrita: a primitiva é a mesma que o certificado
fiscal já usava (`common/crypto/aes-gcm.ts`), agora com o guarda de chave
compartilhado em `common/crypto/encryption-vault.ts`.

## A chave

`BANK_DATA_ENCRYPTION_KEY`, gerada com `openssl rand -hex 32`.

**Própria, nunca a mesma do certificado fiscal** — são dois materiais com donos
e ciclos de vida diferentes, e trocar a de um não pode tornar o outro ilegível.

Opcional, como a fiscal: sem ela **só os dados bancários** ficam indisponíveis e
o resto do ERP sobe normal. A tela avisa (`encryptionConfigured: false`) em vez
de deixar o usuário descobrir com erro ao salvar.

Perdê-la torna as contas gravadas ilegíveis e exige recadastrá-las. Guarde cópia
junto das demais credenciais.

## Permissões

Três, e não as duas de sempre, porque aqui **consultar e ver não são a mesma
coisa**:

| Permissão                | Dá o quê                                        |
| ------------------------ | ----------------------------------------------- |
| `dados_bancarios.view`   | saber que a conta existe — sempre **mascarada** |
| `dados_bancarios.manage` | cadastrar, editar, ativar/desativar             |
| `dados_bancarios.reveal` | ler o número e a chave **inteiros**             |

`manage` **não** dá `reveal`: quem cadastra não passa a poder ler o que já
estava lá.

Quem recebe hoje: **só o papel Administrador**. Nenhum outro papel padrão. Não é
esquecimento — ver a seção de decisões pendentes.

Chegar até a tela exige `admin.manage_users` (é a rota do cadastro de usuário),
e isso **não** basta: a seção some inteira para quem não tem
`dados_bancarios.view`. Administrar acesso não é o mesmo que ver para onde vai o
dinheiro de alguém.

## Revelar o dado completo

`POST /admin/bank-accounts/:id/reveal` — POST apesar de só ler, porque um GET
com número de conta na resposta entra em histórico de navegador e cache de
proxy. E porque ele grava auditoria, o que a rigor o torna um efeito.

A auditoria é gravada **antes** da resposta sair: se o registro falhar, o dado
não é entregue. Consulta de dado protegido sem rastro é pior que consulta
recusada.

No front, os valores vivem só no estado da linha que pediu — nunca no cache do
React Query. Sair da tela descarta.

## Auditoria

Ação nova no enum: **`READ`**, exibida como "Consulta protegida" em
Configurações → Auditoria. Ela não marca consulta comum (seria ruído sobre toda
listagem do sistema); marca só a leitura que **expõe** dado protegido.

O que entra em `changes`:

| Operação | Registra                                                                     |
| -------- | ---------------------------------------------------------------------------- |
| `CREATE` | banco, agência, tipo, **máscara** da conta e do PIX, se o titular é terceiro |
| `UPDATE` | só os campos enviados; sensíveis viram a **máscara nova**                    |
| `READ`   | quais campos foram revelados — nunca o conteúdo                              |

Nunca entram: número de conta, chave PIX, CPF do titular. `BankAccount` foi
deixado **de fora** de `AUDITED_MODELS` (a extensão genérica do Prisma) de
propósito: ela faz diff de todos os campos, e jogaria texto cifrado no log.

## Validações

Formato por campo fica no DTO; o que depende de outro campo fica no service,
sobre `bank-account.util.ts` (puro, testável sem banco).

- Banco: 3 dígitos (COMPE). **Não há tabela de bancos** e nenhuma foi criada —
  manter lista oficial é trabalho recorrente, e a conferência de verdade
  acontece no banco na hora de pagar. O nome vem digitado junto.
- Agência 1–6 dígitos, conta 1–20 dígitos, dígito verificador aceita `X`.
- PIX: tipo e chave andam juntos; a chave é normalizada (só dígitos, minúsculas)
  antes de validar, para a mesma chave digitada de dois jeitos não virar duas.
- **CPF e CNPJ de chave PIX e de titular conferem o dígito verificador**, ao
  contrário do documento de fornecedor (que chega assinado da SEFAZ e só tem o
  comprimento conferido). Motivo concreto: celular sem DDI tem os mesmos 11
  dígitos de um CPF — sem o módulo 11 não haveria como separar os dois.

Nenhuma mensagem de erro repete o valor recebido: mensagem de validação
atravessa log de proxy, tela de erro e print de suporte.

## Edição e remoção

Na edição o campo da conta **nasce vazio** e em branco significa "manter o que
está gravado" — a tela nunca recebeu o número, então não teria como preenchê-lo.
String vazia **apaga** o bloco: `pixKey: ''` remove a chave, `holderName: ''`
devolve a titularidade ao dono. Sem essa convenção não haveria como apagar uma
chave PIX, porque campo ausente é indistinguível de campo que o formulário não
enviou.

O **dono não é editável**. Mudar a conta de pessoa não é corrigir cadastro: é
dizer que outra pessoa recebe naquele destino, e o registro perderia o rastro de
quem já foi pago ali. Errou o titular? Desativa e cadastra a certa.

**Não existe exclusão** — nem endpoint, nem `deletedAt`. Conta que já pagou
alguém é histórico financeiro. Desativar preserva a linha; a conta inativa
continua listada, depois das ativas.

## Multi-empresa

Toda consulta leva `companyId`; não há leitura por `id` sozinho. Antes de
qualquer escrita, o **titular é conferido dentro da mesma empresa** — sem isso
bastaria conhecer o id de um usuário da outra empresa para pendurar uma conta
nele. Há teste para os dois lados (`bank-accounts.service.spec.ts`).

## Decisões pendentes do cliente

1. **Quem, além do Administrador, pode ver dados bancários.** Nenhuma regra foi
   inventada. Atribuir as permissões a um perfil é um clique em
   Configurações → Perfis, sem mudar código.
2. **Autoatendimento.** O sistema não tem hoje nenhum caso de usuário editando o
   próprio cadastro (além da senha), então o colaborador **não** edita a própria
   conta. Definir isso é decisão do cliente.
3. **Funcionário e terceirizado.** O modelo já os sustenta; falta a tela em RH e
   em Terceiros. Fornecedor (o "destino do pagamento" da auditoria) continua sem
   conta bancária — `Supplier` não é dono no arco atual e entraria como quarta
   coluna quando for a hora.

## Arquivos

**API**

- `prisma/schema.prisma` — `BankAccount`, `BankAccountType`, `PixKeyType`, `AuditAction.READ`
- `prisma/migrations/20260824120000_dados_bancarios/`
- `src/common/crypto/encryption-vault.ts`
- `src/common/utils/document.util.ts` — `hasValidCheckDigits`
- `src/administracao/bank-accounts/` — controller, service, cofre, util, DTOs, 2 specs
- `src/common/tenancy/default-roles.ts`, `src/config/env.validation.ts`,
  `src/configuracoes/audit-logs/audit-log-modules.constant.ts`, `src/app.module.ts`

**Web**

- `src/features/administracao/` — `types.ts`, `api.ts`, 2 hooks, schema do formulário,
  `components/bank-accounts-section.tsx`, `components/bank-account-form-drawer.tsx`
- `src/pages/administracao/usuario-detail-page.tsx`
- `src/features/configuracoes/` — rótulos de módulo e da ação `READ`

**Infra**

- `docker/docker-compose.prod.yml` — `BANK_DATA_ENCRYPTION_KEY`
