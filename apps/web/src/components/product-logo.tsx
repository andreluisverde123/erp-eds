import { PRODUCT_LOGO, PRODUCT_NAME } from '@/config/product';

/// Logo do PRODUTO (o software vendido). Único lugar do código que aponta para
/// o arquivo do logo — cada produto que nasce desta Foundation troca
/// `VITE_PRODUCT_LOGO`, sem editar tela nenhuma.
///
/// `w-auto` de propósito: os logos dos dois produtos têm proporções diferentes
/// (um é assinatura horizontal, outro é quase quadrado). Largura fixa esticava
/// um deles. A altura é que fica travada, para os dois ocuparem a mesma faixa.
export function ProductLogo({ className = 'h-5 w-auto max-w-none' }: { className?: string }) {
  return <img src={PRODUCT_LOGO} alt={PRODUCT_NAME} className={className} />;
}
