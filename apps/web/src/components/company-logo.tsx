import { APP_LOGO, APP_NAME } from '@/config/company';

/// Logo institucional da EDS. Único lugar do código que aponta para o arquivo
/// do logo — trocar a arte é trocar `EDS_COMPANY.logo`, sem editar tela nenhuma.
///
/// `w-auto` de propósito: a assinatura da EDS é mais alta que larga e uma
/// largura fixa a esticava. A altura é que fica travada, para o logo ocupar
/// sempre a mesma faixa na barra lateral e no login.
export function CompanyLogo({ className = 'h-5 w-auto max-w-none' }: { className?: string }) {
  return <img src={APP_LOGO} alt={APP_NAME} className={className} />;
}
