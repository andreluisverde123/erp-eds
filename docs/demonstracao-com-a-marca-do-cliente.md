# Demonstração com a marca do cliente

Rodar o ERP na sua máquina exibindo a identidade de quem está do outro lado da
mesa: logo, cor e nomes do prospecto, com os dados de exemplo do seed.

Existe **só em desenvolvimento**. O painel e a aritmética de cor são removidos
na compilação — não há caminho, nem variável de ambiente, que os ligue em
staging ou produção.

## Preparar (uma vez)

```bash
# Banco local com dados de exemplo — obras, compras, financeiro, RDOs.
cd apps/api && SEED_DEMO=true npm run seed:local

# Sobe API e web.
cd ../.. && npm run dev
```

## Trocar a marca (a cada cliente)

Um botão discreto no canto inferior direito. Abra e preencha:

| Campo | Onde aparece |
| --- | --- |
| **Cliente** | só no seletor do painel, para reencontrar a marca depois |
| **Nome do sistema** | topo da barra lateral, tela de login, aba do navegador |
| **Construtora** | rodapé da barra lateral |
| **Cor da marca** | botões, item ativo do menu, foco, etiquetas |
| **Logo** | assinatura no topo, no login e no cabeçalho do Diário |

Tudo aplica na hora, a cada tecla. **Salvar** guarda a marca nesta máquina, para
a próxima conversa com o mesmo cliente; **Voltar para EDS** desfaz.

**Ctrl+Shift+M** esconde o botão — para o print ou o compartilhamento de tela
não denunciar que aquilo é ambiente de demonstração. O mesmo atalho traz de
volta.

O logo escolhido **não entra no repositório**: fica no `localStorage` desta
máquina e vai embora com ele.

## O que a troca alcança — e o que não

Alcança as telas. Não alcança os **PDFs**: ordem de compra, cotação e RDO saem
com o que estiver gravado em **Configurações → Empresa**, que é dado de verdade
no banco. Para uma demonstração em que os documentos também apareçam com a marca
do cliente, suba o mesmo logo por lá — no banco local, à vontade.

## Duas decisões que valem saber

**A cor exata do cliente é preservada onde ela é o fundo** (botão, item ativo).
O texto por cima é que se adapta, escolhendo entre branco e o tom escuro do
sistema pelo contraste real de cada um — é por isso que uma marca amarela ganha
texto escuro sem ninguém configurar nada.

**O vermelho de excluir não segue a marca.** Ele só é reconhecível por ser
independente; herdar a marca faria "Excluir" ficar da cor de "Salvar" em todo
cliente de identidade vermelha — o que já quase acontece com a própria EDS.
