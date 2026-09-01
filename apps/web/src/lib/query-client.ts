import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      /// Por quanto tempo um dado já buscado é considerado atual.
      ///
      /// Vale para o recarregamento por FOCO, não para a montagem da tela —
      /// ver `refetchOnMount` abaixo. Trinta segundos evitam que alternar
      /// janelas a cada poucos segundos vire uma rajada de requisições.
      staleTime: 30_000,
      gcTime: 5 * 60_000,

      /// SEMPRE recarrega ao abrir a tela, mesmo com dado "atual" em cache.
      ///
      /// Era o padrão (recarregar só se estiver velho), e produzia o atraso
      /// que se sentia ao criar um registro e ir para a lista: dentro dos 30
      /// segundos do `staleTime`, a lista abria com a cópia anterior — sem o
      /// que acabara de ser criado — e só se corrigia depois.
      ///
      /// A invalidação da mutação não bastava: ela marca a consulta como
      /// velha, e quem decide recarregar é a política de montagem. Com o
      /// padrão anterior havia caminhos em que a marcação não virava busca.
      ///
      /// O custo é uma requisição por tela aberta. Numa API que responde em
      /// menos de um segundo, é preço baixo por uma lista que nunca mente.
      refetchOnMount: 'always',

      /// Recarrega ao voltar para a aba — respeitando o `staleTime`.
      ///
      /// Estava DESLIGADO, e era o outro meio caminho do mesmo problema: com
      /// a lista aberta numa aba e o cadastro feito em outra, voltar para a
      /// primeira não trazia nada de novo. Ligado, ele só busca se o dado
      /// passou dos 30 segundos — trocar de janela para copiar algo e voltar
      /// continua sem custo nenhum.
      refetchOnWindowFocus: true,

      retry: 1,
    },
  },
});
