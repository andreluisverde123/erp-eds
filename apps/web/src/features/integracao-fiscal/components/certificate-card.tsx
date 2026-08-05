import { useRef, useState } from 'react';
import { AlertTriangle, ShieldCheck, Trash2, Upload } from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Label,
} from '@repo/ui';

import { ApiError } from '@/lib/api-client';

import { useRemoveCertificate, useUploadCertificate } from '../hooks';
import { formatCnpj, formatDateTime } from '../status-labels';
import type { CertificateInfo } from '../types';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-sm text-foreground">{value}</span>
    </div>
  );
}

export function CertificateCard({ certificate }: { certificate: CertificateInfo | null }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [password, setPassword] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const uploadMutation = useUploadCertificate();
  const removeMutation = useRemoveCertificate();

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    setErro(null);

    if (!file) return setErro('Selecione o arquivo .pfx ou .p12 do certificado.');
    if (!password) return setErro('Informe a senha do certificado.');

    try {
      await uploadMutation.mutateAsync({ file, password });
      // A senha some do estado assim que é enviada: ela não precisa continuar
      // viva na memória do navegador depois de cifrada no servidor.
      setPassword('');
      if (fileRef.current) fileRef.current.value = '';
    } catch (error) {
      setErro(error instanceof ApiError ? error.message : 'Não foi possível enviar o certificado.');
    }
  }

  const vencendo = certificate && !certificate.expirado && certificate.diasParaExpirar <= 30;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Certificado Digital A1</CardTitle>
        <CardDescription>
          Usado para autenticar na SEFAZ. O arquivo e a senha são gravados criptografados e nunca
          são exibidos de volta.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {certificate ? (
          <>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Titular" value={certificate.subjectName} />
              <Field label="CNPJ" value={formatCnpj(certificate.cnpj)} />
              <Field label="Emissor" value={certificate.issuerName} />
              <Field label="Série" value={certificate.serialNumber} />
              <Field
                label="Válido até"
                value={`${new Date(certificate.notAfter).toLocaleDateString('pt-BR')} (${certificate.diasParaExpirar} dias)`}
              />
              <Field label="Instalado em" value={formatDateTime(certificate.uploadedAt)} />
            </div>

            {certificate.expirado && (
              <Alert variant="destructive">
                <AlertTriangle />
                <AlertTitle>Certificado expirado</AlertTitle>
                <AlertDescription>
                  A sincronização está parada. Envie um certificado válido para retomar.
                </AlertDescription>
              </Alert>
            )}

            {/* Um A1 vale 1 ano e a renovação não é automática. Avisar só no
                vencimento seria avisar tarde demais. */}
            {vencendo && (
              <Alert>
                <AlertTriangle />
                <AlertTitle>Vence em {certificate.diasParaExpirar} dias</AlertTitle>
                <AlertDescription>
                  Providencie a renovação — quando vencer, a sincronização para sem aviso.
                </AlertDescription>
              </Alert>
            )}
          </>
        ) : (
          <div className="flex flex-col items-center gap-2 rounded-md border border-dashed border-border px-4 py-8 text-center">
            <ShieldCheck className="size-8 text-muted-foreground/60" strokeWidth={1.5} />
            <p className="text-sm text-muted-foreground">Nenhum certificado instalado.</p>
            <p className="text-xs text-muted-foreground">
              Sem ele o sistema não consegue consultar a SEFAZ.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <span className="text-xs font-medium text-muted-foreground">
            {certificate ? 'Substituir certificado' : 'Instalar certificado'}
          </span>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pfx">Arquivo (.pfx ou .p12)</Label>
              <Input id="pfx" type="file" accept=".pfx,.p12" ref={fileRef} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="pfx-password">Senha</Label>
              <Input
                id="pfx-password"
                type="password"
                autoComplete="off"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            </div>
          </div>

          {erro && (
            <Alert variant="destructive">
              <AlertTitle>{erro}</AlertTitle>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" onClick={handleUpload} disabled={uploadMutation.isPending}>
              <Upload />
              {uploadMutation.isPending ? 'Enviando...' : 'Enviar certificado'}
            </Button>
            {certificate && (
              <Button
                type="button"
                variant="outline"
                className="text-destructive"
                disabled={removeMutation.isPending}
                onClick={() => removeMutation.mutate()}
              >
                <Trash2 />
                Remover
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
