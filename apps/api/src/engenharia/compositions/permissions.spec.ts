import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { Reflector } from '@nestjs/core';

import { PERMISSIONS_KEY } from '../../auth/decorators/permissions.decorator';
import { AUDIT_LOG_MODULES } from '../../configuracoes/audit-logs/audit-log-modules.constant';
import { requiredPermissionForEntity } from '../../configuracoes/audit-logs/entity-permissions.constant';
import { DEFAULT_PERMISSIONS, DEFAULT_ROLES } from '../../common/tenancy/default-roles';
import { CompositionsController } from './compositions.controller';

const reflector = new Reflector();

function exigidaPara(metodo: keyof CompositionsController): string[] {
  return reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
    CompositionsController.prototype[metodo] as unknown as () => void,
    CompositionsController,
  ]);
}

const papel = (nome: string) => DEFAULT_ROLES.find((r) => r.name === nome)!.permissionCodes;

describe('Permissões das rotas de composição', () => {
  it('consultar exige composicoes.view', () => {
    expect(exigidaPara('findAll')).toEqual(['composicoes.view']);
    expect(exigidaPara('findOne')).toEqual(['composicoes.view']);
  });

  it('criar, editar, excluir e mexer em item exigem composicoes.manage', () => {
    for (const rota of [
      'create',
      'update',
      'remove',
      'addItem',
      'updateItem',
      'removeItem',
    ] as const) {
      expect(exigidaPara(rota)).toEqual(['composicoes.manage']);
    }
  });

  it('a busca de insumo para incluir exige composicoes.manage, não catalogo.view', () => {
    // Ela serve o editor. Exigir `catalogo.view` faria o autocomplete falhar
    // em silêncio para quem mantém composição sem consultar o catálogo.
    expect(exigidaPara('catalogOptions')).toEqual(['composicoes.manage']);
  });

  it('nenhuma rota fica sem exigência DECLARADA NO MÉTODO', () => {
    // O guard usa `getAllAndOverride`: uma rota nova sem decoration herdaria
    // `composicoes.view` da classe e passaria a escrever com permissão de
    // leitura. A lista vem do protótipo, então rota nova entra sozinha.
    const rotas = Object.getOwnPropertyNames(CompositionsController.prototype).filter(
      (nome) => nome !== 'constructor',
    ) as (keyof CompositionsController)[];

    expect(rotas.length).toBeGreaterThanOrEqual(9);
    for (const rota of rotas) {
      const doMetodo = Reflect.getMetadata(
        PERMISSIONS_KEY,
        CompositionsController.prototype[rota],
      ) as string[] | undefined;
      expect({ rota, exigida: doMetodo?.length ?? 0 }).toEqual({
        rota,
        exigida: expect.any(Number),
      });
      expect(doMetodo?.length).toBeGreaterThan(0);
    }
  });
});

describe('Permissões de composição no seed padrão', () => {
  it('as duas existem no catálogo de permissões', () => {
    const codigos = DEFAULT_PERMISSIONS.map((p) => p.code);
    expect(codigos).toContain('composicoes.view');
    expect(codigos).toContain('composicoes.manage');
  });

  it('Administração tem tudo, por construção', () => {
    expect(papel('Administrador')).toContain('composicoes.manage');
  });

  it('Engenharia MANTÉM as composições', () => {
    expect(papel('Engenharia')).toEqual(
      expect.arrayContaining(['composicoes.view', 'composicoes.manage']),
    );
  });

  it('Diretoria CONSULTA, mas não mantém', () => {
    expect(papel('Diretoria')).toContain('composicoes.view');
    expect(papel('Diretoria')).not.toContain('composicoes.manage');
  });

  it('Compras não vê custo de composição só por consultar o catálogo', () => {
    // A composição tem preço e o catálogo não: separar as permissões é o que
    // mantém essa diferença.
    expect(papel('Compras')).toContain('catalogo.view');
    expect(papel('Compras')).not.toContain('composicoes.view');
  });

  it('quem não precisa não recebe', () => {
    for (const nome of ['Financeiro', 'RH', 'Fiscal de Obra']) {
      expect(papel(nome)).not.toContain('composicoes.view');
      expect(papel(nome)).not.toContain('composicoes.manage');
    }
  });
});

describe('Auditoria de composição', () => {
  it('o histórico exige a mesma permissão que protege o módulo', () => {
    expect(requiredPermissionForEntity('Composition')).toBe('composicoes.view');
    expect(requiredPermissionForEntity('CompositionItem')).toBe('composicoes.view');
  });

  it('o filtro de módulo da tela de Auditoria encontra composição, item e preço de referência', () => {
    // O preço de referência (ORC-03) entrou no mesmo módulo porque usa a mesma
    // permissão: quem vê custo de composição é quem vê preço.
    expect(AUDIT_LOG_MODULES.composicoes).toEqual([
      'Composition',
      'CompositionItem',
      'CatalogItemPrice',
    ]);
  });
});

describe('A migration do ORC-02', () => {
  const sql = readFileSync(
    join(__dirname, '../../../prisma/migrations/20260914120000_composicoes_de_custo/migration.sql'),
    'utf8',
  );
  /// Só os comandos, sem os comentários — que citam "DELETE" e "UPDATE" ao
  /// explicar as FKs.
  const comandos = sql
    .split('\n')
    .filter((linha) => !linha.trim().startsWith('--'))
    .join('\n');

  it('é aditiva: não apaga, não reescreve e não altera coluna existente', () => {
    expect(comandos).not.toMatch(/\bDROP\b/i);
    expect(comandos).not.toMatch(/\bDELETE\s+FROM\b/i);
    expect(comandos).not.toMatch(/\bTRUNCATE\b/i);
    expect(comandos).not.toMatch(/^\s*UPDATE\s/im);
    expect(comandos).not.toMatch(/ALTER\s+COLUMN/i);
  });

  it('acrescenta as naturezas ao enum sem recriá-lo', () => {
    expect(comandos).toContain(`ALTER TYPE "CatalogItemType" ADD VALUE IF NOT EXISTS 'LABOR'`);
    expect(comandos).toContain(`ALTER TYPE "CatalogItemType" ADD VALUE IF NOT EXISTS 'EQUIPMENT'`);
  });

  it('usa a precisão decidida para coeficiente e preço', () => {
    expect(comandos).toMatch(/"coefficient"\s+DECIMAL\(14,6\)/);
    expect(comandos).toMatch(/"unitPrice"\s+DECIMAL\(14,4\)/);
  });

  it('não cria coluna de custo', () => {
    expect(comandos).not.toMatch(/"(totalCost|unitCost)"/);
  });

  it('as permissões inseridas são as mesmas do seed padrão', () => {
    for (const permissao of DEFAULT_PERMISSIONS.filter((p) => p.module === 'composicoes')) {
      expect(comandos).toContain(`'${permissao.code}'`);
      expect(comandos).toContain(`'${permissao.description}'`);
    }
  });
});
