import * as React from 'react';
import * as SelectPrimitive from '@radix-ui/react-select';
import { CheckIcon, ChevronDownIcon, SearchIcon } from 'lucide-react';

import { cn } from '../../lib/utils';

function Select({ ...props }: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />;
}

function SelectValue({ ...props }: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger>) {
  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      className={cn(
        "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-transparent bg-muted px-3 py-2 text-sm whitespace-nowrap outline-none data-[placeholder]:text-muted-foreground [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 [&_svg:not([class*='text-'])]:text-muted-foreground",
        'focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25',
        'disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon className="size-4 opacity-50" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  );
}

/// Regra do produto: dropdown com muitas opções tem busca.
///
/// A partir de `SELECT_SEARCH_THRESHOLD` opções, a lista abre com um campo
/// "Buscar…" no topo, já com o foco. O filtro ignora acento e maiúscula e
/// exige todas as palavras digitadas, em qualquer ordem ("sp saco" acha
/// "SC — Saco" e "Saco (SP)"). Vale para todo `Select` do sistema, sem nada
/// na tela que o usa. `searchable` força ligar ou desligar num caso pontual.
///
/// A opção que não casa é só escondida, nunca desmontada: o `ItemText` da
/// opção escolhida precisa continuar montado para o gatilho mostrar o rótulo.
export const SELECT_SEARCH_THRESHOLD = 8;

type SelectSearchContextValue = {
  terms: string[];
  register: (id: string) => () => void;
};

const SelectSearchContext = React.createContext<SelectSearchContextValue | null>(null);

function normalizeSearch(text: string) {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
}

function SelectSearchInput({
  value,
  onChange,
  inputRef,
}: {
  value: string;
  onChange: (value: string) => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}) {
  // A lista monta a cada abertura: começa sempre sem filtro e com o foco no
  // campo. O `setTimeout` deixa o Radix focar a opção escolhida primeiro.
  React.useEffect(() => {
    const timer = setTimeout(() => inputRef.current?.focus());
    return () => {
      clearTimeout(timer);
      onChange('');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex items-center gap-2 border-b px-3" data-slot="select-search">
      <SearchIcon className="size-4 shrink-0 opacity-50" />
      <input
        ref={inputRef}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Buscar…"
        aria-label="Buscar opção"
        autoComplete="off"
        className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        onKeyDown={(event) => {
          // Setas, Esc e Tab seguem para o Radix (navegar e fechar). O resto é
          // texto do campo e não pode virar a busca por letra do Radix.
          if (event.key === 'Enter') {
            event.preventDefault();
            const first = event.currentTarget
              .closest('[data-slot="select-content"]')
              ?.querySelector<HTMLElement>('[data-slot="select-item"]:not([hidden]):not([data-disabled])');
            first?.focus();
            first?.click();
            return;
          }
          if (!['ArrowDown', 'ArrowUp', 'Escape', 'Tab'].includes(event.key)) event.stopPropagation();
        }}
      />
    </div>
  );
}

function SelectContent({
  className,
  children,
  position = 'popper',
  searchable,
  onKeyDownCapture,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content> & { searchable?: boolean }) {
  const [search, setSearch] = React.useState('');
  const [itemIds, setItemIds] = React.useState<ReadonlySet<string>>(() => new Set());
  const inputRef = React.useRef<HTMLInputElement>(null);

  const register = React.useCallback((id: string) => {
    setItemIds((current) => new Set(current).add(id));
    return () =>
      setItemIds((current) => {
        const next = new Set(current);
        next.delete(id);
        return next;
      });
  }, []);

  const showSearch = searchable ?? itemIds.size >= SELECT_SEARCH_THRESHOLD;
  const terms = React.useMemo(
    () => (showSearch ? normalizeSearch(search).split(/\s+/).filter(Boolean) : []),
    [search, showSearch],
  );
  const context = React.useMemo(() => ({ terms, register }), [terms, register]);

  return (
    <SelectSearchContext.Provider value={context}>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Content
          data-slot="select-content"
          position={position}
          className={cn(
            'relative z-50 max-h-(--radix-select-content-available-height) min-w-32 overflow-x-hidden overflow-y-auto rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
            position === 'popper' &&
              'data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1',
            className,
          )}
          onKeyDownCapture={(event) => {
            onKeyDownCapture?.(event);
            // O mouse sobre a lista tira o foco do campo (o Radix foca a opção
            // sob o ponteiro). Letra digitada então volta para o campo, em vez
            // de disparar a busca por letra do Radix.
            const input = inputRef.current;
            if (!showSearch || !input || event.target === input) return;
            const typing =
              (event.key.length === 1 && event.key !== ' ' && !event.ctrlKey && !event.metaKey && !event.altKey) ||
              event.key === 'Backspace';
            if (typing) {
              input.focus();
              event.stopPropagation();
            }
          }}
          {...props}
        >
          {showSearch && <SelectSearchInput value={search} onChange={setSearch} inputRef={inputRef} />}
          <SelectPrimitive.Viewport
            className={cn(
              'p-1',
              position === 'popper' && 'w-full min-w-(--radix-select-trigger-width) scroll-my-1',
            )}
          >
            {children}
            {terms.length > 0 && <SelectSearchEmpty />}
          </SelectPrimitive.Viewport>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectSearchContext.Provider>
  );
}

/// "Nenhuma opção encontrada", só quando o filtro esconde todas. Olha o DOM
/// porque quem sabe se casa é cada opção, pelo texto que ela desenhou.
function SelectSearchEmpty() {
  const ref = React.useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = React.useState(false);

  // Sem dependências de propósito: roda a cada render e só grava se mudou.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const viewport = ref.current?.parentElement;
    setEmpty(!viewport?.querySelector('[data-slot="select-item"]:not([hidden])'));
  });

  return (
    <div ref={ref} hidden={!empty} className="px-2 py-6 text-center text-sm text-muted-foreground">
      Nenhuma opção encontrada.
    </div>
  );
}

function SelectItem({
  className,
  children,
  ref,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  const search = React.useContext(SelectSearchContext);
  const register = search?.register;
  const id = React.useId();
  const nodeRef = React.useRef<HTMLDivElement | null>(null);
  // O texto que a opção desenhou, e não `children`: há opção com componente
  // dentro (rótulo + e-mail, sigla + nome), e é isso que a pessoa lê e digita.
  const [text, setText] = React.useState('');

  React.useLayoutEffect(() => register?.(id), [register, id]);
  // Sem dependências de propósito: o texto só existe depois de desenhado.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  React.useLayoutEffect(() => {
    const current = normalizeSearch(`${props.textValue ?? ''} ${nodeRef.current?.textContent ?? ''}`);
    if (current !== text) setText(current);
  });

  const hidden = !!search?.terms.length && !search.terms.every((term) => text.includes(term));

  return (
    <SelectPrimitive.Item
      ref={(node) => {
        nodeRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }}
      hidden={hidden}
      data-slot="select-item"
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-sm py-1.5 pr-8 pl-2 text-sm outline-hidden select-none data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 focus:bg-accent focus:text-accent-foreground",
        className,
      )}
      {...props}
    >
      <span className="absolute right-2 flex size-3.5 items-center justify-center">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="size-4" />
        </SelectPrimitive.ItemIndicator>
      </span>
      {/* Flex com `gap` AQUI, e não no item.
          
          O padrão usado em várias telas é dar dois filhos à opção — um rótulo
          e um dado secundário ("Ana" + o e-mail, "SC" + "Saco"). Os dois caem
          dentro deste `ItemText`, que é UM nó: o `gap-2` do item, que fica um
          nível acima, não os separa, e eles saíam colados ("Anaana@eds.com.br")
          tanto na lista quanto espelhados no gatilho.
          
          `min-w-0` para o rótulo longo truncar em vez de empurrar o segundo
          filho para fora da caixa. Opção de um filho só não muda em nada. */}
      <SelectPrimitive.ItemText>
        <span className="flex min-w-0 items-baseline gap-2">{children}</span>
      </SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  );
}

export { Select, SelectValue, SelectTrigger, SelectContent, SelectItem };
