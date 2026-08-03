# ERP EDS — Regras de Negócio

Regras que o sistema **impõe** hoje. Cada uma existe no código e é aplicada
pela API; nenhuma depende da interface para valer.

Este documento é a referência de comportamento da EDS. Onde uma regra tem
número (dias, valor, prefixo), o número está aqui e o arquivo que o define está
indicado. Ao mudar o código, mude este documento junto.

**Como ler:** onde estiver escrito "a API recusa", entenda que a tela também
esconde ou desabilita a ação — mas a recusa que conta é a da API. A interface
nunca é a autoridade.

---

## 1. Regras gerais

Valem para todos os módulos.

| #    | Regra                                                                                                                                                | Onde                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| G-1  | Nenhum registro é apagado do banco. Excluir grava `deletedAt`; o registro some das listas e vai para a Lixeira.                                      | `common/utils/soft-delete.util.ts`     |
| G-2  | Ao excluir um registro com código único, o código é "sujo" com `__deleted__<id>` para liberar o valor para reuso imediato. Restaurar limpa o sufixo. | `common/utils/soft-delete.util.ts`     |
| G-3  | Restaurar é recusado se alguém já reaproveitou o código no intervalo. O sistema não sobrescreve o registro novo.                                     | `trash/trash.service.ts`               |
| G-4  | A Lixeira mostra os 25 excluídos mais recentes por tipo. É para desfazer engano, não para navegar histórico.                                         | `trash/trash.service.ts`               |
| G-5  | Ver um item na Lixeira exige `<módulo>.view`; restaurar exige `<módulo>.manage`. Sem `manage`, o item aparece com o botão desabilitado — não some.   | `trash/trash.service.ts`               |
| G-6  | Toda criação, alteração e exclusão é registrada em `AuditLog` automaticamente, por extensão do Prisma. Não depende de o service lembrar de chamar.   | `prisma/prisma.service.ts`             |
| G-7  | Códigos sequenciais são por empresa e por tipo: `SOL-0001` (solicitação), `OC-0001` (ordem de compra), `CT-0001` (contrato).                         | `common/utils/sequential-code.util.ts` |
| G-8  | Consultar um módulo exige `<módulo>.view`; criar, editar ou excluir exige `<módulo>.manage`.                                                         | `auth/guards/permissions.guard.ts`     |
| G-9  | Senha definida por administrador nasce temporária. Até a troca, a API recusa **todas** as rotas e a interface prende o usuário em "Trocar senha".    | `auth/guards/password-change.guard.ts` |
| G-10 | Arquivo nunca é servido publicamente. Baixar um anexo exige a mesma permissão que protege o registro dono do arquivo.                                | `files/`                               |
| G-11 | Usuário inativo não entra, mesmo com senha correta.                                                                                                  | `auth/auth.service.ts`                 |

---

## 2. Papéis e permissões

### 2.1 As 16 permissões

Cada módulo tem `view` (consultar) e `manage` (criar, editar, excluir). Três
permissões fogem desse par e existem por motivo específico.

| Código               | O que libera                                                   |
| -------------------- | -------------------------------------------------------------- |
| `dashboard.view`     | Home, busca global e Processos                                 |
| `engenharia.view`    | Consultar obras e centros de custo                             |
| `engenharia.manage`  | Criar, editar e excluir obras e centros de custo               |
| `compras.view`       | Consultar solicitações, ordens de compra e fornecedores        |
| `compras.request`    | **Abrir solicitação de compra** — pedir, sem conduzir a compra |
| `compras.manage`     | Cotar, aprovar, emitir ordem, manter fornecedor                |
| `compras.approve`    | **Aprovar acima da alçada** de valor                           |
| `financeiro.view`    | Consultar notas, contas a pagar e pagamentos                   |
| `financeiro.manage`  | Lançar nota, conta e pagamento                                 |
| `financeiro.approve` | **Registrar pagamento acima da alçada**                        |
| `rh.view`            | Consultar funcionários, ponto, produção e holerites            |
| `rh.manage`          | Manter funcionários, ponto, produção e holerites               |
| `terceiros.view`     | Consultar terceirizados e contratos                            |
| `terceiros.manage`   | Manter terceirizados, contratos e documentos                   |
| `relatorios.view`    | Abrir e exportar relatórios                                    |
| `admin.manage_users` | Configurações inteira: usuários, papéis, empresa, auditoria    |

**Por que `compras.request` existe separada.** Quem **pede** não é quem
**compra**. A Engenharia abre a solicitação e manda para Compras, mas não cota,
não aprova, não emite ordem e não mexe em fornecedor. Sem essa permissão, dar à
Engenharia a capacidade de solicitar exigiria dar `compras.manage` — e junto
viria o poder de aprovar a própria compra.

### 2.2 Os 6 papéis

Criados em toda instalação. Podem ser editados na tela de Papéis; o que está
aqui é como nascem.

| Papel             | Permissões                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Administrador** | Todas as 16. Único com Configurações.                                                                               |
| **Engenharia**    | `engenharia.*`, `terceiros.*`, `compras.view`, `compras.request`                                                    |
| **Compras**       | `compras.view/.request/.manage`, `engenharia.view`                                                                  |
| **Financeiro**    | `financeiro.view/.manage`, `compras.view`                                                                           |
| **RH**            | `rh.view/.manage`, `engenharia.view`                                                                                |
| **Diretoria**     | Todos os módulos operacionais em view+manage, mais `compras.approve` e `financeiro.approve`. **Sem** Configurações. |

Todos incluem `dashboard.view` e `relatorios.view`.

**As dependências cruzadas não são cortesia.** Compras precisa de
`engenharia.view` porque a solicitação exige escolher centro de custo.
Financeiro precisa de `compras.view` porque a nota fiscal é lançada a partir de
uma ordem de compra. RH precisa de `engenharia.view` porque alocar funcionário e
apontar produção exigem escolher a obra. Retirar qualquer uma quebra um
formulário do dia a dia.

### 2.3 Regras de autorização

| #   | Regra                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| P-1 | Papéis são da empresa e editáveis. O catálogo de permissões é do sistema e fixo — a tela de Papéis combina permissões existentes, não cria novas. |
| P-2 | Um usuário pode ter mais de um papel; as permissões somam.                                                                                        |
| P-3 | Quando uma rota exige várias permissões, são exigidas **todas** (E, não OU).                                                                      |
| P-4 | `SUPER_ADMIN` não é oferecido na criação de papéis. Nunca concedeu alcance além da própria empresa e prometia poder inexistente.                  |
| P-5 | A checagem de permissão no front é cosmética — evita anunciar tela inacessível. A autorização real é sempre a da API.                             |

---

## 3. Alçada de aprovação

Regra transversal a Compras e Financeiro. Definida em Configurações → Sistema.

| #   | Regra                                                                                                                                           |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A-1 | Dois limites independentes: `purchaseApprovalThreshold` (compras) e `paymentApprovalThreshold` (pagamentos).                                    |
| A-2 | Limite `0` significa **alçada desligada** — comportamento padrão, nenhuma exigência extra.                                                      |
| A-3 | Acima de zero: aprovar solicitação de valor **maior** que o limite exige `compras.approve` **além** de `compras.manage`. Igual ao limite passa. |
| A-4 | Mesma regra para pagamento, com `financeiro.approve`.                                                                                           |
| A-5 | A alçada é de **um nível só**. Não há cadeia de aprovadores nem escalonamento.                                                                  |

Definido em `common/approval/approval-threshold.service.ts`.

---

## 4. Engenharia

| #   | Regra                                                                                    |
| --- | ---------------------------------------------------------------------------------------- |
| E-1 | Obra tem código único por empresa. Duplicar é recusado.                                  |
| E-2 | Status da obra: `PLANNING`, `IN_PROGRESS`, `PAUSED`, `COMPLETED`, `CANCELLED`.           |
| E-3 | Centro de custo pertence a uma obra. Não existe centro de custo solto.                   |
| E-4 | Centro de custo tem código único por empresa.                                            |
| E-5 | Obra e centro de custo excluídos vão para a Lixeira e liberam o código para reuso (G-2). |

---

## 5. Compras

### 5.1 Ciclo da solicitação

```
DRAFT ──▶ PENDING ──▶ QUOTING ──▶ APPROVED
  │          │           │            │
  └──────────┴───────────┴────────────┴──▶ CANCELLED  (terminal)
```

| #    | Regra                                                                                                                     |
| ---- | ------------------------------------------------------------------------------------------------------------------------- |
| C-1  | O fluxo é linear e só anda para frente. Voltar status é recusado.                                                         |
| C-2  | `CANCELLED` é alcançável de qualquer estado não-terminal, e é terminal: de lá não se sai.                                 |
| C-3  | `QUOTING` é rótulo de estágio. Não há cotação múltipla com comparativo de fornecedores.                                   |
| C-4  | A solicitação só é editável em `DRAFT`. Depois de enviada, o conteúdo está congelado.                                     |
| C-5  | O solicitante (`compras.request`) faz sozinho duas transições, e só a partir do rascunho: enviar para Compras e cancelar. |
| C-6  | Da `PENDING` em diante, quem conduz é `compras.manage`.                                                                   |
| C-7  | Aprovar acima da alçada exige `compras.approve` (A-3).                                                                    |
| C-8  | Total estimado = soma de (quantidade × preço unitário estimado) dos itens. Item sem preço entra como zero.                |
| C-9  | Código `SOL-0001`, sequencial por empresa.                                                                                |
| C-10 | A obra é opcional na solicitação; o centro de custo é o vínculo que importa.                                              |

Definido em `compras/purchase-requests/purchase-requests.service.ts`.

### 5.2 Ordem de compra

| #    | Regra                                              |
| ---- | -------------------------------------------------- |
| C-11 | Status: `OPEN`, `ISSUED`, `RECEIVED`, `CANCELLED`. |
| C-12 | Código `OC-0001`, sequencial por empresa.          |
| C-13 | Emitir e alterar ordem exige `compras.manage`.     |

### 5.3 Fornecedores

| #    | Regra                                                                             |
| ---- | --------------------------------------------------------------------------------- |
| C-14 | CNPJ é único por empresa.                                                         |
| C-15 | Manter fornecedor exige `compras.manage` — Engenharia consulta, mas não cadastra. |

---

## 6. Financeiro

O encadeamento é fixo: **ordem de compra → nota fiscal → conta a pagar →
pagamento**. Cada elo aponta para o anterior.

### 6.1 Nota fiscal

| #   | Regra                                                                         |
| --- | ----------------------------------------------------------------------------- |
| F-1 | Status: `RECEIVED`, `VALIDATED`, `CANCELLED`.                                 |
| F-2 | Editável apenas em `RECEIVED`. Depois de validada, o conteúdo está congelado. |
| F-3 | Número da nota é único por empresa.                                           |
| F-4 | A ordem de compra referenciada precisa existir e pertencer à empresa.         |

### 6.2 Conta a pagar

| #    | Regra                                                                                                            |
| ---- | ---------------------------------------------------------------------------------------------------------------- |
| F-5  | Status: `OPEN`, `PARTIAL`, `PAID`, `CANCELLED`.                                                                  |
| F-6  | O status **não é digitado** — é recalculado a cada pagamento, a partir da soma dos pagamentos com status `PAID`. |
| F-7  | Soma `0` → `OPEN`; soma menor que o total → `PARTIAL`; soma maior ou igual ao total → `PAID`.                    |
| F-8  | Editável apenas enquanto está em aberto, sem nenhum pagamento registrado.                                        |
| F-9  | Pagamento excluído dispara o recálculo: a conta pode voltar de `PAID` para `PARTIAL` ou `OPEN`.                  |
| F-10 | Alerta de vencimento usa `dueDateAlertDays` (padrão **7 dias**), configurável em Configurações → Sistema.        |

### 6.3 Pagamento

| #    | Regra                                                                         |
| ---- | ----------------------------------------------------------------------------- |
| F-11 | Toda parcela pertence a uma conta a pagar existente. Não há pagamento avulso. |
| F-12 | Registrar pagamento em conta cancelada é recusado.                            |
| F-13 | Pagamento acima da alçada exige `financeiro.approve` (A-4).                   |
| F-14 | Pagamento parcial é permitido — é o que produz o status `PARTIAL`.            |

---

## 7. RH

| #   | Regra                                                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------- |
| R-1 | Funcionário (`Employee`) e usuário do sistema (`User`) são coisas distintas. Nem todo funcionário tem login.          |
| R-2 | Alocação liga funcionário a **obra e centro de custo**.                                                               |
| R-3 | O centro de custo da alocação precisa pertencer à obra escolhida. Combinação inconsistente é recusada.                |
| R-4 | Apontamento de ponto exige funcionário e obra existentes na empresa.                                                  |
| R-5 | Apontamento de produção segue a mesma exigência de vínculo com obra.                                                  |
| R-6 | Holerite é **documento anexado**, não folha calculada. O sistema guarda e controla o acesso; o cálculo acontece fora. |
| R-7 | Baixar holerite exige `rh.view` — o arquivo passa pelo controle de permissão como qualquer anexo (G-10).              |

---

## 8. Terceirizados

O código e as permissões usam `terceiros`; o rótulo que o usuário lê é
"Terceirizados". Chave e rótulo são coisas diferentes de propósito.

| #   | Regra                                                                                                                        |
| --- | ---------------------------------------------------------------------------------------------------------------------------- |
| T-1 | Contrato tem data de início e fim. Fim anterior ao início é recusado.                                                        |
| T-2 | Código `CT-0001`, sequencial por empresa, único.                                                                             |
| T-3 | A situação exibida (Vigente / Vencendo / Vencido / Encerrado) **nunca é armazenada** — é derivada de `status` + data de fim. |
| T-4 | Vencido: data de fim anterior a hoje.                                                                                        |
| T-5 | Vencendo: data de fim dentro dos próximos **30 dias**.                                                                       |
| T-6 | Encerrado: cancelamento manual. Prevalece sobre a data.                                                                      |
| T-7 | A Home mostra alerta de contratos vencendo, na mesma janela de 30 dias.                                                      |
| T-8 | Documentos de contrato e funcionários vinculados pertencem ao contrato e seguem sua permissão.                               |

Definido em `terceiros/contracts/contract-status.util.ts`.

---

## 9. Processos, busca e anexos

| #   | Regra                                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| W-1 | Comentário e histórico existem sobre registros de Compras, Financeiro e RH.                                                                                   |
| W-2 | Ver o histórico de um registro exige a permissão de consulta do módulo dono.                                                                                  |
| W-3 | A busca global só devolve resultados dos módulos que o usuário pode consultar.                                                                                |
| W-4 | A busca usa índice trigram (`pg_trgm`) e tolera erro de digitação.                                                                                            |
| W-5 | Anexo herda a permissão do módulo dono do registro. **Consequência conhecida:** quem abre solicitação sem `compras.manage` pode não conseguir anexar arquivo. |
| W-6 | Tamanho máximo de upload: `maxUploadSizeMb`, padrão **10 MB**, configurável.                                                                                  |
| W-7 | Anexos podem ser desligados por completo (`allowAttachments`).                                                                                                |

---

## 10. Configurações

| #   | Regra                                                                                                             |
| --- | ----------------------------------------------------------------------------------------------------------------- |
| S-1 | A tela inteira exige `admin.manage_users`. Só o Administrador a enxerga.                                          |
| S-2 | O nome do sistema (`erpName`) e o logo são editáveis e têm precedência sobre a configuração central da aplicação. |
| S-3 | Auditoria pode ser desligada (`auditEnabled`). Desligada, `AuditLog` deixa de receber registros.                  |
| S-4 | Padrões: fuso `America/Sao_Paulo`, idioma `pt-BR`, moeda `BRL`, data `DD/MM/YYYY`, semana começa no domingo.      |
| S-5 | Preferências de notificação são **gravadas mas não disparam nada**. Nenhum envio real existe em nenhum canal.     |

---

## 11. O que a EDS decidiu não ter

Ausências deliberadas. Estão aqui para que ninguém as implemente por engano
achando que é lacuna.

| Ausência                                | Por quê                                                 |
| --------------------------------------- | ------------------------------------------------------- |
| Auto-cadastro de empresa                | Uma empresa só. Acesso é concedido por administrador.   |
| Planos, cobrança, limite de uso         | Sistema proprietário, não vendido.                      |
| Administração entre empresas            | Não há segunda empresa a administrar.                   |
| Marca configurável por cliente          | A marca é a da EDS, fixa.                               |
| Aprovação em vários níveis              | Alçada de um nível atende o fluxo atual.                |
| Cotação com comparativo de fornecedores | `QUOTING` é rótulo de estágio; a cotação acontece fora. |
| Folha de pagamento calculada            | O cálculo é externo; o sistema guarda o holerite.       |

---

## 12. Ao mudar uma regra

1. Mude o código.
2. Mude a linha correspondente aqui, incluindo o número.
3. Se a regra criou permissão nova, registre em
   `src/common/tenancy/default-roles.ts` — fonte única do catálogo e dos papéis.
4. Se mudou estrutura de banco, gere migration. Nunca edite migration aplicada.

Regra que existe no código e não está neste documento é dívida. Regra que está
aqui e não existe no código é mentira — as duas custam caro.
