import { Injectable, Logger } from '@nestjs/common';

/// O que uma base de CEP sabe responder.
///
/// Repare no que NÃO está aqui: NÚMERO e COMPLEMENTO. Nenhuma base de CEP os
/// conhece — são do imóvel, não do logradouro. Continuam digitados, e é por
/// isso que a busca preenche o formulário em vez de substituí-lo.
export interface EnderecoDoCep {
  addressLine: string;
  neighborhood: string;
  city: string;
  state: string;
}

/// Quantos CEPs ficam em memória.
///
/// A relação CEP → logradouro é praticamente imutável, então não há por que
/// expirar por tempo. O teto existe só para o mapa não crescer sem limite num
/// processo de vida longa; ao estourar, o mais antigo sai.
const CACHE_MAX = 500;

const VIACEP_TIMEOUT_MS = 4000;

/// Busca de endereço por CEP.
///
/// **Por que passa pela API e não pelo navegador.** Três razões, e a terceira
/// é a que decide: o provedor fica num lugar só e pode ser trocado sem tocar
/// no front; o cache serve TODOS os usuários, e numa construtora os CEPs se
/// repetem muito (obras na mesma cidade, fornecedores no mesmo distrito); e o
/// ERP trata chamada a terceiro como assunto do servidor — é onde a SEFAZ já
/// vive.
///
/// **Nada aqui pode travar um cadastro.** CEP inexistente, ViaCEP fora do ar,
/// resposta estranha: tudo devolve `null`, o formulário segue editável à mão e
/// a obra é salva do mesmo jeito. Mesma regra do logo no PDF — serviço externo
/// não impede o trabalho.
@Injectable()
export class CepService {
  private readonly logger = new Logger(CepService.name);
  private readonly cache = new Map<string, EnderecoDoCep | null>();

  async buscar(cepBruto: string): Promise<EnderecoDoCep | null> {
    const cep = cepBruto.replace(/\D/g, '');
    if (cep.length !== 8) return null;

    // `has` e não `get`: um CEP que não existe também é resposta, e vale
    // guardar — do contrário cada tecla numa digitação errada bateria fora.
    if (this.cache.has(cep)) return this.cache.get(cep) ?? null;

    const endereco = await this.consultar(cep);
    this.guardar(cep, endereco);
    return endereco;
  }

  private async consultar(cep: string): Promise<EnderecoDoCep | null> {
    try {
      // Timeout próprio: sem ele, um provedor lento seguraria a requisição do
      // usuário até o limite do servidor, e o campo pareceria travado.
      const resposta = await fetch(`https://viacep.com.br/ws/${cep}/json/`, {
        signal: AbortSignal.timeout(VIACEP_TIMEOUT_MS),
      });

      if (!resposta.ok) return null;

      const dados = (await resposta.json()) as {
        erro?: boolean | string;
        logradouro?: string;
        bairro?: string;
        localidade?: string;
        uf?: string;
      };

      // O ViaCEP responde 200 com `{"erro": true}` para CEP inexistente — a
      // falha não vem no status. Em algumas versões o campo vem como string.
      if (dados.erro) return null;
      if (!dados.localidade || !dados.uf) return null;

      return {
        // Logradouro e bairro vêm vazios em CEP de cidade inteira (interior).
        // Não é erro: a cidade e a UF já preenchem o que se sabe.
        addressLine: dados.logradouro?.trim() ?? '',
        neighborhood: dados.bairro?.trim() ?? '',
        city: dados.localidade.trim(),
        state: dados.uf.trim().toUpperCase(),
      };
    } catch (error) {
      this.logger.warn(
        `Consulta de CEP falhou: ${error instanceof Error ? error.message : error}. O cadastro segue digitável.`,
      );
      return null;
    }
  }

  private guardar(cep: string, endereco: EnderecoDoCep | null): void {
    if (this.cache.size >= CACHE_MAX) {
      // `Map` preserva a ordem de inserção, então a primeira chave é a mais
      // antiga.
      const maisAntigo = this.cache.keys().next().value;
      if (maisAntigo !== undefined) this.cache.delete(maisAntigo);
    }
    this.cache.set(cep, endereco);
  }
}
