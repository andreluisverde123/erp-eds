import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from '../../common/tenancy/default-roles';
import { AUDIT_LOG_MODULES } from '../../configuracoes/audit-logs/audit-log-modules.constant';
import { requiredPermissionForEntity } from '../../configuracoes/audit-logs/entity-permissions.constant';
import { CatalogItemPricesController } from './catalog-item-prices.controller';
import { CreateManualPriceDto, CreatePurchasePriceDto } from './dto/catalog-item-price.dto';

const reflector = new Reflector();

function exigidaPara(metodo: keyof CatalogItemPricesController): string[] {
  return reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
    CatalogItemPricesController.prototype[metodo] as unknown as () => void,
    CatalogItemPricesController,
  ]);
}

const papel = (nome: string) => DEFAULT_ROLES.find((r) => r.name === nome)!.permissionCodes;
const pode = (nome: string, exigidas: string[]) =>
  exigidas.every((permissao) => papel(nome).includes(permissao));

describe('Permissões das rotas de preço', () => {
  it('consultar histórico e vigente exige composicoes.view', () => {
    expect(exigidaPara('history')).toEqual(['composicoes.view']);
    expect(exigidaPara('priceAt')).toEqual(['composicoes.view']);
  });

  it('registrar manual exige composicoes.manage', () => {
    expect(exigidaPara('registerManual')).toEqual(['composicoes.manage']);
  });

  it('ver e registrar preço de compra exige composicoes.manage E compras.view', () => {
    expect(exigidaPara('purchaseCandidates')).toEqual(['composicoes.manage', 'compras.view']);
    expect(exigidaPara('registerFromPurchase')).toEqual(['composicoes.manage', 'compras.view']);
  });

  it('nenhuma rota fica sem exigência DECLARADA NO MÉTODO', () => {
    const rotas = Object.getOwnPropertyNames(CatalogItemPricesController.prototype).filter(
      (nome) => nome !== 'constructor',
    ) as (keyof CatalogItemPricesController)[];

    expect(rotas).toHaveLength(5);
    for (const rota of rotas) {
      const doMetodo = Reflect.getMetadata(
        PERMISSIONS_KEY,
        CatalogItemPricesController.prototype[rota],
      ) as string[] | undefined;
      expect(doMetodo?.length).toBeGreaterThan(0);
    }
  });

  it('nenhuma permissão nova foi criada', () => {
    const codigos = DEFAULT_PERMISSIONS.map((p) => p.code);
    for (const rota of ['history', 'priceAt', 'registerManual', 'purchaseCandidates'] as const) {
      for (const permissao of exigidaPara(rota)) expect(codigos).toContain(permissao);
    }
    expect(codigos.filter((c) => /preco|price/i.test(c))).toEqual([]);
  });
});

describe('Quem pode o quê, com os papéis padrão', () => {
  it('Administrador e Engenharia consultam, registram e usam preço de compra', () => {
    for (const nome of ['Administrador', 'Engenharia']) {
      expect(pode(nome, exigidaPara('history'))).toBe(true);
      expect(pode(nome, exigidaPara('registerManual'))).toBe(true);
      expect(pode(nome, exigidaPara('registerFromPurchase'))).toBe(true);
    }
  });

  it('Diretoria CONSULTA, mas não registra', () => {
    expect(pode('Diretoria', exigidaPara('history'))).toBe(true);
    expect(pode('Diretoria', exigidaPara('registerManual'))).toBe(false);
    expect(pode('Diretoria', exigidaPara('registerFromPurchase'))).toBe(false);
  });

  it('Compras NÃO vê preço de referência só por consultar o catálogo', () => {
    // O acesso de Compras não foi ampliado: o preço é assunto de quem orça.
    expect(pode('Compras', exigidaPara('history'))).toBe(false);
    expect(pode('Compras', exigidaPara('purchaseCandidates'))).toBe(false);
  });

  it('Financeiro, RH e Fiscal de Obra não acessam', () => {
    for (const nome of ['Financeiro', 'RH', 'Fiscal de Obra']) {
      expect(pode(nome, exigidaPara('history'))).toBe(false);
    }
  });
});

describe('Auditoria de preço', () => {
  it('o registro é auditado e o histórico exige a permissão do módulo', () => {
    expect(requiredPermissionForEntity('CatalogItemPrice')).toBe('composicoes.view');
    expect(AUDIT_LOG_MODULES.composicoes).toContain('CatalogItemPrice');
  });
});

describe('Contrato de entrada', () => {
  const errosDe = (Classe: new () => object, corpo: object) =>
    validate(plainToInstance(Classe, corpo), { whitelist: true, forbidNonWhitelisted: true });

  it('origem, unidade, empresa e autor não são aceitos do cliente', async () => {
    const erros = await errosDe(CreateManualPriceDto, {
      unitPrice: 38.75,
      referenceDate: '2026-09-10',
      source: 'PURCHASE',
      unit: 'KG',
      companyId: 'x',
      createdById: 'y',
    });

    expect(erros.map((e) => e.property).sort()).toEqual(['companyId', 'createdById', 'source', 'unit']);
  });

  it('preço negativo, cinco casas e data com hora são recusados', async () => {
    const erros = await errosDe(CreateManualPriceDto, {
      unitPrice: -1,
      referenceDate: '2026-09-10T03:00:00.000Z',
    });

    expect(erros.map((e) => e.property).sort()).toEqual(['referenceDate', 'unitPrice']);
    expect(
      (await errosDe(CreateManualPriceDto, { unitPrice: 1.23456, referenceDate: '2026-09-10' })).map(
        (e) => e.property,
      ),
    ).toEqual(['unitPrice']);
  });

  it('o preço de compra não aceita valor nem data: vêm da compra', async () => {
    const erros = await errosDe(CreatePurchasePriceDto, {
      purchaseOrderItemId: 'eeeeeeee-0000-4000-8000-000000000001',
      unitPrice: 1,
      referenceDate: '2026-09-10',
    });

    expect(erros.map((e) => e.property).sort()).toEqual(['referenceDate', 'unitPrice']);
  });
});

describe('A migration do ORC-03', () => {
  const sql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20260915090000_precos_de_referencia/migration.sql'),
    'utf8',
  );
  const comandos = sql
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');

  it('é aditiva: não apaga, não reescreve e não altera tabela existente', () => {
    expect(comandos).not.toMatch(/\bDROP\b/i);
    expect(comandos).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(comandos).not.toMatch(/^\s*UPDATE\s/im);
    expect(comandos).not.toMatch(/ALTER\s+TABLE\s+"(?!CatalogItemPrice")/i);
  });

  it('não faz backfill: nenhum preço de composição vira histórico', () => {
    expect(comandos).not.toMatch(/INSERT\s+INTO/i);
    expect(comandos).not.toMatch(/"CompositionItem"/);
  });

  it('usa a escala de preço decidida e protege o histórico no banco', () => {
    expect(comandos).toMatch(/"unitPrice"\s+DECIMAL\(14,4\)/);
    expect(comandos).toContain('CHECK ("unitPrice" >= 0)');
    expect(comandos).toMatch(/"referenceDate"\s+DATE/);
    expect(comandos).not.toMatch(/"updatedAt"/);
  });

  it('a linha de compra não tem FK: editar ordem recria as linhas', () => {
    expect(comandos).not.toMatch(/FOREIGN KEY \("purchaseOrderItemId"\)/);
    expect(comandos).toContain('FOREIGN KEY ("purchaseOrderId")');
  });
});
