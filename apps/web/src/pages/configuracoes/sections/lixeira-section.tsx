import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import {
  Badge,
  Button,
  EmptyState,
  ErrorState,
  LoadingState,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@repo/ui';

import { getModuleLabel } from '@/features/configuracoes/permission-modules';
import { useRestoreTrashItem, useTrash } from '@/features/lixeira/hooks/use-trash';

const ALL = 'ALL';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

/// Lixeira de todos os módulos numa tela só. Até aqui, excluir era definitivo
/// do ponto de vista do usuário: os registros continuavam no banco (soft
/// delete), mas não havia nenhuma tela que os mostrasse nem endpoint para
/// trazê-los de volta.
export function LixeiraSection() {
  const [entityType, setEntityType] = useState(ALL);
  const { data, isLoading, isError } = useTrash(entityType === ALL ? undefined : entityType);
  const restore = useRestoreTrashItem();
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // As opções do filtro saem do que existe na lixeira: filtrar por um tipo
  // sem nenhum registro excluído não teria serventia.
  const entityOptions = Array.from(
    new Map((data ?? []).map((item) => [item.entityType, item.entityLabel])).entries(),
  ).sort((a, b) => a[1].localeCompare(b[1]));

  async function handleRestore(itemEntityType: string, id: string) {
    setRestoringId(id);
    try {
      await restore.mutateAsync({ entityType: itemEntityType, id });
    } finally {
      setRestoringId(null);
    }
  }

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message="Não foi possível carregar a lixeira." />;

  const items = data ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-foreground">Registros excluídos</h2>
        <p className="text-sm text-muted-foreground">
          Mostra os 25 últimos registros excluídos de cada tipo, nos módulos que você pode
          consultar. Restaurar exige permissão de edição no módulo.
        </p>
      </div>

      {entityOptions.length > 0 && (
        <Select value={entityType} onValueChange={setEntityType}>
          <SelectTrigger className="w-64">
            <SelectValue placeholder="Todos os tipos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>Todos os tipos</SelectItem>
            {entityOptions.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {items.length === 0 ? (
        <EmptyState
          icon={Trash2}
          title="Nada na lixeira"
          description="Registros excluídos aparecem aqui e podem ser restaurados."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="!pl-4">Registro</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Módulo</TableHead>
                <TableHead>Excluído em</TableHead>
                <TableHead className="!pr-4 text-right">Ação</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={`${item.entityType}-${item.id}`}>
                  <TableCell className="!pl-4 font-medium text-foreground">{item.title}</TableCell>
                  <TableCell className="text-muted-foreground">{item.entityLabel}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{getModuleLabel(item.module)}</Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(item.deletedAt)}
                  </TableCell>
                  <TableCell className="!pr-4 text-right">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!item.canRestore || restoringId === item.id}
                      title={
                        item.canRestore
                          ? `Restaurar ${item.entityLabel.toLowerCase()}`
                          : 'Você não tem permissão de edição neste módulo'
                      }
                      onClick={() => handleRestore(item.entityType, item.id)}
                    >
                      <RotateCcw className="size-4" />
                      {restoringId === item.id ? 'Restaurando...' : 'Restaurar'}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
