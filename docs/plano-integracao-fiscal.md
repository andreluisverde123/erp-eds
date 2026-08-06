# Plano — Integração Fiscal, próximos passos

Continuação do que foi entregue entre 03/08 e 06/08/2026: Distribuição DF-e,
importação inteligente e conciliação com os dois caminhos (com e sem ordem de
compra). Este documento organiza o que ficou pendente.

**Estado em 06/08/2026, em staging:** certificado A1 instalado e funcionando,
job horário de download ativo, job de importação a cada 5 min, ~2.500
documentos baixados e sendo convertidos em notas (zero falhas de parsing).
Nada em produção. Branch `feat/fiscal-e-primeiro-acesso`, 10 commits à frente
da `main`.

Legenda de esforço: **P** = até meio dia · **M** = 1 a 2 dias · **G** = 3 dias ou mais.

---

## Fase 1 — Provar o ciclo completo com dado real

Tudo foi verificado por partes; **o ciclo inteiro nunca rodou de ponta a ponta
com uma nota de verdade**. É a fase que ainda pode revelar surpresa — as
demais são escala e polimento.

| #   | Item                                                                                                                                                                                                                             | Onde                          | Esforço |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- | ------- |
| 1.1 | **Cadastrar um fornecedor e um centro de custo** em staging. Bloqueio real: `Invoice.supplierId` é obrigatório, então a conciliação recusa emitente não cadastrado. Escolher um recorrente da fila (BRB, PERIN 4V, PAU BRASIL). | telas de Compras e Engenharia | P       |
| 1.2 | **Conciliar uma nota pelo caminho "Sem ordem (balcão)"** e conferir se a conta a pagar nasce com valor, vencimento e parcelas corretos.                                                                                          | Conciliação de Notas          | P       |
| 1.3 | **Conciliar uma nota COM ordem de compra** — exige criar uma OC antes. Valida a sugestão automática, o saldo em aberto e a divergência.                                                                                          | Compras + Conciliação         | P       |
| 1.4 | **Conferir uma nota cancelada** na fila: deve aparecer marcada e não permitir conciliação.                                                                                                                                        | Conciliação                   | P       |

---

## Fase 2 — Decisões de produto pendentes

Nenhuma é bloqueante; todas mudam o trabalho diário de quem usa.

| #   | Item                                                                                                                                                                                                                                                                                | Esforço |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| 2.1 | **Criar fornecedor automaticamente a partir da NF-e?** Evita o cadastro manual (98 emitentes distintos), mas enche o cadastro com posto, supermercado e compra avulsa. Decidir depois de ver a fila cheia. Se sim: criar só no ato da conciliação, não na importação.              | P       |
| 2.2 | **Botão "Importar agora" no painel de Integração Fiscal.** Hoje só existe o endpoint `POST /admin/fiscal-integration/import`. Ficou de fora porque a sprint pedia para estender a tela de Conciliação, não a de Integração.                                                        | P       |
| 2.3 | **Exibir o log de importação** no painel, ao lado do histórico de sincronização. Os dados já existem em `FiscalImportLog`; falta a tela.                                                                                                                                          | P       |
| 2.4 | **Permitir baixar o XML original?** A sprint pediu explicitamente que o financeiro não o veja. Mas o XML tem valor legal e o contador pode precisar dele numa contestação. Talvez: não exibir na tela, permitir download por quem tem permissão fiscal.                            | P       |

---

## Fase 3 — Produção

O caminho é o mesmo de staging, com três diferenças que precisam de atenção.

| #   | Item                                                                                                                                                                                                                                                          | Esforço |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 3.1 | **Chave de criptografia PRÓPRIA** (`FISCAL_CERT_ENCRYPTION_KEY`). Nunca reaproveitar a de staging. Guardar cópia junto das demais credenciais: perdê-la torna o certificado gravado ilegível e exige reenviar o `.pfx`.                                     | P       |
| 3.2 | **Subir o certificado A1 de novo** pelo painel — ele vive cifrado no banco de cada ambiente, não viaja junto do deploy.                                                                                                                                        | P       |
| 3.3 | **Rodar o seed do catálogo** para criar a permissão `admin.fiscal_integration`, e marcá-la no perfil Administrador pela tela de Perfis. O seed cria a permissão mas não a atribui a ninguém.                                                                    | P       |
| 3.4 | **Decidir `FISCAL_SYNC_ENABLED`.** Ligado em produção; **desligado** em qualquer cópia local do banco de produção — senão duas instâncias consultam a SEFAZ com o mesmo certificado.                                                                          | P       |

---

## Fase 4 — Dívida técnica

| #   | Item                                                                                                                                                                                                                                                                                                                        | Esforço |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 4.1 | **Testes do parser de NF-e.** Cinco sprints de código fiscal sem um teste automatizado. O parser é lógica pura, sem I/O — o candidato mais fácil e o lugar onde um XML fora do padrão vai machucar. Guardar alguns XMLs reais anonimizados como fixture.                                                                | M       |
| 4.2 | **Desempenho da importação** — ~370ms por documento. A causa é distância: cinco idas e voltas ao Neon por documento. Duas correções: carregar os fornecedores uma vez por lote (hoje são N consultas que quase sempre voltam vazias) e juntar as duas transações em uma. Não é urgente: a fila se esvazia sozinha.        | P       |
| 4.3 | **Fechar o branch.** `feat/fiscal-e-primeiro-acesso` com 10 commits nunca foi para a `main`.                                                                                                                                                                                                                                | P       |
| 4.4 | **Alerta de expiração do certificado.** O painel mostra os dias restantes, mas ninguém olha o painel todo dia. Um A1 vale 12 meses e, vencido, a integração para sem aviso. O da EDS vence em **06/02/2027**.                                                                                                                | P       |
| 4.5 | **Rever a mensagem de "bloqueio" no painel.** Hoje a tela diz "Consultas bloqueadas pela SEFAZ" também quando é a janela preventiva do próprio sistema — foi o que levou a crer, em 06/08, que a SEFAZ havia bloqueado a integração. A mensagem precisa distinguir bloqueio real (`cStat 656`) de espera preventiva.                                                                             | P       |
| 4.6 | **Expurgo de `FiscalDocument`.** Os XMLs ficam no banco (~10 KB cada). Guarda legal são 5 anos; depois disso, decidir entre apagar ou mover para storage. Não é problema hoje (2.500 documentos ≈ 25 MB), vira um em alguns anos.                                                                                        | P       |

---

## Perguntas em aberto

**Quem mais consulta a DF-e deste CNPJ?** Havia 50.485 NSUs consumidos antes
da nossa primeira consulta — alguém já lia esse fluxo, provavelmente o
contador. Deixou de ser bloqueante quando se confirmou que cada consumidor
mantém o próprio cursor (pedimos a partir do 50.485 e recebemos normalmente).
O que é compartilhado é o **limite de consumo**, e o código já se contém. Vale
saber por organização, não por risco.

**O módulo de Compras vai ser usado?** A conciliação com ordem de compra só
faz sentido se as ordens existirem no ERP. Se a compra de balcão for a regra,
o caminho "sem ordem" é o principal e o outro vira exceção — o que muda onde
vale investir daqui pra frente.

---

## O que NÃO fazer

**Validação de assinatura XMLDSig.** Foi deliberadamente deixada de fora: o
documento vem da SEFAZ por mTLS e traz o protocolo de autorização, que é
registrado em `protocolNumber`. Implementar exigiria canonicalização C14N,
cadeia ICP-Brasil e checagem de revogação, sem biblioteca madura em Node —
dias de trabalho para reconfirmar algo que a origem já garante.

**Rejeitar chave de acesso duplicada.** Parece proteção e é o contrário: a
mesma nota chega DUAS vezes (resumo e depois documento completo, em NSUs
diferentes). Medido: 983 de ~1.000 chaves. Rejeitar a segunda deixaria toda
nota permanentemente sem itens. A regra correta é upgrade por chave, que é o
que está implementado.
