import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, cn } from '@repo/ui';

import { useDebouncedValue } from '@/hooks/use-debounced-value';

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
type Sugestao = ItemSuggestion & { local: boolean };

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
/// **Sugere, não obriga.** Não há catálogo de materiais no ERP e isto não cria
/// um: quem precisa de algo inédito digita e segue. A lista some ao sair do
/// campo, e ignorá-la não custa nada.
///
/// **Só o nome.** Os demais campos da linha ficam intactos.
export function ItemDescriptionCell({
  value,
  onChange,
  onPick,
  localSuggestions = [],
  className,
  ...inputProps
}: {
  value: string;
  onChange: (valor: string) => void;
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
  onPick: (sugestao: ItemSuggestion) => void;
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

  // As da própria solicitação são filtradas pelo valor VIVO, não pelo
  // debounced: não há consulta a esperar, e segurá-las 250 ms só faria a lista
  // piscar depois que a pessoa já parou de digitar.
  const digitado = normalizar(value);
  const locais: Sugestao[] =
    digitado.length < MINIMO_PARA_SUGERIR
      ? []
      : dedup(localSuggestions)
          .filter((descricao) => normalizar(descricao).includes(digitado))
          .map((descricao) => ({ description: descricao, timesUsed: 1, local: true }));

  // O que já veio da linha de cima não se repete vindo do banco.
  const jaListadas = new Set(locais.map((s) => normalizar(s.description)));
  const doServidor: Sugestao[] = (sugestoes ?? [])
    .filter((s) => !jaListadas.has(normalizar(s.description)))
    .map((s) => ({ ...s, local: false }));

  // Sugerir exatamente o que já está escrito é ruído: a pessoa já digitou.
  const visiveis = [...locais, ...doServidor].filter(
    (s) => normalizar(s.description) !== digitado,
  );
  // O que o painel está fazendo, em um estado só — a lista só some quando
  // não há NADA a dizer.
  const buscando = isFetching && locais.length === 0;
  const semResultado =
    !isFetching && !isError && digitado.length >= MINIMO_PARA_SUGERIR && visiveis.length === 0;
  const mostrando = aberta && (visiveis.length > 0 || buscando || semResultado || isError);

  // A lista encolhe sozinha (o debounce chega, uma local deixa de casar), e o
  // índice guardado pode sobrar dela. Sem o clamp, o Enter nesse intervalo
  // chamava `onPick(undefined)` e limpava a célula.
  const emFoco = visiveis[Math.min(indice, visiveis.length - 1)];

  function escolher(sugestao: Sugestao) {
    // `local` é de uso interno da lista; quem recebe continua vendo uma
    // `ItemSuggestion` como sempre.
    onPick({ description: sugestao.description, timesUsed: sugestao.timesUsed });
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
        className={className}
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
            <li key={sugestao.description}>
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
                {sugestao.local ? (
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
