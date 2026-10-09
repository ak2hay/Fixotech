import { BadRequestException, Controller, Get, NotFoundException, Param, Query, Req } from "@nestjs/common";
import { RFQ_STEPS, num, resolveSellPrice, rfqStepIndex, type PriceList } from "@fixotec/shared";
import type { Prisma } from "@fixotec/db";
import { present } from "./commercial";
import { AuthUser, RequirePermissions, can, isExternal, seesCost } from "./http";
import { PrismaService } from "./prisma.service";
import { CUSTOMER_QUOTE_STATUSES, customerScope, documentAudience, documentScope, healthOf, mediaPath, openIssueWhere, progressOf, projectScope, quoteScope } from "./scope";
import { toPlain } from "./services";
import { CAD_CATEGORIES } from "./uploads";

type ReqUser = { user: AuthUser };

const CLOSED_RFQ = ["WON", "LOST", "CANCELLED"];
const OPEN_QUOTE = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "SENT"];
const ENTITY_HREF: Record<string, string> = {
  project: "/projects",
  rfq: "/rfqs",
  quotation: "/quotations",
  sales_order: "/sales-orders",
  lead: "/leads",
  engineering: "/engineering",
  customer: "/customers",
  product: "/products",
  invoice: "/invoices",
  dispatch: "/dispatch",
  document: "/documents",
};

const ENTITY_NOUN: Record<string, string> = {
  project: "Project",
  rfq: "RFQ",
  quotation: "Quotation",
  sales_order: "Order",
  lead: "Lead",
  engineering: "Engineering",
  customer: "Customer",
  product: "Product",
  document: "Document",
  document_version: "Document",
  invoice: "Invoice",
  dispatch: "Dispatch",
};

export type ActivityRow = { id: string; at: string; kind: "workflow" | "comment" | "audit"; entityType: string; entityId: string; title: string; description?: string; actor?: string | null; status?: string | null; href?: string | null };

function startOfMonth(offset = 0) {
  const date = new Date();
  return new Date(date.getFullYear(), date.getMonth() + offset, 1);
}

function monthKeys(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const date = startOfMonth(index - count + 1);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
  });
}

function series(rows: Array<{ month: Date; amount: unknown }>, keys: string[]) {
  const map = new Map(rows.map((row) => [`${row.month.getFullYear()}-${String(row.month.getMonth() + 1).padStart(2, "0")}`, num(row.amount)]));
  return keys.map((key) => map.get(key) || 0);
}

function deltaPct(values: number[]) {
  const current = values[values.length - 1] || 0;
  const previous = values[values.length - 2] || 0;
  if (!previous) return current ? 100 : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function humanStatus(status?: string | null) {
  return (status || "").toLowerCase().replace(/_/g, " ");
}

@Controller()
export class OverviewController {
  constructor(private readonly prisma: PrismaService) {}

  /* ------------------------------ Dashboard ------------------------------ */

  @Get("reports/dashboard")
  async dashboard(@Req() req: ReqUser) {
    const user = req.user;
    if (isExternal(user)) throw new BadRequestException("Use the portal summary");
    const endOfToday = new Date();
    endOfToday.setHours(23, 59, 59, 999);
    const keys = monthKeys(6);
    const since = startOfMonth(-5);

    const allKpis = can(user, "reports.view") ? await this.kpis(keys, since) : null;
    const kpis = allKpis && !seesCost(user) ? { ...allKpis, grossMargin: null } : allKpis;

    const [approvals, rfqsDue, engineering, delayedDispatches, pendingPos, leadsAgg, oppAgg, rfqOpen, quoteAgg, negotiationAgg, wonAgg] = await Promise.all([
      this.prisma.approvalRequest.count({ where: { status: "PENDING", approverRole: user.roleKeys.some((role) => ["super_admin", "managing_director", "ceo"].includes(role)) ? undefined : { in: user.roleKeys } } }),
      this.prisma.rfq.count({ where: { status: { notIn: [...CLOSED_RFQ, "QUOTED"] }, dueDate: { lte: endOfToday } } }),
      this.prisma.engineeringRequest.count({ where: { status: { in: ["NEW", "UNDER_REVIEW", "CALCULATION", "DRAWING"] } } }),
      this.prisma.dispatchNote.count({ where: { status: { notIn: ["SHIPPED", "DELIVERED", "CANCELLED"] }, createdAt: { lt: new Date(Date.now() - 3 * 86_400_000) } } }),
      this.prisma.purchaseOrder.count({ where: { status: { in: ["DRAFT", "SUBMITTED"] } } }),
      this.prisma.lead.aggregate({ where: { status: { in: ["NEW", "QUALIFIED"] } }, _count: { _all: true }, _sum: { estimatedValue: true } }),
      this.prisma.lead.aggregate({ where: { status: { in: ["OPPORTUNITY", "PROJECT_IDENTIFIED", "TECHNICAL_EVALUATION"] } }, _count: { _all: true }, _sum: { estimatedValue: true } }),
      this.prisma.rfq.count({ where: { status: { notIn: [...CLOSED_RFQ, "QUOTED", "NEGOTIATION"] } } }),
      this.prisma.quotation.aggregate({ where: { status: { in: OPEN_QUOTE } }, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.quotation.aggregate({ where: { status: "NEGOTIATION" }, _count: { _all: true }, _sum: { total: true } }),
      this.prisma.quotation.aggregate({ where: { status: { in: ["ACCEPTED", "COMPLETED"] }, updatedAt: { gte: new Date(Date.now() - 90 * 86_400_000) } }, _count: { _all: true }, _sum: { total: true } }),
    ]);

    const actions = [
      { key: "approvals", count: approvals, title: `${approvals} approval${approvals === 1 ? "" : "s"} waiting`, description: "Requires your review", href: "/approvals", tone: "accent", permission: "approvals.view" },
      { key: "rfqs", count: rfqsDue, title: `${rfqsDue} RFQ${rfqsDue === 1 ? "" : "s"} due today`, description: "Quotation response pending", href: "/rfqs?due=today", tone: "warn", permission: "rfqs.view" },
      { key: "engineering", count: engineering, title: `${engineering} engineering request${engineering === 1 ? "" : "s"}`, description: "Calculation and drawings pending", href: "/engineering", tone: "info", permission: "engineering.view" },
      { key: "dispatch", count: delayedDispatches, title: `${delayedDispatches} delayed dispatch${delayedDispatches === 1 ? "" : "es"}`, description: "Older than 3 days, not shipped", href: "/dispatch", tone: "bad", permission: "dispatch.view" },
      { key: "purchases", count: pendingPos, title: `${pendingPos} purchase order${pendingPos === 1 ? "" : "s"} pending`, description: "Supplier confirmation required", href: "/purchases", tone: "neutral", permission: "purchases.view" },
    ].filter((item) => can(user, item.permission));

    const funnel = [
      { label: "Leads", count: leadsAgg._count._all, value: num(leadsAgg._sum.estimatedValue) },
      { label: "Opportunities", count: oppAgg._count._all, value: num(oppAgg._sum.estimatedValue) },
      { label: "RFQs", count: rfqOpen },
      { label: "Quotations", count: quoteAgg._count._all, value: num(quoteAgg._sum.total) },
      { label: "Negotiation", count: negotiationAgg._count._all, value: num(negotiationAgg._sum.total) },
      { label: "Won", count: wonAgg._count._all, value: num(wonAgg._sum.total) },
    ];

    const recentRfqs = can(user, "rfqs.view") ? await this.recentRfqs() : [];
    const operations = await this.operations();
    const activity = (await this.activityFor(user, { limit: 8 })).items;

    return { kpis, actions, funnel, recentRfqs, operations, activity, generatedAt: new Date().toISOString() };
  }

  private async kpis(keys: string[], since: Date) {
    const [revenueRows, orderRows, quoteRows, marginRows, receivableAgg, paidAgg, pipelineAgg] = await Promise.all([
      this.prisma.$queryRaw<Array<{ month: Date; amount: unknown }>>`SELECT date_trunc('month', "issueDate") AS month, SUM("total") AS amount FROM "Invoice" WHERE "issueDate" >= ${since} GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ month: Date; amount: unknown }>>`SELECT date_trunc('month', "createdAt") AS month, SUM("total") AS amount FROM "SalesOrder" WHERE "createdAt" >= ${since} AND "status" NOT IN ('CANCELLED','DRAFT') GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ month: Date; amount: unknown }>>`SELECT date_trunc('month', "createdAt") AS month, SUM("total") AS amount FROM "Quotation" WHERE "createdAt" >= ${since} AND "status" NOT IN ('CANCELLED','REJECTED') GROUP BY 1`,
      this.prisma.$queryRaw<Array<{ month: Date; revenue: unknown; cost: unknown }>>`SELECT date_trunc('month', o."createdAt") AS month, SUM(i."qty" * i."unitPrice") AS revenue, SUM(i."qty" * i."unitCost") AS cost FROM "SalesOrderItem" i JOIN "SalesOrder" o ON o."id" = i."salesOrderId" WHERE o."createdAt" >= ${since} AND o."status" NOT IN ('CANCELLED','DRAFT') GROUP BY 1`,
      this.prisma.invoice.aggregate({ where: { status: { in: ["ISSUED", "PARTIAL", "OVERDUE"] } }, _sum: { total: true } }),
      this.prisma.payment.aggregate({ where: { direction: "IN", invoice: { status: { in: ["ISSUED", "PARTIAL", "OVERDUE"] } } }, _sum: { amount: true } }),
      this.prisma.quotation.aggregate({ where: { status: { in: [...OPEN_QUOTE, "NEGOTIATION"] } }, _sum: { total: true } }),
    ]);
    const revenue = series(revenueRows, keys);
    const orders = series(orderRows, keys);
    const quotes = series(quoteRows, keys);
    const marginMap = new Map(marginRows.map((row) => [`${row.month.getFullYear()}-${String(row.month.getMonth() + 1).padStart(2, "0")}`, row]));
    const margin = keys.map((key) => {
      const row = marginMap.get(key);
      const rev = num(row?.revenue);
      return rev ? ((rev - num(row?.cost)) / rev) * 100 : 0;
    });
    const receivables = Math.max(0, num(receivableAgg._sum.total) - num(paidAgg._sum.amount));
    const marginWindow = marginRows.reduce((acc, row) => ({ revenue: acc.revenue + num(row.revenue), cost: acc.cost + num(row.cost) }), { revenue: 0, cost: 0 });
    const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
    return {
      months: keys,
      revenue: { value: sum(revenue), delta: deltaPct(revenue), series: revenue },
      orders: { value: sum(orders), delta: deltaPct(orders), series: orders },
      pipeline: { value: num(pipelineAgg._sum.total), delta: deltaPct(quotes), series: quotes },
      receivables: { value: receivables, delta: deltaPct(revenue), series: revenue, invert: true },
      grossMargin: { value: marginWindow.revenue ? ((marginWindow.revenue - marginWindow.cost) / marginWindow.revenue) * 100 : 0, delta: margin[margin.length - 2] ? margin[margin.length - 1] - margin[margin.length - 2] : null, series: margin },
    };
  }

  private async recentRfqs() {
    const rows = await this.prisma.rfq.findMany({
      where: { status: { notIn: CLOSED_RFQ } },
      orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
      take: 6,
      include: {
        customer: { select: { name: true, priceList: true } },
        project: { select: { name: true } },
        quotations: { select: { total: true }, orderBy: { createdAt: "desc" }, take: 1 },
        items: { include: { variant: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      number: row.number,
      status: row.status,
      dueDate: row.dueDate,
      priority: row.priority,
      customer: row.customer?.name || null,
      project: row.project?.name || null,
      value: row.quotations[0] ? num(row.quotations[0].total) : this.estimate(row.items, (row.customer?.priceList as PriceList) || "STANDARD"),
    }));
  }

  private estimate(items: Array<{ qty: unknown; variant: unknown }>, list: PriceList) {
    return items.reduce((sum, item) => sum + (item.variant ? num(item.qty) * resolveSellPrice(toPlain(item.variant) as never, list) : 0), 0);
  }

  private async operations() {
    const [jobs, completedJobs, bins, usedBins, openPo, delayed, dispatches, onTime] = await Promise.all([
      this.prisma.jobCard.count({ where: { createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
      this.prisma.jobCard.count({ where: { status: "COMPLETED", createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) } } }),
      this.prisma.warehouseBin.count({ where: { active: true } }),
      this.prisma.warehouseBin.count({ where: { active: true, balances: { some: { qty: { gt: 0 } } } } }),
      this.prisma.purchaseOrder.aggregate({ where: { status: { in: ["APPROVED", "SUBMITTED", "PARTIAL"] } }, _sum: { total: true } }),
      this.prisma.dispatchNote.count({ where: { status: { notIn: ["SHIPPED", "DELIVERED", "CANCELLED"] }, createdAt: { lt: new Date(Date.now() - 3 * 86_400_000) } } }),
      this.prisma.dispatchNote.count({ where: { status: "DELIVERED" } }),
      this.prisma.dispatchNote.count({ where: { status: "DELIVERED", deliveredAt: { not: null } } }),
    ]);
    return {
      productionPct: jobs ? (completedJobs / jobs) * 100 : 0,
      warehousePct: bins ? (usedBins / bins) * 100 : 0,
      openPurchaseOrders: num(openPo._sum.total),
      delayedDispatches: delayed,
      deliveredPct: dispatches ? (onTime / dispatches) * 100 : 0,
    };
  }

  /* ------------------------------- Activity ------------------------------ */

  @Get("activity")
  async activity(@Req() req: ReqUser, @Query() query: Record<string, string>) {
    return this.activityFor(req.user, { entityType: query.entityType || undefined, entityId: query.entityId || undefined, limit: Math.min(100, Number(query.limit) || 30) });
  }

  async activityFor(user: AuthUser, options: { entityType?: string; entityId?: string; limit: number }): Promise<{ items: ActivityRow[] }> {
    const external = isExternal(user);
    let allowed: Array<{ entityType: string; entityId: { in: string[] } }> | null = null;
    if (external) {
      const customerId = user.customerId || "__none__";
      const [projects, rfqs, quotes, orders] = await Promise.all([
        this.prisma.project.findMany({ where: projectScope(user), select: { id: true } }),
        this.prisma.rfq.findMany({ where: { customerId }, select: { id: true } }),
        this.prisma.quotation.findMany({ where: quoteScope(user), select: { id: true } }),
        this.prisma.salesOrder.findMany({ where: { customerId }, select: { id: true } }),
      ]);
      allowed = [
        { entityType: "project", entityId: { in: projects.map((row) => row.id) } },
        { entityType: "rfq", entityId: { in: rfqs.map((row) => row.id) } },
        { entityType: "quotation", entityId: { in: quotes.map((row) => row.id) } },
        { entityType: "sales_order", entityId: { in: orders.map((row) => row.id) } },
      ];
    }
    const target = options.entityType && options.entityId ? { entityType: options.entityType, entityId: options.entityId } : {};
    const scope = allowed ? { OR: allowed } : {};
    const where = { AND: [target, scope] };
    const projectChildren = options.entityType === "project" && options.entityId ? await this.projectChildren(options.entityId) : null;
    const baseWorkflow = projectChildren ? { AND: [scope, { OR: [target, ...projectChildren] }] } : where;
    // Internal quotation steps (draft, review, rejection) and credit decisions are not part of the customer's timeline.
    const workflowWhere = external
      ? { AND: [baseWorkflow, { NOT: { entityType: "quotation", toStatus: { notIn: CUSTOMER_QUOTE_STATUSES } } }, { OR: [{ comment: null }, { NOT: { comment: { startsWith: "Exposure" } } }] }] }
      : baseWorkflow;

    const [events, comments, audits] = await Promise.all([
      this.prisma.workflowEvent.findMany({ where: workflowWhere, orderBy: { createdAt: "desc" }, take: options.limit }),
      external ? Promise.resolve([]) : this.prisma.comment.findMany({ where, orderBy: { createdAt: "desc" }, take: options.limit, include: { author: { select: { name: true } } } }),
      external ? Promise.resolve([]) : this.prisma.auditLog.findMany({ where: { AND: [target, { action: { in: ["create", "milestone", "override"] } }] }, orderBy: { createdAt: "desc" }, take: options.limit }),
    ]);

    const actorIds = [...new Set([...events.map((row) => row.actorId), ...audits.map((row) => row.actorId)].filter((id): id is string => Boolean(id)))];
    const actors = new Map((await this.prisma.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((row) => [row.id, row.name]));
    const labels = await this.entityLabels([...events, ...comments, ...audits].map((row) => ({ entityType: row.entityType, entityId: row.entityId || "" })));

    const rows: ActivityRow[] = [
      ...events.map((row) => {
        const label = labels.get(`${row.entityType}:${row.entityId}`) || ENTITY_NOUN[row.entityType] || row.entityType;
        const title = row.comment && !row.comment.startsWith("Exposure") ? `${row.comment}` : row.fromStatus ? `${label} moved to ${humanStatus(row.toStatus)}` : `${label} created`;
        return { id: `w-${row.id}`, at: row.createdAt.toISOString(), kind: "workflow" as const, entityType: row.entityType, entityId: row.entityId, title, description: row.comment ? label : undefined, actor: row.actorId ? actors.get(row.actorId) || null : null, status: row.toStatus, href: ENTITY_HREF[row.entityType] ? `${ENTITY_HREF[row.entityType]}/${row.entityId}` : null };
      }),
      ...comments.map((row) => ({ id: `c-${row.id}`, at: row.createdAt.toISOString(), kind: "comment" as const, entityType: row.entityType, entityId: row.entityId, title: row.body, description: labels.get(`${row.entityType}:${row.entityId}`), actor: row.author?.name || null, status: null, href: ENTITY_HREF[row.entityType] ? `${ENTITY_HREF[row.entityType]}/${row.entityId}` : null })),
      ...audits.map((row) => {
        const label = labels.get(`${row.entityType}:${row.entityId}`) || ENTITY_NOUN[row.entityType] || row.entityType;
        const after = (row.after || {}) as Record<string, unknown>;
        const title = row.action === "milestone" ? `${label}: ${String(after.key || "milestone").toLowerCase()} marked ${humanStatus(String(after.status || ""))}` : row.action === "override" ? `${label} credit override` : `${label} created`;
        return { id: `a-${row.id}`, at: row.createdAt.toISOString(), kind: "audit" as const, entityType: row.entityType, entityId: row.entityId || "", title, actor: row.actorId ? actors.get(row.actorId) || null : null, status: row.action === "milestone" ? String(after.status || "") : null, href: ENTITY_HREF[row.entityType] && row.entityId ? `${ENTITY_HREF[row.entityType]}/${row.entityId}` : null };
      }),
    ];
    const seen = new Set<string>();
    const items = rows
      .sort((a, b) => b.at.localeCompare(a.at))
      .filter((row) => {
        const key = `${row.entityType}:${row.entityId}:${row.title}:${row.at.slice(0, 16)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .slice(0, options.limit);
    return { items };
  }

  private async projectChildren(projectId: string) {
    const [rfqs, quotes, orders] = await Promise.all([
      this.prisma.rfq.findMany({ where: { projectId }, select: { id: true } }),
      this.prisma.quotation.findMany({ where: { projectId }, select: { id: true } }),
      this.prisma.salesOrder.findMany({ where: { projectId }, select: { id: true } }),
    ]);
    return [
      { entityType: "rfq", entityId: { in: rfqs.map((row) => row.id) } },
      { entityType: "quotation", entityId: { in: quotes.map((row) => row.id) } },
      { entityType: "sales_order", entityId: { in: orders.map((row) => row.id) } },
    ];
  }

  private async entityLabels(refs: Array<{ entityType: string; entityId: string }>) {
    const byType = new Map<string, Set<string>>();
    for (const ref of refs) {
      if (!ref.entityId) continue;
      if (!byType.has(ref.entityType)) byType.set(ref.entityType, new Set());
      byType.get(ref.entityType)!.add(ref.entityId);
    }
    const ids = (type: string) => [...(byType.get(type) || [])];
    const labels = new Map<string, string>();
    const [projects, rfqs, quotes, orders, leads, customers] = await Promise.all([
      ids("project").length ? this.prisma.project.findMany({ where: { id: { in: ids("project") } }, select: { id: true, name: true } }) : [],
      ids("rfq").length ? this.prisma.rfq.findMany({ where: { id: { in: ids("rfq") } }, select: { id: true, number: true } }) : [],
      ids("quotation").length ? this.prisma.quotation.findMany({ where: { id: { in: ids("quotation") } }, select: { id: true, number: true } }) : [],
      ids("sales_order").length ? this.prisma.salesOrder.findMany({ where: { id: { in: ids("sales_order") } }, select: { id: true, number: true } }) : [],
      ids("lead").length ? this.prisma.lead.findMany({ where: { id: { in: ids("lead") } }, select: { id: true, number: true } }) : [],
      ids("customer").length ? this.prisma.customer.findMany({ where: { id: { in: ids("customer") } }, select: { id: true, name: true } }) : [],
    ]);
    projects.forEach((row) => labels.set(`project:${row.id}`, row.name));
    rfqs.forEach((row) => labels.set(`rfq:${row.id}`, `RFQ ${row.number}`));
    quotes.forEach((row) => labels.set(`quotation:${row.id}`, `Quotation ${row.number}`));
    orders.forEach((row) => labels.set(`sales_order:${row.id}`, `Order ${row.number}`));
    leads.forEach((row) => labels.set(`lead:${row.id}`, `Lead ${row.number}`));
    customers.forEach((row) => labels.set(`customer:${row.id}`, row.name));
    return labels;
  }

  /* -------------------------------- Search ------------------------------- */

  @Get("search")
  async search(@Req() req: ReqUser, @Query("q") raw?: string) {
    const q = String(raw || "").trim();
    if (q.length < 2) return { items: [] };
    const user = req.user;
    const text = { contains: q, mode: "insensitive" as const };
    const customerId = customerScope(user);
    const audience = documentAudience(user);
    const [projects, rfqs, quotes, orders, customers, products, documents] = await Promise.all([
      can(user, "projects.view") ? this.prisma.project.findMany({ where: { AND: [projectScope(user), { OR: [{ name: text }, { code: text }, { location: text }] }] }, take: 5, select: { id: true, name: true, code: true, location: true } }) : [],
      can(user, "rfqs.view") ? this.prisma.rfq.findMany({ where: { customerId, OR: [{ number: text }, { application: text }, { project: { name: text } }] }, take: 5, select: { id: true, number: true, status: true, project: { select: { name: true } } } }) : [],
      can(user, "quotations.view") ? this.prisma.quotation.findMany({ where: { AND: [quoteScope(user), { OR: [{ number: text }, { project: { name: text } }] }] }, take: 5, select: { id: true, number: true, status: true, customer: { select: { name: true } } } }) : [],
      can(user, "sales_orders.view") ? this.prisma.salesOrder.findMany({ where: { customerId, number: text }, take: 5, select: { id: true, number: true, status: true } }) : [],
      can(user, "customers.view") && !isExternal(user) ? this.prisma.customer.findMany({ where: { OR: [{ name: text }, { code: text }, { gstin: text }] }, take: 5, select: { id: true, name: true, code: true } }) : [],
      can(user, "products.view") ? this.prisma.product.findMany({ where: { published: isExternal(user) ? true : undefined, OR: [{ name: text }, { sku: text }, { variants: { some: { articleNumber: text } } }] }, take: 6, select: { id: true, name: true, sku: true } }) : [],
      can(user, "documents.view") ? this.prisma.document.findMany({ where: { title: text, deletedAt: null, audiences: audience.length ? { hasSome: audience } : undefined }, take: 5, select: { id: true, title: true, category: true } }) : [],
    ]);
    const items = [
      ...projects.map((row) => ({ id: row.id, type: "project", group: "Projects", label: row.name, sublabel: [row.code, row.location].filter(Boolean).join(" · "), href: `/projects/${row.id}` })),
      ...rfqs.map((row) => ({ id: row.id, type: "rfq", group: "RFQs", label: row.number, sublabel: [row.project?.name, humanStatus(row.status)].filter(Boolean).join(" · "), href: `/rfqs/${row.id}` })),
      ...quotes.map((row) => ({ id: row.id, type: "quotation", group: "Quotations", label: row.number, sublabel: [row.customer?.name, humanStatus(row.status)].filter(Boolean).join(" · "), href: `/quotations/${row.id}` })),
      ...orders.map((row) => ({ id: row.id, type: "sales_order", group: "Orders", label: row.number, sublabel: humanStatus(row.status), href: `/sales-orders/${row.id}` })),
      ...customers.map((row) => ({ id: row.id, type: "customer", group: "Customers", label: row.name, sublabel: row.code, href: `/customers/${row.id}` })),
      ...products.map((row) => ({ id: row.id, type: "product", group: "Products", label: row.name, sublabel: row.sku, href: `/products/${row.id}` })),
      ...documents.map((row) => ({ id: row.id, type: "document", group: "Documents", label: row.title, sublabel: humanStatus(row.category), href: `/documents?focus=${row.id}` })),
    ];
    return { items };
  }

  /* --------------------------- Project overview -------------------------- */

  @Get("projects/:id/overview")
  @RequirePermissions("projects.view")
  async projectOverview(@Param("id") id: string, @Req() req: ReqUser) {
    const user = req.user;
    const project = await this.prisma.project.findFirst({
      where: { AND: [{ id }, projectScope(user)] },
      include: {
        customer: { include: { contacts: { orderBy: { primary: "desc" }, take: 3 } } },
        consultant: { select: { id: true, name: true } },
        contractor: { select: { id: true, name: true } },
        mepContractor: { select: { id: true, name: true } },
        developer: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true, email: true, jobTitle: true } },
        members: true,
        milestones: { orderBy: { sortOrder: "asc" } },
        _count: { select: { rfqs: true, boqs: true, engineering: true, quotations: true, salesOrders: true, siteIssues: true, submittals: true, tickets: true } },
      },
    });
    if (!project) throw new NotFoundException("Project not found");

    const audience = documentAudience(user);
    const [openIssues, orderIds, documents, documentCount, memberUsers] = await Promise.all([
      this.prisma.siteIssue.count({ where: { projectId: id, ...openIssueWhere } }),
      this.prisma.salesOrder.findMany({ where: { projectId: id }, select: { id: true } }),
      this.prisma.document.findMany({ where: { entityType: "project", entityId: id, deletedAt: null, audiences: audience.length ? { hasSome: audience } : undefined }, orderBy: { updatedAt: "desc" }, take: 8, include: { versions: { orderBy: { version: "desc" }, take: 1 } } }),
      this.prisma.document.count({ where: { entityType: "project", entityId: id, deletedAt: null, audiences: audience.length ? { hasSome: audience } : undefined } }),
      this.prisma.user.findMany({ where: { id: { in: project.members.map((member) => member.userId) } }, select: { id: true, name: true, email: true, jobTitle: true } }),
    ]);
    const salesOrderIds = orderIds.map((row) => row.id);
    const quoteIds = (await this.prisma.quotation.findMany({ where: { projectId: id }, select: { id: true } })).map((row) => row.id);
    const [billed, pendingApprovals, dispatchCount, productionCount, invoiceCount, purchaseCount] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { salesOrderId: { in: salesOrderIds } }, _sum: { total: true } }),
      isExternal(user) ? Promise.resolve(0) : this.prisma.approvalRequest.count({ where: { status: "PENDING", entityId: { in: quoteIds } } }),
      this.prisma.dispatchNote.count({ where: { salesOrderId: { in: salesOrderIds } } }),
      isExternal(user) ? Promise.resolve(0) : this.prisma.productionOrder.count({ where: { salesOrderId: { in: salesOrderIds } } }),
      this.prisma.invoice.count({ where: { salesOrderId: { in: salesOrderIds } } }),
      isExternal(user) ? Promise.resolve(0) : this.prisma.purchaseRequisition.count({ where: { sourceType: "SALES_ORDER", sourceId: { in: salesOrderIds } } }),
    ]);

    const progress = progressOf(project.stage, project.milestones);
    const health = healthOf(project, progress, openIssues);
    const now = Date.now();
    const end = project.expectedCompletion?.getTime();
    const daysLeft = end ? Math.ceil((end - now) / 86_400_000) : null;
    const timeline = daysLeft === null ? "Not scheduled" : daysLeft < 0 ? `Delayed ${Math.abs(daysLeft)} days` : health === "AT_RISK" ? "Behind plan" : "On schedule";
    // Consultants and contractors on a project are not party to the customer's commercial terms.
    const commercial = !isExternal(user) || project.customerId === user.customerId;
    const billedTotal = commercial ? num(billed._sum.total) : 0;
    const budgetUsed = commercial && num(project.fixotecValue) ? (billedTotal / num(project.fixotecValue)) * 100 : 0;
    const next = project.milestones.find((item) => item.status !== "DONE");
    const { members: _members, _count, customer, ...projectFields } = project;
    const internalFields = isExternal(user) ? { notes: null, probability: null } : {};
    const rest = commercial ? { ...projectFields, ...internalFields } : { ...projectFields, ...internalFields, fixotecValue: null, projectValue: null };

    const contacts = [
      ...customer.contacts.map((contact) => ({ role: contact.title || "Customer", name: contact.name, email: contact.email, phone: contact.phone, organisation: customer.name })),
      ...(project.owner ? [{ role: "Project Manager", name: project.owner.name, email: project.owner.email, phone: null, organisation: "Fixotec" }] : []),
      ...memberUsers.map((member) => ({ role: project.members.find((item) => item.userId === member.id)?.role || "Team", name: member.name, email: member.email, phone: null, organisation: "Fixotec" })),
    ];

    return present(
      {
        project: { ...rest, customer: { id: customer.id, name: customer.name, code: customer.code }, coverUrl: mediaPath(project.coverImageKey) },
        health: { status: health, progress, timeline, daysLeft, budgetUsed, billed: billedTotal, openIssues, pendingApprovals, nextMilestone: next ? { key: next.key, label: next.label, plannedDate: next.plannedDate } : null },
        milestones: project.milestones,
        contacts,
        parties: [
          { role: "Customer", name: customer.name },
          project.consultant ? { role: "Consultant", name: project.consultant.name } : null,
          project.contractor ? { role: "Contractor", name: project.contractor.name } : null,
          project.mepContractor ? { role: "MEP Contractor", name: project.mepContractor.name } : null,
          project.developer ? { role: "Developer", name: project.developer.name } : null,
        ].filter(Boolean),
        documents: documents.map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, updatedAt: doc.updatedAt, version: doc.versions[0]?.version || 1, status: doc.versions[0]?.status, sizeBytes: doc.versions[0]?.sizeBytes || 0, mimeType: doc.versions[0]?.mimeType, hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey) })),
        counts: { ..._count, documents: documentCount, dispatch: dispatchCount, production: productionCount, invoices: invoiceCount, procurement: purchaseCount },
      },
      user,
    );
  }

  /* ----------------------------- RFQ overview ---------------------------- */

  @Get("rfqs/:id/overview")
  @RequirePermissions("rfqs.view")
  async rfqOverview(@Param("id") id: string, @Req() req: ReqUser) {
    const user = req.user;
    const rfq = await this.prisma.rfq.findFirst({
      where: { id, customerId: customerScope(user) },
      include: {
        customer: { select: { id: true, name: true, code: true, priceList: true } },
        project: { select: { id: true, name: true, code: true, location: true } },
        assignee: { select: { id: true, name: true } },
        lead: { select: { id: true, number: true, source: true } },
        items: { include: { variant: { include: { product: { select: { id: true, name: true, applications: true } } } } } },
        quotations: { where: isExternal(user) ? { status: { in: CUSTOMER_QUOTE_STATUSES } } : undefined, orderBy: { createdAt: "desc" }, select: { id: true, number: true, status: true, total: true, createdAt: true, validUntil: true } },
        engineering: { select: { id: true, number: true, status: true, engineer: { select: { name: true } }, dueDate: true } },
        boqs: { select: { id: true, number: true, title: true, status: true, _count: { select: { items: true } } } },
      },
    });
    if (!rfq) throw new NotFoundException("RFQ not found");
    const step = rfqStepIndex(rfq.status, rfq.boqs.length > 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = rfq.dueDate ? new Date(rfq.dueDate) : null;
    if (due) due.setHours(0, 0, 0, 0);
    const closed = CLOSED_RFQ.includes(rfq.status) || rfq.status === "QUOTED";
    const dueStatus = !due || closed ? null : due < today ? "OVERDUE" : due.getTime() === today.getTime() ? "DUE_TODAY" : "UPCOMING";
    const estimated = rfq.quotations[0] ? num(rfq.quotations[0].total) : this.estimate(rfq.items, (rfq.customer?.priceList as PriceList) || "STANDARD");
    const audience = documentAudience(user);
    const documents = await this.prisma.document.findMany({ where: { entityType: "rfq", entityId: id, deletedAt: null, audiences: audience.length ? { hasSome: audience } : undefined }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    return present({ rfq, steps: RFQ_STEPS, step, dueStatus, estimatedValue: estimated, documents: documents.map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, version: doc.versions[0]?.version, status: doc.versions[0]?.status, hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey) })) }, user);
  }

  /* ------------------------------ Submittals ----------------------------- */

  @Get("submittals")
  @RequirePermissions("documents.view")
  async submittals(@Req() req: ReqUser, @Query() query: Record<string, string>) {
    const where = { AND: [{ projectId: query.projectId || undefined, status: query.status || undefined }, isExternal(req.user) ? { project: projectScope(req.user) } : {}] };
    const items = await this.prisma.submittal.findMany({ where, orderBy: { createdAt: "desc" }, take: 100, include: { project: { select: { id: true, name: true, code: true } } } });
    return { items };
  }

  @Get("submittals/:id")
  @RequirePermissions("documents.view")
  async submittalDetail(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.submittal.findFirst({ where: { AND: [{ id }, isExternal(req.user) ? { project: projectScope(req.user) } : {}] }, include: { project: { select: { id: true, name: true, code: true } } } });
    if (!row) throw new NotFoundException("Submittal not found");
    const audience = documentAudience(req.user);
    const document = row.documentId
      ? await this.prisma.document.findFirst({
          where: { id: row.documentId, deletedAt: null, audiences: audience.length ? { hasSome: audience } : undefined },
          include: { versions: { where: isExternal(req.user) ? { status: { in: ["APPROVED", "CLIENT_REVIEW"] } } : undefined, orderBy: { version: "desc" } } },
        })
      : null;
    return { ...row, document };
  }

  /* --------------------------------- CAD --------------------------------- */

  @Get("cad")
  @RequirePermissions("documents.view")
  async cad(@Req() req: ReqUser, @Query() query: Record<string, string>) {
    const audience = documentAudience(req.user);
    const categories = query.category && CAD_CATEGORIES.includes(query.category) ? [query.category] : CAD_CATEGORIES;
    const productVariants = query.productId ? await this.prisma.productVariant.findMany({ where: { productId: query.productId }, select: { id: true } }) : [];
    const entity: Prisma.DocumentWhereInput = query.projectId
      ? { entityType: "project", entityId: query.projectId }
      : query.productId
        ? { OR: [{ entityType: "product", entityId: query.productId }, { entityType: "variant", entityId: { in: productVariants.map((row) => row.id) } }] }
        : {};
    const scope = await documentScope(this.prisma, req.user);
    const items = await this.prisma.document.findMany({
      where: { AND: [scope, entity], category: { in: categories }, audiences: audience.length ? { hasSome: audience } : undefined, title: query.q ? { contains: query.q, mode: "insensitive" } : undefined },
      orderBy: { updatedAt: "desc" },
      take: 120,
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });
    const idsOf = (type: string) => items.filter((doc) => doc.entityType === type && doc.entityId).map((doc) => doc.entityId!);
    const [projectIds, productIds, variantIds] = [idsOf("project"), idsOf("product"), idsOf("variant")];
    const [projects, products, variants, downloads] = await Promise.all([
      projectIds.length ? this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } }) : [],
      productIds.length ? this.prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, name: true } }) : [],
      variantIds.length ? this.prisma.productVariant.findMany({ where: { id: { in: variantIds } }, select: { id: true, name: true, articleNumber: true, product: { select: { name: true } } } }) : [],
      isExternal(req.user) || !items.length ? [] : this.prisma.documentDownload.groupBy({ by: ["documentId"], where: { documentId: { in: items.map((doc) => doc.id) } }, _count: { _all: true } }),
    ]);
    const names = new Map([...projects, ...products, ...variants.map((row) => ({ id: row.id, name: `${row.product.name} · ${row.articleNumber} ${row.name}` }))].map((row) => [row.id, row.name]));
    const downloadCount = new Map(downloads.map((row) => [row.documentId, row._count._all]));
    const counts = await this.prisma.document.groupBy({ by: ["category"], where: { AND: [scope], category: { in: CAD_CATEGORIES }, audiences: audience.length ? { hasSome: audience } : undefined }, _count: { _all: true } });
    return {
      items: items.map((doc) => ({
        id: doc.id,
        title: doc.title,
        category: doc.category,
        entityType: doc.entityType,
        entityId: doc.entityId,
        entityName: doc.entityId ? names.get(doc.entityId) || null : null,
        updatedAt: doc.updatedAt,
        version: doc.versions[0]?.version || 1,
        status: doc.versions[0]?.status,
        fileName: doc.versions[0]?.fileName,
        sizeBytes: doc.versions[0]?.sizeBytes || 0,
        hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey),
        downloads: isExternal(req.user) ? undefined : downloadCount.get(doc.id) || 0,
      })),
      counts: Object.fromEntries(counts.map((row) => [row.category, row._count._all])),
    };
  }

  /* ---------------------------- Portal summary --------------------------- */

  @Get("portal/summary")
  async portalSummary(@Req() req: ReqUser) {
    const user = req.user;
    const customerId = customerScope(user);
    const scope = projectScope(user);
    const [activeProjects, openRfqs, quotesAwaiting, reviewDocs, inTransit, projects] = await Promise.all([
      can(user, "projects.view") ? this.prisma.project.count({ where: { AND: [scope, { stage: { notIn: ["CLOSED", "LOST"] } }] } }) : 0,
      can(user, "rfqs.view") ? this.prisma.rfq.count({ where: { customerId, status: { notIn: [...CLOSED_RFQ] } } }) : 0,
      can(user, "quotations.view") ? this.prisma.quotation.count({ where: { customerId, status: { in: ["SENT", "NEGOTIATION"] } } }) : 0,
      can(user, "projects.view") ? this.prisma.documentVersion.count({ where: { status: "CLIENT_REVIEW", document: { entityType: "project", audiences: documentAudience(user).length ? { hasSome: documentAudience(user) } : undefined, entityId: { in: (await this.prisma.project.findMany({ where: scope, select: { id: true } })).map((row) => row.id) } } } }) : 0,
      can(user, "dispatch.view") || can(user, "sales_orders.view") ? this.prisma.dispatchNote.count({ where: { salesOrder: { customerId }, shippedAt: { not: null }, deliveredAt: null } }) : 0,
      can(user, "projects.view")
        ? this.prisma.project.findMany({ where: { AND: [scope, { stage: { notIn: ["CLOSED", "LOST"] } }] }, orderBy: { updatedAt: "desc" }, take: 4, include: { milestones: { orderBy: { sortOrder: "asc" } }, _count: { select: { siteIssues: { where: openIssueWhere } } } } })
        : [],
    ]);
    const activity = (await this.activityFor(user, { limit: 8 })).items;
    return {
      stats: { activeProjects, openRfqs, pendingApprovals: quotesAwaiting + reviewDocs, ordersInTransit: inTransit },
      projects: projects.map(({ milestones, _count, ...project }) => {
        const progress = progressOf(project.stage, milestones);
        return { id: project.id, code: project.code, name: project.name, location: project.location, stage: project.stage, expectedCompletion: project.expectedCompletion, progress, health: healthOf(project, progress, _count.siteIssues), coverUrl: mediaPath(project.coverImageKey), nextMilestone: milestones.find((item) => item.status !== "DONE")?.label || null };
      }),
      activity,
    };
  }
}
