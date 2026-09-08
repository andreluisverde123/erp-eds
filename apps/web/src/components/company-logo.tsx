import { APP_LOGO, APP_NAME } from '@/config/company';
import { useMarcaDemo } from '@/features/demo-brand/use-demo-brand';

/// Logo institucional da EDS. Único lugar do código que aponta para o arquivo
/// do logo — trocar a arte é trocar `EDS_COMPANY.logo`, sem editar tela nenhuma.
///
/// `w-auto` de propósito: a assinatura da EDS é mais alta que larga e uma
/// largura fixa a esticava. A altura é que fica travada, para o logo ocupar
/// sempre a mesma faixa na barra lateral e no login.
export function CompanyLogo({ className = 'h-5 w-auto max-w-none' }: { className?: string }) {
  // Esta é a assinatura que aparece no topo da barra lateral, no login e no
  // cabeçalho do Diário — os lugares onde o cliente da demonstração espera ver
  // a marca DELE. Fora de desenvolvimento não há marca de demonstração e o
  // componente volta a ser o que sempre foi.
  const demo = useMarcaDemo();

  return (
    <img src={demo?.logo ?? APP_LOGO} alt={demo?.erpName ?? APP_NAME} className={className} />
  );
}
