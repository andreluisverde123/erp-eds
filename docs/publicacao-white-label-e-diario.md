# Publicação: white-label + ajustes do Diário (16/09/2026)

O que sai nesta publicação, para a EDS e para todas as próximas implantações:

- **White-label:** a marca vem da pasta `apps/web/brands/<código>/`, escolhida
  por `VITE_BRAND`. Na EDS nada muda na tela, exceto o nome curto do app
  instalado no celular, que passa de "ERP EDS" para "EDS".
- **Item 4:** "Diário de Obras" no menu **Engenharia**.
- **Item 5:** o Diário vale direto na produção. Não há mais etapa de teste
  dele no staging, e o checklist de implantação já diz isso.
- **Item 6:** o campo **Número do primeiro RDO** no cadastro da obra.

Quem faz cada passo: **[você]** no painel ou colando o comando com `!`;
**[Claude]** na sessão.

---

## Antes de começar: o que já foi conferido

- Testes: 1.783 da API e 454 do web passando.
- Migration nova (`20260921090000_obra_numero_inicial_rdo`): só **acrescenta
  uma coluna vazia** na tabela de obras. Nenhum dado existente muda, e o código
  atual continua funcionando com ela, então pode ser aplicada antes do push.
- **Banco do staging:** a única migration pendente é esta.
- **Dados do Diário:** a produção já tem tudo o que o staging tem, e mais
  (5 RDOs contra 3). Nada precisa ser copiado do staging para a produção.
- Os 5 usuários de teste `@eds.app` já estão **excluídos** desde 15/09.
  Os 2 RDOs que um deles criou em 31/08 continuam lá, e ficam até a gente
  decidir o que excluir.

> **Atenção ao item 6 na obra do TJ.** A obra `OBR-001` (Sede do Complexo
> Sociocultural – TJRR) **já tem 3 RDOs de teste** na produção: o nº 1,
> finalizado, e os nºs 2 e 3, em rascunho. Por isso o campo "Número do
> primeiro RDO" vai aparecer **travado** nela. Para usar o número inicial no
> TJ, esses 3 RDOs precisam sair antes. Isso entra na conversa do "o que
> excluir e manter".

---

## Passo 1 — Commit [Claude]

Feito na branch `feat/white-label`. Os relatórios soltos na raiz
(`INVENTARIO_ERP_EDS.md`, `ORCAMENTO_AUDIT.md`, `ORC_0*_RESULT.md`,
`RH_0*_RESULT.md`) ficaram fora do commit.

## Passo 2 — Variável da marca no staging [você]

No Railway: projeto da EDS → ambiente **staging** → serviço **web**
(`erp-eds`) → *Variables* → **New Variable**:

```
VITE_BRAND = eds
```

Sem ela, o build do site falha, e a versão atual continua no ar. Não é
preciso fazer deploy agora: o push do passo 4 já dispara o build.

## Passo 3 — Migration no staging [você]

```
! npm run migrate:staging --workspace api
```

Deve terminar com *"All migrations have been successfully applied."*

## Passo 4 — Publicar no staging [você]

```
! git push origin feat/white-label:staging
```

O Railway rebuilda a API e o site do staging, o que leva alguns minutos.

## Passo 5 — Conferência técnica [Claude]

Me avise que o push foi feito. Eu confiro:

- se a API responde;
- se o site publicado é o novo (hash do bundle) e não só a API;
- se o login continua igual.

## Passo 6 — Sua conferência em staging.gestaoeds.com.br [você]

- [ ] O login e as cores estão iguais aos de hoje.
- [ ] O menu **Engenharia** mostra **Diário de Obras**, e o clique abre o
      Diário.
- [ ] **Engenharia → Obras → Nova obra:** existe o campo **Número do primeiro
      RDO**. Crie uma obra de teste com o número 58, abra o Diário, crie um RDO
      nela e confira que ele sai como **nº 58**.
- [ ] Edite essa obra de novo: o campo aparece travado, com o aviso
      "já tem RDO no Diário".
- [ ] Exclua a obra de teste.

**Aprovado?** Me diga "aprovado para produção". Só então siga para o passo 7.

## Passo 7 — Variável da marca na produção [você]

Mesmo caminho do passo 2, mas no ambiente **production**:

```
VITE_BRAND = eds
```

## Passo 8 — Migration na produção [você]

```
! npm run migrate:production --workspace api
```

## Passo 9 — Publicar na produção [você]

```
! git push origin staging:main
```

## Passo 10 — Conferência na produção [Claude + você]

- [Claude] API, hash do bundle do site em `gestaoeds.com.br` e login.
- [você] Menu **Engenharia → Diário de Obras** e o campo na obra.

## Passo 11 — Fechamento [Claude]

- Marcar os itens na linha da EDS em **Implantações**, no Notion.
- Atualizar a memória: white-label publicado.

---

## Se algo der errado

- **O site do staging ou da produção não atualizou:** quase sempre é a falta
  de `VITE_BRAND`. Crie a variável e mande um *Redeploy* do serviço web. A
  versão anterior continua no ar enquanto isso.
- **Voltar o código:** `git push --force-with-lease origin d76df3c:staging`
  (ou `:main`). A coluna nova pode ficar no banco, porque o código antigo a
  ignora.

## Depois desta publicação (decidir juntos)

1. **O que excluir e o que manter** dos dados de teste do Diário na
   produção:
   - os 3 RDOs da `OBR-001` (TJ);
   - o RDO de 31/08 da `OBR-003`;
   - a obra excluída "Residencial Yes".
2. **Se o TJ usar número inicial:** excluir os RDOs de teste da `OBR-001` e
   depois preencher o número na obra.
3. **Script `seed:diario:staging`:** cria usuários de teste no staging. Com o
   Diário indo direto para a produção, ele pode ser aposentado.
