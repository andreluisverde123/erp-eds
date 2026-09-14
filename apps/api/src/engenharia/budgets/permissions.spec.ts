import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from '../../common/tenancy/default-roles';
import { AUDIT_LOG_MODULES } from '../../configuracoes/audit-logs/audit-log-modules.constant';
import { requiredPermissionForEntity } from '../../configuracoes/audit-logs/entity-permissions.constant';
import { ReferenceDatasetsController } from '../reference/reference-datasets.controller';
import { BudgetsController } from './budgets.controller';
import { CreateBudgetDto, CreateBudgetItemDto } from './dto/budget.dto';

const reflector = new Reflector();

function exigidaPara(metodo: keyof BudgetsController): string[] {
  return reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
    BudgetsController.prototype[metodo] as unknown as () => void,
    BudgetsController,
  ]);
}

const papel = (nome: string) => DEFAULT_ROLES.find((r) => r.name === nome)!.permissionCodes;

describe('Permissões das rotas de orçamento', () => {
  it('consultar exige orcamentos.view', () => {
    expect(exigidaPara('findAll')).toEqual(['orcamentos.view']);
    expect(exigidaPara('findOne')).toEqual(['orcamentos.view']);
    expect(exigidaPara('versions')).toEqual(['orcamentos.view']);
    expect(exigidaPara('export')).toEqual(['orcamentos.view']);
  });

  it('toda escrita, o fechamento e as buscas do editor exigem orcamentos.manage', () => {
    const escritas: (keyof BudgetsController)[] = [
      'create',
      'update',
      'remove',
      'close',
      'constructionSiteOptions',
      'compositionOptions',
      'catalogOptions',
      'addNode',
      'updateNode',
      'moveNode',
      'removeNode',
      'addItem',
      'updateItem',
      'removeItem',
      'revise',
      'setOfficial',
      'importTemplate',
      'importPreview',
      'import',
      'referenceDatasetOptions',
      'referenceOptions',
    ];
    for (const rota of escritas) expect({ rota, exigida: exigidaPara(rota) }).toEqual({ rota, exigida: ['orcamentos.manage'] });
  });

  it('nenhuma rota fica sem exigência DECLARADA NO MÉTODO', () => {
    const rotas = Object.getOwnPropertyNames(BudgetsController.prototype).filter(
      (nome) => nome !== 'constructor',
    ) as (keyof BudgetsController)[];

    expect(rotas).toHaveLength(25);
    for (const rota of rotas) {
      const doMetodo = Reflect.getMetadata(PERMISSIONS_KEY, BudgetsController.prototype[rota]) as string[] | undefined;
      expect({ rota, declarada: (doMetodo?.length ?? 0) > 0 }).toEqual({ rota, declarada: true });
    }
  });
});

describe('Permissões das bases referenciais', () => {
  const exigida = (metodo: keyof ReferenceDatasetsController) =>
    reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      ReferenceDatasetsController.prototype[metodo] as unknown as () => void,
      ReferenceDatasetsController,
    ]);

  it('consultar exige orcamentos.view; analisar e importar, orcamentos.manage', () => {
    for (const rota of ['findAll', 'findOne', 'searchItems', 'searchCompositions', 'findComposition'] as const) {
      expect({ rota, exigida: exigida(rota) }).toEqual({ rota, exigida: ['orcamentos.view'] });
    }
    for (const rota of ['preview', 'import'] as const) {
      expect({ rota, exigida: exigida(rota) }).toEqual({ rota, exigida: ['orcamentos.manage'] });
    }
  });

  it('nenhuma rota fica sem exigência declarada no método', () => {
    const rotas = Object.getOwnPropertyNames(ReferenceDatasetsController.prototype).filter(
      (nome) => nome !== 'constructor',
    ) as (keyof ReferenceDatasetsController)[];
    expect(rotas).toHaveLength(7);
    for (const rota of rotas) {
      const doMetodo = Reflect.getMetadata(PERMISSIONS_KEY, ReferenceDatasetsController.prototype[rota]) as string[] | undefined;
      expect({ rota, declarada: (doMetodo?.length ?? 0) > 0 }).toEqual({ rota, declarada: true });
    }
  });
});

describe('Permissões de orçamento no seed padrão', () => {
  it('as duas existem', () => {
    const codigos = DEFAULT_PERMISSIONS.map((p) => p.code);
    expect(codigos).toContain('orcamentos.view');
    expect(codigos).toContain('orcamentos.manage');
  });

  it('Administrador e Engenharia gerenciam', () => {
    expect(papel('Administrador')).toContain('orcamentos.manage');
    expect(papel('Engenharia')).toEqual(expect.arrayContaining(['orcamentos.view', 'orcamentos.manage']));
  });

  it('Diretoria consulta, como em Composições', () => {
    expect(papel('Diretoria')).toContain('orcamentos.view');
    expect(papel('Diretoria')).not.toContain('orcamentos.manage');
  });

  it('Compras não recebe acesso a orçamento', () => {
    expect(papel('Compras')).not.toContain('orcamentos.view');
    expect(papel('Compras')).not.toContain('orcamentos.manage');
  });

  it('Financeiro, RH e Fiscal de Obra não recebem', () => {
    for (const nome of ['Financeiro', 'RH', 'Fiscal de Obra']) {
      expect(papel(nome)).not.toContain('orcamentos.view');
    }
  });
});

describe('Auditoria de orçamento', () => {
  it('orçamento, grupo, item e base referencial são auditados sob orcamentos.view', () => {
    for (const entidade of ['Budget', 'BudgetNode', 'BudgetItem', 'ReferenceDataset']) {
      expect(requiredPermissionForEntity(entidade)).toBe('orcamentos.view');
    }
    expect(AUDIT_LOG_MODULES.orcamentos).toEqual(['Budget', 'BudgetNode', 'BudgetItem', 'ReferenceDataset']);
  });
});

describe('Contrato de entrada', () => {
  const errosDe = (Classe: new () => object, corpo: object) =>
    validate(plainToInstance(Classe, corpo), { whitelist: true, forbidNonWhitelisted: true });

  it('código, versão, status, empresa e total não são aceitos na criação', async () => {
    const erros = await errosDe(CreateBudgetDto, {
      constructionSiteId: 'aaaaaaaa-0000-4000-8000-000000000001',
      name: 'Orçamento',
      referenceDate: '2026-09-01',
      code: 'ORC-9',
      version: 2,
      status: 'CLOSED',
      companyId: 'x',
      totalCost: 1,
    });

    expect(erros.map((e) => e.property).sort()).toEqual(['code', 'companyId', 'status', 'totalCost', 'version']);
  });

  it('o total do item não é aceito; quantidade e custo seguem a regra Decimal', async () => {
    const erros = await errosDe(CreateBudgetItemDto, {
      budgetNodeId: 'aaaaaaaa-0000-4000-8000-000000000001',
      source: 'MANUAL',
      quantity: 0.00001,
      unitCost: -1,
      totalCost: 10,
    });

    expect(erros.map((e) => e.property).sort()).toEqual(['quantity', 'totalCost', 'unitCost']);
  });
});

describe('As migrations do ORC-05', () => {
  const ler = (pasta: string) =>
    readFileSync(join(__dirname, `../../../prisma/migrations/${pasta}/migration.sql`), 'utf8')
      .split('\n')
      .filter((linha) => !linha.trim().startsWith('--'))
      .join('\n');
  const valor = ler('20260917090000_orcamento_origem_referencia');
  const estrutura = ler('20260917090100_bases_referenciais_e_orcamento_completo');

  it('o valor novo do enum fica numa migration só dele (ADD VALUE não roda na mesma transação que o usa)', () => {
    expect(valor.trim()).toBe(`ALTER TYPE "BudgetItemSource" ADD VALUE IF NOT EXISTS 'REFERENCE';`);
  });

  it('não apaga nem reescreve dados existentes', () => {
    expect(estrutura).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(estrutura).not.toMatch(/^\s*UPDATE\s/im);
    expect(estrutura).not.toMatch(/DROP\s+(TABLE|COLUMN)/i);
    // O único DROP é o do CHECK de origem, recriado logo abaixo com REFERENCE.
    expect([...estrutura.matchAll(/DROP\s+CONSTRAINT\s+"(\w+)"/gi)].map((m) => m[1])).toEqual(['BudgetItem_source_references']);
    expect(estrutura).not.toMatch(/budgetAmount/);
  });

  it('orçamento oficial preso à própria obra por FK composta', () => {
    expect(estrutura).toMatch(/FOREIGN KEY \("currentBudgetId", "id"\) REFERENCES "Budget"\s*\("id", "constructionSiteId"\)/);
  });

  it('BDI não negativo e bases únicas por fonte, competência, UF, regime e versão', () => {
    expect(estrutura).toContain('CHECK ("bdiPercent" >= 0');
    expect(estrutura).toContain('ON "ReferenceDataset" ("source", "competence", "uf", "regime", "versionLabel")');
  });
});

describe('A migration do ORC-04', () => {
  const sql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20260916090000_orcamento_da_obra/migration.sql'),
    'utf8',
  );
  const comandos = sql
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');

  it('é aditiva: não apaga, não reescreve e só altera as tabelas que cria', () => {
    expect(comandos).not.toMatch(/\bDROP\b/i);
    expect(comandos).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(comandos).not.toMatch(/^\s*UPDATE\s/im);
    expect(comandos).not.toMatch(/ALTER\s+TABLE\s+"(?!Budget"|BudgetNode"|BudgetItem"|BudgetItemComponent")/i);
  });

  it('não faz backfill: só insere permissões', () => {
    const insercoes = [...comandos.matchAll(/INSERT\s+INTO\s+"(\w+)"/gi)].map((m) => m[1]);
    expect([...new Set(insercoes)].sort()).toEqual(['Permission', 'RolePermission']);
    expect(comandos).not.toMatch(/budgetAmount/);
  });

  it('não cria coluna de total', () => {
    expect(comandos).not.toMatch(/"(totalCost|subtotal|total)"/);
  });

  it('prende no banco nó e item ao próprio orçamento (FK composta)', () => {
    expect(comandos).toContain('FOREIGN KEY ("parentId", "budgetId") REFERENCES "BudgetNode"("id", "budgetId")');
    expect(comandos).toContain('FOREIGN KEY ("budgetNodeId", "budgetId") REFERENCES "BudgetNode"("id", "budgetId")');
  });

  it('protege quantidade, custo, origem e fechamento com CHECK', () => {
    expect(comandos).toContain('CHECK ("quantity" > 0)');
    expect(comandos).toContain('CHECK ("unitCost" >= 0)');
    expect(comandos).toContain('"BudgetItem_source_references"');
    expect(comandos).toContain('"Budget_closed_has_date"');
  });

  it('as permissões inseridas são as do seed', () => {
    for (const permissao of DEFAULT_PERMISSIONS.filter((p) => p.module === 'orcamentos')) {
      expect(comandos).toContain(`'${permissao.code}'`);
      expect(comandos).toContain(`'${permissao.description}'`);
    }
  });
});
