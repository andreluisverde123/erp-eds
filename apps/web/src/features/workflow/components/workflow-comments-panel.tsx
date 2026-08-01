import { useState } from 'react';
import { Button, Textarea } from '@repo/ui';

import { useAuth } from '@/features/auth/context';

import { useWorkflowCommentMutation } from '../hooks/use-workflow-comment-mutation';
import { useWorkflowComments } from '../hooks/use-workflow-comments';
import type { WorkflowEntityType } from '../types';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function getInitials(name: string): string {
  const [first, second] = name.trim().split(/\s+/);
  return `${first?.[0] ?? ''}${second?.[0] ?? ''}`.toUpperCase();
}

export function WorkflowCommentsPanel({
  entityType,
  entityId,
}: {
  entityType: WorkflowEntityType;
  entityId: string;
}) {
  const { user } = useAuth();
  const { data: comments, isLoading } = useWorkflowComments(entityType, entityId);
  const mutation = useWorkflowCommentMutation(entityType, entityId);
  const [body, setBody] = useState('');

  function handleSubmit() {
    const trimmed = body.trim();
    if (!trimmed) return;
    mutation.mutate(trimmed, { onSuccess: () => setBody('') });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
          {user ? getInitials(user.name) : '—'}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            placeholder="Escreva um comentário..."
            className="min-h-16"
          />
          <Button
            size="sm"
            className="self-end"
            disabled={!body.trim() || mutation.isPending}
            onClick={handleSubmit}
          >
            {mutation.isPending ? 'Enviando...' : 'Comentar'}
          </Button>
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando comentários...</p>}

      {!isLoading && comments && comments.length === 0 && (
        <p className="text-sm text-muted-foreground">Nenhum comentário ainda.</p>
      )}

      {comments && comments.length > 0 && (
        <ol className="flex flex-col gap-4">
          {comments.map((comment) => (
            <li key={comment.id} className="flex gap-3">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
                {getInitials(comment.author.name)}
              </div>
              <div className="flex flex-col gap-0.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-medium text-foreground">{comment.author.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDateTime(comment.createdAt)}
                  </span>
                </div>
                <p className="text-sm text-foreground">{comment.body}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
