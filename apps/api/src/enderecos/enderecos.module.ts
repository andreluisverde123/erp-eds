import { Module } from '@nestjs/common';

import { CepController } from './cep.controller';
import { CepService } from './cep.service';

/// Consulta de endereço por CEP — apoio aos formulários de cadastro.
///
/// Módulo próprio, e não dentro de Engenharia: a obra é só o primeiro
/// formulário a usar. Fornecedor e Empresa têm os mesmos campos e podem
/// consumir a mesma rota sem que nenhum deles dependa do outro.
@Module({
  controllers: [CepController],
  providers: [CepService],
  exports: [CepService],
})
export class EnderecosModule {}
