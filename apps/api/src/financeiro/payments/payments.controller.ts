import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../../auth/decorators/permissions.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { QueryPaymentDto } from './dto/query-payment.dto';
import { UpdatePaymentDto } from './dto/update-payment.dto';
import { PaymentsService } from './payments.service';

@Controller('payments')
@RequirePermissions('financeiro.view')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Get()
  findAll(@Query() query: QueryPaymentDto, @CurrentUser('companyId') companyId: string) {
    return this.paymentsService.findAll(companyId, query);
  }

  @Get(':id')
  findOne(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.paymentsService.findOne(companyId, id);
  }

  @RequirePermissions('financeiro.manage')
  @Post()
  create(
    @Body() dto: CreatePaymentDto,
    @CurrentUser('companyId') companyId: string,
    @CurrentUser('permissions') permissions: string[],
  ) {
    return this.paymentsService.create(companyId, dto, permissions);
  }

  @RequirePermissions('financeiro.manage')
  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdatePaymentDto,
    @CurrentUser('companyId') companyId: string,
  ) {
    return this.paymentsService.update(companyId, id, dto);
  }

  @RequirePermissions('financeiro.manage')
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('companyId') companyId: string) {
    return this.paymentsService.remove(companyId, id);
  }
}
