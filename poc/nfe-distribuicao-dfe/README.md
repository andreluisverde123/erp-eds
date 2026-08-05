# POC — Distribuição DF-e com Certificado A1

Prova de conceito **isolada**: valida se é tecnicamente viável consultar os
documentos fiscais eletrônicos emitidos **contra o CNPJ da EDS** usando um
certificado digital A1.

> Não faz parte do ERP. Não tem banco, não tem tela, não tem API, não importa
> nada de `apps/` nem de `packages/`. Fica fora dos workspaces npm do
> monorepo (`apps/*`, `packages/*`), então nem `npm install` nem `turbo` na
> raiz a enxergam. Apagar esta pasta não afeta o ERP.

## Uso

```bash
cd poc/nfe-distribuicao-dfe
npm install

npm run doctor      # diagnóstico do ambiente — não precisa de certificado
npm run selftest    # prova o que não depende da SEFAZ — não precisa de certificado

cp .env.example .env    # preencha NFE_PFX_PASSWORD
cp /caminho/do/certificado.pfx certs/

npm run cert                              # titular, CNPJ, validade
npm run distribuicao                      # lote a partir do último NSU
npm run consulta-nsu -- 000000000000042   # um NSU específico
npm run download-chave -- <44 dígitos>    # XML de uma nota
```

Os XMLs vão para `out/`. O último NSU lido fica em `out/_cursor.json`.

## O que a POC faz

```
.pfx (A1)
   │  node-forge — PKCS#12 em JS puro, sem OpenSSL
   ▼
chave privada + certificado + cadeia (PEM, só em memória)
   │  https.request({ key, cert, ca }) — mTLS
   ▼
NFeDistribuicaoDFe (Ambiente Nacional, SOAP 1.2)
   │  distNSU | consNSU | consChNFe
   ▼
retDistDFeInt → loteDistDFeInt → docZip[]
   │  base64 → gunzip
   ▼
XML (resNFe · procNFe · resEvento · procEventoNFe) → out/
```

## Limitações e armadilhas

### 1. PKCS#12 legado x OpenSSL 3 — resolvido

As ACs brasileiras emitem A1 cifrado com **`pbeWithSHA1And40BitRC2-CBC`**.
A partir do OpenSSL 3 esse algoritmo saiu do provider padrão. Verificado nesta
máquina (Node 25.6.1 / OpenSSL 3.6.1) com um `.pfx` gerado com exatamente essa
cifra:

```
tls.createSecureContext({ pfx, passphrase })
  → ERR_CRYPTO_UNSUPPORTED_OPERATION: Unsupported PKCS12 PFX data
```

As saídas descartadas: `--openssl-legacy-provider` (flag de processo inteiro,
enfraquece o runtime todo) e reembalar o `.pfx` com `openssl pkcs12 -legacy`
(intervenção manual a cada renovação, que é anual).

**Escolhido:** `node-forge`, que implementa PKCS#12 em JavaScript puro e lê o
arquivo como ele vem da AC. `npm run selftest` demonstra os dois caminhos lado
a lado.

### 2. Cadeia do servidor — NÃO é problema

A expectativa era precisar instalar as raízes ICP-Brasil no truststore. Medido:
os endpoints da SEFAZ usam hoje certificado da **`AC SERPRO AR46 OV TLS CA
2025`**, que encadeia até uma raiz pública. `socket.authorized === true` com o
truststore padrão do Node, sem configuração nenhuma.

`NFE_INSEGURO` e `NFE_CA_PATH` existem como escape, mas hoje **nenhum dos dois
é necessário** — e `NFE_INSEGURO=true` nunca deve ir para produção.

### 3. Certificado recusado aparece como HTTP 403, não como erro de TLS

Verificado com um certificado autoassinado: o handshake TLS **fecha
normalmente** e a recusa chega como **`HTTP 403` com uma página HTML do IIS**.
Não há `cStat`, não há SOAP Fault. Quem espera um retorno SOAP conclui "recebi
HTML em vez de XML" e vai procurar no lugar errado. A POC detecta e explica.

### 4. Resumo x XML completo — RESOLVIDO em 2026-08-05

**O XML completo chega sozinho, sem Manifestação do Destinatário.** Medido com
o A1 da EDS, em produção, num lote de 7 documentos:

| emitida em | quantidade | schema recebido |
| --- | --- | --- |
| 04/08 (véspera) | 4 | `procNFe_v4.00` — **completo** |
| 05/08 (mesmo dia) | 3 | `resNFe_v1.01` — resumo |

O padrão é temporal, não de manifestação: o resumo aparece minutos após a
autorização, e a nota inteira fica disponível depois — na amostra, no dia
seguinte. Um `procNFe` verificado trouxe emitente, destinatário, **itens com
descrição, quantidade e preço unitário**, assinatura digital e protocolo de
autorização. É tudo o que a Conciliação precisa.

**Consequência de arquitetura:** a MESMA nota aparece duas vezes no fluxo, em
NSUs diferentes — primeiro como resumo, depois como documento completo. A
integração precisa **deduplicar pela chave de acesso** (44 dígitos), não pelo
NSU, e saber substituir um resumo já gravado pelo XML completo que chega
depois. Tratar cada NSU como um documento novo criaria notas duplicadas.

Confirmação pendente: reconsultar amanhã e verificar se as chaves dos NSUs
50490–50492 reaparecem como `procNFe`.

### 4a. A EDS fica em Boa Vista/RR

Descoberto no `<dest>` das notas: município `BOA VISTA`, UF `RR`. O
`cUFAutor` foi corrigido de SP (35) para RR (14). Na prática esse campo só
afeta roteamento interno e a consulta funcionou mesmo errado — mas vale
manter certo.

### 4c. Resumo x XML completo — o que se temia (não se confirmou)

A Distribuição DF-e devolve dois tipos de documento para uma NF-e:

| schema | conteúdo |
| --- | --- |
| `resNFe` | **resumo** — chave, emitente, valor, data. Sem itens. |
| `procNFe` | **XML completo** — o documento fiscal inteiro. |

O resumo chega sozinho. O **XML completo depende da Manifestação do
Destinatário** (evento 210210 "Ciência da Operação", ou 210200 "Confirmação"),
que é uma operação de **escrita** em outro webservice (`RecepcaoEvento`) e está
fora do escopo desta POC.

Consequência direta para a Conciliação de Notas: **só o resumo não basta para
lançar a nota** — ele não tem os itens. O comportamento exato deve ser
confirmado com o certificado real, porque varia com o tempo desde a emissão.

### 4b. O CNPJ da EDS já tem 50.485 NSUs consumidos — medido em 2026-08-05

Primeira consulta real, com o A1 da EDS, enviando `ultNSU=0`. A SEFAZ recusou
com `cStat 656` **e devolveu `ultNSU=000000000050485`**.

Duas conclusões, as duas importantes:

1. **Existe fluxo de DF-e para este CNPJ** — não é uma base vazia. São mais de
   50 mil documentos/eventos já enfileirados.
2. **Outro sistema já consome esse fluxo.** O NSU é um contador por
   destinatário; ele só chega a 50.485 porque alguém já leu até lá —
   provavelmente o software do contador ou uma integração fiscal anterior.

Isso tem uma consequência de projeto: **o NSU é um ponteiro compartilhado, não
privado**. Se o ERP e o sistema do contador consumirem o mesmo fluxo sem
combinar, cada um avança o ponteiro do outro e ambos perdem documentos. Antes
de integrar, é preciso saber quem mais consulta este CNPJ.

Pedir de `ultNSU=0` é interpretado como abuso justamente por isso: é
reprocessar 50 mil documentos que já foram entregues.

### 5. Consumo indevido (cStat 656) — bloqueio de 1 hora

A SEFAZ bloqueia o CNPJ por **1 hora** quando detecta consultas repetidas sem
intervalo. A regra prática:

- `cStat 138` com `ultNSU < maxNSU` → pode chamar de novo imediatamente (está
  paginando um lote legítimo);
- `cStat 137` (nada novo) → **aguardar ~1 hora** antes de consultar de novo;
- `cStat 656` → já bloqueado; qualquer nova tentativa reinicia o relógio.

É a razão pela qual a sincronização precisa de um agendador com estado, e não
de um "consultar agora" na tela.

### 6. A3 não serve

Certificado A3 (token/cartão) tem a chave privada não exportável, exigindo
PKCS#11 e presença física. Para um serviço que roda sozinho, **só A1**.

### 7. O certificado expira em 1 ano

Um A1 vale 12 meses e a renovação não é automática. Vencido, a integração para
sem aviso. `npm run cert` mostra os dias restantes; qualquer versão de produção
precisa alertar com antecedência.

## Segurança

O `.pfx` é a identidade jurídica da empresa: quem o tem com a senha **assina em
nome da EDS**. `certs/` e `.env` estão no `.gitignore`. A chave privada só
existe em memória — a POC nunca a escreve em disco.

Se isto virar produção, o certificado não deve morar no filesystem da aplicação
(ver "Próximos passos" no relatório).
