/// Gera um código sequencial por empresa (ex.: "SOL-0001"). Baseado num
/// count(), então tem uma janela de corrida teórica sob criação concorrente
/// — aceitável aqui (não é um documento fiscal/contábil que exija
/// sequência estritamente garantida); se isso vier a importar, trocar por
/// uma sequence do Postgres dedicada.
export async function nextSequentialCode(
  count: () => Promise<number>,
  prefix: string,
  padding = 4,
): Promise<string> {
  const total = await count();
  return `${prefix}-${String(total + 1).padStart(padding, '0')}`;
}
