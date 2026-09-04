import { Controller, Get, NotFoundException, Param } from '@nestjs/common';

import { CepService } from './cep.service';

/// Busca de endereço por CEP, para os formulários de cadastro.
///
/// SEM `@RequirePermissions`: é consulta a dado público de correios, e exigir
/// permissão de módulo aqui obrigaria a repetir a rota — ou a permissão — a
/// cada formulário que a use (obra, fornecedor, empresa). A sessão continua
/// obrigatória, pelo guard global de autenticação, e o limite de requisições
/// também (100/min, `ThrottlerGuard` global).
@Controller('cep')
export class CepController {
  constructor(private readonly cep: CepService) {}

  /// `404` quando o CEP não existe — e o front trata isso como "digite à mão",
  /// não como erro a exibir. Ver `useCepLookup`.
  @Get(':cep')
  async buscar(@Param('cep') cep: string) {
    const endereco = await this.cep.buscar(cep);
    if (!endereco) throw new NotFoundException('CEP não encontrado.');
    return endereco;
  }
}
