import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';

import { isUniqueConstraintError } from '../../../common/utils/prisma-error.util';
import { PrismaService } from '../../../prisma/prisma.service';
import { DailyReportsService, type DailyReportDetail } from '../daily-reports.service';
import { parseTimeOfDay } from '../report-time';
import { CreateActivityDto, UpdateActivityDto } from './dto/activity.dto';
import { CreateEquipmentDto, UpdateEquipmentDto } from './dto/equipment.dto';
import { CreateLaborDto, UpdateLaborDto } from './dto/labor.dto';
import { CreateMaterialDto, UpdateMaterialDto } from './dto/material.dto';
import { CreateOccurrenceDto, UpdateOccurrenceDto } from './dto/occurrence.dto';

const ITEM_NOT_FOUND = 'Item não encontrado neste relatório.';
const DUPLICATE_ROLE = 'Esta função já foi registrada neste relatório. Edite a quantidade dela.';

/// Listas do RDO: mão de obra, equipamentos, atividades e ocorrências.
///
/// **Autorização.** Nenhum método aqui fala com o `SiteAccessService`. Todos
/// passam por `DailyReportsService.assertWritable`, que faz as três perguntas
/// numa chamada só — o relatório existe, é de uma obra vinculada a esta
/// pessoa, e ainda está em rascunho. Uma seção nova amanhã herda as três de
/// graça, e não há caminho onde uma delas seja esquecida.
///
/// **Item pertence ao relatório.** Editar e excluir usam `updateMany`/
/// `deleteMany` com `{ id, dailyReportId }` no `where`, e conferem o `count`.
/// Isso resolve num comando só o que um `findUnique` + comparação faria em
/// dois, e sem a janela entre ler e escrever: um id de item de OUTRO relatório
/// simplesmente não casa, e vira 404.
///
/// **Resposta.** Toda operação devolve o relatório INTEIRO, não o item. São
/// mais bytes, e é de propósito: a tela precisa do resumo recalculado ("5
/// funções · 18 pessoas") a cada mudança, e devolver só o item obrigaria a uma
/// segunda requisição — numa conexão de canteiro, uma ida a mais custa mais
/// que os bytes a mais.
@Injectable()
export class DailyReportItemsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reports: DailyReportsService,
  ) {}

  // --- Mão de obra ---------------------------------------------------------

  async addLabor(
    companyId: string,
    userId: string,
    reportId: string,
    dto: CreateLaborDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    try {
      await this.prisma.dailyReportLabor.create({
        data: { dailyReportId: reportId, role: dto.role, quantity: dto.quantity },
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_ROLE);
      }
      throw error;
    }

    return this.reports.findOne(companyId, userId, reportId);
  }

  async updateLabor(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
    dto: UpdateLaborDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const where = { id: itemId, dailyReportId: reportId };
    const data = this.somenteDefinidos({ role: dto.role, quantity: dto.quantity });

    try {
      await this.escreverItem(
        Object.keys(data).length > 0,
        () => this.prisma.dailyReportLabor.updateMany({ where, data }),
        () => this.prisma.dailyReportLabor.count({ where }),
      );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException(DUPLICATE_ROLE);
      }
      throw error;
    }

    return this.reports.findOne(companyId, userId, reportId);
  }

  async removeLabor(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const { count } = await this.prisma.dailyReportLabor.deleteMany({
      where: { id: itemId, dailyReportId: reportId },
    });
    if (count === 0) throw new NotFoundException(ITEM_NOT_FOUND);

    return this.reports.findOne(companyId, userId, reportId);
  }

  // --- Equipamentos --------------------------------------------------------

  async addEquipment(
    companyId: string,
    userId: string,
    reportId: string,
    dto: CreateEquipmentDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    await this.prisma.dailyReportEquipment.create({
      data: {
        dailyReportId: reportId,
        name: dto.name,
        quantity: dto.quantity,
        notes: dto.notes ?? null,
      },
    });

    return this.reports.findOne(companyId, userId, reportId);
  }

  async updateEquipment(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
    dto: UpdateEquipmentDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const where = { id: itemId, dailyReportId: reportId };
    const data = this.somenteDefinidos({
      name: dto.name,
      quantity: dto.quantity,
      notes: dto.notes,
    });

    await this.escreverItem(
      Object.keys(data).length > 0,
      () => this.prisma.dailyReportEquipment.updateMany({ where, data }),
      () => this.prisma.dailyReportEquipment.count({ where }),
    );

    return this.reports.findOne(companyId, userId, reportId);
  }

  async removeEquipment(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const { count } = await this.prisma.dailyReportEquipment.deleteMany({
      where: { id: itemId, dailyReportId: reportId },
    });
    if (count === 0) throw new NotFoundException(ITEM_NOT_FOUND);

    return this.reports.findOne(companyId, userId, reportId);
  }

  // --- Atividades ----------------------------------------------------------

  async addActivity(
    companyId: string,
    userId: string,
    reportId: string,
    dto: CreateActivityDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    // A posição é atribuída pelo servidor: a atividade nova entra no fim da
    // lista. Aceitá-la do cliente permitiria duas atividades na mesma posição
    // e uma ordem que depende de quem salvou por último.
    const { _max } = await this.prisma.dailyReportActivity.aggregate({
      where: { dailyReportId: reportId },
      _max: { position: true },
    });

    await this.prisma.dailyReportActivity.create({
      data: {
        dailyReportId: reportId,
        description: dto.description,
        location: dto.location ?? null,
        notes: dto.notes ?? null,
        position: (_max.position ?? 0) + 1,
      },
    });

    return this.reports.findOne(companyId, userId, reportId);
  }

  async updateActivity(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
    dto: UpdateActivityDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const where = { id: itemId, dailyReportId: reportId };
    const data = this.somenteDefinidos({
      description: dto.description,
      location: dto.location,
      notes: dto.notes,
    });

    await this.escreverItem(
      Object.keys(data).length > 0,
      () => this.prisma.dailyReportActivity.updateMany({ where, data }),
      () => this.prisma.dailyReportActivity.count({ where }),
    );

    return this.reports.findOne(companyId, userId, reportId);
  }

  async removeActivity(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const { count } = await this.prisma.dailyReportActivity.deleteMany({
      where: { id: itemId, dailyReportId: reportId },
    });
    if (count === 0) throw new NotFoundException(ITEM_NOT_FOUND);

    // As posições das restantes NÃO são recompactadas. Um buraco na sequência
    // (1, 2, 4) não muda a ordem de exibição nem incomoda ninguém, e reescrever
    // todas as linhas a cada exclusão gastaria escrita para consertar algo que
    // não está quebrado.
    return this.reports.findOne(companyId, userId, reportId);
  }

  // --- Ocorrências ---------------------------------------------------------

  async addOccurrence(
    companyId: string,
    userId: string,
    reportId: string,
    dto: CreateOccurrenceDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    await this.prisma.dailyReportOccurrence.create({
      data: {
        dailyReportId: reportId,
        type: dto.type,
        description: dto.description,
        occurredAtMinutes: this.minutosDe(dto.occurredAtTime),
        notes: dto.notes ?? null,
      },
    });

    return this.reports.findOne(companyId, userId, reportId);
  }

  async updateOccurrence(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
    dto: UpdateOccurrenceDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const where = { id: itemId, dailyReportId: reportId };
    const data = this.somenteDefinidos({
      type: dto.type,
      description: dto.description,
      notes: dto.notes,
      // `undefined` = não mexer; `null` = limpar o horário. São coisas
      // diferentes, e colapsá-las tiraria do usuário a possibilidade de
      // apagar um horário informado por engano.
      occurredAtMinutes:
        dto.occurredAtTime === undefined ? undefined : this.minutosDe(dto.occurredAtTime),
    });

    await this.escreverItem(
      Object.keys(data).length > 0,
      () => this.prisma.dailyReportOccurrence.updateMany({ where, data }),
      () => this.prisma.dailyReportOccurrence.count({ where }),
    );

    return this.reports.findOne(companyId, userId, reportId);
  }

  async removeOccurrence(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const { count } = await this.prisma.dailyReportOccurrence.deleteMany({
      where: { id: itemId, dailyReportId: reportId },
    });
    if (count === 0) throw new NotFoundException(ITEM_NOT_FOUND);

    return this.reports.findOne(companyId, userId, reportId);
  }

  // --- Materiais -----------------------------------------------------------
  //
  // Movimentação do DIA, não estoque: nenhum saldo é mantido, nenhum acumulado
  // é calculado. O mesmo material pode aparecer duas vezes no mesmo relatório
  // (parte recebida, parte utilizada), e por isso não há constraint de
  // unicidade por nome como na mão de obra.

  async addMaterial(
    companyId: string,
    userId: string,
    reportId: string,
    dto: CreateMaterialDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    await this.prisma.dailyReportMaterial.create({
      data: {
        dailyReportId: reportId,
        name: dto.name,
        quantity: dto.quantity,
        unit: dto.unit,
        movementType: dto.movementType,
        notes: dto.notes ?? null,
      },
    });

    return this.reports.findOne(companyId, userId, reportId);
  }

  async updateMaterial(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
    dto: UpdateMaterialDto,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const where = { id: itemId, dailyReportId: reportId };
    const data = this.somenteDefinidos({
      name: dto.name,
      quantity: dto.quantity,
      unit: dto.unit,
      movementType: dto.movementType,
      notes: dto.notes,
    });

    await this.escreverItem(
      Object.keys(data).length > 0,
      () => this.prisma.dailyReportMaterial.updateMany({ where, data }),
      () => this.prisma.dailyReportMaterial.count({ where }),
    );

    return this.reports.findOne(companyId, userId, reportId);
  }

  async removeMaterial(
    companyId: string,
    userId: string,
    reportId: string,
    itemId: string,
  ): Promise<DailyReportDetail> {
    await this.reports.assertWritable(companyId, userId, reportId);

    const { count } = await this.prisma.dailyReportMaterial.deleteMany({
      where: { id: itemId, dailyReportId: reportId },
    });
    if (count === 0) throw new NotFoundException(ITEM_NOT_FOUND);

    return this.reports.findOne(companyId, userId, reportId);
  }

  // --- Utilitários ---------------------------------------------------------

  /// Remove as chaves `undefined` do `data` de um update, preservando o tipo.
  private somenteDefinidos<T extends object>(data: T): T {
    return Object.fromEntries(Object.entries(data).filter(([, valor]) => valor !== undefined)) as T;
  }

  /// Aplica o update do item e transforma "nenhuma linha casou" em 404.
  ///
  /// O caso do PATCH sem nenhum campo é tratado à parte, e não é frescura:
  /// `updateMany` com `data` vazio não escreve nada e devolveria `count: 0`,
  /// que viraria um 404 dizendo que o item não existe — quando ele existe e
  /// simplesmente não havia o que mudar. Aí a existência é conferida por um
  /// `count`, e a resposta é o relatório inalterado.
  private async escreverItem(
    temCampos: boolean,
    atualizar: () => Promise<{ count: number }>,
    contar: () => Promise<number>,
  ): Promise<void> {
    const encontrados = temCampos ? (await atualizar()).count : await contar();
    if (encontrados === 0) {
      throw new NotFoundException(ITEM_NOT_FOUND);
    }
  }

  private minutosDe(valor: string | null | undefined): number | null {
    if (valor === null || valor === undefined || valor === '') return null;
    return parseTimeOfDay(valor, 'Horário da ocorrência');
  }
}
