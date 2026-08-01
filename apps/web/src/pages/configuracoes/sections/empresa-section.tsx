import { ErrorState, LoadingState } from '@repo/ui';

import { CompanyForm } from '@/features/configuracoes/components/company-form';
import { CompanyLogoUploader } from '@/features/configuracoes/components/company-logo-uploader';
import { useCompany } from '@/features/configuracoes/hooks/use-company';

export function EmpresaSection() {
  const { data: company, isLoading, isError } = useCompany();

  if (isError) {
    return <ErrorState message="Não foi possível carregar os dados da empresa. Tente novamente." />;
  }

  if (isLoading || !company) {
    return <LoadingState message="Carregando dados da empresa..." />;
  }

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <CompanyLogoUploader company={company} />
      <CompanyForm company={company} />
    </div>
  );
}
