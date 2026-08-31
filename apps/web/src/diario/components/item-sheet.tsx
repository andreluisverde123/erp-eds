import type { FormEvent, ReactNode } from 'react';
import { Loader2 } from 'lucide-react';
import { Button, Sheet, SheetContent, SheetDescription, SheetTitle, cn } from '@repo/ui';

import { ApiError } from '@/lib/api-client';

/// Painel de adicionar/editar item, subindo da borda inferior.
///
/// Sobe de BAIXO, e não abre uma tela nova, por dois motivos que só aparecem
/// em campo: o polegar já está na metade de baixo do aparelho, e sair da lista
/// para um formulário e voltar custa duas navegações a cada item — numa obra
/// com oito atividades, são dezesseis. Aqui a lista continua atrás do painel,
/// e fechar já devolve o contexto.
///
/// `max-h-[85svh]` + rolagem interna: quando o teclado do celular abre, o
/// conteúdo rola por dentro em vez de a folha ser empurrada para fora da tela.
export function ItemSheet({
  aberta,
  onFechar,
  titulo,
  descricao,
  onSalvar,
  salvando,
  erro,
  rotuloAcao = 'Adicionar',
  children,
}: {
  aberta: boolean;
  onFechar: () => void;
  titulo: string;
  descricao?: string;
  onSalvar: () => void;
  salvando: boolean;
  erro: unknown;
  rotuloAcao?: string;
  children: ReactNode;
}) {
  function enviar(evento: FormEvent) {
    evento.preventDefault();
    onSalvar();
  }

  /// Traz o campo focado para dentro da área visível.
  ///
  /// O painel sobe da borda de baixo, que é exatamente onde o teclado do
  /// celular aparece: focar o último campo de um formulário de quatro deixava
  /// o cursor atrás do teclado, sem nada indicando por quê. `focusin` (e não
  /// `focus`) porque só ele borbulha até o formulário, o que permite tratar
  /// todos os campos com um ouvinte só.
  ///
  /// O atraso existe porque o teclado leva alguns quadros para abrir: rolar
  /// antes disso mira na altura errada.
  function aoFocarCampo(evento: React.FocusEvent<HTMLFormElement>) {
    const alvo = evento.target;
    if (!(alvo instanceof HTMLElement)) return;
    window.setTimeout(() => {
      // `scrollIntoView` não existe no jsdom, e o timer dispara depois do fim
      // do teste — a exceção subia como erro não tratado, fora de qualquer
      // asserção, e deixava a suíte vermelha com todos os testes passando.
      alvo.scrollIntoView?.({ block: 'center', behavior: 'smooth' });
    }, 250);
  }

  // Três origens possíveis, uma mensagem: a validação antecipada da tela manda
  // uma string, a API manda um `ApiError` com o texto do backend, e qualquer
  // outra falha cai no genérico.
  const mensagem = !erro
    ? null
    : typeof erro === 'string'
      ? erro
      : erro instanceof ApiError
        ? erro.message
        : 'Não foi possível salvar. Tente novamente.';

  return (
    <Sheet open={aberta} onOpenChange={(estado) => !estado && onFechar()}>
      <SheetContent
        side="bottom"
        className="max-h-[85svh] gap-0 overflow-y-auto p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <SheetTitle className="pr-8 text-base">{titulo}</SheetTitle>
        <SheetDescription className={cn('text-xs', !descricao && 'sr-only')}>
          {descricao ?? titulo}
        </SheetDescription>

        <form
          onSubmit={enviar}
          onFocusCapture={aoFocarCampo}
          className="mt-4 flex flex-col gap-4"
          noValidate
        >
          {children}

          {mensagem && (
            <p role="alert" className="text-sm text-destructive">
              {mensagem}
            </p>
          )}

          <Button type="submit" size="lg" disabled={salvando} className="h-12 text-base">
            {salvando && <Loader2 className="size-5 animate-spin" />}
            {salvando ? 'Salvando…' : rotuloAcao}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}

/// Campo rotulado. Existe para as seis seções não repetirem a mesma marcação
/// de label + espaçamento — e para o `htmlFor` nunca ser esquecido, que é o
/// que faz o toque no rótulo focar o campo.
export function SheetField({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}
