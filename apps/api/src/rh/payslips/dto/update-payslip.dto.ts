import { OmitType, PartialType } from '@nestjs/mapped-types';
import { IsISO8601, IsOptional } from 'class-validator';

import { CreatePayslipDto } from './create-payslip.dto';

/// Sem `employeeId`: o holerite não muda de dono depois de criado.
/// `paidAt` marca o pagamento — uma vez setado, o registro trava para edição
/// (ver PayslipsService.update).
export class UpdatePayslipDto extends PartialType(
  OmitType(CreatePayslipDto, ['employeeId'] as const),
) {
  @IsOptional()
  @IsISO8601(undefined, { message: 'Data de pagamento inválida.' })
  paidAt?: string;
}
