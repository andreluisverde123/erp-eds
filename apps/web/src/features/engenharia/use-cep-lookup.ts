import { useRef, useState } from 'react';

import { apiClient } from '@/lib/api-client';

/// O que a busca por CEP sabe preencher.
///
/// NÚMERO e COMPLEMENTO ficam de fora porque nenhuma base de CEP os conhece —
/// são do imóvel, não do logradouro. É por isso que a busca PREENCHE o
/// formulário em vez de substituí-lo.
export interface EnderecoDoCep {
  addressLine: string;
  neighborhood: string;
  city: string;
  state: string;
}

/// Busca o endereço de um CEP e devolve o que preencher.
///
/// **Nada aqui trava o cadastro.** CEP inexistente, provedor fora do ar,
/// resposta estranha: a busca simplesmente não preenche, os campos continuam
/// digitáveis e a obra é salva do mesmo jeito. Por isso não há mensagem de
/// erro em vermelho — não houve erro do usuário, e culpá-lo por um serviço
/// externo indisponível seria mentira.
///
/// A digitação NUNCA espera: quem já sabe o endereço continua preenchendo por
/// cima enquanto a consulta acontece.
export function useCepLookup() {
  const [buscando, setBuscando] = useState(false);
  /// O último CEP consultado, para não repetir a busca a cada `blur` no campo
  /// — sair e voltar sem alterar o valor não é um pedido novo.
  const ultimo = useRef<string | null>(null);

  async function buscar(cepBruto: string): Promise<EnderecoDoCep | null> {
    const cep = cepBruto.replace(/\D/g, '');
    if (cep.length !== 8 || cep === ultimo.current) return null;

    ultimo.current = cep;
    setBuscando(true);
    try {
      return await apiClient.get<EnderecoDoCep>(`/cep/${cep}`);
    } catch {
      // 404 (CEP inexistente) e falha de rede caem no mesmo lugar de
      // propósito: para quem preenche, as duas significam "digite à mão".
      return null;
    } finally {
      setBuscando(false);
    }
  }

  return { buscar, buscando };
}
