import { describe, expect, it } from 'vitest';

import { queryClient } from './query-client';

/// Estes valores não são preferência de configuração: são a diferença entre
/// uma lista mostrar o que acabou de ser criado ou mostrar a cópia anterior.
/// Mudá-los sem intenção reintroduz o atraso que se sentia ao criar um
/// registro e ir para a lista — por isso o teste existe.
describe('política de atualização das consultas', () => {
  const padrao = queryClient.getDefaultOptions().queries;

  it('recarrega SEMPRE ao abrir a tela', () => {
    // Com o padrão anterior ("só se estiver velho"), a lista aberta dentro dos
    // 30s do staleTime vinha do cache — sem o registro recém-criado.
    expect(padrao?.refetchOnMount).toBe('always');
  });

  it('recarrega ao voltar para a aba', () => {
    // Estava desligado: com a lista numa aba e o cadastro em outra, voltar
    // para a primeira não trazia nada de novo.
    expect(padrao?.refetchOnWindowFocus).toBe(true);
  });

  it('mantém uma janela de frescor para o foco não virar rajada', () => {
    // O `staleTime` continua valendo para o FOCO — sem ele, alternar janelas
    // a cada poucos segundos dispararia uma busca por vez.
    expect(padrao?.staleTime).toBe(30_000);
  });
});
