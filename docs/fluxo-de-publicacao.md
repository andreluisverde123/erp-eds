# Fluxo de publicação: staging → aprovação → produção

Toda alteração, correção ou funcionalidade nova passa primeiro pelo staging.
Ela só chega à produção depois de aprovada lá.

```
  branch de trabalho ──► staging ──(validação + aprovação)──► main
                            │                                   │
                  staging.gestaoeds.com.br              gestaoeds.com.br
                  (Railway: ambiente staging)     (Railway: ambiente production)
```

## Os dois ambientes

|                  | Produção                                                         | Staging                                       |
| ---------------- | ---------------------------------------------------------------- | --------------------------------------------- |
| Branch observada | `main`                                                           | `staging`                                     |
| Endereço         | `gestaoeds.com.br`, `diario.gestaoeds.com.br`                    | `staging.gestaoeds.com.br`                    |
| Banco (Neon)     | branch principal do projeto atual (`ep-purple-hall`)             | branch `staging` do Neon, criada da produção  |
| Arquivos (R2)    | bucket `eds-staging` (o nome é histórico: são os arquivos reais) | bucket próprio de testes                      |
| Segredos JWT     | os atuais                                                        | **novos e diferentes** dos da produção        |
| Sync fiscal      | `FISCAL_SYNC_ENABLED=true`, se houver certificado                | **sempre `false`**                            |
| Faixa no topo    | nenhuma                                                          | `VITE_ENVIRONMENT_LABEL="AMBIENTE DE TESTES"` |

Algumas dessas diferenças protegem a produção e não podem ser relaxadas:

- **JWT diferente.** O banco de staging é uma cópia, com os mesmos IDs de
  usuário. Com o mesmo segredo, um token emitido no staging seria aceito na
  produção.
- **Sync fiscal desligado.** O certificado é o mesmo. Um staging consultando a
  SEFAZ avança o NSU compartilhado, e a produção perde documentos.
- **Bucket separado.** Excluir um anexo no staging apagaria o arquivo real.
  Anexos antigos aparecem quebrados no staging, e isso é esperado.
- **Faixa amarela.** Os usuários conhecem o endereço antigo. A faixa evita que
  lancem dado real onde ele não vale.

## O ciclo de uma alteração

1. **Desenvolver e validar localmente.** Lint, testes e build passando, e a
   migration aplicada no Postgres local.
2. **Publicar no staging.**
   - Se houver migration: `npm run migrate:staging --workspace api`
     **antes** do push.
   - Depois: `git push origin HEAD:staging`. O Railway rebuilda o staging.
3. **Validar no staging.** Smoke test e conferência da funcionalidade, com o
   dado copiado da produção.
4. **Aprovação.** Registrada por quem responde pelo produto. Sem ela, nada
   segue.
5. **Publicar na produção.**
   - Se houver migration: `npm run migrate:production --workspace api`
     **antes** da promoção.
   - Depois: `git push origin staging:main`. É um fast-forward, e o que vai
     para a produção é exatamente o que foi aprovado.
6. **Smoke test na produção.**

Regras:

- **Nada vai direto para a `main`.** O commit da produção é sempre um commit
  que já passou pelo staging.
- **A migration precisa ser compatível com o código anterior.** Ela roda antes
  do código novo subir, e durante o rebuild o código antigo convive com o
  schema novo. Remoção de coluna é feita em dois ciclos: primeiro o código para
  de usar, depois a coluna sai.
- **Correção urgente segue o mesmo caminho.** Pode ser mais rápido, mas passa
  pelo staging.

## Renovar os dados do staging

No Neon, a branch `staging` pode ser recriada a partir da produção a qualquer
momento (_Reset from parent_). Isso descarta tudo o que foi lançado no staging.
Depois de resetar, rode `npm run migrate:staging --workspace api` se houver
migration que ainda não chegou à produção.

## Bases SINAPI/SICRO

A carga (`npm run bases:carregar:<ambiente>`) ocupa cerca de 375 MB por
competência. **O plano Free do Neon (0,5 GB) não comporta a carga.** Ela fica
suspensa até a troca de plano. Quando acontecer, a ordem é a mesma: staging
primeiro, depois produção.
