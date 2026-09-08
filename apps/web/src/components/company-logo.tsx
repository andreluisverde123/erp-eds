import { APP_LOGO, APP_NAME } from '@/config/company';
import { alturaDoLogo } from '@/features/demo-brand/demo-brand';
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

  if (demo?.logo) {
    // Altura em pixel, sobrepondo a classe: as classes de altura deste
    // componente (h-5, h-6, h-8, h-9) foram escolhidas para a assinatura da
    // EDS, que é larga e baixa. A arte de outra empresa quase nunca tem essa
    // proporção, e é por isso que a altura passa a ser um controle da
    // demonstração em vez de uma constante.
    return (
      <img
        src={demo.logo}
        alt={demo.erpName}
        className={className}
        style={{ height: alturaDoLogo(demo), width: 'auto' }}
      />
    );
  }

  return <img src={APP_LOGO} alt={APP_NAME} className={className} />;
}
