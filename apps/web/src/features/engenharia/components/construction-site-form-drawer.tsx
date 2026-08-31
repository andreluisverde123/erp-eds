import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import {
  Alert,
  AlertTitle,
  Button,
  Form,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@repo/ui';

import { useAuth } from '@/features/auth/context';
import { ApiError } from '@/lib/api-client';

import {
  CONSTRUCTION_SITE_FORM_DEFAULTS,
  constructionSiteFormSchema,
  toConstructionSiteInput,
  type ConstructionSiteFormValues,
} from '../construction-site-form-schema';
import {
  useCreateConstructionSite,
  useUpdateConstructionSite,
} from '../hooks/use-construction-site-mutations';
import type { ConstructionSite } from '../types';
import { ConstructionSiteFormFields } from './construction-site-form-fields';
import { SiteTeamField, type SiteTeamEntry } from './site-team-field';
import { getSiteTeam, replaceSiteTeam } from '../site-team';

function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '';
}

function siteToFormValues(site: ConstructionSite): ConstructionSiteFormValues {
  return {
    code: site.code,
    name: site.name,
    clientName: site.clientName ?? '',
    city: site.city ?? '',
    state: site.state ?? '',
    startDate: toDateInputValue(site.startDate),
    expectedEndDate: toDateInputValue(site.expectedEndDate),
    status: site.status,
    responsibleName: site.responsibleName ?? '',
    description: site.description ?? '',
  };
}

interface ConstructionSiteFormDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /// Presente = editando essa obra; ausente = criando uma nova.
  site?: ConstructionSite;
  /// Presente = criando uma nova obra pré-preenchida com os dados desta
  /// (fluxo de "Duplicar"); ignorado se `site` também estiver presente.
  duplicateFrom?: ConstructionSite;
}

export function ConstructionSiteFormDrawer({
  open,
  onOpenChange,
  site,
  duplicateFrom,
}: ConstructionSiteFormDrawerProps) {
  const isEditing = Boolean(site);
  const isDuplicating = !isEditing && Boolean(duplicateFrom);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 sm:max-w-lg">
        <div className="border-b border-border px-6 py-5">
          <SheetTitle>
            {isEditing ? 'Editar obra' : isDuplicating ? 'Duplicar obra' : 'Nova obra'}
          </SheetTitle>
          <SheetDescription>
            {isEditing
              ? 'Atualize as informações gerais da obra.'
              : isDuplicating
                ? 'Revise os dados copiados e ajuste o que for necessário.'
                : 'Preencha os dados para cadastrar uma nova obra.'}
          </SheetDescription>
        </div>

        {/* A key força um remount a cada abertura (troca entre "fechado", o
            id da obra/"create" ou a origem da duplicação), então o form
            sempre nasce com os valores certos sem precisar de um useEffect
            resetando estado. */}
        <ConstructionSiteFormBody
          key={open ? (site?.id ?? duplicateFrom?.id ?? 'create') : 'closed'}
          site={site}
          duplicateFrom={duplicateFrom}
          isEditing={isEditing}
          onDone={() => onOpenChange(false)}
        />
      </SheetContent>
    </Sheet>
  );
}

function ConstructionSiteFormBody({
  site,
  duplicateFrom,
  isEditing,
  onDone,
}: {
  site?: ConstructionSite;
  duplicateFrom?: ConstructionSite;
  isEditing: boolean;
  onDone: () => void;
}) {
  const [submitError, setSubmitError] = useState<string | null>(null);
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // A equipe é gerida pela API do Diário, que exige `diario.manage_access`.
  // Sem essa permissão a seção nem aparece — um campo que sempre falha ao
  // salvar é pior que campo nenhum.
  const podeGerirEquipe = Boolean(user?.permissions.includes('diario.manage_access'));

  const [equipe, setEquipe] = useState<SiteTeamEntry[]>([]);
  const { data: equipeAtual } = useQuery({
    queryKey: ['diario', 'acessos', 'obra', site?.id],
    queryFn: () => getSiteTeam(site!.id),
    enabled: podeGerirEquipe && Boolean(site?.id),
  });

  // A equipe carregada vira o estado inicial UMA vez. Depois disso quem manda
  // é o que a pessoa mexeu na tela — sem esta guarda, um refetch em segundo
  // plano descartaria as alterações não salvas.
  const [equipeCarregada, setEquipeCarregada] = useState(false);
  if (equipeAtual && !equipeCarregada) {
    setEquipe(equipeAtual.map(({ userId, role }) => ({ userId, role })));
    setEquipeCarregada(true);
  }

  const createMutation = useCreateConstructionSite();
  const updateMutation = useUpdateConstructionSite(site?.id ?? '');
  const mutation = isEditing ? updateMutation : createMutation;

  const defaultValues = site
    ? siteToFormValues(site)
    : duplicateFrom
      ? { ...siteToFormValues(duplicateFrom), code: '', name: `${duplicateFrom.name} (cópia)` }
      : CONSTRUCTION_SITE_FORM_DEFAULTS;

  const form = useForm<ConstructionSiteFormValues>({
    resolver: zodResolver(constructionSiteFormSchema),
    defaultValues,
  });

  async function onSubmit(values: ConstructionSiteFormValues) {
    setSubmitError(null);
    try {
      const salva = await mutation.mutateAsync(toConstructionSiteInput(values));

      // A equipe é gravada DEPOIS, e não junto: na criação a obra ainda não
      // tem id quando o formulário é enviado, e a rota de acesso é por obra.
      // Duas chamadas, nesta ordem, é o que a API permite hoje.
      if (podeGerirEquipe) {
        const alvo = site?.id ?? salva?.id;
        if (alvo) {
          await replaceSiteTeam(alvo, equipe);
          void queryClient.invalidateQueries({ queryKey: ['diario', 'acessos'] });
        }
      }

      onDone();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : 'Não foi possível salvar a obra. Tente novamente.',
      );
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <Form {...form}>
          <form id="construction-site-form" onSubmit={form.handleSubmit(onSubmit)} noValidate>
            {submitError && (
              <Alert variant="destructive" className="mb-4">
                <AlertTitle>{submitError}</AlertTitle>
              </Alert>
            )}
            <ConstructionSiteFormFields control={form.control} />

            {podeGerirEquipe && (
              <div className="mt-5 border-t border-border pt-5">
                <SiteTeamField
                  value={equipe}
                  onChange={setEquipe}
                  disabled={mutation.isPending}
                />
              </div>
            )}
          </form>
        </Form>
      </div>

      <div className="flex items-center justify-end gap-2 border-t border-border px-6 py-4">
        <Button type="button" variant="outline" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" form="construction-site-form" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Salvando...' : 'Salvar'}
        </Button>
      </div>
    </>
  );
}
