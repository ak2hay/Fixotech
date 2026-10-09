import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  addressSchema,
  contactSchema,
  customerSchema,
  customerUpdateSchema,
  leadSchema,
  leadUpdateSchema,
  lineAmount,
  milestoneUpdateSchema,
  num,
  productSchema,
  productUpdateSchema,
  projectSchema,
  projectUpdateSchema,
  quoteFromRfqSchema,
  resolveSellPrice,
  rfqSchema,
  rfqUpdateSchema,
  salesOrderCreateSchema,
  taxonomySchema,
  transitionAllowed,
  variantSchema,
  type PriceList,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import type { z } from "zod";
import { AuthUser, RequirePermissions, can, isExternal, pageOf, parseBody, seesCost } from "./http";
import { CrmService } from "./crm";
import { PrismaService } from "./prisma.service";
import { ApprovalService } from "./platform";
import { AuditService, DomainEventService, NotifyService, NumberService, WorkflowService, contentDisposition, toPlain, type Tx } from "./services";
import { CUSTOMER_QUOTE_STATUSES, assertProjectInScope, healthOf, mediaPath, openIssueWhere, progressOf, projectScope, quoteScope, syncMilestones } from "./scope";

type ReqUser = { user: AuthUser; ip?: string };

const D = Prisma.Decimal;
const dec = (value: unknown) => new D(value == null || value === "" ? 0 : String(value));

const leadTransitionAllowed = (from: string, to: string) => transitionAllowed("lead", from, to);

function productData(input: z.infer<typeof productUpdateSchema>): Prisma.ProductUpdateInput {
  const { familyId, categoryId, ...scalars } = input;
  return {
    ...scalars,
    family: familyId === undefined ? undefined : familyId ? { connect: { id: familyId } } : { disconnect: true },
    category: categoryId === undefined ? undefined : categoryId ? { connect: { id: categoryId } } : { disconnect: true },
  };
}
const COST_KEYS = new Set(["purchaseCost", "manufacturingCost", "unitCost", "marginPct", "margin", "avgCost", "salary"]);
/** Other customers' price lists and internal stock policy are never shown to portal users. */
const EXTERNAL_KEYS = new Set([...COST_KEYS, "customerPrice", "dealerPrice", "exportPrice", "safetyStock", "reorderLevel", "internalNotes", "probability", "passwordHash", "mfaSecret", "mfaRecoveryCodes"]);

export function present<T>(value: T, user: AuthUser): T {
  const plain = toPlain(value);
  const hidden = user.kind === "EXTERNAL" ? EXTERNAL_KEYS : seesCost(user) ? null : COST_KEYS;
  if (!hidden) return plain;
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input && typeof input === "object" && !(input instanceof Date)) {
      return Object.fromEntries(Object.entries(input as Record<string, unknown>).filter(([key]) => !hidden.has(key)).map(([key, item]) => [key, walk(item)]));
    }
    return input;
  };
  return walk(plain) as T;
}

@Controller()
export class CommercialController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly notify: NotifyService,
    private readonly events: DomainEventService,
    private readonly approvals: ApprovalService,
    private readonly crm: CrmService,
  ) {}

  private async priceListFor(user: AuthUser, customerId?: string | null): Promise<PriceList> {
    if (customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
      if (customer?.priceList) return customer.priceList as PriceList;
    }
    if (user.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: user.customerId } });
      if (customer?.priceList) return customer.priceList as PriceList;
    }
    return "STANDARD";
  }

  @Get("customers")
  @RequirePermissions("customers.view")
  async customers(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const where = {
      id: isExternal(req.user) ? req.user.customerId || "__none__" : undefined,
      active: query.includeInactive === "1" ? undefined : true,
      OR: page.q ? [{ name: { contains: page.q, mode: "insensitive" as const } }, { code: { contains: page.q, mode: "insensitive" as const } }, { gstin: { contains: page.q, mode: "insensitive" as const } }] : undefined,
      type: page.status || undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({ where, skip: page.skip, take: page.pageSize, orderBy: { name: "asc" }, include: { contacts: true, _count: { select: { clientProjects: true, salesOrders: true } } } }),
      this.prisma.customer.count({ where }),
    ]);
    return { items: present(items, req.user), total, page: page.page, pageSize: page.pageSize };
  }

  @Get("customers/:id")
  @RequirePermissions("customers.view")
  async customer(@Param("id") id: string, @Req() req: ReqUser) {
    this.ownCustomer(req.user, id);
    const row = await this.prisma.customer.findUnique({
      where: { id },
      include: { contacts: true, addresses: true, clientProjects: true, rfqs: { take: 10, orderBy: { createdAt: "desc" } }, quotations: { where: isExternal(req.user) ? { status: { in: CUSTOMER_QUOTE_STATUSES } } : undefined, take: 10, orderBy: { createdAt: "desc" } }, salesOrders: { take: 10, orderBy: { createdAt: "desc" } }, invoices: { take: 10, orderBy: { createdAt: "desc" } }, tickets: { take: 10, orderBy: { createdAt: "desc" } } },
    });
    if (!row) throw new NotFoundException("Customer not found");
    return present(row, req.user);
  }

  @Post("customers")
  @RequirePermissions("customers.create")
  async createCustomer(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(customerSchema, body);
    const approver = req.user.permissions.includes("customers.approve") || req.user.permissions.includes("customers.override");
    if (!approver && (input.creditLimit > 0 || input.priceList !== "STANDARD")) throw new ForbiddenException("Credit limit and price list need customers.approve");
    const row = await this.prisma.$transaction(async (tx) => {
      const code = await this.numbers.next("CUSTOMER", tx);
      const created = await tx.customer.create({
        data: {
          code,
          name: input.name,
          type: input.type,
          gstin: input.gstin,
          email: input.email || undefined,
          phone: input.phone,
          website: input.website,
          creditLimit: input.creditLimit,
          paymentTerms: input.paymentTerms,
          priceList: input.priceList,
          notes: input.notes,
        },
      });
      await this.audit.log({ actorId: req.user.id, action: "create", entityType: "customer", entityId: created.id, after: { code, name: created.name, creditLimit: input.creditLimit, priceList: input.priceList }, ip: req.ip }, tx);
      return created;
    });
    return present(row, req.user);
  }

  @Patch("customers/:id")
  @RequirePermissions("customers.edit")
  async updateCustomer(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(customerUpdateSchema, body);
    const approver = req.user.permissions.includes("customers.approve") || req.user.permissions.includes("customers.override");
    if ((input.creditLimit !== undefined || input.priceList !== undefined || input.active !== undefined) && !approver) {
      throw new ForbiddenException("Credit limit, price list and activation changes need finance or sales head approval rights");
    }
    const before = await this.prisma.customer.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Customer not found");
    const row = await this.prisma.customer.update({
      where: { id },
      data: {
        name: input.name,
        type: input.type,
        gstin: input.gstin,
        email: input.email === "" ? null : input.email,
        phone: input.phone,
        website: input.website,
        creditLimit: input.creditLimit,
        paymentTerms: input.paymentTerms,
        priceList: input.priceList,
        notes: input.notes,
        active: input.active,
      },
    });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "customer", entityId: id, before, after: row, ip: String(req.ip || "") });
    return present(row, req.user);
  }

  @Post("customers/:id/contacts")
  @RequirePermissions("customers.edit")
  async addContact(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(contactSchema, body);
    await this.requireCustomer(id);
    const row = await this.prisma.contact.create({ data: { customerId: id, name: input.name, email: input.email || undefined, phone: input.phone, title: input.title, primary: input.primary ?? false } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "contact", entityId: row.id, after: row, ip: String(req.ip || "") });
    return row;
  }

  @Post("customers/:id/addresses")
  @RequirePermissions("customers.edit")
  async addAddress(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(addressSchema, body);
    await this.requireCustomer(id);
    const row = await this.prisma.address.create({
      data: { customerId: id, label: input.label, line1: input.line1, line2: input.line2, city: input.city, state: input.state, postalCode: input.postalCode, country: input.country || "India", gstin: input.gstin },
    });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "address", entityId: row.id, after: row, ip: String(req.ip || "") });
    return row;
  }

  private async requireCustomer(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id }, select: { id: true } });
    if (!customer) throw new NotFoundException("Customer not found");
  }

  @Get("leads")
  @RequirePermissions("leads.view")
  async leads(@Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const where = {
      status: page.status || undefined,
      OR: page.q ? [{ companyName: { contains: page.q, mode: "insensitive" as const } }, { contactName: { contains: page.q, mode: "insensitive" as const } }, { number: { contains: page.q, mode: "insensitive" as const } }] : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.lead.findMany({ where, skip: page.skip, take: page.pageSize, orderBy: { createdAt: "desc" }, include: { owner: { select: { name: true } }, customer: { select: { name: true } } } }),
      this.prisma.lead.count({ where }),
    ]);
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  @Post("leads")
  @RequirePermissions("leads.create")
  async createLead(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(leadSchema, body);
    if (input.ownerId && input.ownerId !== req.user.id && !can(req.user, "leads.assign")) throw new ForbiddenException("Assigning another owner needs leads.assign");
    const created = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("LEAD", tx);
      const row = await tx.lead.create({
        data: {
          number,
          source: input.source,
          contactName: input.contactName,
          companyName: input.companyName,
          email: input.email || undefined,
          phone: input.phone,
          application: input.application,
          message: input.message,
          estimatedValue: input.estimatedValue,
          customerId: input.customerId,
          ownerId: input.ownerId || req.user.id,
        },
      });
      await this.workflow.record("lead", row.id, null, "NEW", req.user.id, undefined, tx);
      await this.audit.log({ actorId: req.user.id, action: "create", entityType: "lead", entityId: row.id, after: { number, companyName: row.companyName }, ip: req.ip }, tx);
      return row;
    });
    await this.crm.onLeadCreated(created.id, false);
    return this.prisma.lead.findUniqueOrThrow({ where: { id: created.id } });
  }

  @Patch("leads/:id")
  @RequirePermissions("leads.edit")
  async updateLead(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(leadUpdateSchema, body);
    const before = await this.prisma.lead.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Lead not found");
    if (input.status && input.status !== before.status && !leadTransitionAllowed(before.status, input.status)) {
      throw new BadRequestException(`A lead cannot move from ${before.status} to ${input.status}`);
    }
    if (input.ownerId && input.ownerId !== before.ownerId) {
      if (!can(req.user, "leads.assign")) throw new ForbiddenException("Reassigning a lead needs leads.assign");
      const owner = await this.prisma.user.findFirst({ where: { id: input.ownerId, active: true, kind: "STAFF" }, select: { id: true } });
      if (!owner) throw new BadRequestException("Owner must be an active staff user");
    }
    const moving = input.status && input.status !== before.status ? input.status : undefined;
    if (moving === "LOST" && !input.lostReason) throw new BadRequestException("Choose a lost reason");
    const customFields = input.customFields ? await this.crm.customFields("LEAD", input.customFields, before.customFields) : undefined;
    const row = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.lead.updateMany({
        where: { id, status: before.status },
        data: {
          status: input.status,
          ownerId: input.ownerId,
          estimatedValue: input.estimatedValue,
          nextFollowUpAt: input.nextFollowUpAt === undefined ? undefined : input.nextFollowUpAt ? new Date(input.nextFollowUpAt) : null,
          region: input.region,
          segment: input.segment,
          customFields,
          lostReason: moving === "LOST" ? input.lostReason : moving ? null : undefined,
          lostAt: moving === "LOST" ? new Date() : undefined,
          wonAt: moving === "WON" ? new Date() : undefined,
        },
      });
      if (!claimed.count) throw new ConflictException("Lead was changed by someone else; reload and try again");
      const updated = await tx.lead.findUniqueOrThrow({ where: { id } });
      if (moving) await this.workflow.record("lead", id, before.status, moving, req.user.id, [moving === "LOST" ? `Lost: ${input.lostReason}` : null, input.note].filter(Boolean).join(" — ") || undefined, tx);
      if (input.note) await tx.leadActivity.create({ data: { leadId: id, type: "NOTE", note: input.note } });
      await this.audit.log({ actorId: req.user.id, action: "update", entityType: "lead", entityId: id, before: { status: before.status, ownerId: before.ownerId, estimatedValue: before.estimatedValue }, after: { status: updated.status, ownerId: updated.ownerId, estimatedValue: updated.estimatedValue, lostReason: updated.lostReason }, ip: String(req.ip || "") }, tx);
      return updated;
    });
    await this.crm.rescore(id);
    if (input.ownerId && input.ownerId !== before.ownerId) {
      await this.notify.push([input.ownerId], "Lead assigned", `${row.number} assigned to you`, "lead", id);
    }
    return row;
  }

  @Get("projects")
  @RequirePermissions("projects.view")
  async projects(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const search = page.q ? { OR: [{ name: { contains: page.q, mode: "insensitive" as const } }, { code: { contains: page.q, mode: "insensitive" as const } }, { location: { contains: page.q, mode: "insensitive" as const } }, { customer: { name: { contains: page.q, mode: "insensitive" as const } } }] } : {};
    const scoped = { AND: [this.projectScope(req.user), search] };
    const where = { ...scoped, stage: page.status || undefined };
    const [items, total, stageCounts] = await Promise.all([
      this.prisma.project.findMany({
        where,
        skip: page.skip,
        take: page.pageSize,
        orderBy: { updatedAt: "desc" },
        include: {
          customer: { select: { name: true } },
          owner: { select: { name: true } },
          milestones: { orderBy: { sortOrder: "asc" } },
          _count: { select: { siteIssues: { where: openIssueWhere } } },
        },
      }),
      this.prisma.project.count({ where }),
      this.prisma.project.groupBy({ by: ["stage"], where: scoped, _count: { _all: true } }),
    ]);
    const lastEvents = items.length
      ? await this.prisma.workflowEvent.groupBy({ by: ["entityId"], where: { entityType: "project", entityId: { in: items.map((item) => item.id) } }, _max: { createdAt: true } })
      : [];
    const external = isExternal(req.user);
    const rows = items.map(({ milestones, _count, ...project }) => {
      const progress = progressOf(project.stage, milestones);
      const last = lastEvents.find((event) => event.entityId === project.id)?._max.createdAt;
      const hidden = external ? { notes: null, probability: null, ...(project.customerId === req.user.customerId ? {} : { projectValue: null, fixotecValue: null }) } : {};
      return {
        ...project,
        ...hidden,
        progress,
        health: healthOf(project, progress, _count.siteIssues),
        openIssues: _count.siteIssues,
        coverUrl: mediaPath(project.coverImageKey),
        lastActivityAt: last && last > project.updatedAt ? last : project.updatedAt,
      };
    });
    const stages = Object.fromEntries(stageCounts.map((row) => [row.stage, row._count._all]));
    return { items: present(rows, req.user), total, page: page.page, pageSize: page.pageSize, stages };
  }

  @Patch("projects/:id/milestones/:key")
  @RequirePermissions("projects.edit")
  async updateMilestone(@Param("id") id: string, @Param("key") key: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const body = parseBody(milestoneUpdateSchema, raw);
    await assertProjectInScope(this.prisma, req.user, id);
    const row = await this.prisma.projectMilestone.findUnique({ where: { projectId_key: { projectId: id, key } } });
    if (!row) throw new NotFoundException("Milestone not found");
    const updated = await this.prisma.projectMilestone.update({
      where: { id: row.id },
      data: {
        status: body.status,
        plannedDate: body.plannedDate === undefined ? undefined : body.plannedDate ? new Date(body.plannedDate) : null,
        actualDate: body.actualDate !== undefined ? (body.actualDate ? new Date(body.actualDate) : null) : body.status === "DONE" ? row.actualDate || new Date() : undefined,
      },
    });
    await this.audit.log({ actorId: req.user.id, action: "milestone", entityType: "project", entityId: id, before: { key, status: row.status }, after: { key, status: updated.status }, ip: String(req.ip || "") });
    return updated;
  }

  @Get("projects/:id")
  @RequirePermissions("projects.view")
  async project(@Param("id") id: string, @Req() req: ReqUser) {
    if (isExternal(req.user)) return this.portalProject(id, req.user);
    const row = await this.prisma.project.findFirst({
      where: { id, ...this.projectScope(req.user) },
      include: {
        customer: true, developer: true, consultant: true, pmc: true, contractor: true, mepContractor: true, owner: { select: { id: true, name: true } },
        rfqs: { include: { items: true } }, quotations: true, boqs: { include: { items: true } },
        salesOrders: { include: { items: true, dispatches: true, invoices: true, productionOrders: true } },
        engineering: { include: { engineer: { select: { name: true } } } }, siteIssues: true, tickets: true, submittals: true, milestones: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("Project not found");
    return present(row, req.user);
  }

  /** Portal view of a project: other parties are names only; commercial records only for the owning customer. */
  private async portalProject(id: string, user: AuthUser) {
    const party = { select: { id: true, name: true } };
    const row = await this.prisma.project.findFirst({
      where: { AND: [{ id }, this.projectScope(user)] },
      include: {
        customer: party, developer: party, consultant: party, pmc: party, contractor: party, mepContractor: party, owner: { select: { id: true, name: true } },
        submittals: true,
        siteIssues: true,
        milestones: { orderBy: { sortOrder: "asc" } },
      },
    });
    if (!row) throw new NotFoundException("Project not found");
    const owner = row.customerId === user.customerId;
    const customerId = user.customerId || "__none__";
    const [rfqs, quotations, salesOrders, tickets] = await Promise.all([
      this.prisma.rfq.findMany({ where: { projectId: id, customerId }, include: { items: true }, orderBy: { createdAt: "desc" }, take: 200 }),
      this.prisma.quotation.findMany({ where: { projectId: id, ...quoteScope(user) }, orderBy: { createdAt: "desc" }, take: 200 }),
      owner ? this.prisma.salesOrder.findMany({ where: { projectId: id, customerId }, include: { items: true, dispatches: true, invoices: true }, orderBy: { createdAt: "desc" }, take: 200 }) : Promise.resolve([]),
      this.prisma.serviceTicket.findMany({ where: { projectId: id, customerId }, orderBy: { createdAt: "desc" }, take: 200 }),
    ]);
    const { notes: _notes, probability: _probability, ...fields } = row;
    const commercial = owner ? {} : { projectValue: null, fixotecValue: null };
    return present({ ...fields, ...commercial, rfqs, quotations, salesOrders, tickets, boqs: [], engineering: [] }, user);
  }

  @Post("projects")
  @RequirePermissions("projects.create")
  async createProject(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(projectSchema, body);
    if (input.ownerId && input.ownerId !== req.user.id && !can(req.user, "projects.assign")) throw new ForbiddenException("Assigning another owner needs projects.assign");
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId }, select: { id: true } });
    if (!customer) throw new BadRequestException("Customer not found");
    return this.prisma.$transaction(async (tx) => {
    const code = await this.numbers.next("PROJECT", tx);
    const row = await tx.project.create({
      data: {
        code,
        name: input.name,
        location: input.location,
        customerId: input.customerId,
        developerId: input.developerId,
        consultantId: input.consultantId,
        pmcId: input.pmcId,
        contractorId: input.contractorId,
        mepContractorId: input.mepContractorId,
        projectValue: input.projectValue,
        fixotecValue: input.fixotecValue,
        stage: input.stage,
        probability: input.probability,
        notes: input.notes,
        coverImageKey: input.coverImageKey,
        startDate: input.startDate ? new Date(input.startDate) : undefined,
        expectedCompletion: input.expectedCompletion ? new Date(input.expectedCompletion) : undefined,
        ownerId: input.ownerId || req.user.id,
      },
    });
    await this.workflow.record("project", row.id, null, row.stage, req.user.id, undefined, tx);
    await syncMilestones(tx, row);
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "project", entityId: row.id, after: { code, name: row.name }, ip: String(req.ip || "") }, tx);
    return row;
    });
  }

  @Patch("projects/:id")
  @RequirePermissions("projects.edit")
  async updateProject(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(projectUpdateSchema, body);
    const before = await this.prisma.project.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Project not found");
    if (input.ownerId !== undefined && input.ownerId !== before.ownerId && !can(req.user, "projects.assign")) {
      throw new ForbiddenException("Changing the project owner needs projects.assign");
    }
    const date = (value: string | null | undefined) => (value === undefined ? undefined : value ? new Date(value) : null);
    const row = await this.prisma.project.update({
      where: { id },
      data: {
        name: input.name,
        location: input.location,
        customerId: input.customerId,
        developerId: input.developerId,
        consultantId: input.consultantId,
        pmcId: input.pmcId,
        contractorId: input.contractorId,
        mepContractorId: input.mepContractorId,
        projectValue: input.projectValue,
        fixotecValue: input.fixotecValue,
        startDate: date(input.startDate),
        expectedCompletion: date(input.expectedCompletion),
        stage: input.stage,
        probability: input.probability,
        ownerId: input.ownerId,
        notes: input.notes,
        coverImageKey: input.coverImageKey,
        health: input.health,
      },
    });
    if (input.stage && input.stage !== before.stage) await this.workflow.record("project", id, before.stage, input.stage, req.user.id);
    if (input.stage !== undefined || input.startDate !== undefined || input.expectedCompletion !== undefined) await syncMilestones(this.prisma, row);
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "project", entityId: id, before, after: row, ip: String(req.ip || "") });
    return row;
  }

  @Get("product-families")
  @RequirePermissions("products.view")
  families() {
    return this.prisma.productFamily.findMany({ orderBy: { name: "asc" } });
  }

  @Get("product-categories")
  @RequirePermissions("products.view")
  categories() {
    return this.prisma.productCategory.findMany({ orderBy: { name: "asc" } });
  }

  @Post("product-families")
  @RequirePermissions("products.create")
  async createFamily(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(taxonomySchema, body);
    const row = await this.prisma.productFamily.create({ data: { name: input.name, slug: input.slug } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "product_family", entityId: row.id, after: row, ip: String(req.ip || "") });
    return row;
  }

  @Post("product-categories")
  @RequirePermissions("products.create")
  async createCategory(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(taxonomySchema, body);
    const row = await this.prisma.productCategory.create({ data: { name: input.name, slug: input.slug } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "product_category", entityId: row.id, after: row, ip: String(req.ip || "") });
    return row;
  }

  @Get("products")
  @RequirePermissions("products.view")
  async products(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const where = {
      published: isExternal(req.user) ? true : undefined,
      categoryId: query.categoryId ? String(query.categoryId) : undefined,
      familyId: query.familyId ? String(query.familyId) : undefined,
      supplyMode: query.supplyMode ? String(query.supplyMode) : undefined,
      OR: page.q ? [{ name: { contains: page.q, mode: "insensitive" as const } }, { sku: { contains: page.q, mode: "insensitive" as const } }, { variants: { some: { articleNumber: { contains: page.q, mode: "insensitive" as const } } } }] : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.product.findMany({ where, skip: page.skip, take: page.pageSize, orderBy: { name: "asc" }, include: { family: true, category: true, variants: true } }),
      this.prisma.product.count({ where }),
    ]);
    const list = await this.priceListFor(req.user);
    return { items: items.map((item) => this.withPrices(item, req.user, list)), total, page: page.page, pageSize: page.pageSize };
  }

  @Get("products/:id")
  @RequirePermissions("products.view")
  async product(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.product.findFirst({ where: { OR: [{ id }, { slug: id }] }, include: { family: true, category: true, variants: true } });
    if (!row || (isExternal(req.user) && !row.published)) throw new NotFoundException("Product not found");
    const list = await this.priceListFor(req.user);
    return this.withPrices(row, req.user, list);
  }

  @Post("products")
  @RequirePermissions("products.create")
  async createProduct(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(productSchema, body);
    const row = await this.prisma.product.create({ data: input });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "product", entityId: row.id, after: { sku: row.sku }, ip: String(req.ip || "") });
    return present(row, req.user);
  }

  @Patch("products/:id")
  @RequirePermissions("products.edit")
  async updateProduct(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(productUpdateSchema, body);
    if ((input.purchaseCost !== undefined || input.manufacturingCost !== undefined) && !seesCost(req.user)) {
      throw new ForbiddenException("Product cost is restricted");
    }
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Product not found");
    const row = await this.prisma.product.update({ where: { id }, data: productData(input) });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "product", entityId: id, before, after: row, ip: String(req.ip || "") });
    return present(row, req.user);
  }

  @Post("products/:id/variants")
  @RequirePermissions("products.create")
  async createVariant(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(variantSchema, body);
    if (!seesCost(req.user) && (input.purchaseCost > 0 || input.manufacturingCost > 0)) throw new ForbiddenException("Variant cost is restricted");
    const product = await this.prisma.product.findUnique({ where: { id }, select: { id: true } });
    if (!product) throw new NotFoundException("Product not found");
    const row = await this.prisma.productVariant.create({
      data: {
        productId: id,
        articleNumber: input.articleNumber,
        sku: input.sku,
        name: input.name,
        attributes: input.attributes,
        barcode: input.barcode || undefined,
        purchaseCost: input.purchaseCost,
        manufacturingCost: input.manufacturingCost,
        standardPrice: input.standardPrice,
        customerPrice: input.customerPrice,
        dealerPrice: input.dealerPrice,
        exportPrice: input.exportPrice,
        safetyStock: input.safetyStock,
        reorderLevel: input.reorderLevel,
      },
    });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "product_variant", entityId: row.id, after: { articleNumber: row.articleNumber, sku: row.sku }, ip: String(req.ip || "") });
    return present(row, req.user);
  }

  @Get("rfqs")
  @RequirePermissions("rfqs.view")
  async rfqs(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getTime() + 86_400_000);
    const open = { notIn: ["QUOTED", "WON", "LOST", "CANCELLED"] };
    const due = query.due === "today" ? { dueDate: { gte: start, lt: end }, status: open } : query.due === "overdue" ? { dueDate: { lt: start }, status: open } : {};
    const where = {
      customerId: isExternal(req.user) ? req.user.customerId || "__none__" : undefined,
      status: page.status || undefined,
      projectId: query.projectId ? String(query.projectId) : undefined,
      priority: query.priority ? String(query.priority) : undefined,
      assigneeId: query.mine === "1" && !isExternal(req.user) ? req.user.id : undefined,
      ...due,
      OR: page.q ? [{ number: { contains: page.q, mode: "insensitive" as const } }, { application: { contains: page.q, mode: "insensitive" as const } }, { customer: { name: { contains: page.q, mode: "insensitive" as const } } }] : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.rfq.findMany({ where, skip: page.skip, take: page.pageSize, orderBy: { createdAt: "desc" }, include: { customer: { select: { name: true } }, project: { select: { name: true, code: true } }, assignee: { select: { name: true } }, items: true } }),
      this.prisma.rfq.count({ where }),
    ]);
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  @Get("rfqs/:id")
  @RequirePermissions("rfqs.view")
  async rfq(@Param("id") id: string, @Req() req: ReqUser) {
    const external = isExternal(req.user);
    const row = await this.prisma.rfq.findFirst({
      where: { id, customerId: external ? req.user.customerId || "__none__" : undefined },
      include: { items: { include: { variant: true } }, customer: true, project: external ? { select: { id: true, name: true, code: true, location: true } } : true, quotations: external ? { where: { status: { in: CUSTOMER_QUOTE_STATUSES } } } : true },
    });
    if (!row) throw new NotFoundException("RFQ not found");
    return present(row, req.user);
  }

  @Post("rfqs")
  @RequirePermissions("rfqs.create")
  async createRfq(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(rfqSchema, body);
    const customerId = isExternal(req.user) ? req.user.customerId : input.customerId;
    if (!customerId && !isExternal(req.user)) {
      /* internal RFQ may start from a lead before the account exists */
    }
    if (isExternal(req.user) && !customerId) throw new BadRequestException("Portal user is not linked to a customer");
    if (isExternal(req.user) && input.projectId) {
      const project = await this.prisma.project.findFirst({ where: { AND: [{ id: input.projectId }, this.projectScope(req.user)] }, select: { id: true } });
      if (!project) throw new BadRequestException("Project is outside this account");
    }
    const row = await this.prisma.$transaction(async (tx) => {
    const number = await this.numbers.next("RFQ", tx);
    const created = await tx.rfq.create({
      data: {
        number,
        customerId: customerId || undefined,
        projectId: input.projectId,
        leadId: input.leadId,
        application: input.application,
        notes: input.notes,
        dueDate: input.dueDate ? new Date(input.dueDate) : new Date(Date.now() + 7 * 86_400_000),
        priority: input.priority || "MEDIUM",
        assigneeId: input.assigneeId || (isExternal(req.user) ? undefined : req.user.id),
        status: isExternal(req.user) ? "RECEIVED" : "DRAFT",
        items: { create: input.items.map((item) => ({ variantId: item.variantId, description: item.description, qty: item.qty, unit: item.unit, specification: item.specification })) },
      },
      include: { items: true },
    });
    await this.workflow.record("rfq", created.id, null, created.status, req.user.id, undefined, tx);
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "rfq", entityId: created.id, after: { number, status: created.status }, ip: String(req.ip || "") }, tx);
    return created;
    });
    if (row.assigneeId) await this.notify.push([row.assigneeId], "RFQ assigned", `${row.number} is in your queue`, "rfq", row.id);
    return row;
  }

  @Patch("rfqs/:id")
  @RequirePermissions("rfqs.edit")
  async updateRfq(@Param("id") id: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const body = parseBody(rfqUpdateSchema, raw);
    const before = await this.prisma.rfq.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("RFQ not found");
    if (body.status && !transitionAllowed("rfq", before.status, body.status)) throw new BadRequestException(`An RFQ cannot move from ${before.status} to ${body.status}`);
    if (body.assigneeId && body.assigneeId !== before.assigneeId) {
      if (!can(req.user, "rfqs.assign")) throw new ForbiddenException("Reassigning an RFQ needs rfqs.assign");
      const assignee = await this.prisma.user.findFirst({ where: { id: body.assigneeId, active: true, kind: "STAFF" }, select: { id: true } });
      if (!assignee) throw new BadRequestException("Assignee must be an active staff user");
    }
    const row = await this.prisma.rfq.update({
      where: { id },
      data: { status: body.status, assigneeId: body.assigneeId, notes: body.notes, priority: body.priority, dueDate: body.dueDate === undefined ? undefined : body.dueDate ? new Date(body.dueDate) : null },
    });
    if (body.status && body.status !== before.status) await this.workflow.record("rfq", id, before.status, body.status, req.user.id);
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "rfq", entityId: id, before: { status: before.status, assigneeId: before.assigneeId, priority: before.priority }, after: { status: row.status, assigneeId: row.assigneeId, priority: row.priority }, ip: String(req.ip || "") });
    if (body.assigneeId && body.assigneeId !== before.assigneeId) await this.notify.push([body.assigneeId], "RFQ assigned", `${row.number} was assigned to you`, "rfq", id);
    return row;
  }

  @Post("rfqs/:id/quotation")
  @RequirePermissions("quotations.create")
  async quoteFromRfq(@Param("id") id: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const body = parseBody(quoteFromRfqSchema, raw);
    const rfq = await this.prisma.rfq.findUnique({ where: { id }, include: { items: { include: { variant: { include: { product: true } } } }, customer: true } });
    if (!rfq) throw new NotFoundException("RFQ not found");
    if (["WON", "LOST", "CANCELLED"].includes(rfq.status)) throw new BadRequestException(`A ${rfq.status.toLowerCase()} RFQ cannot be priced`);
    if (!rfq.customerId || !rfq.customer) throw new BadRequestException("RFQ needs a customer before it can be priced");
    if (!rfq.items.length) throw new BadRequestException("Add items to the RFQ before pricing it");
    const list = rfq.customer.priceList as PriceList;
    const items = rfq.items.map((item) => {
      const basePrice = item.variant ? resolveSellPrice(toPlain(item.variant), list) : 0;
      const unitCost = item.variant ? num(item.variant.manufacturingCost) || num(item.variant.purchaseCost) : 0;
      const taxRate = item.variant ? num(item.variant.product.gstRate) : 18;
      return { variantId: item.variantId, description: item.description, qty: item.qty, unit: item.unit, basePrice, unitCost, discountPct: 0, taxRate };
    });
    const totals = this.totals(items, body.discountPct || 0, body.freight || 0);
    const customer = rfq.customer;
    const quote = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("QUOTATION", tx);
      const created = await tx.quotation.create({
        data: {
          number,
          customerId: customer.id,
          projectId: rfq.projectId,
          rfqId: rfq.id,
          status: "DRAFT",
          createdById: req.user.id,
          validUntil: new Date(Date.now() + (body.validDays || 15) * 86_400_000),
          paymentTerms: body.paymentTerms || customer.paymentTerms,
          deliveryTerms: body.deliveryTerms || "Ex-works Pune",
          discountPct: body.discountPct || 0,
          freight: body.freight || 0,
          ...totals,
          items: { create: items },
        },
        include: { items: true },
      });
      if (["DRAFT", "RECEIVED", "UNDER_REVIEW", "ENGINEERING_REQUIRED"].includes(rfq.status)) {
        await tx.rfq.updateMany({ where: { id, status: rfq.status }, data: { status: "PRICING" } });
        await this.workflow.record("rfq", id, rfq.status, "PRICING", req.user.id, undefined, tx);
      }
      await this.workflow.record("quotation", created.id, null, "DRAFT", req.user.id, undefined, tx);
      await this.audit.log({ actorId: req.user.id, action: "create", entityType: "quotation", entityId: created.id, after: { number, rfqId: id, total: totals.total }, ip: String(req.ip || "") }, tx);
      return created;
    });
    return present(quote, req.user);
  }

  @Get("quotations")
  @RequirePermissions("quotations.view")
  async quotations(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const where = {
      AND: [this.quoteScope(req.user), { status: page.status || undefined }],
      projectId: query.projectId ? String(query.projectId) : undefined,
      OR: page.q ? [{ number: { contains: page.q, mode: "insensitive" as const } }, { customer: { name: { contains: page.q, mode: "insensitive" as const } } }, { project: { name: { contains: page.q, mode: "insensitive" as const } } }] : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.quotation.findMany({ where, skip: page.skip, take: page.pageSize, orderBy: { createdAt: "desc" }, include: { customer: { select: { name: true } }, project: { select: { name: true } }, rfq: { select: { number: true } }, items: true } }),
      this.prisma.quotation.count({ where }),
    ]);
    return { items: present(items, req.user), total, page: page.page, pageSize: page.pageSize };
  }

  @Get("quotations/:id")
  @RequirePermissions("quotations.view")
  async quotation(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.quotation.findFirst({
      where: { AND: [{ id }, this.quoteScope(req.user)] },
      include: { items: { include: { variant: true } }, customer: true, project: isExternal(req.user) ? { select: { id: true, name: true, code: true, location: true } } : true, rfq: true, salesOrders: { select: { id: true, number: true, status: true, total: true, createdAt: true } } },
    });
    if (!row) throw new NotFoundException("Quotation not found");
    return present(row, req.user);
  }

  @Post("quotations/:id/submit")
  @RequirePermissions("quotations.edit")
  async submitQuote(@Param("id") id: string, @Req() req: ReqUser) {
    const quote = await this.prisma.quotation.findUnique({ where: { id }, include: { _count: { select: { items: true } } } });
    if (!quote || !["DRAFT", "REJECTED", "NEGOTIATION"].includes(quote.status)) throw new BadRequestException("Quotation cannot be submitted from this status");
    if (!quote._count.items) throw new BadRequestException("A quotation needs at least one line");
    if (quote.validUntil && quote.validUntil < new Date()) throw new BadRequestException("Quotation validity has lapsed; extend it before submitting");
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.quotation.updateMany({ where: { id, status: quote.status }, data: { status: "UNDER_REVIEW", version: { increment: 1 } } });
      if (!claimed.count) throw new BadRequestException("Quotation changed in the meantime; reload and try again");
      const approval = await this.approvals.open(
        {
          entityType: "QUOTATION",
          entityId: id,
          requesterId: req.user.id,
          context: { discountPct: num(quote.discountPct), total: num(quote.total), marginPct: num(quote.marginPct) },
          snapshot: { number: quote.number, total: num(quote.total), discountPct: num(quote.discountPct) },
        },
        tx,
      );
      await this.workflow.record("quotation", id, quote.status, "UNDER_REVIEW", req.user.id, undefined, tx);
      let status = "UNDER_REVIEW";
      if (!approval) {
        await tx.quotation.update({ where: { id }, data: { status: "APPROVED" } });
        await this.workflow.record("quotation", id, "UNDER_REVIEW", "APPROVED", req.user.id, "No approval rule matched", tx);
        status = "APPROVED";
      }
      await this.audit.log({ actorId: req.user.id, action: "submit", entityType: "quotation", entityId: id, before: { status: quote.status }, after: { status }, ip: String(req.ip || "") }, tx);
      return tx.quotation.findUniqueOrThrow({ where: { id } });
    });
    return present(updated, req.user);
  }

  @Post("quotations/:id/send")
  @RequirePermissions("quotations.edit")
  async sendQuote(@Param("id") id: string, @Req() req: ReqUser) {
    const quote = await this.prisma.quotation.findUnique({ where: { id }, include: { customer: { include: { users: { where: { active: true }, select: { id: true } } } } } });
    if (!quote || quote.status !== "APPROVED") throw new BadRequestException("Approve the quotation before sending it");
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.quotation.updateMany({ where: { id, status: "APPROVED" }, data: { status: "SENT", version: { increment: 1 } } });
      if (!claimed.count) throw new BadRequestException("Quotation was already sent");
      await this.workflow.record("quotation", id, quote.status, "SENT", req.user.id, undefined, tx);
      await this.audit.log({ actorId: req.user.id, action: "send", entityType: "quotation", entityId: id, before: { status: "APPROVED" }, after: { status: "SENT" }, ip: String(req.ip || "") }, tx);
      return tx.quotation.findUniqueOrThrow({ where: { id } });
    });
    await this.notify.push(quote.customer.users.map((user) => user.id), "Quotation ready", `${quote.number} is ready to review`, "quotation", id);
    return present(updated, req.user);
  }

  @Post("quotations/:id/accept")
  @RequirePermissions("quotations.approve")
  async acceptQuote(@Param("id") id: string, @Req() req: ReqUser) {
    if (!isExternal(req.user)) throw new BadRequestException("Customer acceptance is recorded from the customer portal");
    const quote = await this.prisma.quotation.findFirst({ where: { id, customerId: req.user.customerId || "__none__" } });
    if (!quote || !["SENT", "NEGOTIATION"].includes(quote.status)) throw new BadRequestException("Quotation is not ready for acceptance");
    if (quote.validUntil && quote.validUntil < new Date()) throw new BadRequestException("This quotation has expired. Ask Fixotec for a revised offer.");
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.quotation.updateMany({ where: { id, status: quote.status }, data: { status: "ACCEPTED", customerAcceptedAt: new Date(), version: { increment: 1 } } });
      if (!claimed.count) throw new BadRequestException("Quotation changed in the meantime; reload and try again");
      await this.workflow.record("quotation", id, quote.status, "ACCEPTED", req.user.id, "Customer accepted", tx);
      await this.audit.log({ actorId: req.user.id, action: "accept", entityType: "quotation", entityId: id, before: { status: quote.status }, after: { status: "ACCEPTED" }, ip: String(req.ip || "") }, tx);
      return tx.quotation.findUniqueOrThrow({ where: { id } });
    });
    const sales = await this.notify.usersWithRole("sales_head");
    await this.notify.push(sales.map((user) => user.id), "Quotation accepted", `${quote.number} was accepted`, "quotation", id);
    return present(updated, req.user);
  }

  @Get("quotations/:id/pdf")
  @RequirePermissions("quotations.download")
  async quotePdf(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    const quote = await this.prisma.quotation.findFirst({
      where: { AND: [{ id }, this.quoteScope(req.user)] },
      include: { items: true, customer: true, project: true },
    });
    if (!quote) throw new NotFoundException("Quotation not found");
    // Standard PDF fonts only encode WinAnsi; anything else (₹, Devanagari, emoji) would make pdf-lib throw.
    const safe = (value: unknown, max = 90) => String(value ?? "").replace(/[^\x20-\x7E]/g, "?").slice(0, max);
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    let page = pdf.addPage([595, 842]);
    page.drawText("FIXOTEC", { x: 48, y: 790, size: 14, font: bold });
    page.drawText(safe(quote.number, 30), { x: 400, y: 790, size: 14, font: bold });
    page.drawText(safe(quote.customer.name), { x: 48, y: 750, size: 12, font });
    page.drawText(safe(quote.project?.name), { x: 48, y: 732, size: 11, font });
    let y = 690;
    for (const item of quote.items) {
      if (y < 120) {
        page = pdf.addPage([595, 842]);
        page.drawText(safe(`${quote.number} (continued)`), { x: 48, y: 790, size: 10, font: bold });
        y = 760;
      }
      const amount = lineAmount(num(item.qty), num(item.basePrice), num(quote.discountPct), 0).net;
      page.drawText(safe(`${item.description}    ${num(item.qty)} ${item.unit}    INR ${amount.toFixed(2)}`, 110), { x: 48, y, size: 10, font });
      y -= 18;
    }
    page.drawText(`Freight INR ${num(quote.freight).toFixed(2)}`, { x: 48, y: y - 10, size: 10, font });
    page.drawText(`Tax INR ${num(quote.tax).toFixed(2)}`, { x: 48, y: y - 26, size: 10, font });
    page.drawText(`Total INR ${num(quote.total).toFixed(2)}`, { x: 48, y: y - 46, size: 13, font: bold, color: rgb(0.2, 0.2, 0.2) });
    const bytes = await pdf.save();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDisposition(`${quote.number}.pdf`));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(Buffer.from(bytes));
  }

  @Get("sales-orders")
  @RequirePermissions("sales_orders.view")
  async orders(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const where = {
      customerId: isExternal(req.user) ? req.user.customerId || "__none__" : undefined,
      status: page.status || undefined,
      projectId: query.projectId ? String(query.projectId) : undefined,
      OR: page.q ? [{ number: { contains: page.q, mode: "insensitive" as const } }, { customer: { name: { contains: page.q, mode: "insensitive" as const } } }, { project: { name: { contains: page.q, mode: "insensitive" as const } } }] : undefined,
    };
    const [items, total] = await Promise.all([
      this.prisma.salesOrder.findMany({ where, skip: page.skip, take: page.pageSize, orderBy: { createdAt: "desc" }, include: { customer: { select: { name: true } }, items: true, project: { select: { name: true } }, quotation: { select: { number: true } }, dispatches: { select: { id: true, status: true } } } }),
      this.prisma.salesOrder.count({ where }),
    ]);
    return { items: present(items, req.user), total, page: page.page, pageSize: page.pageSize };
  }

  @Get("sales-orders/:id")
  @RequirePermissions("sales_orders.view")
  async order(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.salesOrder.findFirst({
      where: { id, customerId: isExternal(req.user) ? req.user.customerId || "__none__" : undefined },
      include: { items: { include: { variant: true } }, customer: true, project: isExternal(req.user) ? { select: { id: true, name: true, code: true, location: true } } : true, quotation: true, dispatches: true, invoices: true, productionOrders: !isExternal(req.user) },
    });
    if (!row) throw new NotFoundException("Sales order not found");
    return present(row, req.user);
  }

  @Post("sales-orders")
  @RequirePermissions("sales_orders.create")
  async createOrder(@Body() raw: unknown, @Req() req: ReqUser) {
    const body = parseBody(salesOrderCreateSchema, raw);
    if (isExternal(req.user)) return this.distributorOrder(req.user, body);
    if (!body.quotationId) throw new BadRequestException("Create the order from an approved quotation");
    const quotationId = body.quotationId;
    const ip = String(req.ip || "");
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "Quotation" WHERE "id" = ${quotationId} FOR UPDATE`;
      const quote = await tx.quotation.findUnique({ where: { id: quotationId }, include: { items: { include: { variant: { include: { product: true } } } }, customer: true } });
      if (!quote) throw new NotFoundException("Quotation not found");
      if (!["APPROVED", "ACCEPTED", "SENT"].includes(quote.status)) throw new BadRequestException("Quotation must be approved before an order");
      if (quote.validUntil && quote.validUntil.getTime() < Date.now()) throw new BadRequestException("Quotation has expired; revise it before ordering");
      const ordered = await tx.salesOrderItem.groupBy({
        by: ["quotationItemId"],
        where: { quotationItemId: { in: quote.items.map((item) => item.id) }, salesOrder: { status: { not: "CANCELLED" } } },
        _sum: { qty: true },
      });
      const remaining = new Map(quote.items.map((item) => [item.id, dec(item.qty).sub(dec(ordered.find((row) => row.quotationItemId === item.id)?._sum.qty))]));
      const chosen = body.lines?.length
        ? body.lines
        : quote.items.filter((item) => remaining.get(item.id)!.gt(0)).map((item) => ({ quotationItemId: item.id, variantId: item.variantId || undefined, qty: remaining.get(item.id)!.toNumber() }));
      if (!chosen.length) throw new BadRequestException("Every line on this quotation has already been ordered");
      const discountPct = dec(quote.discountPct);
      const items = chosen.map((line) => {
        const source = (line.quotationItemId ? quote.items.find((item) => item.id === line.quotationItemId) : undefined) || quote.items.find((item) => !!line.variantId && item.variantId === line.variantId);
        if (!source) throw new BadRequestException("Order line is not on the quotation");
        const left = remaining.get(source.id)!;
        const qty = dec(line.qty);
        if (qty.lte(0)) throw new BadRequestException("Order quantity must be positive");
        if (qty.gt(left)) throw new BadRequestException(`Only ${left.toString()} of "${source.description}" remain to be ordered`);
        remaining.set(source.id, left.sub(qty));
        const lineDiscount = D.min(100, dec(source.discountPct).add(discountPct));
        return {
          quotationItemId: source.id,
          variantId: source.variantId,
          description: source.description,
          qty,
          unitPrice: dec(source.basePrice).mul(new D(100).sub(lineDiscount)).div(100).toDecimalPlaces(2),
          unitCost: dec(source.unitCost),
          discountPct: lineDiscount,
          taxRate: dec(source.taxRate),
        };
      });
      return this.persistOrder(tx, { customerId: quote.customerId, projectId: quote.projectId, quotationId: quote.id, items, user: req.user, ip });
    });
  }

  @Post("sales-orders/:id/release-credit")
  @RequirePermissions("customers.override")
  async releaseCredit(@Param("id") id: string, @Req() req: ReqUser) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.salesOrder.findUnique({ where: { id }, include: { items: true } });
      if (!order) throw new NotFoundException("Sales order not found");
      const backordered = order.items.some((item) => num(item.backorderedQty) > 0);
      const status = backordered ? "BACKORDERED" : "CONFIRMED";
      const claimed = await tx.salesOrder.updateMany({ where: { id, status: "CREDIT_HOLD" }, data: { status } });
      if (!claimed.count) throw new BadRequestException("Order is not on credit hold");
      await this.workflow.record("sales_order", id, "CREDIT_HOLD", status, req.user.id, "Credit override", tx);
      await this.audit.log({ actorId: req.user.id, action: "override", entityType: "sales_order", entityId: id, before: { status: "CREDIT_HOLD" }, after: { status }, ip: String(req.ip || "") }, tx);
      await this.afterOrder(tx, id);
      return tx.salesOrder.findUniqueOrThrow({ where: { id } });
    });
  }

  private ownCustomer(user: AuthUser, customerId: string) {
    if (isExternal(user) && user.customerId !== customerId) throw new NotFoundException("Customer not found");
  }

  private projectScope(user: AuthUser) {
    return projectScope(user);
  }

  private quoteScope(user: AuthUser) {
    return quoteScope(user);
  }

  private withPrices(product: { variants: Array<Record<string, unknown>> } & Record<string, unknown>, user: AuthUser, list: PriceList) {
    const plain = present(product, user) as typeof product;
    const external = isExternal(user);
    if (external) delete plain.standardPrice;
    plain.variants = product.variants.map((variant) => {
      const shown = present(variant, user) as Record<string, unknown>;
      shown.sellPrice = resolveSellPrice(toPlain(variant) as never, list);
      if (external) for (const key of ["standardPrice", "customerPrice", "dealerPrice", "exportPrice", "safetyStock", "reorderLevel"]) delete shown[key];
      return shown;
    });
    return plain;
  }

  private totals(items: Array<{ qty: unknown; basePrice: unknown; discountPct?: unknown; taxRate: unknown; unitCost?: unknown }>, headerDiscount: number, freight: number) {
    let subtotal = new D(0);
    let tax = new D(0);
    let cost = new D(0);
    for (const item of items) {
      const discount = Math.min(100, num(item.discountPct) + headerDiscount);
      const net = dec(item.qty).mul(dec(item.basePrice)).mul(new D(100).sub(discount)).div(100).toDecimalPlaces(2);
      subtotal = subtotal.add(net);
      tax = tax.add(net.mul(dec(item.taxRate)).div(100).toDecimalPlaces(2));
      cost = cost.add(dec(item.qty).mul(dec(item.unitCost)));
    }
    const marginPct = subtotal.isZero() ? new D(0) : subtotal.sub(cost).div(subtotal).mul(100).toDecimalPlaces(2);
    const clampedMargin = D.max(-999.99, D.min(999.99, marginPct));
    return { subtotal, tax, total: subtotal.add(tax).add(dec(freight)), marginPct: clampedMargin };
  }

  private async distributorOrder(user: AuthUser, body: { lines: Array<{ variantId?: string; description: string; qty: number }> }) {
    if (!user.customerId) throw new BadRequestException("Account is not linked");
    if (!user.roleKeys.some((role) => role === "distributor" || role === "dealer")) throw new BadRequestException("Only a distributor or dealer can place a portal order");
    const customerId = user.customerId;
    if (!body.lines?.length) throw new BadRequestException("Add at least one article");
    return this.prisma.$transaction(async (tx) => {
      const customer = await tx.customer.findUnique({ where: { id: customerId } });
      if (!customer) throw new NotFoundException("Customer not found");
      const variants = await tx.productVariant.findMany({ where: { id: { in: body.lines.map((line) => line.variantId || "") } }, include: { product: true } });
      const items = body.lines.map((line) => {
        if (!line.variantId) throw new BadRequestException("Choose a catalogue article");
        const variant = variants.find((row) => row.id === line.variantId);
        if (!variant?.product.published) throw new BadRequestException("Article is not in the catalogue");
        return {
          quotationItemId: null,
          variantId: variant.id,
          description: line.description || variant.name,
          qty: dec(line.qty),
          unitPrice: dec(resolveSellPrice(toPlain(variant), customer.priceList as PriceList)),
          unitCost: dec(num(variant.manufacturingCost) || num(variant.purchaseCost)),
          discountPct: new D(0),
          taxRate: dec(variant.product.gstRate),
        };
      });
      return this.persistOrder(tx, { customerId, projectId: null, quotationId: null, items, user, ip: "" });
    });
  }

  /** Must run inside a transaction: locks the customer (credit exposure) and variants (stock allocation) so concurrent orders cannot both pass the checks. */
  private async persistOrder(
    tx: Tx,
    input: {
      customerId: string;
      projectId: string | null;
      quotationId: string | null;
      items: Array<{ quotationItemId: string | null; variantId: string | null; description: string; qty: Prisma.Decimal; unitPrice: Prisma.Decimal; unitCost: Prisma.Decimal; discountPct: Prisma.Decimal; taxRate: Prisma.Decimal }>;
      user: AuthUser;
      ip: string;
    },
  ) {
    await tx.$queryRaw`SELECT "id" FROM "Customer" WHERE "id" = ${input.customerId} FOR UPDATE`;
    const variantIds = [...new Set(input.items.map((item) => item.variantId).filter((id): id is string => !!id))].sort();
    if (variantIds.length) await tx.$queryRaw`SELECT "id" FROM "ProductVariant" WHERE "id" IN (${Prisma.join(variantIds)}) ORDER BY "id" FOR UPDATE`;
    const customer = await tx.customer.findUniqueOrThrow({ where: { id: input.customerId } });

    let subtotal = new D(0);
    let tax = new D(0);
    const claimed = new Map<string, Prisma.Decimal>();
    const priced = [];
    for (const item of input.items) {
      const net = item.qty.mul(item.unitPrice).toDecimalPlaces(2);
      subtotal = subtotal.add(net);
      tax = tax.add(net.mul(item.taxRate).div(100).toDecimalPlaces(2));
      let backorderedQty = new D(0);
      if (item.variantId) {
        const free = claimed.get(item.variantId) ?? D.max(0, (await this.onHand(tx, item.variantId)).sub(await this.allocated(tx, item.variantId)));
        backorderedQty = D.max(0, item.qty.sub(free));
        claimed.set(item.variantId, D.max(0, free.sub(item.qty)));
      }
      priced.push({ ...item, backorderedQty });
    }
    const total = subtotal.add(tax);
    const exposure = (await this.outstanding(tx, customer.id)).add(total);
    const limit = dec(customer.creditLimit);
    const creditHold = exposure.gt(limit) && !input.user.permissions.includes("customers.override");
    const backordered = priced.some((item) => item.backorderedQty.gt(0));
    const status = creditHold ? "CREDIT_HOLD" : backordered ? "BACKORDERED" : "CONFIRMED";
    const number = await this.numbers.next("SALES_ORDER", tx);
    const order = await tx.salesOrder.create({
      data: {
        number,
        customerId: customer.id,
        projectId: input.projectId || undefined,
        quotationId: input.quotationId || undefined,
        status,
        subtotal,
        tax,
        total,
        creditExposure: exposure,
        creditLimit: limit,
        createdById: input.user.id,
        items: {
          create: priced.map((item) => ({
            quotationItemId: item.quotationItemId,
            variantId: item.variantId,
            description: item.description,
            qty: item.qty,
            backorderedQty: item.backorderedQty,
            unitPrice: item.unitPrice,
            unitCost: item.unitCost,
            discountPct: item.discountPct,
            taxRate: item.taxRate,
          })),
        },
      },
      include: { items: true },
    });
    await this.workflow.record("sales_order", order.id, null, status, input.user.id, creditHold ? `Exposure ${exposure.toFixed(0)} over limit ${limit.toFixed(0)}` : undefined, tx);
    await this.events.record("SalesOrderCreated", { salesOrderId: order.id, status }, tx);
    await this.audit.log({ actorId: input.user.id, action: "create", entityType: "sales_order", entityId: order.id, after: { number, status, total: total.toString() }, ip: input.ip }, tx);
    if (!creditHold) await this.afterOrder(tx, order.id);
    return present(order, input.user);
  }

  private async afterOrder(tx: Tx, orderId: string) {
    const order = await tx.salesOrder.findUnique({ where: { id: orderId }, include: { items: { include: { variant: { include: { product: true } } } } } });
    if (!order) return;
    for (const item of order.items) {
      if (dec(item.backorderedQty).lte(0) || !item.variant) continue;
      if (item.variant.product.supplyMode === "MAKE") {
        const existing = await tx.productionOrder.findFirst({ where: { salesOrderId: order.id, variantId: item.variant.id, status: { not: "CANCELLED" } } });
        if (existing) continue;
        const number = await this.numbers.next("PRODUCTION", tx);
        const jobNumber = await this.numbers.next("JOB", tx);
        const production = await tx.productionOrder.create({
          data: { number, variantId: item.variant.id, qty: item.backorderedQty, status: "PLANNED", salesOrderId: order.id },
        });
        await tx.jobCard.create({ data: { number: jobNumber, productionOrderId: production.id, status: "QUEUED", requiredQty: item.backorderedQty } });
        await this.events.record("ProductionRequirementCreated", { productionOrderId: production.id }, tx);
      } else {
        const existing = await tx.purchaseRequisition.findFirst({ where: { sourceType: "SALES_ORDER", sourceId: order.id, status: { not: "CANCELLED" }, items: { some: { variantId: item.variant.id } } } });
        if (existing) continue;
        const number = await this.numbers.next("PURCHASE_REQUISITION", tx);
        await tx.purchaseRequisition.create({
          data: {
            number,
            status: "SUBMITTED",
            sourceType: "SALES_ORDER",
            sourceId: order.id,
            notes: `Raised from ${order.number}`,
            items: { create: [{ variantId: item.variant.id, description: item.description, qty: item.backorderedQty }] },
          },
        });
        await this.events.record("PurchaseRequestCreated", { salesOrderId: order.id, variantId: item.variant.id }, tx);
      }
    }
  }

  private async onHand(tx: Tx, variantId: string) {
    const agg = await tx.inventoryBalance.aggregate({ where: { variantId }, _sum: { qty: true } });
    return dec(agg._sum.qty);
  }

  private async allocated(tx: Tx, variantId: string) {
    const items = await tx.salesOrderItem.findMany({
      where: { variantId, salesOrder: { status: { in: ["CONFIRMED", "PARTIAL", "BACKORDERED"] } } },
      select: { qty: true, fulfilledQty: true },
    });
    return items.reduce((sum, item) => sum.add(D.max(0, dec(item.qty).sub(dec(item.fulfilledQty)))), new D(0));
  }

  private async outstanding(tx: Tx, customerId: string) {
    const invoices = await tx.invoice.findMany({ where: { customerId, status: { in: ["ISSUED", "PARTIAL", "OVERDUE"] } }, select: { total: true, payments: { where: { direction: "IN" }, select: { amount: true } } } });
    return invoices.reduce((sum, invoice) => sum.add(dec(invoice.total)).sub(invoice.payments.reduce((paid, payment) => paid.add(dec(payment.amount)), new D(0))), new D(0));
  }
}
