import { BadRequestException, Body, Controller, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import { caseStudySchema, claimSchema, cmsBlockSchema, configureSchema, enquirySchema, industrySchema, num, resolveSellPrice, solutionSchema, type PriceList } from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { verifyCaptcha } from "./captcha";
import { CrmService } from "./crm";
import { env } from "./env";
import { AuthUser, Public, RequirePermissions, assertStaff, can, clientIp, parseBody, seesCost } from "./http";
import { PrismaService } from "./prisma.service";
import { sanitizeRichText } from "./sanitize";
import { customerScope } from "./scope";
import { AuditService, NotifyService, NumberService, toPlain } from "./services";
import { productCard, productCardSelect } from "./site";
import { Throttle } from "@nestjs/throttler";
import { PUBLIC_READ } from "./site";

type ReqUser = { user: AuthUser; ip?: string };

const PRIVATE_PRODUCT_KEYS = ["purchaseCost", "manufacturingCost", "standardPrice", "customerPrice", "dealerPrice", "exportPrice", "safetyStock", "reorderLevel", "supplyMode", "internalNotes"];

@Controller()
export class InsightController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
    private readonly crm: CrmService,
  ) {}

  @Get("reports/executive")
  @RequirePermissions("reports.view")
  async executive(@Req() req: ReqUser) {
    const report = await this.executiveReport();
    if (seesCost(req.user)) return report;
    return { ...report, grossMarginPct: null, inventory: null };
  }

  /** All figures are computed in the database so the report stays O(1) in memory as volumes grow. */
  private async executiveReport() {
    const liveOrder = { status: { notIn: ["CANCELLED", "DRAFT"] } };
    const [revenue, orders, pipeline, rfqs, won, projects, delayed, openPo, [money], [stock], [orderCost], inspections, jobs] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { status: { not: "CANCELLED" } }, _sum: { total: true } }),
      this.prisma.salesOrder.aggregate({ where: liveOrder, _sum: { total: true, subtotal: true } }),
      this.prisma.quotation.aggregate({ where: { status: { in: ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "SENT", "NEGOTIATION"] } }, _sum: { total: true } }),
      this.prisma.rfq.count(),
      this.prisma.quotation.count({ where: { status: { in: ["ACCEPTED", "COMPLETED"] } } }),
      this.prisma.project.count({ where: { stage: { notIn: ["CLOSED", "LOST"] } } }),
      this.prisma.project.count({ where: { expectedCompletion: { lt: new Date() }, stage: { notIn: ["CLOSED", "LOST"] } } }),
      this.prisma.purchaseOrder.aggregate({ where: { status: { in: ["APPROVED", "SUBMITTED", "PARTIAL"] } }, _sum: { total: true } }),
      this.prisma.$queryRaw<Array<{ due: unknown; overdue: unknown }>>`
        SELECT COALESCE(SUM(GREATEST(0, i."total" - COALESCE(p.paid, 0))), 0) AS due,
               COALESCE(SUM(CASE WHEN i."status" IN ('ISSUED','PARTIAL','OVERDUE') AND i."dueDate" < now() THEN i."total" ELSE 0 END), 0) AS overdue
        FROM "Invoice" i
        LEFT JOIN (SELECT "invoiceId", SUM("amount") AS paid FROM "Payment" WHERE "direction" = 'IN' GROUP BY "invoiceId") p ON p."invoiceId" = i."id"
        WHERE i."status" <> 'CANCELLED'`,
      this.prisma.$queryRaw<Array<{ value: unknown }>>`SELECT COALESCE(SUM("qty" * "avgCost"), 0) AS value FROM "InventoryBalance"`,
      this.prisma.$queryRaw<Array<{ cost: unknown }>>`
        SELECT COALESCE(SUM(i."qty" * i."unitCost"), 0) AS cost
        FROM "SalesOrderItem" i JOIN "SalesOrder" o ON o."id" = i."salesOrderId"
        WHERE o."status" NOT IN ('CANCELLED','DRAFT')`,
      this.prisma.qualityInspection.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.productionOrder.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const countOf = (rows: Array<{ status: string; _count: { _all: number } }>, statuses?: string[]) => rows.filter((row) => !statuses || statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
    const decided = countOf(inspections) - countOf(inspections, ["PENDING"]);
    const rejected = countOf(inspections, ["REJECTED"]);
    const totalJobs = countOf(jobs);
    const revenueBase = num(orders._sum.subtotal);
    const cost = num(orderCost?.cost);
    const receivables = num(money?.due);
    return {
      revenue: num(revenue._sum.total),
      orders: num(orders._sum.total),
      pipeline: num(pipeline._sum.total),
      grossMarginPct: revenueBase === 0 ? 0 : ((revenueBase - cost) / revenueBase) * 100,
      receivables,
      inventory: num(stock?.value),
      sales: { won, rfqs, conversionPct: rfqs === 0 ? 0 : (won / rfqs) * 100 },
      manufacturing: {
        productionPct: totalJobs === 0 ? 0 : (countOf(jobs, ["COMPLETED"]) / totalJobs) * 100,
        capacityPct: totalJobs === 0 ? 0 : (countOf(jobs, ["IN_PROGRESS", "RELEASED", "QC"]) / totalJobs) * 100,
        rejectionPct: decided === 0 ? 0 : (rejected / decided) * 100,
      },
      projects: { active: projects, delayed },
      procurement: { openPo: num(openPo._sum.total), criticalShortages: 0 },
      collections: { due: receivables, overdue: num(money?.overdue) },
    };
  }

  @Get("reports/queues")
  async queues(@Req() req: ReqUser) {
    assertStaff(req.user);
    const [approvals, jobs, picks, issues, rfqs] = await Promise.all([
      this.prisma.approvalRequest.count({ where: { status: "PENDING", approverRole: { in: req.user.roleKeys } } }),
      this.prisma.jobCard.count({ where: { status: { in: ["QUEUED", "RUNNING", "PAUSED"] } } }),
      this.prisma.dispatchNote.count({ where: { status: { in: ["PICK_LIST", "PICKING"] } } }),
      this.prisma.siteIssue.count({ where: { status: { notIn: ["CLOSED", "VERIFIED"] } } }),
      this.prisma.rfq.count({ where: { assigneeId: req.user.id, status: { notIn: ["WON", "LOST", "CANCELLED"] } } }),
    ]);
    return { approvals, jobsToday: jobs, picksToday: picks, siteIssues: issues, myRfqs: rfqs };
  }

  @Get("reports/sales")
  @RequirePermissions("reports.view")
  async sales() {
    const where = { status: { notIn: ["CANCELLED", "DRAFT"] } };
    const [totals, perCustomer] = await Promise.all([
      this.prisma.salesOrder.aggregate({ where, _sum: { total: true }, _count: { _all: true } }),
      this.prisma.salesOrder.groupBy({ by: ["customerId"], where, _sum: { total: true }, orderBy: { _sum: { total: "desc" } }, take: 50 }),
    ]);
    const customers = await this.prisma.customer.findMany({ where: { id: { in: perCustomer.map((row) => row.customerId) } }, select: { id: true, name: true } });
    const names = new Map(customers.map((row) => [row.id, row.name]));
    const revenue = num(totals._sum.total);
    const deals = totals._count._all;
    return {
      revenue,
      deals,
      averageDeal: deals ? revenue / deals : 0,
      byCustomer: perCustomer.map((row) => ({ key: names.get(row.customerId) || "Unknown", amount: num(row._sum.total) })),
    };
  }

  @Get("reports/inventory")
  @RequirePermissions("reports.view")
  async inventoryReport(@Req() req: ReqUser) {
    const [[row], positions] = await Promise.all([
      this.prisma.$queryRaw<Array<{ value: unknown }>>`SELECT COALESCE(SUM("qty" * "avgCost"), 0) AS value FROM "InventoryBalance"`,
      this.prisma.inventoryBalance.count(),
    ]);
    return { value: seesCost(req.user) ? num(row?.value) : null, positions };
  }

  @Get("reports/projects")
  @RequirePermissions("reports.view")
  async projectReport(@Req() req: ReqUser) {
    const cost = seesCost(req.user);
    const projects = await this.prisma.project.findMany({ select: { id: true, code: true, name: true, stage: true, expectedCompletion: true }, take: 1000, orderBy: { updatedAt: "desc" } });
    const ids = projects.map((project) => project.id);
    const [revenueRows, spendRows, billedRows] = ids.length
      ? await Promise.all([
          this.prisma.salesOrder.groupBy({ by: ["projectId"], where: { projectId: { in: ids }, status: { not: "CANCELLED" } }, _sum: { subtotal: true } }),
          this.prisma.$queryRaw<Array<{ projectId: string; spend: unknown }>>`
            SELECT o."projectId", SUM(i."qty" * i."unitCost") AS spend
            FROM "SalesOrderItem" i JOIN "SalesOrder" o ON o."id" = i."salesOrderId"
            WHERE o."projectId" IN (${Prisma.join(ids)}) AND o."status" <> 'CANCELLED' GROUP BY o."projectId"`,
          this.prisma.$queryRaw<Array<{ projectId: string; billed: unknown }>>`
            SELECT o."projectId", SUM(v."total") AS billed
            FROM "Invoice" v JOIN "SalesOrder" o ON o."id" = v."salesOrderId"
            WHERE o."projectId" IN (${Prisma.join(ids)}) AND v."status" <> 'CANCELLED' GROUP BY o."projectId"`,
        ])
      : [[], [], []];
    const revenueOf = new Map(revenueRows.map((row) => [row.projectId, num(row._sum.subtotal)]));
    const spendOf = new Map(spendRows.map((row) => [row.projectId, num(row.spend)]));
    const billedOf = new Map(billedRows.map((row) => [row.projectId, num(row.billed)]));
    return projects.map((project) => ({
      id: project.id,
      code: project.code,
      name: project.name,
      stage: project.stage,
      margin: cost ? (revenueOf.get(project.id) || 0) - (spendOf.get(project.id) || 0) : null,
      billed: billedOf.get(project.id) || 0,
      delayed: Boolean(project.expectedCompletion && project.expectedCompletion < new Date() && !["CLOSED", "LOST"].includes(project.stage)),
    }));
  }

  @Get("reports/forecast")
  @RequirePermissions("reports.view")
  forecast() {
    return this.forecastReport();
  }

  private async forecastReport() {
    const since = new Date();
    since.setMonth(since.getMonth() - 6);
    const where = { salesOrder: { createdAt: { gte: since }, status: { not: "CANCELLED" } } };
    const [withVariant, freeText] = await Promise.all([
      this.prisma.salesOrderItem.groupBy({ by: ["variantId"], where: { ...where, variantId: { not: null } }, _sum: { qty: true }, orderBy: { _sum: { qty: "desc" } }, take: 500 }),
      this.prisma.salesOrderItem.groupBy({ by: ["description"], where: { ...where, variantId: null }, _sum: { qty: true }, orderBy: { _sum: { qty: "desc" } }, take: 100 }),
    ]);
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: withVariant.map((row) => row.variantId!) } }, select: { id: true, name: true } });
    const names = new Map(variants.map((row) => [row.id, row.name]));
    const byVariant = new Map<string, { name: string; qty: number }>();
    for (const row of withVariant) byVariant.set(row.variantId!, { name: names.get(row.variantId!) || "Unknown article", qty: num(row._sum.qty) });
    for (const row of freeText) byVariant.set(`text:${row.description}`, { name: row.description, qty: num(row._sum.qty) });
    return {
      method: "trailing_average",
      horizon: "next_month",
      items: [...byVariant.values()].map((item) => ({ name: item.name, monthlyAverage: item.qty / 6 })),
    };
  }

  @Post("assistant/query")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async assistant(@Body() body: unknown, @Req() req: ReqUser) {
    assertStaff(req.user);
    const raw = (body as { question?: unknown } | null)?.question;
    const question = typeof raw === "string" ? raw.trim().slice(0, 500) : "";
    if (!question) throw new BadRequestException("Ask a question");
    const intent = (await this.intentFromModel(question)) || this.intentFromRules(question);
    const needs: Record<string, string> = { rfq: "rfqs.view", stock: "inventory.view", delay: "projects.view", datasheet: "documents.view", forecast: "reports.view" };
    if (needs[intent.kind] && !can(req.user, needs[intent.kind])) {
      return { intent: intent.kind, answer: "You do not have access to that information.", records: [] };
    }
    if (intent.kind === "rfq") {
      const rows = await this.prisma.rfq.findMany({
        where: {
          status: { notIn: ["WON", "LOST", "CANCELLED", "QUOTED"] },
          OR: [{ application: { contains: intent.topic || "", mode: "insensitive" } }, { project: { name: { contains: intent.topic || "", mode: "insensitive" } } }],
        },
        include: { project: true, quotations: true },
        take: 20,
      });
      const filtered = rows.filter((row) => !intent.minValue || row.quotations.some((quote) => num(quote.total) >= (intent.minValue || 0)) || num(row.project?.fixotecValue) >= (intent.minValue || 0));
      return { intent: intent.kind, answer: `${filtered.length} open RFQs match.`, records: filtered.map((row) => ({ number: row.number, project: row.project?.name, status: row.status })) };
    }
    if (intent.kind === "stock") {
      const rows = await this.prisma.$queryRaw<Array<{ articleNumber: string; name: string; onHand: unknown; safety: unknown }>>`
        SELECT v."articleNumber", v."name", COALESCE(SUM(b."qty"), 0) AS "onHand", v."safetyStock" AS safety
        FROM "ProductVariant" v LEFT JOIN "InventoryBalance" b ON b."variantId" = v."id"
        WHERE v."safetyStock" > 0
        GROUP BY v."id" HAVING COALESCE(SUM(b."qty"), 0) < v."safetyStock"
        ORDER BY v."articleNumber" LIMIT 200`;
      const low = rows.map((row) => ({ article: row.articleNumber, name: row.name, onHand: num(row.onHand), safety: num(row.safety) }));
      return { intent: intent.kind, answer: `${low.length} articles are below safety stock.`, records: seesCost(req.user) ? low : low.map(({ article, name }) => ({ article, name })) };
    }
    if (intent.kind === "delay") {
      const project = await this.prisma.project.findFirst({
        where: { OR: [{ name: { contains: intent.topic || "", mode: "insensitive" } }, { code: { contains: intent.topic || "", mode: "insensitive" } }] },
        include: { siteIssues: true, salesOrders: { include: { items: true } }, engineering: true },
      });
      if (!project) return { intent: intent.kind, answer: "No project matched that name.", records: [] };
      const reasons: string[] = [];
      const openIssues = project.siteIssues.filter((issue) => !["CLOSED", "VERIFIED"].includes(issue.status));
      if (openIssues.length) reasons.push(`${openIssues.length} site issue(s) are still open, including “${openIssues[0].title}”.`);
      const backordered = project.salesOrders.flatMap((order) => order.items).filter((item) => num(item.backorderedQty) > 0);
      if (backordered.length) reasons.push(`${backordered.length} order line(s) are backordered.`);
      const engineering = project.engineering.filter((job) => !["APPROVED", "REJECTED"].includes(job.status));
      if (engineering.length) reasons.push(`${engineering.length} engineering request(s) are not approved.`);
      if (project.expectedCompletion && project.expectedCompletion < new Date() && !["CLOSED", "LOST"].includes(project.stage)) {
        reasons.push(`Expected completion has passed and the stage is still ${project.stage}.`);
      }
      if (!reasons.length) reasons.push("Nothing in the project record currently explains a delay.");
      return { intent: intent.kind, answer: reasons.join(" "), records: [{ code: project.code, name: project.name, stage: project.stage }] };
    }
    if (intent.kind === "datasheet") {
      const documents = await this.prisma.document.findMany({
        where: { category: "DATASHEET", deletedAt: null, title: { contains: intent.topic || "", mode: "insensitive" } },
        include: { versions: { orderBy: { version: "desc" }, take: 1 } },
        take: 10,
      });
      return { intent: intent.kind, answer: documents.length ? `Found ${documents.length} datasheet(s).` : "No datasheet matched.", records: documents.map((document) => ({ id: document.id, title: document.title, version: document.versions[0]?.version, status: document.versions[0]?.status })) };
    }
    if (intent.kind === "forecast") {
      const report = await this.forecastReport();
      return { intent: intent.kind, answer: "Forecast uses a six-month trailing average of sales-order quantities.", records: report.items };
    }
    return { intent: "unknown", answer: "Ask about pending RFQs, safety stock, a delayed project, a datasheet, or the forecast.", records: [] };
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/home")
  async home() {
    const [blocks, solutions, industries, products, studies, services, news] = await Promise.all([
      this.prisma.cmsBlock.findMany({ where: { published: true } }),
      this.prisma.solution.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.industry.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.product.findMany({ where: { published: true, heroImageKey: { not: null } }, select: productCardSelect, orderBy: { updatedAt: "desc" }, take: 8 }),
      this.prisma.caseStudy.findMany({ where: { published: true } }),
      this.prisma.serviceArea.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } }),
      this.prisma.post.findMany({ where: { published: true }, orderBy: { publishedAt: "desc" }, take: 3, select: { slug: true, title: true, excerpt: true, imageKey: true, publishedAt: true } }),
    ]);
    return { blocks, solutions, industries, products: products.map(productCard), studies, services, news };
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/solutions")
  solutions() {
    return this.prisma.solution.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } });
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/solutions/:slug")
  async solution(@Param("slug") slug: string) {
    const solution = await this.prisma.solution.findFirst({ where: { slug, published: true } });
    if (!solution) return { solution: null, products: [] };
    const products = await this.prisma.product.findMany({
      where: { published: true, OR: [{ segments: { has: solution.slug } }, { applications: { has: solution.name } }] },
      select: productCardSelect,
      orderBy: { name: "asc" },
    });
    return { solution, products: products.map(productCard) };
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/industries")
  industries() {
    return this.prisma.industry.findMany({ where: { published: true }, orderBy: { sortOrder: "asc" } });
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/industries/:slug")
  async industry(@Param("slug") slug: string) {
    const industry = await this.prisma.industry.findFirst({ where: { slug, published: true } });
    if (!industry) return null;
    const segments = industry.group === "INDUSTRIES" ? ["multiple-services", "electrical", "hvac"] : ["hvac", "plumbing", "fire-fighting", "electrical"];
    const [products, solutions] = await Promise.all([
      this.prisma.product.findMany({ where: { published: true, heroImageKey: { not: null }, segments: { hasSome: segments } }, select: productCardSelect, orderBy: { name: "asc" }, take: 8 }),
      this.prisma.solution.findMany({ where: { published: true, slug: { in: segments } }, orderBy: { sortOrder: "asc" }, select: { slug: true, name: true, summary: true, imageKey: true } }),
    ]);
    return { ...industry, products: products.map(productCard), solutions };
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/products")
  async publicProducts(@Query("q") q?: string, @Query("segment") segment?: string) {
    const products = await this.prisma.product.findMany({
      where: {
        published: true,
        segments: segment ? { has: segment } : undefined,
        OR: q ? [{ name: { contains: q, mode: "insensitive" } }, { description: { contains: q, mode: "insensitive" } }, { variants: { some: { articleNumber: { contains: q, mode: "insensitive" } } } }] : undefined,
      },
      select: productCardSelect,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    return products.map(productCard);
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/products/:slug")
  async publicProductPage(@Param("slug") slug: string) {
    const product = await this.prisma.product.findUnique({ where: { slug }, include: { category: { include: { parent: true } }, family: true, variants: { where: { active: true }, orderBy: { articleNumber: "asc" } } } });
    if (!product?.published) return null;
    const variantNames = new Map(product.variants.map((variant) => [variant.id, `${variant.articleNumber} ${variant.name}`]));
    const [documents, related] = await Promise.all([
      this.prisma.document.findMany({
        where: { deletedAt: null, audiences: { has: "PUBLIC" }, OR: [{ entityType: "product", entityId: product.id }, { entityType: "variant", entityId: { in: [...variantNames.keys()] } }] },
        include: { versions: { where: { status: "APPROVED" }, orderBy: { version: "desc" }, take: 1 } },
        orderBy: { title: "asc" },
      }),
      this.prisma.product.findMany({ where: { published: true, id: { not: product.id }, OR: [{ categoryId: product.categoryId }, { familyId: product.familyId }] }, select: productCardSelect, orderBy: { name: "asc" }, take: 4 }),
    ]);
    return {
      ...this.publicProduct(product),
      documents: documents
        .filter((document) => document.versions.length)
        .map((document) => ({
          id: document.id,
          title: document.title,
          category: document.category,
          version: document.versions[0].version,
          fileName: document.versions[0].fileName,
          sizeBytes: document.versions[0].sizeBytes,
          variant: document.entityType === "variant" && document.entityId ? variantNames.get(document.entityId) || null : null,
        })),
      related: related.map(productCard),
    };
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/projects")
  studies() {
    return this.prisma.caseStudy.findMany({ where: { published: true }, orderBy: { year: "desc" } });
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/projects/:slug")
  study(@Param("slug") slug: string) {
    return this.prisma.caseStudy.findFirst({ where: { slug, published: true } });
  }

  @Public()
  @Throttle(PUBLIC_READ)
  @Get("public/search")
  async search(@Query("q") q = "") {
    const term = q.trim();
    if (!term) return { products: [], solutions: [], industries: [], studies: [], documents: [], news: [] };
    const contains = { contains: term, mode: "insensitive" as const };
    const [products, solutions, industries, studies, documents, news] = await Promise.all([
      this.prisma.product.findMany({ where: { published: true, OR: [{ name: contains }, { description: contains }, { technicalDescription: contains }, { applications: { has: term } }, { features: { has: term } }, { variants: { some: { OR: [{ articleNumber: contains }, { name: contains }] } } }] }, select: productCardSelect, take: 12 }),
      this.prisma.solution.findMany({ where: { published: true, OR: [{ name: contains }, { summary: contains }] }, take: 8 }),
      this.prisma.industry.findMany({ where: { published: true, OR: [{ name: contains }, { summary: contains }] }, take: 8 }),
      this.prisma.caseStudy.findMany({ where: { published: true, OR: [{ title: contains }, { summary: contains }] }, take: 8 }),
      this.prisma.document.findMany({ where: { deletedAt: null, audiences: { has: "PUBLIC" }, versions: { some: { status: "APPROVED" } }, title: contains }, select: { id: true, title: true, category: true }, take: 12 }),
      this.prisma.post.findMany({ where: { published: true, OR: [{ title: contains }, { excerpt: contains }] }, select: { slug: true, title: true, publishedAt: true }, take: 6 }),
    ]);
    return { products: products.map(productCard), solutions, industries, studies, documents, news };
  }

  @Public()
  @Post("public/configure")
  async configure(@Body() body: unknown) {
    const input = parseBody(configureSchema, body);
    const rules = await this.prisma.configuratorRule.findMany({ where: { active: true, installing: input.installing }, orderBy: { priority: "desc" } });
    const rule = rules.find((item) => {
      if (item.application && input.application && item.application.toLowerCase() !== input.application.toLowerCase()) return false;
      if (item.installation && input.installation && item.installation.toLowerCase() !== input.installation.toLowerCase()) return false;
      if (input.pipeSizeMm && item.minSizeMm && input.pipeSizeMm < item.minSizeMm) return false;
      if (input.pipeSizeMm && item.maxSizeMm && input.pipeSizeMm > item.maxSizeMm) return false;
      return true;
    }) || rules[0];
    if (!rule) return { label: "No standard system", products: [] };
    const variants = await this.prisma.productVariant.findMany({ where: { articleNumber: { in: rule.articles } }, include: { product: true } });
    const ordered = rule.articles.map((article) => variants.find((variant) => variant.articleNumber === article)).filter((variant): variant is NonNullable<typeof variant> => Boolean(variant));
    return { label: rule.label, products: ordered.map((variant) => ({ articleNumber: variant.articleNumber, name: variant.name, slug: variant.product.slug, sellPrice: num(variant.standardPrice) })) };
  }

  /**
   * Anonymous: the enquiry is never linked to an existing customer or project here, because the company
   * name is unverified. Sales links it when qualifying the lead.
   */
  @Public()
  @Throttle({ default: { limit: 5, ttl: 10 * 60_000 } })
  @Post("public/enquiries")
  async enquiry(@Body() body: unknown, @Req() req: { ip?: string; headers: Record<string, string | string[] | undefined> }) {
    const input = parseBody(enquirySchema, body);
    if (input.website) return { ok: true };
    await this.verifyCaptcha(input.captchaToken, clientIp(req));
    const variantIds = [...new Set((input.items || []).map((item) => item.variantId).filter((value): value is string => Boolean(value)))];
    const known = variantIds.length ? new Set((await this.prisma.productVariant.findMany({ where: { id: { in: variantIds }, active: true }, select: { id: true } })).map((row) => row.id)) : new Set<string>();
    const result = await this.prisma.$transaction(async (tx) => {
      const leadNumber = await this.numbers.next("LEAD", tx);
      const lead = await tx.lead.create({
        data: {
          number: leadNumber,
          source: "WEBSITE",
          status: input.items?.length || input.project ? "RFQ" : "NEW",
          contactName: input.name,
          companyName: input.company,
          email: input.email,
          phone: input.phone,
          application: input.application,
          message: [input.project ? `Project: ${input.project}` : null, input.message].filter(Boolean).join("\n\n") || undefined,
        },
      });
      let rfqId: string | undefined;
      if (input.items?.length || input.project) {
        const number = await this.numbers.next("RFQ", tx);
        const lines = input.items?.length ? input.items : [{ description: input.project || input.application || "Website enquiry", qty: 1, unit: "SET", specification: undefined, variantId: undefined }];
        const rfq = await tx.rfq.create({
          data: {
            number,
            leadId: lead.id,
            status: "RECEIVED",
            application: input.application,
            notes: input.message,
            items: { create: lines.map((item) => ({ description: item.description, qty: item.qty, unit: item.unit, specification: item.specification, variantId: item.variantId && known.has(item.variantId) ? item.variantId : undefined })) },
          },
        });
        rfqId = rfq.id;
      }
      await this.audit.log({ action: "enquiry", entityType: "lead", entityId: lead.id, after: { number: leadNumber, rfqId }, ip: clientIp(req) }, tx);
      return { lead, rfqId };
    });
    await this.crm.onLeadCreated(result.lead.id, true);
    const sales = await this.notify.usersWithRole("sales_head");
    await this.notify.push(sales.map((user) => user.id), "Website enquiry", `${input.company} sent ${result.lead.number}`, "lead", result.lead.id);
    return { ok: true, reference: result.lead.number };
  }

  private verifyCaptcha(token: string | undefined, ip: string | undefined) {
    return verifyCaptcha(token, ip);
  }

  @Get("cms/blocks")
  @RequirePermissions("content.view")
  blocks() {
    return this.prisma.cmsBlock.findMany();
  }

  @Patch("cms/blocks/:key")
  @RequirePermissions("content.edit")
  async saveBlock(@Param("key") key: string, @Body() raw: unknown, @Req() req: ReqUser) {
    if (!/^[a-z0-9_.-]{1,80}$/i.test(key)) throw new BadRequestException("Invalid block key");
    const input = parseBody(cmsBlockSchema, raw);
    const data = input.data === undefined ? undefined : input.data === null ? Prisma.DbNull : (input.data as Prisma.InputJsonValue);
    const fields = { title: input.title, subtitle: input.subtitle, body: input.body === undefined || input.body === null ? input.body : sanitizeRichText(input.body), data, published: input.published };
    const before = await this.prisma.cmsBlock.findUnique({ where: { key } });
    const row = await this.prisma.cmsBlock.upsert({ where: { key }, update: fields, create: { ...fields, key, title: input.title || key, published: input.published ?? false } });
    await this.audit.log({ actorId: req.user.id, action: before ? "update" : "create", entityType: "cms_block", entityId: key, before, after: row, ip: req.ip });
    return row;
  }

  @Get("cms/solutions")
  @RequirePermissions("content.view")
  adminSolutions() {
    return this.prisma.solution.findMany({ orderBy: { sortOrder: "asc" } });
  }

  @Post("cms/solutions")
  @RequirePermissions("content.create")
  async createSolution(@Body() raw: unknown, @Req() req: ReqUser) {
    const input = parseBody(solutionSchema, raw);
    const row = await this.prisma.solution.create({ data: { ...input, body: sanitizeRichText(input.body), published: input.published ?? false } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "solution", entityId: row.id, after: { slug: row.slug }, ip: req.ip });
    return row;
  }

  @Patch("cms/solutions/:id")
  @RequirePermissions("content.edit")
  async updateSolution(@Param("id") id: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const input = parseBody(solutionSchema.partial(), raw);
    const before = await this.prisma.solution.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Solution not found");
    const row = await this.prisma.solution.update({ where: { id }, data: { ...input, body: input.body === undefined ? undefined : sanitizeRichText(input.body) } });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "solution", entityId: id, before, after: row, ip: req.ip });
    return row;
  }

  @Get("cms/industries")
  @RequirePermissions("content.view")
  adminIndustries() {
    return this.prisma.industry.findMany({ orderBy: { sortOrder: "asc" } });
  }

  @Post("cms/industries")
  @RequirePermissions("content.create")
  async createIndustry(@Body() raw: unknown, @Req() req: ReqUser) {
    const input = parseBody(industrySchema, raw);
    const row = await this.prisma.industry.create({ data: { ...input, body: sanitizeRichText(input.body), published: input.published ?? false } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "industry", entityId: row.id, after: { slug: row.slug }, ip: req.ip });
    return row;
  }

  @Patch("cms/industries/:id")
  @RequirePermissions("content.edit")
  async updateIndustry(@Param("id") id: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const input = parseBody(industrySchema.partial(), raw);
    const before = await this.prisma.industry.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Industry not found");
    const row = await this.prisma.industry.update({ where: { id }, data: { ...input, body: input.body === undefined ? undefined : sanitizeRichText(input.body) } });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "industry", entityId: id, before, after: row, ip: req.ip });
    return row;
  }

  @Get("cms/studies")
  @RequirePermissions("content.view")
  adminStudies() {
    return this.prisma.caseStudy.findMany();
  }

  @Post("cms/studies")
  @RequirePermissions("content.create")
  async createStudy(@Body() raw: unknown, @Req() req: ReqUser) {
    const input = parseBody(caseStudySchema, raw);
    const row = await this.prisma.caseStudy.create({ data: { ...input, body: sanitizeRichText(input.body), published: input.published ?? false } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "case_study", entityId: row.id, after: { slug: row.slug }, ip: req.ip });
    return row;
  }

  @Patch("cms/studies/:id")
  @RequirePermissions("content.edit")
  async updateStudy(@Param("id") id: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const input = parseBody(caseStudySchema.partial(), raw);
    const before = await this.prisma.caseStudy.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Case study not found");
    const row = await this.prisma.caseStudy.update({ where: { id }, data: { ...input, body: input.body === undefined ? undefined : sanitizeRichText(input.body) } });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "case_study", entityId: id, before, after: row, ip: req.ip });
    return row;
  }

  @Get("distributor/targets")
  @RequirePermissions("sales_orders.view")
  targets(@Req() req: ReqUser) {
    return this.prisma.distributorTarget.findMany({ where: { customerId: customerScope(req.user) }, include: { customer: { select: { name: true } } }, take: 500 });
  }

  @Get("distributor/schemes")
  @RequirePermissions("sales_orders.view")
  schemes(@Req() req: ReqUser) {
    const claims = req.user.kind === "EXTERNAL" ? { where: { customerId: req.user.customerId || "__none__" }, orderBy: { createdAt: "desc" as const } } : true;
    return this.prisma.scheme.findMany({ where: { active: true }, include: { claims } });
  }

  @Post("distributor/claims")
  @RequirePermissions("sales_orders.create")
  async claim(@Body() raw: unknown, @Req() req: ReqUser) {
    const input = parseBody(claimSchema, raw);
    if (!req.user.customerId) throw new BadRequestException("Account is not linked to a customer");
    const now = new Date();
    const scheme = await this.prisma.scheme.findFirst({
      where: { id: input.schemeId, active: true, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }] },
      select: { id: true },
    });
    if (!scheme) throw new BadRequestException("Scheme is not open for claims");
    const row = await this.prisma.schemeClaim.create({ data: { schemeId: scheme.id, customerId: req.user.customerId, amount: input.amount, notes: input.notes } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "scheme_claim", entityId: row.id, after: { amount: input.amount, schemeId: scheme.id }, ip: req.ip });
    return row;
  }

  /** Allow-list: anonymous visitors get catalogue fields and the standard list price only. */
  private publicProduct(product: { variants: Array<Record<string, unknown>> } & Record<string, unknown>) {
    const plain = toPlain(product) as Record<string, unknown>;
    for (const key of PRIVATE_PRODUCT_KEYS) delete plain[key];
    plain.variants = (plain.variants as Array<Record<string, unknown>>).map((variant) => ({
      id: variant.id,
      articleNumber: variant.articleNumber,
      sku: variant.sku,
      name: variant.name,
      attributes: variant.attributes,
      sellPrice: resolveSellPrice(variant as never, "STANDARD" as PriceList),
    }));
    return plain;
  }

  private intentFromRules(question: string): { kind: string; topic?: string; minValue?: number } {
    const text = question.toLowerCase();
    const lakh = text.match(/(\d+(?:\.\d+)?)\s*lakh/);
    const minValue = lakh ? Number(lakh[1]) * 100000 : undefined;
    if (text.includes("forecast")) return { kind: "forecast" };
    if (text.includes("datasheet") || text.includes("data sheet")) return { kind: "datasheet", topic: question.replace(/datasheet|data sheet|find|the|for/gi, "").trim() };
    if (text.includes("safety stock") || text.includes("below safety") || text.includes("reorder")) return { kind: "stock" };
    if (text.includes("delay") || text.includes("delayed")) {
      const named = question.match(/project\s+(.+?)(?:\s+delayed|\?|$)/i);
      return { kind: "delay", topic: named?.[1]?.replace(/^why is /i, "").trim() || "ABC" };
    }
    if (text.includes("rfq")) return { kind: "rfq", topic: text.includes("data center") ? "data center" : "", minValue };
    return { kind: "unknown" };
  }

  private async intentFromModel(question: string) {
    if (!process.env.AI_API_KEY) return null;
    try {
      const response = await fetch(`${process.env.AI_BASE_URL || "https://api.openai.com/v1"}/chat/completions`, {
        method: "POST",
        signal: AbortSignal.timeout(10_000),
        headers: { Authorization: `Bearer ${process.env.AI_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: process.env.AI_MODEL || "gpt-4o-mini",
          temperature: 0,
          messages: [
            { role: "system", content: "Convert the question into JSON with keys kind (rfq, stock, delay, datasheet, forecast, unknown), topic, minValue. Do not answer the business question." },
            { role: "user", content: question },
          ],
        }),
      });
      if (!response.ok) return null;
      const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const content = payload.choices?.[0]?.message?.content || "";
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) return null;
      const parsed = JSON.parse(match[0]) as { kind?: unknown; topic?: unknown; minValue?: unknown };
      const kinds = ["rfq", "stock", "delay", "datasheet", "forecast", "unknown"];
      if (typeof parsed.kind !== "string" || !kinds.includes(parsed.kind)) return null;
      return {
        kind: parsed.kind,
        topic: typeof parsed.topic === "string" ? parsed.topic.slice(0, 100) : undefined,
        minValue: typeof parsed.minValue === "number" && Number.isFinite(parsed.minValue) ? parsed.minValue : undefined,
      };
    } catch {
      return null;
    }
  }
}
