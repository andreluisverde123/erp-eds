import { useState } from 'react';
import { Building2, CalendarDays, MapPin, Pencil, Plus, Star, Trash2, Wallet } from 'lucide-react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button, Card, CardContent, cn, Separator } from '@repo/ui';

import { AttachmentsPanel } from '@/features/anexos/components/attachments-panel';
import { useAuth } from '@/features/auth/context';

import { ConfirmDialog } from '@/components/confirm-dialog';
import { BreadcrumbNav } from '@/components/layout/breadcrumb-nav';
import { useFavorites } from '@/hooks/use-favorites';

import { RecordHistoryPanel } from '@/features/history/components/record-history-panel';

import { ConstructionSiteFormDrawer } from '@/features/engenharia/components/construction-site-form-drawer';
import { ConstructionSiteStatusBadge } from '@/features/engenharia/components/construction-site-status-badge';
import { CostCenterFormDrawer } from '@/features/engenharia/components/cost-center-form-drawer';
import { CostCentersTable } from '@/features/engenharia/components/cost-centers-table';
import { useDeleteConstructionSite } from '@/features/engenharia/hooks/use-construction-site-mutations';
import { useConstructionSite } from '@/features/engenharia/hooks/use-construction-site';
import { useDeleteCostCenter } from '@/features/engenharia/hooks/use-cost-center-mutations';
import { getStatusLabel } from '@/features/engenharia/construction-site-status';
import type { CostCenter } from '@/features/engenharia/types';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function SummaryStat({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Building2;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardContent className="flex items-center gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="size-[18px]" strokeWidth={1.75} />
        </div>
        <div className="flex flex-col">
          <span className="text-xs text-muted-foreground">{label}</span>
          <span className="text-sm font-semibold text-foreground">{value}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export function ObraDetailPage() {
  const { user } = useAuth();
  const canManage = user?.permissions.includes('engenharia.manage') ?? false;
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: site, isLoading, isError } = useConstructionSite(id);

  const deleteSiteMutation = useDeleteConstructionSite();
  const deleteCostCenterMutation = useDeleteCostCenter();
  const { isFavorite, toggleFavorite } = useFavorites();

  const [editDrawerOpen, setEditDrawerOpen] = useState(false);
  const [deleteSiteDialogOpen, setDeleteSiteDialogOpen] = useState(false);
  const [costCenterDrawerOpen, setCostCenterDrawerOpen] = useState(false);
  const [editingCostCenter, setEditingCostCenter] = useState<CostCenter | undefined>();
  const [deletingCostCenter, setDeletingCostCenter] = useState<CostCenter | null>(null);

  if (!id) {
    return <Navigate to="/engenharia/obras" replace />;
  }

  if (isError) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <Building2 className="size-9 text-muted-foreground/60" strokeWidth={1.5} />
        <p className="text-sm text-muted-foreground">Obra não encontrada.</p>
        <Button variant="outline" size="sm" onClick={() => navigate('/engenharia/obras')}>
          Voltar para Obras
        </Button>
      </div>
    );
  }

  if (isLoading || !site) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-sm text-muted-foreground">
        Carregando obra...
      </div>
    );
  }

  function openCreateCostCenterDrawer() {
    setEditingCostCenter(undefined);
    setCostCenterDrawerOpen(true);
  }

  function openEditCostCenterDrawer(costCenter: CostCenter) {
    setEditingCostCenter(costCenter);
    setCostCenterDrawerOpen(true);
  }

  async function confirmDeleteSite() {
    if (!site) return;
    await deleteSiteMutation.mutateAsync(site.id);
    navigate('/engenharia/obras');
  }

  async function confirmDeleteCostCenter() {
    if (!deletingCostCenter) return;
    await deleteCostCenterMutation.mutateAsync(deletingCostCenter.id);
    setDeletingCostCenter(null);
  }

  return (
    <div className="flex flex-col gap-6">
      <BreadcrumbNav override={site.name} />

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() =>
                toggleFavorite({
                  type: 'construction-site',
                  id: site.id,
                  label: site.name,
                  subtitle: site.code,
                  path: `/engenharia/obras/${site.id}`,
                })
              }
              className="shrink-0 text-muted-foreground/50 hover:text-primary"
            >
              <Star
                className={cn(
                  'size-5',
                  isFavorite('construction-site', site.id) && 'fill-primary text-primary',
                )}
              />
              <span className="sr-only">Favoritar {site.name}</span>
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-foreground">{site.name}</h1>
            <ConstructionSiteStatusBadge status={site.status} />
          </div>
          <p className="text-sm text-muted-foreground">Código {site.code}</p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setEditDrawerOpen(true)}>
            <Pencil />
            Editar
          </Button>
          <Button variant="outline" onClick={() => setDeleteSiteDialogOpen(true)}>
            <Trash2 />
            Excluir
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryStat
          icon={Wallet}
          label="Centros de custo"
          value={String(site._count.costCenters)}
        />
        <SummaryStat
          icon={MapPin}
          label="Cidade"
          value={site.city ? `${site.city}${site.state ? `/${site.state}` : ''}` : '—'}
        />
        <SummaryStat
          icon={CalendarDays}
          label="Previsão de término"
          value={formatDate(site.expectedEndDate)}
        />
      </div>

      <Card>
        <CardContent className="flex flex-col gap-5">
          <h2 className="text-base font-semibold text-foreground">Informações gerais</h2>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            <InfoRow label="Cliente" value={site.clientName ?? '—'} />
            <InfoRow label="Responsável" value={site.responsibleName ?? '—'} />
            <InfoRow label="Status" value={getStatusLabel(site.status)} />
            <InfoRow label="Data de início" value={formatDate(site.startDate)} />
            <InfoRow label="Previsão de término" value={formatDate(site.expectedEndDate)} />
            <InfoRow
              label="Cidade / UF"
              value={site.city ? `${site.city}${site.state ? ` - ${site.state}` : ''}` : '—'}
            />
          </div>
          {site.description && (
            <>
              <Separator />
              <InfoRow label="Descrição" value={site.description} />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-foreground">Centros de custo</h2>
            <Button size="sm" onClick={openCreateCostCenterDrawer}>
              <Plus />
              Novo Centro de Custo
            </Button>
          </div>
          <CostCentersTable
            costCenters={site.costCenters}
            onEdit={openEditCostCenterDrawer}
            onDelete={setDeletingCostCenter}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">Anexos</h2>
          <AttachmentsPanel
            entityType="ConstructionSite"
            entityId={site.id}
            canManage={canManage}
            emptyMessage="Nenhum documento anexado — alvará, ART, licença, contrato."
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">Histórico</h2>
          <RecordHistoryPanel entityType="ConstructionSite" entityId={site.id} />
        </CardContent>
      </Card>

      <ConstructionSiteFormDrawer
        open={editDrawerOpen}
        onOpenChange={setEditDrawerOpen}
        site={site}
      />

      <CostCenterFormDrawer
        open={costCenterDrawerOpen}
        onOpenChange={setCostCenterDrawerOpen}
        constructionSiteId={site.id}
        costCenter={editingCostCenter}
      />

      <ConfirmDialog
        open={deleteSiteDialogOpen}
        onOpenChange={setDeleteSiteDialogOpen}
        title="Excluir obra"
        description={`Tem certeza que deseja excluir "${site.name}"? Os centros de custo associados também serão removidos.`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteSiteMutation.isPending}
        onConfirm={confirmDeleteSite}
      />

      <ConfirmDialog
        open={Boolean(deletingCostCenter)}
        onOpenChange={(open) => !open && setDeletingCostCenter(null)}
        title="Excluir centro de custo"
        description={`Tem certeza que deseja excluir "${deletingCostCenter?.name}"?`}
        confirmLabel="Excluir"
        variant="destructive"
        isLoading={deleteCostCenterMutation.isPending}
        onConfirm={confirmDeleteCostCenter}
      />
    </div>
  );
}
