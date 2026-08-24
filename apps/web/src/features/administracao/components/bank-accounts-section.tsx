import { useState } from 'react';
import { Eye, EyeOff, Landmark, Pencil, Plus, ToggleLeft, ToggleRight } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
  Skeleton,
} from '@repo/ui';

import { useAuth } from '@/features/auth/context';

import { useBankAccounts } from '../hooks/use-bank-accounts';
import {
  useRevealBankAccount,
  useUpdateBankAccountStatus,
} from '../hooks/use-bank-account-mutations';
import {
  BANK_ACCOUNT_TYPE_LABELS,
  PIX_KEY_TYPE_LABELS,
  type BankAccount,
  type RevealedBankAccount,
} from '../types';
import { BankAccountFormDrawer } from './bank-account-form-drawer';

interface BankAccountsSectionProps {
  userId: string;
  userName: string;
}

/// Dados bancários dentro do cadastro do usuário — não um módulo à parte.
///
/// A seção inteira some para quem não tem `dados_bancarios.view`: a rota que
/// leva até aqui exige `admin.manage_users`, que é outra coisa. Um admin de
/// acesso não é automaticamente alguém que pode ver para onde vai o dinheiro.
export function BankAccountsSection({ userId, userName }: BankAccountsSectionProps) {
  const { user } = useAuth();
  const permissions = user?.permissions ?? [];
  const podeVer = permissions.includes('dados_bancarios.view');
  const podeEditar = permissions.includes('dados_bancarios.manage');
  const podeRevelar = permissions.includes('dados_bancarios.reveal');

  const { data, isLoading } = useBankAccounts('USER', userId, podeVer);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [emEdicao, setEmEdicao] = useState<BankAccount | null>(null);

  if (!podeVer) return null;

  const contas = data?.data ?? [];

  function abrirCadastro() {
    setEmEdicao(null);
    setDrawerOpen(true);
  }

  function abrirEdicao(conta: BankAccount) {
    setEmEdicao(conta);
    setDrawerOpen(true);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Landmark className="size-4 text-muted-foreground" />
          Dados bancários
        </CardTitle>
        {podeEditar && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={abrirCadastro}>
              <Plus />
              Adicionar conta
            </Button>
          </CardAction>
        )}
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {data && !data.encryptionConfigured && (
          <Alert variant="destructive">
            <AlertTitle>Cofre não configurado neste ambiente</AlertTitle>
            <AlertDescription>
              Falta a variável BANK_DATA_ENCRYPTION_KEY na API. Sem ela não é possível gravar nem
              ler dados bancários.
            </AlertDescription>
          </Alert>
        )}

        {isLoading && <Skeleton className="h-20 w-full" />}

        {!isLoading && contas.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta bancária cadastrada para {userName}.
          </p>
        )}

        {contas.map((conta) => (
          <BankAccountRow
            key={conta.id}
            conta={conta}
            podeEditar={podeEditar}
            podeRevelar={podeRevelar}
            onEditar={() => abrirEdicao(conta)}
          />
        ))}
      </CardContent>

      <BankAccountFormDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        ownerId={userId}
        ownerName={userName}
        account={emEdicao}
      />
    </Card>
  );
}

function BankAccountRow({
  conta,
  podeEditar,
  podeRevelar,
  onEditar,
}: {
  conta: BankAccount;
  podeEditar: boolean;
  podeRevelar: boolean;
  onEditar: () => void;
}) {
  const statusMutation = useUpdateBankAccountStatus();
  const revealMutation = useRevealBankAccount();
  // Vive só aqui, no estado desta linha: sair da tela descarta os valores, que
  // não existem em nenhum cache do app.
  const [revelada, setRevelada] = useState<RevealedBankAccount | null>(null);

  const conta_ = revelada
    ? `${revelada.accountNumber}${revelada.accountDigit ? `-${revelada.accountDigit}` : ''}`
    : `${conta.accountNumberMasked}${conta.accountDigit ? `-${conta.accountDigit}` : ''}`;

  const chavePix = revelada?.pixKey ?? conta.pixKeyMasked;

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">
              {conta.bankCode} — {conta.bankName}
            </span>
            {!conta.isActive && <Badge variant="secondary">Inativa</Badge>}
          </div>
          <span className="text-xs text-muted-foreground">
            {BANK_ACCOUNT_TYPE_LABELS[conta.accountType]} · Ag. {conta.branch}
            {conta.branchDigit ? `-${conta.branchDigit}` : ''}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {podeRevelar && (
            <Button
              variant="ghost"
              size="sm"
              disabled={revealMutation.isPending}
              onClick={async () => {
                if (revelada) {
                  setRevelada(null);
                  return;
                }
                setRevelada(await revealMutation.mutateAsync(conta.id));
              }}
            >
              {revelada ? <EyeOff /> : <Eye />}
              {revelada ? 'Ocultar' : 'Ver completo'}
            </Button>
          )}
          {podeEditar && (
            <>
              <Button variant="ghost" size="sm" onClick={onEditar}>
                <Pencil />
                Editar
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate({ id: conta.id, isActive: !conta.isActive })}
              >
                {conta.isActive ? <ToggleLeft /> : <ToggleRight />}
                {conta.isActive ? 'Desativar' : 'Ativar'}
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Conta" value={conta_} destaque={Boolean(revelada)} />
        <Field
          label={conta.pixKeyType ? `PIX (${PIX_KEY_TYPE_LABELS[conta.pixKeyType]})` : 'PIX'}
          value={chavePix ?? 'Sem chave'}
          destaque={Boolean(revelada?.pixKey)}
        />
        <Field
          label={conta.holder.isOwner ? 'Titular (o próprio)' : 'Titular (terceiro)'}
          value={
            conta.holder.name
              ? `${conta.holder.name}${conta.holder.document ? ` · ${conta.holder.document}` : ''}`
              : '—'
          }
        />
      </div>

      {revelada && (
        <p className="text-xs text-muted-foreground">
          Esta consulta ficou registrada na auditoria, com o seu usuário e a data.
        </p>
      )}
    </div>
  );
}

function Field({
  label,
  value,
  destaque = false,
}: {
  label: string;
  value: string;
  destaque?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span
        className={
          destaque ? 'font-mono text-sm text-foreground' : 'font-mono text-sm text-muted-foreground'
        }
      >
        {value}
      </span>
    </div>
  );
}
