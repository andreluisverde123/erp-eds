import * as bcrypt from 'bcrypt';

import type { PrismaClient } from '../../generated/prisma/client';
/// Papéis padrão de um tenant vêm de src/common/tenancy — a MESMA fonte que o
/// cadastro self-service (src/onboarding) usa. Enquanto o seed tinha a própria
/// cópia, uma empresa criada pelo cadastro podia nascer com papéis diferentes
/// das criadas localmente, e a diferença só apareceria em produção.
import { DEFAULT_ROLES as ROLES } from '../../src/common/tenancy/default-roles';

const SALT_ROUNDS = 12;

/// Senha única dos usuários de demonstração. Só existe dentro deste arquivo,
/// que só roda com `SEED_DEMO=true` — nenhum ambiente publicado a recebe.
const DEV_PASSWORD = 'Eds@12345';

const DEMO_USERS: {
  name: string;
  email: string;
  roleName: string;
  position?: string;
  isActive?: boolean;
}[] = [
  {
    name: 'Ana Administradora',
    email: 'admin@eds.app',
    roleName: 'Administrador',
    position: 'Administradora do Sistema',
  },
  {
    name: 'Eduardo Engenharia',
    email: 'engenharia@eds.app',
    roleName: 'Engenharia',
    position: 'Engenheiro de Obras',
  },
  {
    name: 'Camila Compras',
    email: 'compras@eds.app',
    roleName: 'Compras',
    position: 'Analista de Compras',
  },
  {
    name: 'Felipe Financeiro',
    email: 'financeiro@eds.app',
    roleName: 'Financeiro',
    position: 'Analista Financeiro',
  },
  { name: 'Rita Rh', email: 'rh@eds.app', roleName: 'RH', position: 'Analista de RH' },
  {
    name: 'Diego Diretor',
    email: 'diretoria@eds.app',
    roleName: 'Diretoria',
    position: 'Diretor Geral',
    isActive: false,
  },
];

/// Dados de exemplo do módulo de Engenharia, só pra a tela de Obras não
/// nascer vazia em um ambiente novo. Sem relação com o fluxo de auth acima.
const DEMO_CONSTRUCTION_SITES = [
  {
    code: 'OBR-001',
    name: 'Residencial Alpha',
    clientName: 'Construtora Horizonte',
    responsibleName: 'Marina Souza',
    description: 'Residencial de alto padrão com 3 torres.',
    status: 'IN_PROGRESS' as const,
    city: 'Curitiba',
    state: 'PR',
    startDate: new Date('2026-01-10'),
    expectedEndDate: new Date('2026-12-20'),
    costCenters: [
      { code: 'CC-001', name: 'Fundação', description: 'Escavação e fundação das torres.' },
      { code: 'CC-002', name: 'Estrutura', description: 'Estrutura de concreto armado.' },
    ],
  },
  {
    code: 'OBR-002',
    name: 'Centro Empresarial Norte',
    clientName: 'Norte Empreendimentos',
    responsibleName: 'Rafael Lima',
    description: 'Edifício comercial de 12 andares.',
    status: 'PLANNING' as const,
    city: 'Joinville',
    state: 'SC',
    startDate: null,
    expectedEndDate: new Date('2027-06-30'),
    costCenters: [{ code: 'CC-003', name: 'Terraplenagem', description: null }],
  },
  {
    code: 'OBR-003',
    name: 'Condomínio Green Park',
    clientName: 'Green Park Incorporadora',
    responsibleName: 'Camila Rocha',
    description: null,
    status: 'COMPLETED' as const,
    city: 'Florianópolis',
    state: 'SC',
    startDate: new Date('2024-03-01'),
    expectedEndDate: new Date('2026-02-28'),
    costCenters: [],
  },
];

/// Centros de custo que NÃO pertencem a nenhuma obra. Existem porque o centro
/// de custo é o destino da solicitação de compra, e nem todo destino é obra —
/// o material comprado para a sede ou para a fazenda é lançado aqui.
const DEMO_STANDALONE_COST_CENTERS = [
  { code: 'CC-100', name: 'Escritório', description: 'Despesas administrativas da sede.' },
  { code: 'CC-101', name: 'Fazenda', description: 'Manutenção e insumos da fazenda.' },
];

/// Dados de exemplo do módulo de Compras. Referenciam os códigos de obra e
/// centro de custo definidos em DEMO_CONSTRUCTION_SITES acima.
const DEMO_SUPPLIERS = [
  {
    document: '12345678000199',
    legalName: 'Cimento Forte Materiais Ltda',
    tradeName: 'Cimento Forte',
    contactName: 'Paulo Souza',
    phone: '41999998888',
    email: 'contato@cimentoforte.com',
    city: 'Curitiba',
    state: 'PR',
  },
  {
    document: '98765432000188',
    legalName: 'Aço Sul Distribuidora Ltda',
    tradeName: 'Aço Sul',
    contactName: 'Marcos Vinicius',
    phone: '4732221100',
    email: 'vendas@acosul.com',
    city: 'Joinville',
    state: 'SC',
  },
];

/// Dados de exemplo do módulo de RH.
const DEMO_EMPLOYEES = [
  {
    cpf: '11122233344',
    name: 'Bruno Carpinteiro',
    position: 'Carpinteiro',
    hireDate: new Date('2025-03-10'),
    baseSalary: 3200,
    status: 'ACTIVE' as const,
  },
  {
    cpf: '22233344455',
    name: 'Diego Pedreiro',
    position: 'Pedreiro',
    hireDate: new Date('2024-11-01'),
    baseSalary: 3000,
    status: 'ACTIVE' as const,
  },
  {
    cpf: '33344455566',
    name: 'Larissa Engenheira',
    position: 'Engenheira Civil',
    hireDate: new Date('2023-06-15'),
    baseSalary: 9500,
    status: 'VACATION' as const,
  },
];

/// Dados de exemplo do módulo de Terceiros.
const DEMO_CONTRACTORS = [
  {
    document: '11222333000144',
    legalName: 'Terceirize Segurança e Limpeza Ltda',
    tradeName: 'Terceirize Seg',
    specialty: 'Segurança patrimonial',
    responsibleName: 'Marcos Silva',
    email: 'contato@terceirizeseg.com',
    phone: '41988776655',
    city: 'Curitiba',
    state: 'PR',
  },
  {
    document: '55666777000122',
    legalName: 'BuildClean Serviços de Limpeza Ltda',
    tradeName: 'BuildClean',
    specialty: 'Limpeza pós-obra',
    responsibleName: 'Fernanda Alves',
    email: 'comercial@buildclean.com',
    phone: '4733224455',
    city: 'Joinville',
    state: 'SC',
  },
];

/// Deslocamento relativo a "agora" — os contratos/documentos de exemplo
/// precisam continuar "vencendo em breve" não importa quando o seed rodar.
function addDaysFromNow(days: number): Date {
  const result = new Date();
  result.setUTCHours(0, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

interface DemoRequestItemSeed {
  description: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice?: number;
  notes?: string;
}

/// Sem `siteCode`: a obra da solicitação é derivada do centro de custo (e é
/// nula quando o centro não pertence a obra nenhuma), igual ao que o service
/// faz quando alguém cria a solicitação pela tela.
interface DemoRequestSeed {
  costCenterCode: string;
  requesterEmail: string;
  notes?: string;
  status: 'DRAFT' | 'PENDING' | 'QUOTING' | 'APPROVED' | 'CANCELLED';
  items: DemoRequestItemSeed[];
  order?: {
    supplierDocument: string;
    totalAmount: number;
    status: 'OPEN' | 'ISSUED' | 'RECEIVED' | 'CANCELLED';
  };
}

const DEMO_REQUESTS: DemoRequestSeed[] = [
  {
    costCenterCode: 'CC-001',
    requesterEmail: 'engenharia@eds.app',
    notes: 'Urgente para a próxima etapa da fundação.',
    status: 'APPROVED',
    // Já cotada por Compras — por isso tem valor unitário e virou ordem.
    items: [
      { description: 'Cimento CPII 50kg', unit: 'SC', quantity: 100, estimatedUnitPrice: 32.5 },
      { description: 'Areia média', unit: 'M3', quantity: 15, estimatedUnitPrice: 85 },
    ],
    order: { supplierDocument: '12345678000199', totalAmount: 4525, status: 'ISSUED' },
  },
  {
    // Aberta pela Engenharia e ainda sem valor: é o estado normal de uma
    // solicitação nova agora que o valor unitário é preenchido por Compras.
    costCenterCode: 'CC-002',
    requesterEmail: 'engenharia@eds.app',
    notes: 'Aguardando cotação de ferragens.',
    status: 'PENDING',
    items: [{ description: 'Vergalhão CA-50 10mm', unit: 'BR', quantity: 200 }],
  },
  {
    costCenterCode: 'CC-003',
    requesterEmail: 'engenharia@eds.app',
    status: 'DRAFT',
    items: [{ description: 'Locação de retroescavadeira', unit: 'DIA', quantity: 5 }],
  },
  {
    // Destino que não é obra: mostra que o centro de custo cobre qualquer
    // destino da solicitação, não só canteiro.
    costCenterCode: 'CC-100',
    requesterEmail: 'engenharia@eds.app',
    notes: 'Reposição de material de escritório.',
    status: 'PENDING',
    items: [
      { description: 'Papel A4 75g (resma)', unit: 'RS', quantity: 20 },
      { description: 'Toner impressora HP', unit: 'UN', quantity: 4 },
    ],
  },
];

/// Empresa-vitrine com dados de exemplo em todos os módulos. Roda SÓ com
/// `SEED_DEMO=true` (ver `prisma/seed.ts`): nenhum ambiente publicado recebe
/// esta empresa nem a senha conhecida dos usuários daqui.
///
/// Recebe `prisma` e o catálogo de permissões já semeado em vez de criar os
/// dois, para o orquestrador controlar a ordem e a conexão.
export async function seedDemo(
  prisma: PrismaClient,
  permissionByCode: Map<string, { id: string }>,
): Promise<void> {
  const company = await prisma.company.upsert({
    where: { cnpj: '00000000000100' },
    update: {
      slug: 'eds',
      status: 'ACTIVE',
      plan: 'ENTERPRISE',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      primaryColor: '#ED2124',
    },
    create: {
      cnpj: '00000000000100',
      slug: 'eds',
      legalName: 'EDS Construtora Demo Ltda.',
      tradeName: 'EDS',
      email: 'contato@eds.app',
      status: 'ACTIVE',
      plan: 'ENTERPRISE',
      timezone: 'America/Sao_Paulo',
      locale: 'pt-BR',
      currency: 'BRL',
      primaryColor: '#ED2124',
    },
  });

  // O catálogo de permissões já foi semeado pelo orquestrador — ele é global
  // e vale para toda instalação, não só para a demonstração.

  const roleByName = new Map<string, { id: string }>();
  for (const roleSeed of ROLES) {
    const role = await prisma.role.upsert({
      where: { companyId_name: { companyId: company.id, name: roleSeed.name } },
      update: { type: roleSeed.type, description: roleSeed.description, isSystem: true },
      create: {
        companyId: company.id,
        name: roleSeed.name,
        type: roleSeed.type,
        description: roleSeed.description,
        isSystem: true,
      },
    });
    roleByName.set(role.name, role);

    for (const permissionCode of roleSeed.permissionCodes) {
      const permission = permissionByCode.get(permissionCode);
      if (!permission) {
        throw new Error(`Permissão desconhecida referenciada no seed: ${permissionCode}`);
      }

      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        update: {},
        create: { roleId: role.id, permissionId: permission.id },
      });
    }

    // Remove o que saiu do template. Sem isto o seed só somava permissões:
    // reduzir o escopo de um papel padrão não tinha efeito nenhum, e o papel
    // ficava com sobras de versões anteriores.
    const permissionIds = roleSeed.permissionCodes
      .map((code) => permissionByCode.get(code)?.id)
      .filter((id): id is string => Boolean(id));

    await prisma.rolePermission.deleteMany({
      where: { roleId: role.id, permissionId: { notIn: permissionIds } },
    });
  }

  const passwordHash = await bcrypt.hash(DEV_PASSWORD, SALT_ROUNDS);

  const userByEmail = new Map<string, { id: string }>();
  for (const demoUser of DEMO_USERS) {
    const role = roleByName.get(demoUser.roleName);
    if (!role) {
      throw new Error(`Papel desconhecido referenciado no seed: ${demoUser.roleName}`);
    }

    const user = await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {
        name: demoUser.name,
        passwordHash,
        companyId: company.id,
        position: demoUser.position,
        isActive: demoUser.isActive ?? true,
      },
      create: {
        companyId: company.id,
        name: demoUser.name,
        email: demoUser.email,
        passwordHash,
        position: demoUser.position,
        isActive: demoUser.isActive ?? true,
      },
    });
    userByEmail.set(demoUser.email, user);

    await prisma.userRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    });
  }

  const siteByCode = new Map<string, { id: string }>();
  const costCenterByCode = new Map<string, { id: string; constructionSiteId: string | null }>();
  for (const siteSeed of DEMO_CONSTRUCTION_SITES) {
    const { costCenters, ...siteData } = siteSeed;

    const site = await prisma.constructionSite.upsert({
      where: { companyId_code: { companyId: company.id, code: siteData.code } },
      update: siteData,
      create: { companyId: company.id, ...siteData },
    });
    siteByCode.set(site.code, site);

    for (const costCenter of costCenters) {
      const created = await prisma.costCenter.upsert({
        where: { companyId_code: { companyId: company.id, code: costCenter.code } },
        update: { ...costCenter, constructionSiteId: site.id },
        create: { companyId: company.id, constructionSiteId: site.id, ...costCenter },
      });
      costCenterByCode.set(created.code, created);
    }
  }

  for (const costCenter of DEMO_STANDALONE_COST_CENTERS) {
    const created = await prisma.costCenter.upsert({
      where: { companyId_code: { companyId: company.id, code: costCenter.code } },
      update: { ...costCenter, constructionSiteId: null },
      create: { companyId: company.id, constructionSiteId: null, ...costCenter },
    });
    costCenterByCode.set(created.code, created);
  }

  const supplierByDocument = new Map<string, { id: string }>();
  for (const supplierSeed of DEMO_SUPPLIERS) {
    const supplier = await prisma.supplier.upsert({
      where: { companyId_document: { companyId: company.id, document: supplierSeed.document } },
      update: supplierSeed,
      create: { companyId: company.id, ...supplierSeed },
    });
    supplierByDocument.set(supplier.document, supplier);
  }

  for (const [index, requestSeed] of DEMO_REQUESTS.entries()) {
    const costCenter = costCenterByCode.get(requestSeed.costCenterCode);
    const requester = userByEmail.get(requestSeed.requesterEmail);
    if (!costCenter || !requester) {
      throw new Error(`Referência inválida no seed de solicitações (índice ${index}).`);
    }

    const code = `SOL-${String(index + 1).padStart(4, '0')}`;

    const existing = await prisma.purchaseRequest.findFirst({
      where: { companyId: company.id, code },
    });
    if (existing) continue; // seed de solicitações não é re-executado (evita duplicar histórico/OCs)

    const request = await prisma.purchaseRequest.create({
      data: {
        companyId: company.id,
        constructionSiteId: costCenter.constructionSiteId,
        costCenterId: costCenter.id,
        requestedById: requester.id,
        code,
        status: requestSeed.status,
        notes: requestSeed.notes,
        items: { create: requestSeed.items },
      },
    });

    await prisma.auditLog.create({
      data: {
        companyId: company.id,
        userId: requester.id,
        entityType: 'PurchaseRequest',
        entityId: request.id,
        action: 'CREATE',
        changes: { status: 'DRAFT' },
      },
    });

    if (requestSeed.status !== 'DRAFT') {
      await prisma.auditLog.create({
        data: {
          companyId: company.id,
          userId: requester.id,
          entityType: 'PurchaseRequest',
          entityId: request.id,
          action: 'UPDATE',
          changes: { status: { from: 'DRAFT', to: requestSeed.status } },
        },
      });
    }

    if (requestSeed.order) {
      const supplier = supplierByDocument.get(requestSeed.order.supplierDocument);
      if (!supplier) {
        throw new Error(
          `Fornecedor desconhecido referenciado no seed: ${requestSeed.order.supplierDocument}`,
        );
      }

      await prisma.purchaseOrder.create({
        data: {
          companyId: company.id,
          purchaseRequestId: request.id,
          supplierId: supplier.id,
          constructionSiteId: costCenter.constructionSiteId,
          costCenterId: costCenter.id,
          code: `OC-${String(index + 1).padStart(4, '0')}`,
          status: requestSeed.order.status,
          totalAmount: requestSeed.order.totalAmount,
          issueDate: new Date(),
        },
      });
    }
  }

  // Financeiro: uma nota validada com pagamento parcial, pendurada na
  // primeira ordem de compra do seed de Compras — só pra a tela de Contas a
  // Pagar não nascer vazia. Idempotente via checagem de existência.
  const primaryOrder = await prisma.purchaseOrder.findFirst({
    where: { companyId: company.id, code: 'OC-0001', deletedAt: null },
  });

  if (primaryOrder) {
    const invoiceNumber = 'NF-3001';
    const existingInvoice = await prisma.invoice.findFirst({
      where: { companyId: company.id, supplierId: primaryOrder.supplierId, number: invoiceNumber },
    });

    if (!existingInvoice) {
      const invoice = await prisma.invoice.create({
        data: {
          companyId: company.id,
          supplierId: primaryOrder.supplierId,
          purchaseOrderId: primaryOrder.id,
          constructionSiteId: primaryOrder.constructionSiteId,
          costCenterId: primaryOrder.costCenterId,
          number: invoiceNumber,
          series: '1',
          issueDate: new Date('2026-07-01'),
          totalAmount: primaryOrder.totalAmount,
          status: 'VALIDATED',
        },
      });

      const accountPayable = await prisma.accountPayable.create({
        data: {
          companyId: company.id,
          invoiceId: invoice.id,
          amount: invoice.totalAmount,
          dueDate: new Date('2026-07-31'),
          status: 'PARTIAL',
        },
      });

      await prisma.payment.create({
        data: {
          accountPayableId: accountPayable.id,
          amount: 2000,
          paidAt: new Date('2026-07-15'),
          method: 'Boleto',
          status: 'PAID',
        },
      });
    }
  }

  // RH: dois funcionários alocados na obra principal, com ponto, produção e
  // holerite (um pago, um em aberto) — só pra as telas de RH não nascerem
  // vazias. Idempotente via upsert/checagem de existência.
  const employeeByCpf = new Map<string, { id: string }>();
  for (const employeeSeed of DEMO_EMPLOYEES) {
    const employee = await prisma.employee.upsert({
      where: { companyId_cpf: { companyId: company.id, cpf: employeeSeed.cpf } },
      update: employeeSeed,
      create: { companyId: company.id, ...employeeSeed },
    });
    employeeByCpf.set(employee.cpf, employee);
  }

  const mainSite = siteByCode.get('OBR-001');
  const mainCostCenter = costCenterByCode.get('CC-001');
  const carpenter = employeeByCpf.get('11122233344');
  const mason = employeeByCpf.get('22233344455');

  if (mainSite && mainCostCenter && carpenter && mason) {
    for (const [employeeId, startDate] of [
      [carpenter.id, new Date('2026-01-15')],
      [mason.id, new Date('2025-11-05')],
    ] as const) {
      const existingAllocation = await prisma.employeeAllocation.findFirst({
        where: { employeeId, constructionSiteId: mainSite.id, deletedAt: null },
      });
      if (!existingAllocation) {
        await prisma.employeeAllocation.create({
          data: {
            employeeId,
            constructionSiteId: mainSite.id,
            costCenterId: mainCostCenter.id,
            startDate,
          },
        });
      }
    }

    const timeEntryDate = new Date('2026-07-21');
    const existingTimeEntry = await prisma.timeEntry.findFirst({
      where: { employeeId: carpenter.id, date: timeEntryDate, deletedAt: null },
    });
    if (!existingTimeEntry) {
      await prisma.timeEntry.create({
        data: {
          employeeId: carpenter.id,
          constructionSiteId: mainSite.id,
          date: timeEntryDate,
          checkIn: new Date('2026-07-21T08:00:00Z'),
          checkOut: new Date('2026-07-21T17:00:00Z'),
          hoursWorked: 9,
          status: 'CLOSED',
        },
      });
    }

    const productionDate = new Date('2026-07-21');
    const existingProduction = await prisma.productionEntry.findFirst({
      where: {
        employeeId: mason.id,
        constructionSiteId: mainSite.id,
        date: productionDate,
        deletedAt: null,
      },
    });
    if (!existingProduction) {
      await prisma.productionEntry.create({
        data: {
          employeeId: mason.id,
          constructionSiteId: mainSite.id,
          costCenterId: mainCostCenter.id,
          date: productionDate,
          description: 'Alvenaria de vedação',
          quantity: 24,
          unit: 'M2',
        },
      });
    }

    const existingPaidPayslip = await prisma.payslip.findFirst({
      where: { employeeId: carpenter.id, referenceYear: 2026, referenceMonth: 6, deletedAt: null },
    });
    if (!existingPaidPayslip) {
      await prisma.payslip.create({
        data: {
          employeeId: carpenter.id,
          referenceYear: 2026,
          referenceMonth: 6,
          grossSalary: 3200,
          deductions: 480,
          netSalary: 2720,
          paidAt: new Date('2026-07-05'),
        },
      });
    }

    const existingOpenPayslip = await prisma.payslip.findFirst({
      where: { employeeId: mason.id, referenceYear: 2026, referenceMonth: 7, deletedAt: null },
    });
    if (!existingOpenPayslip) {
      await prisma.payslip.create({
        data: {
          employeeId: mason.id,
          referenceYear: 2026,
          referenceMonth: 7,
          grossSalary: 3000,
          deductions: 450,
          netSalary: 2550,
        },
      });
    }
  }

  // Terceiros: duas empresas terceirizadas com contratos, documentos e
  // funcionários — um contrato vencendo em breve (pro card de alerta na
  // Home) e um vigente. Idempotente via upsert/checagem de existência.
  const contractorByDocument = new Map<string, { id: string }>();
  for (const contractorSeed of DEMO_CONTRACTORS) {
    const contractor = await prisma.contractor.upsert({
      where: { companyId_document: { companyId: company.id, document: contractorSeed.document } },
      update: contractorSeed,
      create: { companyId: company.id, ...contractorSeed },
    });
    contractorByDocument.set(contractor.document, contractor);
  }

  const securityContractor = contractorByDocument.get('11222333000144');
  const cleaningContractor = contractorByDocument.get('55666777000122');
  const mainSiteForContracts = siteByCode.get('OBR-001');

  if (securityContractor && cleaningContractor && mainSiteForContracts) {
    // upsert (não find-or-create): reafirma status ACTIVE e as datas
    // relativas a cada execução do seed, mesmo que um teste manual anterior
    // tenha deixado o contrato encerrado ou com outras datas.
    const securityContract = await prisma.contractorContract.upsert({
      where: { companyId_code: { companyId: company.id, code: 'CT-0001' } },
      update: {
        contractorId: securityContractor.id,
        constructionSiteId: mainSiteForContracts.id,
        scope: 'Segurança patrimonial 24h na obra',
        totalValue: 45000,
        startDate: new Date('2026-01-01'),
        endDate: addDaysFromNow(20),
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        contractorId: securityContractor.id,
        constructionSiteId: mainSiteForContracts.id,
        code: 'CT-0001',
        scope: 'Segurança patrimonial 24h na obra',
        totalValue: 45000,
        startDate: new Date('2026-01-01'),
        endDate: addDaysFromNow(20),
      },
    });

    const cleaningContract = await prisma.contractorContract.upsert({
      where: { companyId_code: { companyId: company.id, code: 'CT-0002' } },
      update: {
        contractorId: cleaningContractor.id,
        constructionSiteId: mainSiteForContracts.id,
        scope: 'Limpeza pós-obra e remoção de entulho',
        totalValue: 18000,
        startDate: new Date('2026-03-01'),
        endDate: addDaysFromNow(200),
        status: 'ACTIVE',
        deletedAt: null,
      },
      create: {
        companyId: company.id,
        contractorId: cleaningContractor.id,
        constructionSiteId: mainSiteForContracts.id,
        code: 'CT-0002',
        scope: 'Limpeza pós-obra e remoção de entulho',
        totalValue: 18000,
        startDate: new Date('2026-03-01'),
        endDate: addDaysFromNow(200),
      },
    });

    const existingInsuranceDoc = await prisma.contractDocument.findFirst({
      where: { contractId: securityContract.id, name: 'Apólice de Seguro' },
    });
    if (existingInsuranceDoc) {
      await prisma.contractDocument.update({
        where: { id: existingInsuranceDoc.id },
        data: { expiresAt: addDaysFromNow(20), deletedAt: null },
      });
    } else {
      await prisma.contractDocument.create({
        data: {
          contractId: securityContract.id,
          name: 'Apólice de Seguro',
          expiresAt: addDaysFromNow(20),
        },
      });
    }

    const existingArtDoc = await prisma.contractDocument.findFirst({
      where: { contractId: cleaningContract.id, name: 'ART de Responsabilidade Técnica' },
    });
    if (!existingArtDoc) {
      await prisma.contractDocument.create({
        data: {
          contractId: cleaningContract.id,
          name: 'ART de Responsabilidade Técnica',
          expiresAt: addDaysFromNow(200),
        },
      });
    }

    const existingGuard = await prisma.contractEmployee.findFirst({
      where: { contractId: securityContract.id, name: 'José Vigilante' },
    });
    if (!existingGuard) {
      await prisma.contractEmployee.create({
        data: { contractId: securityContract.id, name: 'José Vigilante', role: 'Vigilante' },
      });
    }

    const existingCleaner = await prisma.contractEmployee.findFirst({
      where: { contractId: cleaningContract.id, name: 'Marta Faxineira' },
    });
    if (!existingCleaner) {
      await prisma.contractEmployee.create({
        data: {
          contractId: cleaningContract.id,
          name: 'Marta Faxineira',
          role: 'Auxiliar de Limpeza',
        },
      });
    }
  }

  console.log(`Empresa de demonstração: ${company.tradeName} (${company.cnpj})`);
  console.log(`Papéis: ${ROLES.map((role) => role.name).join(', ')}`);
  console.log('Usuários de demonstração (senha única abaixo):');
  for (const demoUser of DEMO_USERS) {
    console.log(`  - ${demoUser.email} [${demoUser.roleName}]`);
  }
  console.log(`Senha: ${DEV_PASSWORD}`);
}
