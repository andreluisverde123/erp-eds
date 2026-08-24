# Conciliação: NF-e × Ordem de Compra

Como a Conciliação liga a nota recebida à compra e ao Financeiro, depois da
evolução de 23/08/2026. Complementa `docs/plano-integracao-fiscal.md` (captura)
e `docs/ordem-de-compra.md` (o que a ordem passou a ter).

## O que já existia e foi preservado

Sugestões pontuadas, escolha manual de qualquer ordem em aberto, caminho sem
ordem de compra (balcão), divergência de valor com aceite explícito, geração
parcelada de contas a pagar, filtros da listagem, auditoria e isolamento por
empresa. **Nada disso foi reescrito.**

## O que mudou

### 1. A comparação agora é por ITEM

Antes, a conferência era só de valor total: a ordem não tinha itens próprios, e
o que a tela mostrava vinha da *solicitação* (o que foi **pedido**, com preço
estimado). Agora existe o que foi **comprado**, com quantidade e preço
negociados — e é esse o lado certo para conferir contra a nota do fornecedor.

### 2. Camada de compatibilidade explícita

`compatibility.util.ts` — pura, sem Prisma, sem I/O. Produz cinco verificações
com três resultados possíveis:

| Verificação | Regra |
| --- | --- |
| **Fornecedor** | Compara o vínculo de cadastro; cai no CNPJ quando a nota ainda não foi ligada a um fornecedor. |
| **Valor** | Nota × **saldo em aberto** da ordem (não o total dela), em `Decimal`. Tolerância de 1 centavo. |
| **Itens** | Casamento por semelhança de descrição; compara quantidade, unidade, valor unitário e total. |
| **Obra** | Sempre `UNKNOWN` — ver abaixo. |
| **Data** | Auxiliar. **Nunca** marca divergência. |

`UNKNOWN` não é falha: é ausência de informação. A nota que só chegou como
resumo não tem itens; a ordem emitida antes da estrutura de itens não tem
itens. Tratar isso como divergência acusaria o que não se sabe.

**Sobre a obra**: a NF-e **não carrega obra** — não existe esse campo no
documento fiscal nem em `InboundInvoice`. A obra é o que a conciliação
**define** (vindo da ordem), não o que ela confere. Marcar `MATCH` ali seria
afirmar uma conferência que não aconteceu.

### 3. Casamento de itens — determinístico, sem IA

1. Normaliza a descrição: tira acento, caixa e pontuação.
2. Tokeniza e remove palavras vazias (`de`, `da`, `com`, `un`…).
3. **Coeficiente de Dice** sobre as palavras: `2·|A∩B| / (|A|+|B|)`.
4. Limiar de 0,5. Abaixo disso, não casa.
5. Guloso e estável: para cada linha da **ordem** (o pedido aprovado é o lado
   que manda), pega a linha ainda não usada da nota com maior semelhança.

Dice em vez de distância de edição porque a diferença entre "CIMENTO CP II 50KG"
e "Cimento CP-II 50kg ensacado" é de **palavras** inteiras, não de letras.

O que não casou é reportado dos dois lados: `ONLY_IN_INVOICE` (material cobrado
sem pedido — o que mais importa ao financeiro) e `ONLY_IN_ORDER` (pedido que
não veio).

### 4. Itens entram no score das sugestões

Antes: 70% valor + 30% data. Agora, **quando há itens comparáveis**: 50% valor
+ 30% itens + 20% data. Sem itens comparáveis, volta ao par original — assim
nenhuma ordem antiga é rebaixada por não ter um dado que não tinha como ter.

Isso resolve o caso real: duas ordens do mesmo fornecedor, mesmo valor, mesma
data. Só os itens as distinguem.

### 5. Auditoria com o que estava divergente

O registro passou a incluir `withoutPurchaseOrder` (explícito, não deduzido de
um campo nulo), `divergences` (a lista em texto), `divergenceAccepted`,
`supplierId`, `constructionSiteId` e `amountAccepted`.

## NF sem ordem de compra

Continua sendo o caminho que já existia: marcar "Sem ordem (balcão)", informar
o centro de custo, e a conciliação cria a `Invoice` + as parcelas. A auditoria
agora registra `withoutPurchaseOrder: true` de forma explícita.

**Não** foi criado caminho paralelo, e a Conta a Pagar avulsa do Prompt 4 não é
usada aqui: aquela existe para despesa **sem documento fiscal nenhum**. Uma
NF-e recebida tem documento, e ele precisa virar `Invoice` para a nota ficar
rastreável. Usar o lançamento avulso perderia o vínculo com o XML capturado.

## Conta a Pagar

Inalterado. A conciliação cria a `Invoice` já `VALIDATED` e as parcelas numa
transação única, com `origin = INVOICE`. Duplicidade é impedida pelo status:
`RECONCILABLE_STATUSES` só aceita `PENDING`, então uma nota conciliada não gera
segunda conta.

## Status

Nenhum status novo. O fluxo é `PENDING → RECONCILED | DIVERGENT | CANCELLED`.

**"Em Análise" não foi criado.** Analisar é o que acontece com a tela aberta;
não há transição que alguém dispare nem informação que se perca sem ele. Um
status que ninguém escreve só adiciona um valor a todo filtro, badge e
transição. Se o objetivo for evitar que dois usuários do Financeiro trabalhem a
mesma nota, isso é atribuição/trava — e é outra funcionalidade.

**Divergência de item NÃO bloqueia.** A regra de bloqueio continua sendo só a
de valor, que é a que já existia. Transformar divergência de item em
impedimento seria criar regra nova — e o pedido é que o usuário autorizado
decida. A divergência é mostrada, registrada na auditoria, e a decisão é humana.

## Endpoints

| Método | Rota | Permissão | Mudança |
| --- | --- | --- | --- |
| `GET` | `/inbound-invoices/:id/suggestions` | `financeiro.view` | passa a trazer `compatibility` e os itens da OC |
| `GET` | `/inbound-invoices/:id/compare/:purchaseOrderId` | `financeiro.view` | **novo** — comparação com ordem escolhida à mão |
| `POST` | `/inbound-invoices/:id/reconcile` | `financeiro.manage` | inalterado no contrato; auditoria enriquecida |

Nenhuma permissão nova.

## Desfazer conciliação — não implementado

O sistema **não** permite desfazer. `reconciledAt`, `purchaseOrderId` e
`invoiceId` são gravados e nunca mais alterados; `cancel` só vale antes de
conciliar. Conforme o escopo desta etapa, não foi implementado.

**Fica registrado como necessidade futura:** conciliar na ordem errada é um erro
humano provável, e hoje a única saída é o Financeiro tratar a conta a pagar
gerada. Desfazer exigiria decidir o que fazer com a `Invoice` e as parcelas já
criadas — e se houver pagamento registrado, provavelmente não deve ser possível.

## IA — não implementada

Nenhum modelo, nenhuma inferência, nenhum "grau de confiança" aprendido. Toda a
comparação é aritmética de `Decimal` e sobreposição de palavras. O mesmo par
nota/ordem produz sempre exatamente o mesmo relatório, e cada divergência pode
ser explicada linha a linha — que é o requisito de um documento que vira dívida.
