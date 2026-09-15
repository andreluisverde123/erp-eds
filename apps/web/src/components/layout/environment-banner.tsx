/// Faixa que identifica um ambiente que NÃO é a produção.
///
/// O staging nasce como cópia do banco de produção: mesmos usuários, mesmas
/// obras, mesmas senhas. Sem um aviso impossível de ignorar, alguém lança uma
/// solicitação de verdade no endereço de testes e ela nunca chega à produção.
///
/// O rótulo vem de `VITE_ENVIRONMENT_LABEL`, assado no bundle em tempo de
/// build (build arg da imagem do web). Vazio — o caso da produção — não
/// renderiza nada.
export function EnvironmentBanner({
  label = import.meta.env.VITE_ENVIRONMENT_LABEL,
}: {
  label?: string;
}) {
  const texto = label?.trim();
  if (!texto) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[60] w-full bg-amber-400 px-4 py-1 text-center text-xs font-semibold tracking-wide text-amber-950"
    >
      {texto} — os dados lançados aqui não vão para a produção
    </div>
  );
}
