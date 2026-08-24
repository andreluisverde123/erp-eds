import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Ip,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { BankAccountsService, type BankAccountView } from './bank-accounts.service';
import { CreateBankAccountDto } from './dto/create-bank-account.dto';
import { QueryBankAccountDto } from './dto/query-bank-account.dto';
import { UpdateBankAccountStatusDto } from './dto/update-bank-account-status.dto';
import { UpdateBankAccountDto } from './dto/update-bank-account.dto';

/// Dados bancários de quem recebe dinheiro da empresa.
///
/// Três permissões, e não duas, porque aqui há três coisas diferentes a
/// autorizar: saber que a conta existe (`view`, devolve mascarado), mexer nela
/// (`manage`) e LER o número inteiro (`reveal`). Nos outros módulos `view` e
/// `manage` bastam porque consultar já é ver tudo.
@Controller('admin/bank-accounts')
@RequirePermissions('dados_bancarios.view')
export class BankAccountsController {
  constructor(private readonly bankAccounts: BankAccountsService) {}

  /// Sempre de um titular só (`ownerType` + `ownerId`) — ver `QueryBankAccountDto`.
  ///
  /// `encryptionConfigured` acompanha a lista para a tela conseguir explicar
  /// um ambiente sem `BANK_DATA_ENCRYPTION_KEY` antes do usuário tentar salvar.
  @Get()
  async findAll(
    @Query() query: QueryBankAccountDto,
    @CurrentUser('companyId') companyId: string,
  ): Promise<{ data: BankAccountView[]; encryptionConfigured: boolean }> {
    return {
      data: await this.bankAccounts.findAllByOwner(companyId, query),
      encryptionConfigured: this.bankAccounts.encryptionConfigured,
    };
  }

  @RequirePermissions('dados_bancarios.view', 'dados_bancarios.manage')
  @Post()
  create(
    @Body() dto: CreateBankAccountDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.bankAccounts.create(companyId, actingUserId, ip, dto);
  }

  @RequirePermissions('dados_bancarios.view', 'dados_bancarios.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.bankAccounts.update(companyId, actingUserId, ip, id, dto);
  }

  /// Desativar é o que existe no lugar de excluir — ver o comentário de
  /// `isActive` no schema.
  @RequirePermissions('dados_bancarios.view', 'dados_bancarios.manage')
  @Patch(':id/status')
  updateStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBankAccountStatusDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.bankAccounts.updateStatus(companyId, actingUserId, ip, id, dto.isActive);
  }

  /// POST, não GET, apesar de não alterar nada: um GET com dado bancário no
  /// corpo entra em histórico de navegador, cache de proxy e réplica de log de
  /// acesso. E ele grava auditoria — o que, a rigor, o torna um efeito.
  @RequirePermissions('dados_bancarios.view', 'dados_bancarios.reveal')
  @Post(':id/reveal')
  @HttpCode(HttpStatus.OK)
  reveal(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('sub') actingUserId: string,
    @Ip() ip: string,
  ) {
    return this.bankAccounts.reveal(companyId, actingUserId, ip, id);
  }
}
