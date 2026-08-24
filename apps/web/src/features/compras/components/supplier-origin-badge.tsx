import { Sparkles } from 'lucide-react';
import { Badge, Tooltip, TooltipContent, TooltipTrigger } from '@repo/ui';

import type { Supplier } from '../types';

/// Marca o fornecedor que o importador fiscal cadastrou sozinho.
///
/// Existe porque os dois cadastros parecem iguais na listagem e não são: o
/// automático veio do emitente de uma NF-e, ninguém conferiu, e quando a nota
/// chegou como resumo ele tem só razão social, CNPJ e inscrição estadual. Sem
/// o aviso, quem abre a tela trata um cadastro de uma linha só como se
/// alguém tivesse preenchido — e é aí que o dado errado vira pedido errado.
export function SupplierOriginBadge({ supplier }: { supplier: Supplier }) {
  if (supplier.origin !== 'NFE') return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant="info" className="gap-1">
          <Sparkles className="size-3" aria-hidden />
          Identificado pela NF-e
        </Badge>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p>Fornecedor identificado automaticamente pela NF-e.</p>
        <p className="mt-1 text-muted-foreground">
          Os dados vieram do emitente do documento fiscal e não foram conferidos por ninguém.
          Complete o cadastro se precisar de contato, endereço ou condições comerciais.
        </p>
        {supplier.originAccessKey && (
          <p className="mt-1 font-mono text-[10px] break-all text-muted-foreground">
            Chave de origem: {supplier.originAccessKey}
          </p>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
