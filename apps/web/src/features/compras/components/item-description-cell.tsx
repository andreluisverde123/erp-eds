import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, cn } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

import { searchCatalogSuggestions, type CatalogSuggestion } from '../catalog-suggestions';
import { searchItemSuggestions, type ItemSuggestion } from '../item-suggestions';

/// A busca vale desde a PRIMEIRA letra.
///
/// Eram duas, e o motivo não era de produto: com `ILIKE '%c%'` o índice
/// trigram do banco não é usado abaixo de três caracteres, e a primeira letra
/// custava uma varredura da tabela inteira. Com o índice de prefixo sobre
/// `searchKey`, "c" é uma consulta indexada como qualquer outra — e é
/// justamente na primeira letra que a sugestão poupa mais digitação.
const MINIMO_PARA_SUGERIR = 1;

/// Uma sugestão com a PROCEDÊNCIA junto: `local` veio de outra linha desta
/// mesma solicitação, ainda não gravada; o resto veio do histórico da empresa.
/// A tela precisa distinguir as duas — "3×" num material que só existe duas
/// linhas acima seria mentira.
type Sugestao = ItemSuggestion & { local: boolean; catalogItem?: CatalogSuggestion };

/// O que a célula devolve ao escolher. `catalogItem` só vem quando a escolha
/// foi do CADASTRO — é o que liga a linha ao insumo.
export type ItemPick = ItemSuggestion & { catalogItem?: CatalogSuggestion };

/// Tira acento, caixa e espaço sobrando, só para COMPARAR. O texto exibido e
/// o escolhido continuam sendo o que a pessoa digitou — "Telha Fosca" casa com
/// "telha fosca" sem que nenhuma das duas grafias seja corrigida por baixo.
function normalizar(valor: string): string {
  return valor
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

/// A mesma descrição repetida em três linhas é UMA sugestão. Preserva a
/// primeira grafia digitada e descarta as equivalentes.
function dedup(descricoes: string[]): string[] {
  const vistas = new Set<string>();
  return descricoes.filter((descricao) => {
    const chave = normalizar(descricao);
    if (chave.length === 0 || vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
}

/// A célula de descrição do item, com sugestão do que já foi pedido.
///
/// **Por que existe.** Uma obra pede os mesmos materiais o tempo todo, e cada
/// solicitação era redigitada do zero. Além do trabalho, isso produz várias
/// grafias para o mesmo item ("Cimento CP-II", "cimento cp2", "CIMENTO CPII
/// 50KG") — e relatório por material deixa de somar, porque o banco vê três
/// materiais diferentes.
///
/// **Duas memórias, e nenhuma obriga.** O CADASTRO de insumos vem primeiro,
/// com código e unidade: escolher dali liga a linha ao insumo. O HISTÓRICO do
/// que já foi pedido vem depois, só com o nome. Quem precisa de algo que não
/// está em nenhum dos dois digita e segue — a linha de texto livre continua
/// válida, a lista some ao sair do campo, e ignorá-la não custa nada.
///
/// **Do histórico, só o nome.** Do cadastro, nome e unidade — ali a unidade é
/// do insumo, e não de um pedido anterior.
export function ItemDescriptionCell({
  value,
  onChange,
  onPick,
  localSuggestions = [],
  catalogItemId,
  catalogItemCode,
  className,
  ...inputProps
}: {
  value: string;
  onChange: (valor: string) => void;
  /// O insumo a que a linha JÁ está ligada, se estiver. Ele não é sugerido de
  /// novo, e o código aparece na célula para dizer de onde a linha veio.
  catalogItemId?: string;
  catalogItemCode?: string;
  /// As descrições JÁ DIGITADAS nesta solicitação, tirando a da própria linha.
  ///
  /// Existe porque a fonte do servidor é o que está GRAVADO
  /// (`PurchaseRequestItem` de solicitações salvas), e a repetição que mais
  /// custa acontece antes de salvar: quem digita "Telha fosca" na linha 2 e
  /// "Telha" na linha 3 não recebia sugestão nenhuma — o material ainda não
  /// existe no banco, e o campo não tinha como enxergar a linha de cima.
  ///
  /// Vêm ANTES das do servidor e sem consulta nenhuma: são as mais próximas
  /// do que a pessoa está fazendo agora, e aparecem já na primeira tecla útil,
  /// sem esperar os 250 ms do debounce.
  localSuggestions?: string[];
  /// Chamado quando a pessoa ESCOLHE uma sugestão.
  ///
  /// Só o NOME é preenchido. Unidade, quantidade e observação continuam
  /// digitadas: são decisões daquele pedido, não do material — a mesma tinta
  /// vem em lata numa compra e em galão na outra, e herdar a unidade da vez
  /// anterior colocaria um valor plausível e errado num campo que ninguém
  /// olharia de novo.
  ///
  /// Escolha do CADASTRO vem com `catalogItem`, e quem recebe decide o que
  /// preencher com ele.
  onPick: (escolha: ItemPick) => void;
  className?: string;
} & Omit<React.ComponentProps<typeof Input>, 'value' | 'onChange' | 'className'>) {
  const [aberta, setAberta] = useState(false);
  const [indice, setIndice] = useState(0);
  // Fechar no `blur` direto engoliria o clique na sugestão: o blur dispara
  // ANTES do click. O timer dá a janela para o clique acontecer.
  const fechamento = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Uma consulta por tecla inundaria a API numa digitação normal. 200 ms é o
  // intervalo em que a pessoa ainda percebe a lista como imediata — e agora a
  // busca começa uma letra antes, então o debounce carrega mais peso.
  //
  // A digitação NUNCA espera por isto: o `<input>` é controlado pelo `value`
  // vivo, e só a consulta é adiada.
  const termo = useDebouncedValue(value, 200);

  const { data: sugestoes, isFetching, isError } = useQuery({
    queryKey: ['compras', 'item-suggestions', termo],
    queryFn: () => searchItemSuggestions(termo),
    enabled: aberta && normalizar(termo).length >= MINIMO_PARA_SUGERIR,
    staleTime: 60_000,
  });

  // O cadastro vem numa consulta própria, com o mesmo termo e o mesmo
  // debounce. Falha aqui NÃO vira aviso: o histórico continua respondendo e a
  // pessoa continua digitando — o catálogo é conveniência, não requisito.
  const { data: doCadastro, isFetching: buscandoCadastro } = useQuery({
    queryKey: ['compras', 'catalog-suggestions', termo],
    queryFn: () => searchCatalogSuggestions(termo),
    enabled: aberta && normalizar(termo).length >= MINIMO_PARA_SUGERIR,
    staleTime: 60_000,
  });

  // As da própria solicitação são filtradas pelo valor VIVO, não pelo
  // debounced: não há consulta a esperar, e segurá-las 250 ms só faria a lista
  // piscar depois que a pessoa já parou de digitar.
  const digitado = normalizar(value);

  // O CADASTRO primeiro: é a única fonte que liga a linha a um insumo. O
  // insumo a que a linha já está ligada não se oferece de novo.
  const doCatalogo: Sugestao[] = (digitado.length < MINIMO_PARA_SUGERIR ? [] : (doCadastro ?? []))
    .filter((insumo) => insumo.id !== catalogItemId)
    .map((insumo) => ({
      description: insumo.name,
      timesUsed: 0,
      local: false,
      catalogItem: insumo,
    }));
  const noCatalogo = new Set(doCatalogo.map((s) => normalizar(s.description)));

  const locais: Sugestao[] =
    digitado.length < MINIMO_PARA_SUGERIR
      ? []
      : dedup(localSuggestions)
          .filter((descricao) => normalizar(descricao).includes(digitado))
          // O nome que o cadastro já oferece aparece UMA vez, e a entrada do
          // cadastro vence: escolhê-la é o que liga a linha ao insumo.
          .filter((descricao) => !noCatalogo.has(normalizar(descricao)))
          .map((descricao) => ({ description: descricao, timesUsed: 1, local: true }));

  // O que já veio do cadastro ou da linha de cima não se repete vindo do banco.
  const jaListadas = new Set([...noCatalogo, ...locais.map((s) => normalizar(s.description))]);
  const doServidor: Sugestao[] = (sugestoes ?? [])
    .filter((s) => !jaListadas.has(normalizar(s.description)))
    .map((s) => ({ ...s, local: false }));

  // Sugerir exatamente o que já está escrito é ruído: a pessoa já digitou. A
  // exceção é o cadastro — "Cimento CP II" digitado à mão ainda não está
  // ligado ao insumo, e escolher a sugestão é justamente o que liga.
  const visiveis = [
    ...doCatalogo,
    ...[...locais, ...doServidor].filter((s) => normalizar(s.description) !== digitado),
  ];
  // O que o painel está fazendo, em um estado só — a lista só some quando
  // não há NADA a dizer.
  const buscando =
    (isFetching || buscandoCadastro) && locais.length === 0 && doCatalogo.length === 0;
  const semResultado =
    !isFetching &&
    !buscandoCadastro &&
    !isError &&
    digitado.length >= MINIMO_PARA_SUGERIR &&
    visiveis.length === 0;
  const mostrando = aberta && (visiveis.length > 0 || buscando || semResultado || isError);

  // A lista encolhe sozinha (o debounce chega, uma local deixa de casar), e o
  // índice guardado pode sobrar dela. Sem o clamp, o Enter nesse intervalo
  // chamava `onPick(undefined)` e limpava a célula.
  const emFoco = visiveis[Math.min(indice, visiveis.length - 1)];

  function escolher(sugestao: Sugestao) {
    // `local` é de uso interno da lista; quem recebe continua vendo uma
    // `ItemSuggestion` como sempre.
    onPick(
      sugestao.catalogItem
        ? { description: sugestao.description, timesUsed: 0, catalogItem: sugestao.catalogItem }
        : { description: sugestao.description, timesUsed: sugestao.timesUsed },
    );
    setAberta(false);
  }

  function aoTeclar(evento: React.KeyboardEvent<HTMLInputElement>) {
    // TAB não é tratado aqui de propósito: ele cai fora de todos os ramos
    // abaixo, sem `preventDefault`, e o navegador leva o foco ao próximo
    // controle da linha. Quem tira as sugestões do caminho é o `tabIndex={-1}`
    // delas; o `blur` do input fecha a lista logo em seguida.
    //
    // `visiveis` vazio com o painel ABERTO é estado normal: é o "buscando..."
    // e o "nenhum material encontrado". Sem esta guarda, a seta faria `% 0` —
    // NaN no índice, e o Enter seguinte escolhia `undefined`.
    if (!mostrando || visiveis.length === 0) return;

    // Setas e Enter percorrem a lista sem tirar a mão do teclado — é uma grade
    // de digitação, e obrigar o mouse aqui custaria mais que redigitar.
    if (evento.key === 'ArrowDown') {
      evento.preventDefault();
      setIndice((i) => (i + 1) % visiveis.length);
    } else if (evento.key === 'ArrowUp') {
      evento.preventDefault();
      setIndice((i) => (i - 1 + visiveis.length) % visiveis.length);
    } else if (evento.key === 'Enter') {
      // Só intercepta o Enter quando há uma sugestão em foco; do contrário o
      // Enter continua fazendo o que a grade espera dele.
      if (!emFoco) return;
      evento.preventDefault();
      escolher(emFoco);
    } else if (evento.key === 'Escape') {
      setAberta(false);
    }
  }

  return (
    <div className="relative">
      <Input
        {...inputProps}
        value={value}
        className={cn(className, catalogItemCode && 'pr-20')}
        autoComplete="off"
        onChange={(evento) => {
          onChange(evento.target.value);
          setAberta(true);
          setIndice(0);
        }}
        onFocus={() => setAberta(true)}
        onKeyDown={aoTeclar}
        onBlur={(evento) => {
          fechamento.current = setTimeout(() => setAberta(false), 120);
          inputProps.onBlur?.(evento);
        }}
      />

      {/* De onde a linha veio. Some assim que a pessoa digita por cima: a
          grade desfaz o vínculo e a linha volta a ser texto livre. */}
      {catalogItemCode && (
        <span
          className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 font-mono text-[11px] text-muted-foreground"
          title="Insumo do cadastro"
        >
          {catalogItemCode}
        </span>
      )}

      {mostrando && (
        <ul
          // `data-grid-action` marca o elemento como parte da grade: o
          // `onBlur` da linha usa isso para não tratar o clique aqui como
          // saída da linha.
          data-grid-action
          className={cn(
            'absolute left-0 top-full z-50 mt-0.5 w-[min(28rem,80vw)] overflow-hidden',
            'rounded-md border border-border bg-popover shadow-md',
          )}
          onMouseDown={() => {
            if (fechamento.current) clearTimeout(fechamento.current);
          }}
        >
          {/* ESTADOS do painel, e cada um responde a uma pergunta diferente:
              "ele está fazendo alguma coisa?", "não existe mesmo?", "quebrou?".
              Antes os três produziam a mesma tela vazia, e o relato que chegava
              era sempre "o autocomplete não funciona" — sem como distinguir. */}
          {buscando && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">Buscando materiais…</li>
          )}
          {semResultado && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">
              Nenhum material encontrado. Continue digitando para cadastrar um novo.
            </li>
          )}
          {isError && !buscando && (
            <li className="px-3 py-1.5 text-sm text-muted-foreground">
              Não foi possível buscar sugestões. Você pode digitar normalmente.
            </li>
          )}
          {visiveis.map((sugestao, i) => (
            <li
              key={
                sugestao.catalogItem ? `cadastro:${sugestao.catalogItem.id}` : sugestao.description
              }
            >
              <button
                type="button"
                // FORA da ordem de tabulação, e é o que consertava o pulo da
                // Unidade: a lista é irmã do input e vem ANTES do seletor de
                // unidade no DOM, então o Tab caía na primeira sugestão. O
                // `blur` do input então fechava a lista, o botão focado sumia
                // da página e o foco ia para o `body` — daí a impressão de que
                // a Unidade tinha sido "pulada".
                //
                // É também o padrão de combobox: as opções se percorrem com as
                // setas e se escolhem com Enter ou clique, nunca com Tab. O
                // mouse não é afetado — `tabIndex` só governa o teclado.
                tabIndex={-1}
                className={cn(
                  'flex w-full items-baseline gap-2 px-3 py-1.5 text-left text-sm',
                  i === indice ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                )}
                onMouseEnter={() => setIndice(i)}
                onClick={() => escolher(sugestao)}
              >
                <span className="min-w-0 flex-1 truncate">{sugestao.description}</span>
                {/* A procedência, porque as duas fontes respondem a perguntas
                    diferentes: "nesta solicitação" é a linha que a pessoa
                    acabou de digitar e quer repetir; o contador é o histórico
                    da empresa, e separa o material do dia a dia do que foi
                    pedido uma vez só. */}
                {sugestao.catalogItem ? (
                  // Do cadastro: código e unidade, que é o que separa dois
                  // insumos de nome parecido.
                  <span className="shrink-0 font-mono text-xs text-muted-foreground">
                    {sugestao.catalogItem.code} · {sugestao.catalogItem.unit}
                  </span>
                ) : sugestao.local ? (
                  <span className="shrink-0 text-xs text-muted-foreground">
                    nesta solicitação
                  </span>
                ) : (
                  sugestao.timesUsed > 1 && (
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {sugestao.timesUsed}×
                    </span>
                  )
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
