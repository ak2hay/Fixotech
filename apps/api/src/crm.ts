import { BadRequestException, Body, Controller, ForbiddenException, Get, Headers, Injectable, Logger, NotFoundException, Param, Patch, Post, Query, Req, ServiceUnavailableException, UseInterceptors } from "@nestjs/common";
import { AnyFilesInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { createHmac } from "crypto";
import nodemailer from "nodemailer";
import {
  ACTIVITY_ENTITIES,
  LEAD_STAGE_PROBABILITY,
  activitySchema,
  activityUpdateSchema,
  ageBucket,
  assignmentMatches,
  assignmentRuleSchema,
  customFieldDefSchema,
  duplicateKeys,
  emailTemplateSchema,
  enrollSchema,
  groupDuplicates,
  inboundEmailSchema,
  mergeSchema,
  normalizeEmail,
  normalizePhone,
  renderTemplate,
  roundRobin,
  scoreLead,
  scoringRuleSchema,
  sendEmailSchema,
  sequenceSchema,
  validateCustomFields,
  weightedValue,
  whatsappSendSchema,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { safeEqual } from "./crypto";
import { env } from "./env";
import { AuthUser, Public, RequirePermissions, assertStaff, can, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { AuditService, NotifyService, NumberService, toPlain, type Tx } from "./services";

type ReqUser = { user: AuthUser; ip?: string };
type RawReq = { rawBody?: Buffer; ip?: string };
type Entity = (typeof ACTIVITY_ENTITIES)[number];

const ENTITY_RESOURCE: Record<Entity, string> = { lead: "leads", customer: "customers", project: "projects", quotation: "quotations", rfq: "rfqs" };
const OPEN_LEAD = { notIn: ["WON", "LOST"] };
const OPEN_QUOTE_STATUSES = ["SENT", "NEGOTIATION"];
const DAY = 86_400_000;

function leadRecord(lead: { estimatedValue?: Prisma.Decimal | null } & Record<string, unknown>) {
  return { ...lead, estimatedValue: lead.estimatedValue == null ? null : Number(lead.estimatedValue) };
}

/** "Asha Rao <asha@x.com>" → asha@x.com */
export function addressOf(value: string) {
  const match = /<([^>]+)>/.exec(value);
  return normalizeEmail(match ? match[1] : value.split(",")[0]);
}

const REFERENCE = /\[((?:LD|QT|PRJ|CUS|RFQ)-\d{3,})\]/i;

@Injectable()
export class CrmService {
  private readonly logger = new Logger("Crm");
  private transport?: ReturnType<typeof nodemailer.createTransport>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notify: NotifyService,
  ) {}

  async rescore(leadId: string, tx?: Tx) {
    const db = tx || this.prisma;
    const [lead, rules] = await Promise.all([db.lead.findUnique({ where: { id: leadId } }), db.leadScoringRule.findMany({ where: { active: true } })]);
    if (!lead) return null;
    const score = scoreLead(leadRecord(lead), rules);
    if (score !== lead.score) await db.lead.update({ where: { id: leadId }, data: { score } });
    return score;
  }

  /** First matching rule (by priority) picks the next active user in its rotation; the cursor bump is atomic. */
  async autoAssign(leadId: string) {
    const lead = await this.prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead || lead.ownerId) return lead?.ownerId ?? null;
    const rules = await this.prisma.assignmentRule.findMany({ where: { active: true }, orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
    const rule = rules.find((candidate) => assignmentMatches(candidate.condition, leadRecord(lead)));
    if (!rule) return null;
    const active = new Set((await this.prisma.user.findMany({ where: { id: { in: rule.userIds }, active: true, kind: "STAFF" }, select: { id: true } })).map((user) => user.id));
    const eligible = rule.userIds.filter((id) => active.has(id));
    if (!eligible.length) return null;
    const bumped = await this.prisma.assignmentRule.update({ where: { id: rule.id }, data: { cursor: { increment: 1 } } });
    const pick = roundRobin(eligible, bumped.cursor - 1)!;
    const claimed = await this.prisma.lead.updateMany({ where: { id: leadId, ownerId: null }, data: { ownerId: pick.userId } });
    if (!claimed.count) return null;
    await this.notify.push([pick.userId], "Lead assigned", `${lead.number} (${lead.companyName}) was assigned to you by rule "${rule.name}"`, "lead", leadId);
    return pick.userId;
  }

  /** Scoring and routing must never fail the enquiry that created the lead. */
  async onLeadCreated(leadId: string, assign: boolean) {
    try {
      await this.rescore(leadId);
      if (assign) await this.autoAssign(leadId);
    } catch (error) {
      this.logger.warn(`Lead ${leadId} scoring/assignment failed: ${(error as Error).message}`);
    }
  }

  async customFields(entity: "LEAD" | "CUSTOMER" | "PROJECT", values: Record<string, unknown>, existing?: Prisma.JsonValue | null) {
    const defs = await this.prisma.customFieldDef.findMany({ where: { entity, active: true } });
    const merged = { ...((existing as Record<string, unknown> | null) || {}), ...values };
    const result = validateCustomFields(defs, Object.fromEntries(Object.entries(merged).filter(([key]) => defs.some((def) => def.key === key))));
    const unknown = Object.keys(values).filter((key) => !defs.some((def) => def.key === key));
    if (unknown.length) result.errors.push(...unknown.map((key) => `Unknown field ${key}`));
    if (result.errors.length) throw new BadRequestException({ message: "Invalid custom fields", errors: result.errors });
    return result.values as Prisma.InputJsonValue;
  }

  mailEnabled() {
    return Boolean(env.SMTP_HOST);
  }

  async sendMail(input: { to: string; subject: string; text: string; replyTo?: string }) {
    if (!env.SMTP_HOST) throw new ServiceUnavailableException("Outgoing email is not configured (SMTP_HOST)");
    this.transport ??= nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    });
    const info = await this.transport.sendMail({ from: env.SMTP_FROM || "Fixotec <noreply@fixotec.local>", to: input.to, subject: input.subject, text: input.text, replyTo: input.replyTo });
    return String(info.messageId || "");
  }

  whatsappEnabled() {
    return Boolean(env.WHATSAPP_TOKEN && env.WHATSAPP_PHONE_NUMBER_ID);
  }

  /** Free-form text only reaches numbers that messaged us in the last 24 hours (WhatsApp session window). */
  async sendWhatsApp(to: string, body: string) {
    if (!this.whatsappEnabled()) throw new ServiceUnavailableException("WhatsApp is not configured (WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID)");
    const digits = to.replace(/\D/g, "");
    const recipient = digits.length === 10 ? `91${digits}` : digits;
    const response = await fetch(`https://graph.facebook.com/${env.WHATSAPP_API_VERSION}/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: recipient, type: "text", text: { body, preview_url: false } }),
      signal: AbortSignal.timeout(15_000),
    });
    const payload = (await response.json().catch(() => ({}))) as { messages?: Array<{ id: string }>; error?: { message?: string } };
    if (!response.ok) throw new BadRequestException(`WhatsApp send failed: ${payload.error?.message || response.status}`);
    return payload.messages?.[0]?.id || "";
  }

  /** Finds the CRM record an inbound message belongs to: explicit [LD-0001] reference first, then email/phone. */
  async resolveContact(input: { email?: string | null; phone?: string | null; subject?: string }): Promise<{ entityType: Entity; entityId: string; ownerId: string | null } | null> {
    const ref = input.subject ? REFERENCE.exec(input.subject)?.[1]?.toUpperCase() : undefined;
    if (ref) {
      const prefix = ref.split("-")[0];
      if (prefix === "LD") {
        const lead = await this.prisma.lead.findUnique({ where: { number: ref }, select: { id: true, ownerId: true } });
        if (lead) return { entityType: "lead", entityId: lead.id, ownerId: lead.ownerId };
      } else if (prefix === "QT") {
        const quote = await this.prisma.quotation.findUnique({ where: { number: ref }, select: { id: true, createdById: true } });
        if (quote) return { entityType: "quotation", entityId: quote.id, ownerId: quote.createdById };
      } else if (prefix === "PRJ") {
        const project = await this.prisma.project.findUnique({ where: { code: ref }, select: { id: true, ownerId: true } });
        if (project) return { entityType: "project", entityId: project.id, ownerId: project.ownerId };
      } else if (prefix === "RFQ") {
        const rfq = await this.prisma.rfq.findUnique({ where: { number: ref }, select: { id: true, assigneeId: true } });
        if (rfq) return { entityType: "rfq", entityId: rfq.id, ownerId: rfq.assigneeId };
      } else if (prefix === "CUS") {
        const customer = await this.prisma.customer.findUnique({ where: { code: ref }, select: { id: true } });
        if (customer) return { entityType: "customer", entityId: customer.id, ownerId: null };
      }
    }
    const email = normalizeEmail(input.email);
    const phone = normalizePhone(input.phone);
    if (email) {
      const lead = await this.prisma.lead.findFirst({ where: { email: { equals: email, mode: "insensitive" }, mergedIntoId: null }, orderBy: [{ updatedAt: "desc" }], select: { id: true, ownerId: true, status: true } });
      if (lead && !["WON", "LOST"].includes(lead.status)) return { entityType: "lead", entityId: lead.id, ownerId: lead.ownerId };
      const contact = await this.prisma.contact.findFirst({ where: { email: { equals: email, mode: "insensitive" } }, select: { customerId: true } });
      const customer = contact ? { id: contact.customerId } : await this.prisma.customer.findFirst({ where: { email: { equals: email, mode: "insensitive" }, mergedIntoId: null }, select: { id: true } });
      if (customer) return { entityType: "customer", entityId: customer.id, ownerId: null };
      if (lead) return { entityType: "lead", entityId: lead.id, ownerId: lead.ownerId };
    }
    if (phone) {
      const leads = await this.prisma.$queryRaw<Array<{ id: string; ownerId: string | null }>>`SELECT "id", "ownerId" FROM "Lead" WHERE "mergedIntoId" IS NULL AND right(regexp_replace(coalesce("phone", ''), '\\D', '', 'g'), 10) = ${phone} ORDER BY "updatedAt" DESC LIMIT 1`;
      if (leads[0]) return { entityType: "lead", entityId: leads[0].id, ownerId: leads[0].ownerId };
      const contacts = await this.prisma.$queryRaw<Array<{ customerId: string }>>`SELECT "customerId" FROM "Contact" WHERE right(regexp_replace(coalesce("phone", ''), '\\D', '', 'g'), 10) = ${phone} LIMIT 1`;
      if (contacts[0]) return { entityType: "customer", entityId: contacts[0].customerId, ownerId: null };
      const customers = await this.prisma.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Customer" WHERE "mergedIntoId" IS NULL AND right(regexp_replace(coalesce("phone", ''), '\\D', '', 'g'), 10) = ${phone} LIMIT 1`;
      if (customers[0]) return { entityType: "customer", entityId: customers[0].id, ownerId: null };
    }
    return null;
  }

  /** Activity reminders (job runs every 5 minutes): anything due within 15 minutes notifies its owner once. */
  async remind() {
    const due = await this.prisma.activity.findMany({
      where: { status: "OPEN", remindedAt: null, ownerId: { not: null }, dueAt: { lte: new Date(Date.now() + 15 * 60_000) } },
      take: 500,
      orderBy: { dueAt: "asc" },
    });
    for (const activity of due) {
      const claimed = await this.prisma.activity.updateMany({ where: { id: activity.id, remindedAt: null }, data: { remindedAt: new Date() } });
      if (!claimed.count) continue;
      const overdue = activity.dueAt && activity.dueAt.getTime() < Date.now() - 60_000;
      await this.notify.push([activity.ownerId], overdue ? `Overdue: ${activity.subject}` : `Due soon: ${activity.subject}`, `${activity.type.toLowerCase()} on ${activity.entityType}${activity.dueAt ? ` at ${activity.dueAt.toISOString()}` : ""}`, activity.entityType, activity.entityId);
    }
    return { reminded: due.length };
  }

  /** Enrols newly sent quotations into the auto sequence, then sends every due step. */
  async runSequences() {
    const auto = await this.prisma.sequence.findFirst({ where: { active: true, autoEnroll: true, entityType: "quotation" }, orderBy: { createdAt: "asc" } });
    if (auto) {
      const quotes = await this.prisma.quotation.findMany({
        where: { status: "SENT", updatedAt: { gte: new Date(Date.now() - 7 * DAY) } },
        select: { id: true, createdById: true, customer: { select: { email: true, contacts: { select: { email: true, primary: true } } } } },
        take: 200,
      });
      for (const quote of quotes) {
        const email = quote.customer.contacts.find((contact) => contact.primary && contact.email)?.email || quote.customer.contacts.find((contact) => contact.email)?.email || quote.customer.email;
        if (!email) continue;
        await this.enroll(auto.id, "quotation", quote.id, email, quote.createdById).catch(() => undefined);
      }
    }
    if (!this.mailEnabled()) return { sent: 0 };
    const due = await this.prisma.sequenceEnrollment.findMany({ where: { status: "ACTIVE", nextRunAt: { lte: new Date() } }, include: { sequence: true }, take: 200 });
    let sent = 0;
    for (const enrollment of due) {
      try {
        if (await this.advance(enrollment)) sent += 1;
      } catch (error) {
        await this.prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { lastError: (error as Error).message.slice(0, 500) } });
      }
    }
    return { sent };
  }

  async enroll(sequenceId: string, entityType: "quotation" | "lead", entityId: string, email: string, createdById?: string | null) {
    const sequence = await this.prisma.sequence.findUnique({ where: { id: sequenceId } });
    if (!sequence || !sequence.active) throw new NotFoundException("Sequence not found");
    if (sequence.entityType !== entityType) throw new BadRequestException(`This sequence is for ${sequence.entityType}s`);
    const steps = sequence.steps as Array<{ dayOffset: number; templateKey: string }>;
    return this.prisma.sequenceEnrollment.create({
      data: { sequenceId, entityType, entityId, email, createdById: createdById || undefined, nextRunAt: new Date(Date.now() + (steps[0]?.dayOffset ?? 0) * DAY) },
    });
  }

  private async advance(enrollment: Prisma.SequenceEnrollmentGetPayload<{ include: { sequence: true } }>) {
    const steps = enrollment.sequence.steps as Array<{ dayOffset: number; templateKey: string }>;
    const stop = async (status: string, reason?: string) => {
      await this.prisma.sequenceEnrollment.update({ where: { id: enrollment.id }, data: { status, nextRunAt: null, lastError: reason } });
      return false;
    };
    const context = await this.templateContext(enrollment.entityType as Entity, enrollment.entityId);
    if (!context) return stop("STOPPED", "Record no longer exists");
    if (enrollment.entityType === "quotation" && !OPEN_QUOTE_STATUSES.includes(String((context.quotation as { status: string }).status))) return stop("STOPPED", "Quotation closed");
    if (enrollment.entityType === "lead" && ["WON", "LOST"].includes(String((context.lead as { status: string }).status))) return stop("STOPPED", "Lead closed");
    const replied = await this.prisma.activity.count({ where: { entityType: enrollment.entityType, entityId: enrollment.entityId, direction: "IN", createdAt: { gte: enrollment.createdAt } } });
    if (replied) return stop("STOPPED", "Customer replied");
    const step = steps[enrollment.step];
    if (!step) return stop("COMPLETED");
    const template = await this.prisma.emailTemplate.findUnique({ where: { key: step.templateKey } });
    if (!template || !template.active) return stop("STOPPED", `Template ${step.templateKey} missing`);
    const claimed = await this.prisma.sequenceEnrollment.updateMany({ where: { id: enrollment.id, step: enrollment.step, status: "ACTIVE" }, data: { step: { increment: 1 } } });
    if (!claimed.count) return false;
    const subject = renderTemplate(template.subject, context);
    const text = renderTemplate(template.body, context);
    const messageId = await this.sendMail({ to: enrollment.email, subject, text });
    await this.prisma.activity.create({
      data: { type: "EMAIL", direction: "OUT", status: "DONE", completedAt: new Date(), subject, body: text, entityType: enrollment.entityType, entityId: enrollment.entityId, contactEmail: enrollment.email, externalId: messageId || undefined, ownerId: enrollment.createdById, createdById: enrollment.createdById },
    });
    const next = steps[enrollment.step + 1];
    await this.prisma.sequenceEnrollment.update({
      where: { id: enrollment.id },
      data: next ? { nextRunAt: new Date(enrollment.createdAt.getTime() + next.dayOffset * DAY), lastError: null } : { status: "COMPLETED", nextRunAt: null, lastError: null },
    });
    return true;
  }

  async templateContext(entityType: Entity, entityId: string): Promise<Record<string, unknown> | null> {
    if (entityType === "quotation") {
      const quotation = await this.prisma.quotation.findUnique({ where: { id: entityId }, include: { customer: true, project: true } });
      if (!quotation) return null;
      return toPlain({ quotation, customer: quotation.customer, project: quotation.project }) as Record<string, unknown>;
    }
    if (entityType === "lead") {
      const lead = await this.prisma.lead.findUnique({ where: { id: entityId }, include: { owner: { select: { name: true, email: true, phone: true } } } });
      return lead ? (toPlain({ lead, owner: lead.owner }) as Record<string, unknown>) : null;
    }
    if (entityType === "customer") {
      const customer = await this.prisma.customer.findUnique({ where: { id: entityId } });
      return customer ? (toPlain({ customer }) as Record<string, unknown>) : null;
    }
    if (entityType === "project") {
      const project = await this.prisma.project.findUnique({ where: { id: entityId }, include: { customer: true } });
      return project ? (toPlain({ project, customer: project.customer }) as Record<string, unknown>) : null;
    }
    const rfq = await this.prisma.rfq.findUnique({ where: { id: entityId }, include: { customer: true } });
    return rfq ? (toPlain({ rfq, customer: rfq.customer }) as Record<string, unknown>) : null;
  }

  async entityExists(entityType: Entity, entityId: string) {
    const where = { where: { id: entityId }, select: { id: true } } as const;
    const row =
      entityType === "lead" ? await this.prisma.lead.findUnique(where)
      : entityType === "customer" ? await this.prisma.customer.findUnique(where)
      : entityType === "project" ? await this.prisma.project.findUnique(where)
      : entityType === "quotation" ? await this.prisma.quotation.findUnique(where)
      : await this.prisma.rfq.findUnique(where);
    if (!row) throw new NotFoundException(`${entityType} not found`);
  }
}

@Controller()
export class CrmController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crm: CrmService,
    private readonly audit: AuditService,
    private readonly numbers: NumberService,
    private readonly notify: NotifyService,
  ) {}

  private access(user: AuthUser, entityType: string, action: "view" | "edit") {
    assertStaff(user);
    const resource = ENTITY_RESOURCE[entityType as Entity];
    if (!resource) throw new BadRequestException("Unknown record type");
    if (!can(user, `${resource}.${action}`)) throw new ForbiddenException(`Missing permission ${resource}.${action}`);
    return entityType as Entity;
  }

  @Get("crm/owners")
  @RequirePermissions("leads.view")
  owners(@Req() req: ReqUser) {
    assertStaff(req.user);
    return this.prisma.user.findMany({ where: { active: true, kind: "STAFF" }, orderBy: { name: "asc" }, select: { id: true, name: true, jobTitle: true } });
  }

  @Get("leads/:id")
  @RequirePermissions("leads.view")
  async lead(@Param("id") id: string, @Req() req: ReqUser) {
    assertStaff(req.user);
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        owner: { select: { id: true, name: true } },
        customer: { select: { id: true, code: true, name: true } },
        project: { select: { id: true, code: true, name: true } },
        rfqs: { select: { id: true, number: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" } },
      },
    });
    if (!lead) throw new NotFoundException("Lead not found");
    return toPlain({ ...lead, probability: LEAD_STAGE_PROBABILITY[lead.status] ?? 0, weightedValue: weightedValue(lead.status, lead.estimatedValue) });
  }

  // ---------------------------------------------------------------- pipeline

  @Get("crm/pipeline")
  @RequirePermissions("leads.view")
  async pipeline(@Req() req: ReqUser, @Query() query: Record<string, string | undefined>) {
    assertStaff(req.user);
    const closedSince = new Date(Date.now() - 90 * DAY);
    const q = query.q?.trim();
    const leads = await this.prisma.lead.findMany({
      where: {
        mergedIntoId: null,
        ownerId: query.mine === "1" ? req.user.id : query.ownerId || undefined,
        source: query.source || undefined,
        OR: [{ status: OPEN_LEAD }, { updatedAt: { gte: closedSince } }],
        AND: q ? [{ OR: [{ companyName: { contains: q, mode: "insensitive" } }, { contactName: { contains: q, mode: "insensitive" } }, { number: { contains: q, mode: "insensitive" } }] }] : undefined,
      },
      orderBy: [{ score: "desc" }, { updatedAt: "desc" }],
      take: 1000,
      select: { id: true, number: true, status: true, companyName: true, contactName: true, source: true, score: true, estimatedValue: true, nextFollowUpAt: true, updatedAt: true, createdAt: true, lostReason: true, owner: { select: { id: true, name: true } } },
    });
    const stages = Object.keys(LEAD_STAGE_PROBABILITY).map((status) => {
      const items = leads.filter((lead) => lead.status === status);
      const value = items.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0);
      return { status, probability: LEAD_STAGE_PROBABILITY[status], count: items.length, value, weighted: items.reduce((sum, lead) => sum + weightedValue(status, lead.estimatedValue), 0), items: toPlain(items) };
    });
    const open = stages.filter((stage) => !["WON", "LOST"].includes(stage.status));
    return {
      stages,
      totals: {
        open: open.reduce((sum, stage) => sum + stage.count, 0),
        openValue: open.reduce((sum, stage) => sum + stage.value, 0),
        forecast: open.reduce((sum, stage) => sum + stage.weighted, 0),
        won90: stages.find((stage) => stage.status === "WON")?.value ?? 0,
      },
    };
  }

  // ---------------------------------------------------------------- activities

  @Get("activities")
  async activities(@Req() req: ReqUser, @Query() query: Record<string, string | undefined>) {
    assertStaff(req.user);
    const where: Prisma.ActivityWhereInput = {};
    if (query.entityType && query.entityId) {
      this.access(req.user, query.entityType, "view");
      where.entityType = query.entityType;
      where.entityId = query.entityId;
    } else if (query.ownerId && query.ownerId !== req.user.id) {
      if (!can(req.user, "leads.assign")) throw new ForbiddenException("Viewing another user's activities needs leads.assign");
      where.ownerId = query.ownerId;
    } else {
      where.ownerId = req.user.id;
    }
    if (query.status) where.status = query.status;
    if (query.type) where.type = query.type;
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    if (query.due === "overdue") where.dueAt = { lt: now };
    else if (query.due === "today") where.dueAt = { lte: endOfDay };
    else if (query.due === "week") where.dueAt = { lte: new Date(now.getTime() + 7 * DAY) };
    const items = await this.prisma.activity.findMany({ where, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }, { createdAt: "desc" }], take: Math.min(500, Number(query.take) || 200), include: { owner: { select: { id: true, name: true } } } });
    return { items: toPlain(items), total: items.length };
  }

  @Post("activities")
  async createActivity(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(activitySchema, body);
    const entityType = this.access(req.user, input.entityType, "edit");
    await this.crm.entityExists(entityType, input.entityId);
    if (input.ownerId && input.ownerId !== req.user.id && !can(req.user, "leads.assign")) throw new ForbiddenException("Assigning an activity to someone else needs leads.assign");
    const done = input.status === "DONE" || input.type === "NOTE";
    const row = await this.prisma.activity.create({
      data: {
        type: input.type,
        subject: input.subject,
        body: input.body,
        entityType,
        entityId: input.entityId,
        dueAt: input.dueAt ? new Date(input.dueAt) : undefined,
        status: done ? "DONE" : "OPEN",
        completedAt: done ? new Date() : undefined,
        contactEmail: input.contactEmail,
        contactPhone: input.contactPhone,
        ownerId: input.ownerId || req.user.id,
        createdById: req.user.id,
      },
    });
    if (entityType === "lead" && input.dueAt && !done) await this.syncFollowUp(input.entityId);
    if (row.ownerId && row.ownerId !== req.user.id) await this.notify.push([row.ownerId], `New ${row.type.toLowerCase()}: ${row.subject}`, `Assigned by ${req.user.name}`, entityType, input.entityId);
    return toPlain(row);
  }

  @Patch("activities/:id")
  async updateActivity(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(activityUpdateSchema, body);
    const before = await this.prisma.activity.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Activity not found");
    this.access(req.user, before.entityType, "edit");
    if (before.ownerId !== req.user.id && before.createdById !== req.user.id && !can(req.user, "leads.assign")) throw new ForbiddenException("Only the owner can change this activity");
    if (input.ownerId && input.ownerId !== before.ownerId && !can(req.user, "leads.assign")) throw new ForbiddenException("Reassigning needs leads.assign");
    const closing = input.status && input.status !== "OPEN" && before.status === "OPEN";
    const row = await this.prisma.activity.update({
      where: { id },
      data: {
        subject: input.subject,
        body: input.body,
        dueAt: input.dueAt === undefined ? undefined : input.dueAt ? new Date(input.dueAt) : null,
        remindedAt: input.dueAt !== undefined ? null : undefined,
        ownerId: input.ownerId,
        status: input.status,
        completedAt: closing ? new Date() : input.status === "OPEN" ? null : undefined,
      },
    });
    if (before.entityType === "lead") await this.syncFollowUp(before.entityId);
    return toPlain(row);
  }

  /** The lead's next follow-up is its earliest open activity, so list views can sort and filter on it. */
  private async syncFollowUp(leadId: string) {
    const next = await this.prisma.activity.findFirst({ where: { entityType: "lead", entityId: leadId, status: "OPEN", dueAt: { not: null } }, orderBy: { dueAt: "asc" }, select: { dueAt: true } });
    await this.prisma.lead.update({ where: { id: leadId }, data: { nextFollowUpAt: next?.dueAt ?? null } });
  }

  @Get("crm/my-day")
  async myDay(@Req() req: ReqUser) {
    assertStaff(req.user);
    const now = new Date();
    const endOfDay = new Date(now);
    endOfDay.setHours(23, 59, 59, 999);
    const [activities, followUps, hotLeads, expiring, stale] = await Promise.all([
      this.prisma.activity.findMany({ where: { ownerId: req.user.id, status: "OPEN", OR: [{ dueAt: { lte: new Date(now.getTime() + 7 * DAY) } }, { dueAt: null }] }, orderBy: [{ dueAt: { sort: "asc", nulls: "last" } }], take: 200 }),
      this.prisma.lead.findMany({ where: { ownerId: req.user.id, status: OPEN_LEAD, mergedIntoId: null, nextFollowUpAt: { lte: endOfDay } }, orderBy: { nextFollowUpAt: "asc" }, take: 50, select: { id: true, number: true, companyName: true, status: true, score: true, nextFollowUpAt: true } }),
      this.prisma.lead.findMany({ where: { ownerId: req.user.id, status: OPEN_LEAD, mergedIntoId: null, score: { gte: 60 } }, orderBy: { score: "desc" }, take: 20, select: { id: true, number: true, companyName: true, status: true, score: true, estimatedValue: true } }),
      this.prisma.quotation.findMany({ where: { createdById: req.user.id, status: { in: OPEN_QUOTE_STATUSES }, validUntil: { lte: new Date(now.getTime() + 7 * DAY) } }, orderBy: { validUntil: "asc" }, take: 20, select: { id: true, number: true, total: true, validUntil: true, customer: { select: { name: true } } } }),
      this.prisma.lead.findMany({ where: { ownerId: req.user.id, status: OPEN_LEAD, mergedIntoId: null, updatedAt: { lt: new Date(now.getTime() - 14 * DAY) }, nextFollowUpAt: null }, orderBy: { updatedAt: "asc" }, take: 20, select: { id: true, number: true, companyName: true, status: true, updatedAt: true } }),
    ]);
    return toPlain({
      overdue: activities.filter((item) => item.dueAt && item.dueAt < now),
      today: activities.filter((item) => item.dueAt && item.dueAt >= now && item.dueAt <= endOfDay),
      upcoming: activities.filter((item) => !item.dueAt || item.dueAt > endOfDay),
      followUps,
      hotLeads,
      expiringQuotes: expiring,
      staleLeads: stale,
    });
  }

  @Get("crm/timeline/:entityType/:entityId")
  async timeline(@Param("entityType") entityType: string, @Param("entityId") entityId: string, @Req() req: ReqUser) {
    const type = this.access(req.user, entityType, "view");
    const [activities, events, comments, leadNotes] = await Promise.all([
      this.prisma.activity.findMany({ where: { entityType: type, entityId }, orderBy: { createdAt: "desc" }, take: 200, include: { owner: { select: { name: true } } } }),
      this.prisma.workflowEvent.findMany({ where: { entityType: type, entityId }, orderBy: { createdAt: "desc" }, take: 100 }),
      this.prisma.comment.findMany({ where: { entityType: type, entityId }, orderBy: { createdAt: "desc" }, take: 100, include: { author: { select: { name: true } } } }),
      type === "lead" ? this.prisma.leadActivity.findMany({ where: { leadId: entityId }, orderBy: { createdAt: "desc" }, take: 100 }) : Promise.resolve([]),
    ]);
    const actors = await this.prisma.user.findMany({ where: { id: { in: [...new Set(events.map((event) => event.actorId).filter((id): id is string => Boolean(id)))] } }, select: { id: true, name: true } });
    const nameOf = new Map(actors.map((actor) => [actor.id, actor.name]));
    const entries = [
      ...activities.map((item) => ({ kind: "activity", id: item.id, at: item.dueAt && item.status === "OPEN" ? item.dueAt : item.completedAt || item.createdAt, type: item.type, title: item.subject, body: item.body, status: item.status, direction: item.direction, actor: item.owner?.name })),
      ...events.map((item) => ({ kind: "status", id: item.id, at: item.createdAt, type: "STATUS", title: `${item.fromStatus || "—"} → ${item.toStatus}`, body: item.comment, actor: item.actorId ? nameOf.get(item.actorId) : undefined })),
      ...comments.map((item) => ({ kind: "comment", id: item.id, at: item.createdAt, type: "COMMENT", title: "Comment", body: item.body, actor: item.author?.name })),
      ...leadNotes.map((item) => ({ kind: "lead_note", id: item.id, at: item.createdAt, type: item.type, title: item.type.replace(/_/g, " ").toLowerCase(), body: item.note })),
    ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return toPlain({ items: entries });
  }

  // ---------------------------------------------------------------- reports

  private range(query: Record<string, string | undefined>) {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from ? new Date(query.from) : new Date(to.getTime() - 365 * DAY);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new BadRequestException("Invalid date range");
    return { gte: from, lte: to };
  }

  @Get("crm/reports")
  @RequirePermissions("leads.view", "reports.view")
  async reports(@Req() req: ReqUser, @Query() query: Record<string, string | undefined>) {
    assertStaff(req.user);
    const createdAt = this.range(query);
    const leads = await this.prisma.lead.findMany({
      where: { createdAt, mergedIntoId: null },
      select: { id: true, status: true, source: true, ownerId: true, estimatedValue: true, lostReason: true, createdAt: true, wonAt: true, updatedAt: true, owner: { select: { name: true } } },
    });
    const order = Object.keys(LEAD_STAGE_PROBABILITY);
    const reached = (status: string, stage: string) => (status === "LOST" ? stage === "NEW" : order.indexOf(status) >= order.indexOf(stage));
    const funnel = order
      .filter((stage) => stage !== "LOST")
      .map((stage) => {
        const count = leads.filter((lead) => reached(lead.status, stage)).length;
        return { stage, count, pct: leads.length ? Math.round((count / leads.length) * 1000) / 10 : 0 };
      });
    const bySourceMap = new Map<string, { source: string; total: number; won: number; lost: number; wonValue: number }>();
    for (const lead of leads) {
      const row = bySourceMap.get(lead.source) || { source: lead.source, total: 0, won: 0, lost: 0, wonValue: 0 };
      row.total += 1;
      if (lead.status === "WON") {
        row.won += 1;
        row.wonValue += Number(lead.estimatedValue || 0);
      }
      if (lead.status === "LOST") row.lost += 1;
      bySourceMap.set(lead.source, row);
    }
    const bySource = [...bySourceMap.values()].map((row) => ({ ...row, winRate: row.won + row.lost ? Math.round((row.won / (row.won + row.lost)) * 1000) / 10 : 0 })).sort((a, b) => b.total - a.total);
    const activityCounts = await this.prisma.activity.groupBy({ by: ["ownerId"], where: { status: "DONE", completedAt: createdAt }, _count: { _all: true } });
    const overdue = await this.prisma.activity.groupBy({ by: ["ownerId"], where: { status: "OPEN", dueAt: { lt: new Date() } }, _count: { _all: true } });
    const board = new Map<string, { ownerId: string; name: string; open: number; won: number; lost: number; wonValue: number; pipeline: number; activities: number; overdue: number }>();
    for (const lead of leads) {
      if (!lead.ownerId) continue;
      const row = board.get(lead.ownerId) || { ownerId: lead.ownerId, name: lead.owner?.name || "—", open: 0, won: 0, lost: 0, wonValue: 0, pipeline: 0, activities: 0, overdue: 0 };
      if (lead.status === "WON") {
        row.won += 1;
        row.wonValue += Number(lead.estimatedValue || 0);
      } else if (lead.status === "LOST") row.lost += 1;
      else {
        row.open += 1;
        row.pipeline += weightedValue(lead.status, lead.estimatedValue);
      }
      board.set(lead.ownerId, row);
    }
    for (const row of activityCounts) if (row.ownerId && board.has(row.ownerId)) board.get(row.ownerId)!.activities = row._count._all;
    for (const row of overdue) if (row.ownerId && board.has(row.ownerId)) board.get(row.ownerId)!.overdue = row._count._all;
    const now = Date.now();
    const ageing: Record<string, Record<string, number>> = {};
    for (const lead of leads.filter((item) => !["WON", "LOST"].includes(item.status))) {
      const bucket = ageBucket(Math.floor((now - lead.createdAt.getTime()) / DAY));
      ageing[lead.status] ??= { "0-7": 0, "8-30": 0, "31-90": 0, "90+": 0 };
      ageing[lead.status][bucket] += 1;
    }
    const lostReasons = Object.entries(leads.filter((lead) => lead.status === "LOST").reduce<Record<string, number>>((acc, lead) => ({ ...acc, [lead.lostReason || "UNSPECIFIED"]: (acc[lead.lostReason || "UNSPECIFIED"] || 0) + 1 }), {}))
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count);
    const cycle = leads.filter((lead) => lead.status === "WON" && lead.wonAt).map((lead) => (lead.wonAt!.getTime() - lead.createdAt.getTime()) / DAY);
    return {
      from: createdAt.gte,
      to: createdAt.lte,
      total: leads.length,
      avgDaysToWin: cycle.length ? Math.round(cycle.reduce((a, b) => a + b, 0) / cycle.length) : null,
      funnel,
      bySource,
      leaderboard: [...board.values()].sort((a, b) => b.wonValue - a.wonValue || b.pipeline - a.pipeline),
      ageing: Object.entries(ageing).map(([status, buckets]) => ({ status, ...buckets })),
      lostReasons,
    };
  }

  /** Consultants, architects and PMCs who put Fixotec into specifications, ranked by the business they influenced. */
  @Get("crm/specifiers")
  @RequirePermissions("customers.view", "projects.view")
  async specifiers(@Req() req: ReqUser) {
    assertStaff(req.user);
    const specifiers = await this.prisma.customer.findMany({
      where: { type: { in: ["CONSULTANT", "ARCHITECT", "PMC"] }, active: true, mergedIntoId: null },
      select: {
        id: true,
        code: true,
        name: true,
        type: true,
        consultantProjects: { select: { id: true, stage: true, fixotecValue: true, createdAt: true } },
        pmcProjects: { select: { id: true, stage: true, fixotecValue: true, createdAt: true } },
      },
    });
    const won = ["WON", "EXECUTION", "CLOSED"];
    const rows = specifiers.map((specifier) => {
      const projects = [...new Map([...specifier.consultantProjects, ...specifier.pmcProjects].map((project) => [project.id, project])).values()];
      const wonProjects = projects.filter((project) => won.includes(project.stage));
      const lost = projects.filter((project) => project.stage === "LOST").length;
      const last = projects.reduce<Date | null>((latest, project) => (!latest || project.createdAt > latest ? project.createdAt : latest), null);
      return {
        id: specifier.id,
        code: specifier.code,
        name: specifier.name,
        type: specifier.type,
        projects: projects.length,
        active: projects.filter((project) => !won.includes(project.stage) && project.stage !== "LOST").length,
        won: wonProjects.length,
        lost,
        winRate: wonProjects.length + lost ? Math.round((wonProjects.length / (wonProjects.length + lost)) * 1000) / 10 : 0,
        influencedValue: projects.reduce((sum, project) => sum + Number(project.fixotecValue || 0), 0),
        wonValue: wonProjects.reduce((sum, project) => sum + Number(project.fixotecValue || 0), 0),
        lastProjectAt: last,
      };
    });
    return toPlain({ items: rows.filter((row) => row.projects > 0).sort((a, b) => b.wonValue - a.wonValue || b.influencedValue - a.influencedValue), withoutProjects: rows.filter((row) => !row.projects).length });
  }

  // ---------------------------------------------------------------- 360

  @Get("crm/customers/:id/360")
  @RequirePermissions("customers.view")
  async customer360(@Param("id") id: string, @Req() req: ReqUser) {
    assertStaff(req.user);
    const customer = await this.prisma.customer.findUnique({ where: { id }, include: { contacts: true, addresses: true } });
    if (!customer) throw new NotFoundException("Customer not found");
    const projectWhere = { OR: [{ customerId: id }, { developerId: id }, { consultantId: id }, { pmcId: id }, { contractorId: id }, { mepContractorId: id }] };
    const [projects, leads, rfqs, quotations, orders, invoices, payments, tickets, activities] = await Promise.all([
      this.prisma.project.findMany({ where: projectWhere, orderBy: { updatedAt: "desc" }, take: 50, select: { id: true, code: true, name: true, stage: true, fixotecValue: true, customerId: true, consultantId: true, pmcId: true, contractorId: true } }),
      this.prisma.lead.findMany({ where: { customerId: id, mergedIntoId: null }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, status: true, estimatedValue: true, score: true, createdAt: true } }),
      this.prisma.rfq.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, status: true, createdAt: true } }),
      this.prisma.quotation.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 100, select: { id: true, number: true, status: true, total: true, createdAt: true, validUntil: true } }),
      this.prisma.salesOrder.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, number: true, status: true, total: true, createdAt: true } }),
      this.prisma.invoice.findMany({ where: { customerId: id }, orderBy: { issueDate: "desc" }, take: 200, select: { id: true, number: true, status: true, total: true, issueDate: true, dueDate: true, payments: { where: { direction: "IN" }, select: { amount: true, paidAt: true } } } }),
      this.prisma.payment.findMany({ where: { customerId: id, direction: "IN" }, orderBy: { paidAt: "desc" }, take: 20, select: { id: true, number: true, amount: true, method: true, paidAt: true } }),
      this.prisma.serviceTicket.findMany({ where: { customerId: id }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, number: true, subject: true, status: true, priority: true, createdAt: true } }),
      this.prisma.activity.findMany({ where: { entityType: "customer", entityId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
    ]);
    const now = Date.now();
    let revenue = 0;
    let outstanding = 0;
    let overdue = 0;
    const daysToPay: number[] = [];
    for (const invoice of invoices) {
      if (invoice.status === "CANCELLED") continue;
      const paid = invoice.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
      revenue += Number(invoice.total);
      const due = Math.max(0, Number(invoice.total) - paid);
      outstanding += due;
      if (due > 0 && invoice.dueDate && invoice.dueDate.getTime() < now) overdue += due;
      if (due === 0 && invoice.payments.length) {
        const settled = Math.max(...invoice.payments.map((payment) => payment.paidAt.getTime()));
        daysToPay.push((settled - invoice.issueDate.getTime()) / DAY);
      }
    }
    const decided = quotations.filter((quote) => ["ACCEPTED", "REJECTED", "EXPIRED", "LOST"].includes(quote.status));
    const accepted = decided.filter((quote) => quote.status === "ACCEPTED").length;
    return toPlain({
      customer,
      kpis: {
        revenue,
        outstanding,
        overdue,
        creditLimit: Number(customer.creditLimit),
        creditAvailable: Math.max(0, Number(customer.creditLimit) - outstanding),
        avgDaysToPay: daysToPay.length ? Math.round(daysToPay.reduce((a, b) => a + b, 0) / daysToPay.length) : null,
        quoteWinRate: decided.length ? Math.round((accepted / decided.length) * 1000) / 10 : null,
        openQuotes: quotations.filter((quote) => OPEN_QUOTE_STATUSES.includes(quote.status)).reduce((sum, quote) => sum + Number(quote.total), 0),
        openTickets: tickets.filter((ticket) => !["CLOSED", "RESOLVED"].includes(ticket.status)).length,
        projects: projects.length,
      },
      projects: projects.map((project) => ({ ...project, role: project.customerId === id ? "Client" : project.consultantId === id ? "Consultant" : project.pmcId === id ? "PMC" : project.contractorId === id ? "Contractor" : "Other" })),
      leads,
      rfqs,
      quotations,
      orders,
      invoices: invoices.map(({ payments: paid, ...invoice }) => ({ ...invoice, paid: paid.reduce((sum, payment) => sum + Number(payment.amount), 0) })),
      payments,
      tickets,
      activities,
    });
  }

  // ---------------------------------------------------------------- duplicates & merge

  @Get("crm/duplicates")
  async duplicates(@Req() req: ReqUser, @Query("entity") entity = "lead") {
    if (entity === "customer") {
      this.access(req.user, "customer", "view");
      const customers = await this.prisma.customer.findMany({ where: { mergedIntoId: null, active: true }, select: { id: true, code: true, name: true, email: true, phone: true, gstin: true, type: true, createdAt: true, contacts: { select: { email: true, phone: true } } } });
      const groups = groupDuplicates(customers, (row) => [...duplicateKeys(row), ...row.contacts.flatMap((contact) => duplicateKeys(contact).filter((key) => !key.startsWith("gstin")))]);
      return toPlain({ groups: groups.map((group) => ({ ...group, records: group.records.map(({ contacts: _contacts, ...record }) => record) })) });
    }
    this.access(req.user, "lead", "view");
    const leads = await this.prisma.lead.findMany({ where: { mergedIntoId: null, status: OPEN_LEAD }, select: { id: true, number: true, companyName: true, contactName: true, email: true, phone: true, status: true, createdAt: true, owner: { select: { name: true } } } });
    return toPlain({ groups: groupDuplicates(leads, (row) => duplicateKeys(row)) });
  }

  @Post("leads/:id/merge")
  @RequirePermissions("leads.edit", "leads.assign")
  async mergeLead(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const { intoId } = parseBody(mergeSchema, body);
    if (id === intoId) throw new BadRequestException("Choose a different lead to merge into");
    const [source, target] = await Promise.all([this.prisma.lead.findUnique({ where: { id } }), this.prisma.lead.findUnique({ where: { id: intoId } })]);
    if (!source || !target) throw new NotFoundException("Lead not found");
    if (source.mergedIntoId || target.mergedIntoId) throw new BadRequestException("One of these leads was already merged");
    await this.prisma.$transaction(async (tx) => {
      const fill: Prisma.LeadUpdateInput = {};
      for (const key of ["email", "phone", "application", "region", "segment"] as const) if (!target[key] && source[key]) fill[key] = source[key];
      if (!target.estimatedValue && source.estimatedValue) fill.estimatedValue = source.estimatedValue;
      if (!target.customerId && source.customerId) fill.customer = { connect: { id: source.customerId } };
      if (!target.projectId && source.projectId) fill.project = { connect: { id: source.projectId } };
      const message = [target.message, source.message ? `Merged from ${source.number}: ${source.message}` : null].filter(Boolean).join("\n\n");
      fill.message = message || undefined;
      fill.customFields = { ...((source.customFields as Record<string, unknown>) || {}), ...((target.customFields as Record<string, unknown>) || {}) } as Prisma.InputJsonValue;
      await tx.lead.update({ where: { id: intoId }, data: fill });
      await tx.leadActivity.updateMany({ where: { leadId: id }, data: { leadId: intoId } });
      await tx.rfq.updateMany({ where: { leadId: id }, data: { leadId: intoId } });
      await tx.activity.updateMany({ where: { entityType: "lead", entityId: id }, data: { entityId: intoId } });
      await tx.comment.updateMany({ where: { entityType: "lead", entityId: id }, data: { entityId: intoId } });
      await tx.leadActivity.create({ data: { leadId: intoId, type: "MERGE", note: `${source.number} (${source.companyName}) merged into this lead by ${req.user.name}` } });
      await tx.lead.update({ where: { id }, data: { status: "LOST", lostReason: "MERGED", lostAt: new Date(), mergedIntoId: intoId } });
      await this.audit.log({ actorId: req.user.id, action: "merge", entityType: "lead", entityId: id, before: { number: source.number }, after: { mergedInto: target.number }, ip: req.ip }, tx);
    });
    await this.crm.rescore(intoId);
    return { ok: true, intoId };
  }

  @Post("customers/:id/merge")
  @RequirePermissions("customers.edit", "customers.override")
  async mergeCustomer(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const { intoId } = parseBody(mergeSchema, body);
    if (id === intoId) throw new BadRequestException("Choose a different customer to merge into");
    const [source, target] = await Promise.all([this.prisma.customer.findUnique({ where: { id } }), this.prisma.customer.findUnique({ where: { id: intoId } })]);
    if (!source || !target) throw new NotFoundException("Customer not found");
    if (source.mergedIntoId || target.mergedIntoId) throw new BadRequestException("One of these customers was already merged");
    if (source.gstin && target.gstin && source.gstin !== target.gstin) throw new BadRequestException("These customers have different GSTINs; they are separate legal entities");
    const moved = await this.prisma.$transaction(
      async (tx) => {
        const to = { customerId: intoId };
        const counts = {
          contacts: (await tx.contact.updateMany({ where: { customerId: id }, data: to })).count,
          addresses: (await tx.address.updateMany({ where: { customerId: id }, data: to })).count,
          users: (await tx.user.updateMany({ where: { customerId: id }, data: to })).count,
          leads: (await tx.lead.updateMany({ where: { customerId: id }, data: to })).count,
          projects: (await tx.project.updateMany({ where: { customerId: id }, data: to })).count,
          rfqs: (await tx.rfq.updateMany({ where: { customerId: id }, data: to })).count,
          quotations: (await tx.quotation.updateMany({ where: { customerId: id }, data: to })).count,
          salesOrders: (await tx.salesOrder.updateMany({ where: { customerId: id }, data: to })).count,
          invoices: (await tx.invoice.updateMany({ where: { customerId: id }, data: to })).count,
          payments: (await tx.payment.updateMany({ where: { customerId: id }, data: to })).count,
          tickets: (await tx.serviceTicket.updateMany({ where: { customerId: id }, data: to })).count,
          targets: (await tx.distributorTarget.updateMany({ where: { customerId: id }, data: to })).count,
          claims: (await tx.schemeClaim.updateMany({ where: { customerId: id }, data: to })).count,
          engineering: (await tx.engineeringRequest.updateMany({ where: { customerId: id }, data: to })).count,
        };
        await tx.project.updateMany({ where: { developerId: id }, data: { developerId: intoId } });
        await tx.project.updateMany({ where: { consultantId: id }, data: { consultantId: intoId } });
        await tx.project.updateMany({ where: { pmcId: id }, data: { pmcId: intoId } });
        await tx.project.updateMany({ where: { contractorId: id }, data: { contractorId: intoId } });
        await tx.project.updateMany({ where: { mepContractorId: id }, data: { mepContractorId: intoId } });
        await tx.activity.updateMany({ where: { entityType: "customer", entityId: id }, data: { entityId: intoId } });
        await tx.comment.updateMany({ where: { entityType: "customer", entityId: id }, data: { entityId: intoId } });
        await tx.document.updateMany({ where: { entityType: "customer", entityId: id }, data: { entityId: intoId } });
        await tx.customer.update({
          where: { id: intoId },
          data: { email: target.email || source.email, phone: target.phone || source.phone, gstin: target.gstin || source.gstin, website: target.website || source.website, customFields: { ...((source.customFields as Record<string, unknown>) || {}), ...((target.customFields as Record<string, unknown>) || {}) } as Prisma.InputJsonValue },
        });
        await tx.customer.update({ where: { id }, data: { active: false, mergedIntoId: intoId, notes: [source.notes, `Merged into ${target.code} on ${new Date().toISOString().slice(0, 10)}`].filter(Boolean).join("\n") } });
        await this.audit.log({ actorId: req.user.id, action: "merge", entityType: "customer", entityId: id, before: { code: source.code }, after: { mergedInto: target.code, moved: counts }, ip: req.ip }, tx);
        return counts;
      },
      { timeout: 60_000 },
    );
    return { ok: true, intoId, moved };
  }

  // ---------------------------------------------------------------- custom fields

  @Get("crm/custom-fields")
  async customFieldDefs(@Req() req: ReqUser, @Query("entity") entity?: string) {
    assertStaff(req.user);
    return this.prisma.customFieldDef.findMany({ where: { entity: entity || undefined }, orderBy: [{ entity: "asc" }, { sortOrder: "asc" }, { label: "asc" }] });
  }

  @Post("crm/custom-fields")
  @RequirePermissions("organization.edit")
  async createCustomField(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(customFieldDefSchema, body);
    const row = await this.prisma.customFieldDef.create({ data: input }).catch((error: { code?: string }) => {
      if (error.code === "P2002") throw new BadRequestException(`A ${input.entity.toLowerCase()} field with key ${input.key} already exists`);
      throw error;
    });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "custom_field", entityId: row.id, after: row, ip: req.ip });
    return row;
  }

  @Patch("crm/custom-fields/:id")
  @RequirePermissions("organization.edit")
  async updateCustomField(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(customFieldDefSchema.partial().omit({ entity: true, key: true }), body);
    const row = await this.prisma.customFieldDef.update({ where: { id }, data: input });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "custom_field", entityId: id, after: row, ip: req.ip });
    return row;
  }

  @Patch("crm/custom-values/:entity/:id")
  async saveCustomValues(@Param("entity") entity: string, @Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const values = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (entity === "lead") {
      this.access(req.user, "lead", "edit");
      const row = await this.prisma.lead.findUnique({ where: { id }, select: { customFields: true } });
      if (!row) throw new NotFoundException("Lead not found");
      const customFields = await this.crm.customFields("LEAD", values, row.customFields);
      await this.prisma.lead.update({ where: { id }, data: { customFields } });
      await this.crm.rescore(id);
      return { customFields };
    }
    if (entity === "customer") {
      this.access(req.user, "customer", "edit");
      const row = await this.prisma.customer.findUnique({ where: { id }, select: { customFields: true } });
      if (!row) throw new NotFoundException("Customer not found");
      const customFields = await this.crm.customFields("CUSTOMER", values, row.customFields);
      await this.prisma.customer.update({ where: { id }, data: { customFields } });
      return { customFields };
    }
    if (entity === "project") {
      this.access(req.user, "project", "edit");
      const row = await this.prisma.project.findUnique({ where: { id }, select: { customFields: true } });
      if (!row) throw new NotFoundException("Project not found");
      const customFields = await this.crm.customFields("PROJECT", values, row.customFields);
      await this.prisma.project.update({ where: { id }, data: { customFields } });
      return { customFields };
    }
    throw new BadRequestException("Custom fields exist for leads, customers and projects");
  }

  // ---------------------------------------------------------------- scoring & assignment rules

  @Get("crm/scoring-rules")
  @RequirePermissions("leads.view")
  scoringRules() {
    return this.prisma.leadScoringRule.findMany({ orderBy: { createdAt: "asc" } });
  }

  @Post("crm/scoring-rules")
  @RequirePermissions("leads.override")
  async createScoringRule(@Body() body: unknown, @Req() req: ReqUser) {
    const row = await this.prisma.leadScoringRule.create({ data: parseBody(scoringRuleSchema, body) });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "lead_scoring_rule", entityId: row.id, after: row, ip: req.ip });
    return row;
  }

  @Patch("crm/scoring-rules/:id")
  @RequirePermissions("leads.override")
  async updateScoringRule(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const row = await this.prisma.leadScoringRule.update({ where: { id }, data: parseBody(scoringRuleSchema.partial(), body) });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "lead_scoring_rule", entityId: id, after: row, ip: req.ip });
    return row;
  }

  /** Recomputes every open lead after the rules change. */
  @Post("crm/scoring-rules/rescore")
  @RequirePermissions("leads.override")
  async rescoreAll() {
    const leads = await this.prisma.lead.findMany({ where: { status: OPEN_LEAD, mergedIntoId: null }, select: { id: true } });
    for (const lead of leads) await this.crm.rescore(lead.id);
    return { rescored: leads.length };
  }

  @Get("crm/assignment-rules")
  @RequirePermissions("leads.assign")
  assignmentRules() {
    return this.prisma.assignmentRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] });
  }

  @Post("crm/assignment-rules")
  @RequirePermissions("leads.assign", "leads.override")
  async createAssignmentRule(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(assignmentRuleSchema, body);
    await this.assertStaffUsers(input.userIds);
    const row = await this.prisma.assignmentRule.create({ data: { ...input, condition: input.condition as Prisma.InputJsonValue } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "assignment_rule", entityId: row.id, after: row, ip: req.ip });
    return row;
  }

  @Patch("crm/assignment-rules/:id")
  @RequirePermissions("leads.assign", "leads.override")
  async updateAssignmentRule(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(assignmentRuleSchema.partial(), body);
    if (input.userIds) await this.assertStaffUsers(input.userIds);
    const row = await this.prisma.assignmentRule.update({ where: { id }, data: { ...input, condition: input.condition as Prisma.InputJsonValue | undefined } });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "assignment_rule", entityId: id, after: row, ip: req.ip });
    return row;
  }

  private async assertStaffUsers(ids: string[]) {
    const count = await this.prisma.user.count({ where: { id: { in: ids }, active: true, kind: "STAFF" } });
    if (count !== new Set(ids).size) throw new BadRequestException("Every assignee must be an active staff user");
  }

  // ---------------------------------------------------------------- email

  @Get("crm/email-templates")
  @RequirePermissions("leads.view")
  templates() {
    return this.prisma.emailTemplate.findMany({ orderBy: { name: "asc" } });
  }

  @Post("crm/email-templates")
  @RequirePermissions("leads.override")
  async createTemplate(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(emailTemplateSchema, body);
    const row = await this.prisma.emailTemplate.create({ data: input }).catch((error: { code?: string }) => {
      if (error.code === "P2002") throw new BadRequestException(`Template key ${input.key} is taken`);
      throw error;
    });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "email_template", entityId: row.id, after: row, ip: req.ip });
    return row;
  }

  @Patch("crm/email-templates/:id")
  @RequirePermissions("leads.override")
  async updateTemplate(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const row = await this.prisma.emailTemplate.update({ where: { id }, data: parseBody(emailTemplateSchema.partial().omit({ key: true }), body) });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "email_template", entityId: id, after: row, ip: req.ip });
    return row;
  }

  @Post("crm/email/preview")
  async previewEmail(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(sendEmailSchema, body);
    this.access(req.user, input.entityType, "view");
    return this.composeEmail(input);
  }

  @Post("crm/email/send")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async sendEmail(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(sendEmailSchema, body);
    const entityType = this.access(req.user, input.entityType, "edit");
    await this.crm.entityExists(entityType, input.entityId);
    const { subject, text } = await this.composeEmail(input);
    const messageId = await this.crm.sendMail({ to: input.to, subject, text, replyTo: req.user.email });
    const row = await this.prisma.activity.create({
      data: { type: "EMAIL", direction: "OUT", status: "DONE", completedAt: new Date(), subject, body: text, entityType, entityId: input.entityId, contactEmail: input.to, externalId: messageId || undefined, ownerId: req.user.id, createdById: req.user.id },
    });
    return toPlain(row);
  }

  private async composeEmail(input: { entityType: Entity; entityId: string; subject?: string; body?: string; templateKey?: string }) {
    const context = (await this.crm.templateContext(input.entityType, input.entityId)) || {};
    if (input.templateKey) {
      const template = await this.prisma.emailTemplate.findUnique({ where: { key: input.templateKey } });
      if (!template || !template.active) throw new NotFoundException("Template not found");
      return { subject: renderTemplate(input.subject || template.subject, context), text: renderTemplate(input.body || template.body, context) };
    }
    if (!input.subject || !input.body) throw new BadRequestException("Subject and body are required without a template");
    return { subject: renderTemplate(input.subject, context), text: renderTemplate(input.body, context) };
  }

  @Get("crm/sequences")
  @RequirePermissions("leads.view")
  sequences() {
    return this.prisma.sequence.findMany({ orderBy: { createdAt: "asc" }, include: { _count: { select: { enrollments: true } } } });
  }

  @Post("crm/sequences")
  @RequirePermissions("leads.override")
  async createSequence(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(sequenceSchema, body);
    await this.assertTemplates(input.steps.map((step) => step.templateKey));
    const row = await this.prisma.sequence.create({ data: { ...input, steps: input.steps.sort((a, b) => a.dayOffset - b.dayOffset) } });
    await this.audit.log({ actorId: req.user.id, action: "create", entityType: "sequence", entityId: row.id, after: row, ip: req.ip });
    return row;
  }

  @Patch("crm/sequences/:id")
  @RequirePermissions("leads.override")
  async updateSequence(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(sequenceSchema.partial(), body);
    if (input.steps) await this.assertTemplates(input.steps.map((step) => step.templateKey));
    const row = await this.prisma.sequence.update({ where: { id }, data: { ...input, steps: input.steps?.sort((a, b) => a.dayOffset - b.dayOffset) } });
    await this.audit.log({ actorId: req.user.id, action: "update", entityType: "sequence", entityId: id, after: row, ip: req.ip });
    return row;
  }

  private async assertTemplates(keys: string[]) {
    const found = await this.prisma.emailTemplate.count({ where: { key: { in: keys } } });
    if (found !== new Set(keys).size) throw new BadRequestException("Every step needs an existing email template");
  }

  @Post("crm/sequences/enroll")
  async enroll(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(enrollSchema, body);
    this.access(req.user, input.entityType, "edit");
    await this.crm.entityExists(input.entityType, input.entityId);
    const row = await this.crm.enroll(input.sequenceId, input.entityType, input.entityId, input.email, req.user.id).catch((error: { code?: string }) => {
      if (error.code === "P2002") throw new BadRequestException("Already enrolled in this sequence");
      throw error;
    });
    return toPlain(row);
  }

  @Post("crm/sequences/enrollments/:id/stop")
  async stopEnrollment(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.sequenceEnrollment.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Enrollment not found");
    this.access(req.user, row.entityType, "edit");
    return toPlain(await this.prisma.sequenceEnrollment.update({ where: { id }, data: { status: "STOPPED", nextRunAt: null, lastError: `Stopped by ${req.user.name}` } }));
  }

  @Get("crm/sequences/enrollments")
  async enrollments(@Req() req: ReqUser, @Query("entityType") entityType: string, @Query("entityId") entityId: string) {
    this.access(req.user, entityType, "view");
    return toPlain(await this.prisma.sequenceEnrollment.findMany({ where: { entityType, entityId }, include: { sequence: { select: { name: true, steps: true } } }, orderBy: { createdAt: "desc" } }));
  }

  /**
   * Inbound mail from SendGrid Inbound Parse / Mailgun routes (multipart) or Postmark (JSON).
   * Replies are filed against the matching record; unknown senders become EMAIL leads.
   */
  @Public()
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @Post("public/crm/inbound-email")
  @UseInterceptors(AnyFilesInterceptor({ limits: { files: 20, fileSize: 10 * 1024 * 1024, fieldSize: 2 * 1024 * 1024 } }))
  async inboundEmail(@Body() raw: Record<string, unknown>, @Query("key") key: string | undefined, @Headers("x-inbound-key") headerKey: string | undefined) {
    if (!env.INBOUND_EMAIL_SECRET) throw new NotFoundException();
    const supplied = headerKey || key || "";
    if (!safeEqual(supplied, env.INBOUND_EMAIL_SECRET)) throw new ForbiddenException("Invalid inbound key");
    const input = parseBody(inboundEmailSchema, {
      from: raw.from ?? raw.From ?? raw.sender ?? "",
      to: raw.to ?? raw.To ?? raw.recipient,
      subject: raw.subject ?? raw.Subject ?? "",
      text: raw.text ?? raw.TextBody ?? raw["body-plain"] ?? raw["stripped-text"] ?? "",
      messageId: raw.MessageID ?? raw["Message-Id"] ?? raw["message-id"] ?? undefined,
    });
    const from = addressOf(input.from);
    if (!from) throw new BadRequestException("Sender address missing");
    const messageId = input.messageId ? `mail:${input.messageId}` : undefined;
    if (messageId && (await this.prisma.activity.findUnique({ where: { externalId: messageId }, select: { id: true } }))) return { ok: true, duplicate: true };
    let target = await this.crm.resolveContact({ email: from, subject: input.subject });
    if (!target) target = await this.leadFromMessage("EMAIL", { email: from, name: input.from.replace(/<[^>]+>/, "").replace(/"/g, "").trim() || from, message: `${input.subject}\n\n${input.text}`.slice(0, 5000) });
    await this.prisma.activity.create({
      data: { type: "EMAIL", direction: "IN", status: "DONE", completedAt: new Date(), subject: input.subject.slice(0, 200) || "(no subject)", body: input.text.slice(0, 20_000), entityType: target.entityType, entityId: target.entityId, contactEmail: from, externalId: messageId, ownerId: target.ownerId },
    });
    if (target.ownerId) await this.notify.push([target.ownerId], `Email from ${from}`, input.subject.slice(0, 200), target.entityType, target.entityId);
    return { ok: true, entityType: target.entityType, entityId: target.entityId };
  }

  private async leadFromMessage(source: "EMAIL" | "WHATSAPP", input: { email?: string; phone?: string; name: string; message: string }) {
    const lead = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("LEAD", tx);
      const company = input.email ? input.email.split("@")[1] : input.name;
      return tx.lead.create({ data: { number, source, status: "NEW", contactName: input.name.slice(0, 120), companyName: company.slice(0, 200), email: input.email, phone: input.phone, message: input.message } });
    });
    await this.crm.onLeadCreated(lead.id, true);
    const fresh = await this.prisma.lead.findUnique({ where: { id: lead.id }, select: { ownerId: true } });
    if (!fresh?.ownerId) {
      const sales = await this.notify.usersWithRole("sales_head");
      await this.notify.push(sales.map((user) => user.id), `New ${source.toLowerCase()} lead`, `${lead.number} from ${input.email || input.phone}`, "lead", lead.id);
    }
    return { entityType: "lead" as const, entityId: lead.id, ownerId: fresh?.ownerId ?? null };
  }

  // ---------------------------------------------------------------- WhatsApp

  @Post("crm/whatsapp/send")
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  async sendWhatsApp(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(whatsappSendSchema, body);
    const entityType = this.access(req.user, input.entityType, "edit");
    await this.crm.entityExists(entityType, input.entityId);
    const id = await this.crm.sendWhatsApp(input.to, input.body);
    const row = await this.prisma.activity.create({
      data: { type: "WHATSAPP", direction: "OUT", status: "DONE", completedAt: new Date(), subject: input.body.slice(0, 120), body: input.body, entityType, entityId: input.entityId, contactPhone: input.to, externalId: id ? `wa:${id}` : undefined, ownerId: req.user.id, createdById: req.user.id },
    });
    return toPlain(row);
  }

  @Get("crm/channels")
  channels(@Req() req: ReqUser) {
    assertStaff(req.user);
    return { email: this.crm.mailEnabled(), whatsapp: this.crm.whatsappEnabled(), inboundEmail: Boolean(env.INBOUND_EMAIL_SECRET) };
  }

  /** Meta webhook verification handshake. */
  @Public()
  @Get("public/whatsapp/webhook")
  verifyWhatsApp(@Query("hub.mode") mode: string, @Query("hub.verify_token") token: string, @Query("hub.challenge") challenge: string) {
    if (!env.WHATSAPP_VERIFY_TOKEN || mode !== "subscribe" || !safeEqual(token || "", env.WHATSAPP_VERIFY_TOKEN)) throw new ForbiddenException();
    return challenge;
  }

  @Public()
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @Post("public/whatsapp/webhook")
  async whatsAppWebhook(@Body() body: WhatsAppPayload, @Headers("x-hub-signature-256") signature: string | undefined, @Req() req: RawReq) {
    if (!env.WHATSAPP_APP_SECRET) throw new NotFoundException();
    const expected = `sha256=${createHmac("sha256", env.WHATSAPP_APP_SECRET).update(req.rawBody || Buffer.alloc(0)).digest("hex")}`;
    if (!req.rawBody || !signature || !safeEqual(signature, expected)) throw new ForbiddenException("Invalid signature");
    let stored = 0;
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const message of value.messages || []) {
          const externalId = `wa:${message.id}`;
          if (await this.prisma.activity.findUnique({ where: { externalId }, select: { id: true } })) continue;
          const name = value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name || message.from;
          const text = message.text?.body || message.button?.text || message.interactive?.button_reply?.title || `[${message.type} message]`;
          let target = await this.crm.resolveContact({ phone: message.from });
          if (!target) target = await this.leadFromMessage("WHATSAPP", { phone: `+${message.from}`, name, message: text });
          await this.prisma.activity
            .create({ data: { type: "WHATSAPP", direction: "IN", status: "DONE", completedAt: new Date(Number(message.timestamp) * 1000 || Date.now()), subject: text.slice(0, 120), body: text, entityType: target.entityType, entityId: target.entityId, contactPhone: `+${message.from}`, externalId, ownerId: target.ownerId } })
            .catch((error: { code?: string }) => {
              if (error.code !== "P2002") throw error;
            });
          if (target.ownerId) await this.notify.push([target.ownerId], `WhatsApp from ${name}`, text.slice(0, 200), target.entityType, target.entityId);
          stored += 1;
        }
      }
    }
    return { ok: true, stored };
  }
}

type WhatsAppPayload = {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id: string; profile?: { name?: string } }>;
        messages?: Array<{ id: string; from: string; timestamp: string; type: string; text?: { body: string }; button?: { text: string }; interactive?: { button_reply?: { title: string } } }>;
      };
    }>;
  }>;
};
