import { Module } from '@nestjs/common';

import { BankAccountCryptoService } from './bank-accounts/bank-account-crypto.service';
import { BankAccountsController } from './bank-accounts/bank-accounts.controller';
import { BankAccountsService } from './bank-accounts/bank-accounts.service';
import { SystemUsersController } from './users/system-users.controller';
import { SystemUsersService } from './users/system-users.service';

/// Administração: gestão dos usuários que têm acesso ao sistema. Os perfis
/// (RBAC) continuam sendo administrados pelo módulo de Configurações — aqui
/// eles só são consumidos, sempre por `roleId`.
///
/// Os dados bancários moram aqui porque é aqui que a tela deles vive (no
/// cadastro do usuário), e não porque pertençam à administração de acesso: o
/// modelo já prevê funcionário e terceirizado como donos, e o dia em que RH e
/// Terceiros ligarem as telas deles é o dia de avaliar um módulo próprio.
@Module({
  controllers: [SystemUsersController, BankAccountsController],
  providers: [SystemUsersService, BankAccountsService, BankAccountCryptoService],
})
export class AdministracaoModule {}
