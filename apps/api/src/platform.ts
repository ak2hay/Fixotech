import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  Get,
  Injectable,
  NotFoundException,
  Param,
  Post,
  Query,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import { createHash, randomBytes, randomUUID } from "crypto";
import type { Response } from "express";
import { rm } from "fs/promises";
import { tmpdir } from "os";
import { z } from "zod";
import { approvalRuleSchema, matchesCondition } from "@fixotec/shared";
import { recordDownload, streamBundle, streamFile } from "./documents";
import { env } from "./env";
import { AuthUser, Public, RequirePermissions, assertCan, assertStaff, clientIp, isExternal, pageOf, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { documentAudience, documentScope } from "./scope";
import { AuditService, NotifyService, StorageService, Tx, WorkflowService, contentDisposition } from "./services";
import { CAD_CATEGORIES, DOCUMENT_KINDS, DiskUpload, HEAD_BYTES, MB, Upload, inspectDiskUpload, inspectHead, inspectName, inspectUpload, uploadLimits } from "./uploads";
import type { Prisma } from "@fixotec/db";

type ReqUser = { user: AuthUser; ip?: string };

const ELEVATED = new Set(["super_admin", "managing_director", "ceo"]);
const DOCUMENT_MAX_BYTES = 25 * MB;
/** CAD and BIM models (Revit projects, Navisworks) are routinely hundreds of MB. */
const CAD_MAX_BYTES = env.CAD_MAX_MB * MB;
/** Revisions a portal user may see; drafts and internal reviews stay inside Fixotec. */
const PORTAL_VERSION_STATUSES = ["APPROVED", "CLIENT_REVIEW"];
const DOCUMENT_ENTITIES = ["project", "rfq", "quotation", "sales_order", "engineering", "product", "variant", "customer", "boq", "submittal"] as const;
const AUDIENCES = ["PUBLIC", "CUSTOMER", "DISTRIBUTOR", "DEALER", "CONSULTANT", "CONTRACTOR"] as const;

const csvList = (allowed: readonly string[]) =>
  z
    .union([z.string().max(500), z.array(z.string().max(40)).max(10)])
    .optional()
    .transform((value) => (Array.isArray(value) ? value : (value || "").split(",")).map((item) => item.trim().toUpperCase()).filter(Boolean))
    .refine((items) => items.every((item) => allowed.includes(item)), { message: `Audiences must be among ${allowed.join(", ")}` })
    .transform((items) => [...new Set(items)]);

const documentUploadSchema = z.object({
  title: z.string().trim().max(200).optional(),
  category: z.string().trim().toUpperCase().regex(/^[A-Z_]{2,40}$/).optional(),
  entityType: z.enum(DOCUMENT_ENTITIES).optional(),
  entityId: z.string().trim().max(64).optional(),
  audiences: csvList(AUDIENCES),
  notes: z.string().trim().max(2000).optional(),
});
const versionUploadSchema = z.object({ notes: z.string().trim().max(2000).optional() });
/** Large and presigned uploads can create a document or add a version to one (`documentId`). */
const targetUploadSchema = documentUploadSchema.extend({ documentId: z.string().trim().max(64).optional() });
const presignSchema = targetUploadSchema.extend({ fileName: z.string().trim().min(1).max(255), size: z.coerce.number().int().positive() });
const completeSchema = z.object({ ticket: z.string().min(20).max(8000) }).strict();
const bundleSchema = z.object({
  entityType: z.enum(DOCUMENT_ENTITIES),
  entityId: z.string().trim().min(1).max(64),
  categories: z
    .string()
    .max(200)
    .optional()
    .transform((value) => (value || "").split(",").map((item) => item.trim().toUpperCase()).filter((item) => /^[A-Z_]{2,40}$/.test(item))),
});

type UploadTarget = z.infer<typeof targetUploadSchema>;
type StoredFile = { key: string; fileName: string; mimeType: string; sizeBytes: number; thumbnailKey: string | null };
type UploadTicket = { purpose: "upload"; uid: string; key: string; size: number; fileName: string; target: UploadTarget };
const versionStatusSchema = z.object({ status: z.enum(["DRAFT", "INTERNAL_REVIEW", "CLIENT_REVIEW", "APPROVED"]).default("APPROVED") }).strict();
const shareSchema = z.object({ version: z.coerce.number().int().min(1).optional(), days: z.coerce.number().int().min(1).max(30).default(7) }).strict();
const decisionSchema = z.object({ decision: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(2000).optional() }).strict();

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Files are served as downloads with a locked-down CSP so an uploaded file can never run script on the API origin. */
function sendFile(res: Response, bytes: Buffer, mimeType: string, fileName: string, disposition: "attachment" | "inline") {
  res.setHeader("Content-Type", mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", contentDisposition(fileName, disposition));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  res.send(bytes);
}

/** Raster uploads are their own preview; other formats fall back to an icon on the client. */
function thumbnailFor(mimeType: string | undefined, key: string) {
  return mimeType && /^image\/(png|jpeg|webp|gif)$/.test(mimeType) ? key : null;
}

@Injectable()
export class ApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly notify: NotifyService,
    private readonly audit: AuditService,
  ) {}

  /** Opens an approval request when a rule matches. Notifications are sent after the caller's transaction commits. */
  async open(input: { entityType: string; entityId: string; context: Record<string, number>; requesterId?: string; snapshot?: unknown }, tx?: Tx) {
    const db = tx || this.prisma;
    const rules = await db.approvalRule.findMany({ where: { entityType: input.entityType, active: true }, orderBy: { priority: "asc" } });
    const rule = rules.find((item) => matchesCondition(item.condition, input.context));
    if (!rule) return null;
    const pending = await db.approvalRequest.findFirst({ where: { entityType: input.entityType, entityId: input.entityId, status: "PENDING" } });
    if (pending) return pending;
    const request = await db.approvalRequest.create({
      data: {
        entityType: input.entityType,
        entityId: input.entityId,
        ruleId: rule.id,
        requesterId: input.requesterId,
        approverRole: rule.approverRole,
        snapshot: input.snapshot as Prisma.InputJsonValue | undefined,
      },
    });
    const announce = async () => {
      const approvers = await this.notify.usersWithRole(rule.approverRole);
      await this.notify.push(
        approvers.map((user) => user.id).filter((id) => id !== input.requesterId),
        `${rule.name}`,
        `${input.entityType} is waiting for ${rule.approverRole.replaceAll("_", " ")}`,
        input.entityType.toLowerCase(),
        input.entityId,
      );
    };
    if (tx) setImmediate(() => void announce().catch(() => undefined));
    else await announce();
    return request;
  }

  async decide(id: string, decision: "APPROVED" | "REJECTED", note: string, user: AuthUser, ip: string) {
    const request = await this.prisma.approvalRequest.findUnique({ where: { id } });
    if (!request || request.status !== "PENDING") throw new BadRequestException("Approval is no longer pending");
    if (request.requesterId === user.id) throw new ForbiddenException("You cannot approve your own request");
    const elevated = user.roleKeys.some((role) => ELEVATED.has(role));
    if (!elevated && !user.roleKeys.includes(request.approverRole)) {
      throw new ForbiddenException(`This step belongs to ${request.approverRole}`);
    }
    const next = decision === "APPROVED" ? "APPROVED" : "REJECTED";
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.approvalRequest.updateMany({
        where: { id, status: "PENDING" },
        data: { status: decision, decidedById: user.id, decisionNote: note, decidedAt: new Date() },
      });
      if (!claimed.count) throw new BadRequestException("Approval is no longer pending");
      if (request.entityType === "QUOTATION") {
        const quote = await tx.quotation.findUnique({ where: { id: request.entityId } });
        if (quote && ["SUBMITTED", "UNDER_REVIEW"].includes(quote.status)) {
          const moved = await tx.quotation.updateMany({ where: { id: quote.id, status: quote.status }, data: { status: next, version: { increment: 1 } } });
          if (moved.count) await this.workflow.record("quotation", quote.id, quote.status, next, user.id, note, tx);
        }
      }
      if (request.entityType === "PURCHASE") {
        const moved = await tx.purchaseOrder.updateMany({ where: { id: request.entityId, status: "SUBMITTED" }, data: { status: next } });
        if (moved.count) await this.workflow.record("purchase_order", request.entityId, "SUBMITTED", next, user.id, note, tx);
      }
      if (request.entityType === "ENGINEERING") {
        const moved = await tx.engineeringRequest.updateMany({ where: { id: request.entityId, status: "CLIENT_APPROVAL" }, data: { status: next } });
        if (moved.count) await this.workflow.record("engineering", request.entityId, "CLIENT_APPROVAL", next, user.id, note, tx);
      }
      await this.audit.log({ actorId: user.id, action: "decide", entityType: "approval", entityId: id, before: { status: "PENDING" }, after: { status: decision, note }, ip }, tx);
      return tx.approvalRequest.findUniqueOrThrow({ where: { id } });
    });
    if (request.requesterId) {
      await this.notify.push([request.requesterId], `Approval ${decision.toLowerCase()}`, note || `${request.entityType} was ${decision.toLowerCase()}`, request.entityType.toLowerCase(), request.entityId);
    }
    return updated;
  }

  async scanAlerts() {
    const low = await this.prisma.$queryRaw<Array<{ id: string; name: string; qty: unknown; safety: unknown }>>`
      SELECT v.id, v.name, COALESCE(SUM(b.qty), 0) AS qty, v."safetyStock" AS safety
      FROM "ProductVariant" v
      LEFT JOIN "InventoryBalance" b ON b."variantId" = v.id
      GROUP BY v.id, v.name, v."safetyStock"
      HAVING COALESCE(SUM(b.qty), 0) < v."safetyStock"
    `;
    const managers = await this.notify.usersWithRole("warehouse_manager");
    if (low.length) {
      await this.notify.push(managers.map((user) => user.id), "Stock below safety", `${low.length} articles are below safety stock.`);
    }
    const overdue = await this.prisma.invoice.findMany({
      where: { status: { in: ["ISSUED", "PARTIAL"] }, dueDate: { lt: new Date() } },
      include: { customer: true },
      take: 20,
    });
    const finance = await this.notify.usersWithRole("finance_head");
    if (overdue.length) {
      await this.notify.push(finance.map((user) => user.id), "Customer payments overdue", `${overdue.length} invoices are past due.`);
    }
    const delayed = await this.prisma.project.findMany({
      where: { expectedCompletion: { lt: new Date() }, stage: { notIn: ["CLOSED", "LOST"] } },
    });
    const pms = await this.notify.usersWithRole("project_manager");
    if (delayed.length) {
      await this.notify.push(pms.map((user) => user.id), "Project milestone delayed", `${delayed.length} projects are past the expected completion.`);
    }
    return { lowStock: low.length, overdue: overdue.length, delayed: delayed.length };
  }
}

@Controller()
export class PlatformController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly notify: NotifyService,
    private readonly approvals: ApprovalService,
    private readonly jwt: JwtService,
  ) {}

  @Get("audit")
  @RequirePermissions("audit.view")
  async auditLog(@Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    const where = page.q ? { OR: [{ action: { contains: page.q, mode: "insensitive" as const } }, { entityType: { contains: page.q, mode: "insensitive" as const } }] } : {};
    const [items, total] = await Promise.all([
      this.prisma.auditLog.findMany({ where, skip: page.skip, take: page.pageSize, orderBy: { createdAt: "desc" } }),
      this.prisma.auditLog.count({ where }),
    ]);
    return { items, total, page: page.page, pageSize: page.pageSize };
  }

  @Get("notifications")
  async notifications(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const unread = query.unread === "1";
    const items = await this.prisma.notification.findMany({
      where: { userId: req.user.id, readAt: unread ? null : undefined },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    const unreadCount = await this.prisma.notification.count({ where: { userId: req.user.id, readAt: null } });
    return { items, unreadCount };
  }

  @Post("notifications/:id/read")
  async read(@Param("id") id: string, @Req() req: ReqUser) {
    await this.prisma.notification.updateMany({ where: { id, userId: req.user.id }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post("notifications/read-all")
  async readAll(@Req() req: ReqUser) {
    await this.prisma.notification.updateMany({ where: { userId: req.user.id, readAt: null }, data: { readAt: new Date() } });
    return { ok: true };
  }

  @Post("notifications/scan")
  @RequirePermissions("notifications.edit")
  async scan() {
    return this.approvals.scanAlerts();
  }

  @Get("documents")
  @RequirePermissions("documents.view")
  async documents(@Req() req: ReqUser, @Query() query: Record<string, string>) {
    const external = isExternal(req.user);
    const audience = documentAudience(req.user);
    const items = await this.prisma.document.findMany({
      where: {
        AND: [await documentScope(this.prisma, req.user)],
        entityType: query.entityType ? String(query.entityType).slice(0, 40) : undefined,
        entityId: query.entityId ? String(query.entityId).slice(0, 64) : undefined,
        category: query.category ? String(query.category).slice(0, 40) : undefined,
        audiences: audience.length ? { hasSome: audience } : undefined,
        title: query.q ? { contains: String(query.q).slice(0, 100), mode: "insensitive" } : undefined,
        versions: external ? { some: { status: { in: PORTAL_VERSION_STATUSES } } } : undefined,
      },
      include: { versions: { where: external ? { status: { in: PORTAL_VERSION_STATUSES } } : undefined, orderBy: { version: "desc" }, omit: { storageKey: true } } },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });
    return { items };
  }

  @Post("documents")
  @RequirePermissions("documents.create")
  @UseInterceptors(FileInterceptor("file", uploadLimits(DOCUMENT_MAX_BYTES)))
  async upload(@UploadedFile() file: Upload, @Body() raw: unknown, @Req() req: ReqUser) {
    const body = parseBody(documentUploadSchema, raw);
    const checked = await inspectUpload(file, DOCUMENT_KINDS, DOCUMENT_MAX_BYTES);
    await this.prepareTarget(body);
    const key = this.keyFor(body, checked.fileName);
    await this.storage.put(key, file.buffer, checked.mimeType);
    return this.saveUpload(body, { key, fileName: checked.fileName, mimeType: checked.mimeType, sizeBytes: file.size, thumbnailKey: thumbnailFor(checked.mimeType, key) }, req);
  }

  @Post("documents/:id/versions")
  @RequirePermissions("documents.create")
  @UseInterceptors(FileInterceptor("file", uploadLimits(DOCUMENT_MAX_BYTES)))
  async newVersion(@Param("id") id: string, @UploadedFile() file: Upload, @Body() raw: unknown, @Req() req: ReqUser) {
    const body = { ...parseBody(versionUploadSchema, raw ?? {}), documentId: id, audiences: [] };
    await this.prepareTarget(body);
    const checked = await inspectUpload(file, DOCUMENT_KINDS, DOCUMENT_MAX_BYTES);
    const key = this.keyFor(body, checked.fileName);
    await this.storage.put(key, file.buffer, checked.mimeType);
    return this.saveUpload(body, { key, fileName: checked.fileName, mimeType: checked.mimeType, sizeBytes: file.size, thumbnailKey: thumbnailFor(checked.mimeType, key) }, req);
  }

  /** Large CAD/BIM files on local storage: streamed to a temp file, never held in memory. */
  @Post("documents/large")
  @RequirePermissions("documents.create")
  @UseInterceptors(FileInterceptor("file", { dest: tmpdir(), ...uploadLimits(CAD_MAX_BYTES) }))
  async uploadLarge(@UploadedFile() file: DiskUpload, @Body() raw: unknown, @Req() req: ReqUser) {
    try {
      const body = parseBody(targetUploadSchema, raw);
      const category = await this.prepareTarget(body);
      const checked = await inspectDiskUpload(file, DOCUMENT_KINDS, this.maxBytesFor(category));
      const key = this.keyFor(body, checked.fileName);
      await this.storage.putFile(key, file.path, file.size, checked.mimeType);
      return await this.saveUpload(body, { key, fileName: checked.fileName, mimeType: checked.mimeType, sizeBytes: file.size, thumbnailKey: null }, req);
    } finally {
      if (file?.path) await rm(file.path, { force: true });
    }
  }

  /**
   * Step 1 of a direct-to-bucket upload. With S3 storage the browser PUTs the file to the returned URL and then
   * calls /documents/uploads/complete; with local storage the client is told to use /documents/large instead.
   */
  @Post("documents/uploads/presign")
  @RequirePermissions("documents.create")
  async presignUpload(@Body() raw: unknown, @Req() req: ReqUser) {
    const input = parseBody(presignSchema, raw);
    const { fileName: originalName, size, ...target } = input;
    const category = await this.prepareTarget(target);
    const named = inspectName(originalName, size, DOCUMENT_KINDS, this.maxBytesFor(category));
    const key = this.keyFor(target, named.fileName);
    const url = await this.storage.presignPut(key, named.mimeType, size);
    if (!url) return { mode: "multipart" as const, path: "/documents/large", maxBytes: this.maxBytesFor(category) };
    const ticket: UploadTicket = { purpose: "upload", uid: req.user.id, key, size, fileName: named.fileName, target };
    return { mode: "s3" as const, url, headers: { "Content-Type": named.mimeType }, ticket: await this.jwt.signAsync(ticket, { expiresIn: "2h" }) };
  }

  /** Step 2: the object is checked (size and file signature) before it becomes a document; a bad file is deleted. */
  @Post("documents/uploads/complete")
  @RequirePermissions("documents.create")
  async completeUpload(@Body() raw: unknown, @Req() req: ReqUser) {
    const { ticket } = parseBody(completeSchema, raw);
    const claim = await this.jwt.verifyAsync<UploadTicket>(ticket).catch(() => null);
    if (!claim || claim.purpose !== "upload" || claim.uid !== req.user.id) throw new BadRequestException("The upload ticket is invalid or has expired");
    const existing = await this.prisma.documentVersion.findFirst({ where: { storageKey: claim.key }, select: { documentId: true } });
    if (existing) return this.prisma.document.findUniqueOrThrow({ where: { id: existing.documentId }, include: { versions: { omit: { storageKey: true } } } });
    const category = await this.prepareTarget(claim.target);
    const { size, head } = await this.storage.head(claim.key, HEAD_BYTES);
    let checked: Awaited<ReturnType<typeof inspectHead>>;
    try {
      if (size !== claim.size) throw new BadRequestException("The uploaded file size does not match");
      checked = await inspectHead(head, claim.fileName, size, DOCUMENT_KINDS, this.maxBytesFor(category));
    } catch (error) {
      await this.storage.remove(claim.key);
      throw error;
    }
    return this.saveUpload(claim.target, { key: claim.key, fileName: checked.fileName, mimeType: checked.mimeType, sizeBytes: size, thumbnailKey: thumbnailFor(checked.mimeType, claim.key) }, req);
  }

  /** Zip of every file the caller may see on a record; for a product this includes the per-variant files. */
  @Get("documents/bundle")
  @RequirePermissions("documents.download")
  async bundle(@Query() query: Record<string, string>, @Req() req: ReqUser, @Res() res: Response) {
    const input = parseBody(bundleSchema, query);
    const external = isExternal(req.user);
    const audience = documentAudience(req.user);
    const targets: Prisma.DocumentWhereInput[] = [{ entityType: input.entityType, entityId: input.entityId }];
    let label = `${input.entityType}-${input.entityId}`;
    if (input.entityType === "product") {
      const product = await this.prisma.product.findUnique({ where: { id: input.entityId }, select: { sku: true, variants: { select: { id: true } } } });
      if (!product) throw new NotFoundException("Product not found");
      label = product.sku;
      if (product.variants.length) targets.push({ entityType: "variant", entityId: { in: product.variants.map((variant) => variant.id) } });
    }
    const documents = await this.prisma.document.findMany({
      where: {
        AND: [await documentScope(this.prisma, req.user), { OR: targets }],
        category: input.categories.length ? { in: input.categories } : undefined,
        audiences: audience.length ? { hasSome: audience } : undefined,
      },
      include: { versions: { where: external ? { status: { in: PORTAL_VERSION_STATUSES } } : undefined, orderBy: { version: "desc" }, take: 1 } },
      orderBy: { title: "asc" },
    });
    const files = documents
      .filter((document) => document.versions.length)
      .map((document) => ({ ...document.versions[0], category: document.category }));
    await streamBundle(res, this.storage, files, `${label}${input.categories.length ? `-${input.categories.join("-")}` : ""}.zip`);
    const channel = external ? "PORTAL" : "BUNDLE";
    for (const file of files) await recordDownload(this.prisma, { documentId: file.documentId, version: file.version, channel, userId: req.user.id, ip: clientIp(req) });
  }

  /** Who downloaded a file, per channel, for the last 90 days. */
  @Get("documents/:id/downloads")
  @RequirePermissions("documents.view")
  async downloads(@Param("id") id: string, @Req() req: ReqUser) {
    assertStaff(req.user);
    const since = new Date(Date.now() - 90 * 86_400_000);
    const [byChannel, recent, total] = await Promise.all([
      this.prisma.documentDownload.groupBy({ by: ["channel"], where: { documentId: id, createdAt: { gte: since } }, _count: { _all: true } }),
      this.prisma.documentDownload.findMany({ where: { documentId: id }, orderBy: { createdAt: "desc" }, take: 50 }),
      this.prisma.documentDownload.count({ where: { documentId: id } }),
    ]);
    const leadIds = [...new Set(recent.map((row) => row.leadId).filter((value): value is string => Boolean(value)))];
    const userIds = [...new Set(recent.map((row) => row.userId).filter((value): value is string => Boolean(value)))];
    const [leads, users] = await Promise.all([
      leadIds.length ? this.prisma.lead.findMany({ where: { id: { in: leadIds } }, select: { id: true, number: true, companyName: true, contactName: true } }) : [],
      userIds.length ? this.prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : [],
    ]);
    const leadById = new Map(leads.map((row) => [row.id, row]));
    const userById = new Map(users.map((row) => [row.id, row.name]));
    return {
      total,
      last90Days: Object.fromEntries(byChannel.map((row) => [row.channel, row._count._all])),
      recent: recent.map((row) => ({ ...row, user: row.userId ? userById.get(row.userId) || null : null, lead: row.leadId ? leadById.get(row.leadId) || null : null })),
    };
  }

  @Post("documents/:id/versions/:version/status")
  @RequirePermissions("documents.approve")
  async versionStatus(@Param("id") id: string, @Param("version") version: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const body = parseBody(versionStatusSchema, raw ?? {});
    const number = Number(version);
    if (!Number.isInteger(number) || number < 1) throw new BadRequestException("Invalid version");
    const row = await this.prisma.documentVersion.findUnique({ where: { documentId_version: { documentId: id, version: number } } });
    if (!row) throw new NotFoundException("Version not found");
    if (row.status === "APPROVED") throw new BadRequestException("An approved revision cannot be changed. Upload a new version.");
    if (row.createdById === req.user.id && body.status === "APPROVED") throw new ForbiddenException("You cannot approve a revision you uploaded");
    const updated = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.documentVersion.updateMany({ where: { id: row.id, status: row.status }, data: { status: body.status } });
      if (!claimed.count) throw new BadRequestException("Revision changed in the meantime; reload and try again");
      await this.workflow.record("document_version", row.id, row.status, body.status, req.user.id, undefined, tx);
      await this.audit.log({ actorId: req.user.id, action: "status", entityType: "document_version", entityId: row.id, before: { status: row.status }, after: { status: body.status }, ip: String(req.ip || "") }, tx);
      return tx.documentVersion.findUniqueOrThrow({ where: { id: row.id }, omit: { storageKey: true } });
    });
    return updated;
  }

  @Get("documents/:id/download")
  @RequirePermissions("documents.download")
  async download(@Param("id") id: string, @Query("version") version: string | undefined, @Req() req: ReqUser, @Res() res: Response) {
    const document = await this.visibleDocument(id, req.user);
    const selected = version ? document.versions.find((item) => item.version === Number(version)) : document.versions[0];
    if (!selected) throw new NotFoundException("Version not found");
    await streamFile(res, this.storage, selected);
    await recordDownload(this.prisma, { documentId: id, version: selected.version, channel: isExternal(req.user) ? "PORTAL" : "ERP", userId: req.user.id, ip: clientIp(req) });
    if (isExternal(req.user)) {
      await this.audit.log({ actorId: req.user.id, action: "download", entityType: "document", entityId: id, after: { version: selected.version }, ip: String(req.ip || "") });
    }
  }

  @Get("documents/:id/thumbnail")
  @RequirePermissions("documents.view")
  async thumbnail(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    const document = await this.visibleDocument(id, req.user);
    const latest = document.versions[0];
    if (!latest?.thumbnailKey || !/^image\/(png|jpeg|webp|gif)$/.test(latest.mimeType)) throw new NotFoundException("No preview");
    const bytes = await this.storage.get(latest.thumbnailKey);
    sendFile(res, bytes, latest.mimeType, latest.fileName, "inline");
    res.setHeader("Cache-Control", "private, max-age=3600");
  }

  @Public()
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Get("documents/shared/:token")
  async shared(@Param("token") token: string, @Req() req: { ip?: string }, @Res() res: Response) {
    if (!/^[a-f0-9]{48}$/.test(token)) throw new NotFoundException("Share link not found");
    const share = await this.prisma.documentShare.findUnique({ where: { token: hashToken(token) }, include: { document: { include: { versions: true } } } });
    if (!share || share.revokedAt || share.document.deletedAt || share.expiresAt.getTime() < Date.now()) throw new NotFoundException("Share link expired or revoked");
    const version = share.document.versions.find((item) => item.id === share.documentVersionId);
    if (!version) throw new NotFoundException("File missing");
    res.setHeader("Cache-Control", "private, no-store");
    res.setHeader("Referrer-Policy", "no-referrer");
    await streamFile(res, this.storage, version);
    await recordDownload(this.prisma, { documentId: share.documentId, version: version.version, channel: "SHARE", ip: clientIp(req) });
  }

  @Post("documents/:id/share")
  @RequirePermissions("documents.share")
  async share(@Param("id") id: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const body = parseBody(shareSchema, raw ?? {});
    const version = await this.prisma.documentVersion.findFirst({
      where: { documentId: id, version: body.version, status: { in: PORTAL_VERSION_STATUSES } },
      orderBy: { version: "desc" },
    });
    if (!version) throw new BadRequestException("Only approved or client-review revisions can be shared");
    const token = randomBytes(24).toString("hex");
    const share = await this.prisma.$transaction(async (tx) => {
      const row = await tx.documentShare.create({
        data: { documentId: id, documentVersionId: version.id, token: hashToken(token), expiresAt: new Date(Date.now() + body.days * 86_400_000), createdById: req.user.id },
      });
      await this.audit.log({ actorId: req.user.id, action: "share", entityType: "document", entityId: id, after: { shareId: row.id, version: version.version, expiresAt: row.expiresAt }, ip: String(req.ip || "") }, tx);
      return row;
    });
    return { id: share.id, token, expiresAt: share.expiresAt, path: `/api/v1/documents/shared/${token}` };
  }

  @Get("documents/:id/shares")
  @RequirePermissions("documents.share")
  shares(@Param("id") id: string) {
    return this.prisma.documentShare.findMany({ where: { documentId: id }, orderBy: { createdAt: "desc" }, omit: { token: true }, take: 100 });
  }

  @Post("documents/:id/shares/:shareId/revoke")
  @RequirePermissions("documents.share")
  async revokeShare(@Param("id") id: string, @Param("shareId") shareId: string, @Req() req: ReqUser) {
    const result = await this.prisma.documentShare.updateMany({ where: { id: shareId, documentId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    if (!result.count) throw new NotFoundException("Share link not found or already revoked");
    await this.audit.log({ actorId: req.user.id, action: "revoke_share", entityType: "document", entityId: id, after: { shareId }, ip: String(req.ip || "") });
    return { ok: true };
  }

  /** Soft delete: the file and its history stay for audit; the document disappears from every listing and its share links stop working. */
  @Post("documents/:id/archive")
  @RequirePermissions("documents.delete")
  async archive(@Param("id") id: string, @Req() req: ReqUser) {
    if (isExternal(req.user)) throw new NotFoundException("Document not found");
    return this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.document.updateMany({ where: { id, deletedAt: null }, data: { deletedAt: now } });
      if (!claimed.count) throw new NotFoundException("Document not found");
      await tx.documentShare.updateMany({ where: { documentId: id, revokedAt: null }, data: { revokedAt: now } });
      await this.audit.log({ actorId: req.user.id, action: "archive", entityType: "document", entityId: id, before: { deletedAt: null }, after: { deletedAt: now }, ip: String(req.ip || "") }, tx);
      return { ok: true };
    });
  }

  /** Scope + audience + (for portal users) only released revisions. Out-of-scope reads 404. */
  private async visibleDocument(id: string, user: AuthUser) {
    const external = isExternal(user);
    const audience = documentAudience(user);
    const document = await this.prisma.document.findFirst({
      where: { AND: [{ id }, await documentScope(this.prisma, user)], audiences: audience.length ? { hasSome: audience } : undefined },
      include: { versions: { where: external ? { status: { in: PORTAL_VERSION_STATUSES } } : undefined, orderBy: { version: "desc" } } },
    });
    if (!document || !document.versions.length) throw new NotFoundException("Document not found");
    return document;
  }

  private async assertEntity(entityType: string | undefined, entityId: string | undefined) {
    if (!entityType) return;
    if (!entityId) throw new BadRequestException("Choose the record to attach the file to");
    const delegates: Record<string, { findUnique(args: { where: { id: string }; select: { id: true } }): Promise<{ id: string } | null> }> = {
      project: this.prisma.project,
      rfq: this.prisma.rfq,
      quotation: this.prisma.quotation,
      sales_order: this.prisma.salesOrder,
      engineering: this.prisma.engineeringRequest,
      product: this.prisma.product,
      variant: this.prisma.productVariant,
      customer: this.prisma.customer,
      boq: this.prisma.boq,
      submittal: this.prisma.submittal,
    };
    const row = await delegates[entityType]?.findUnique({ where: { id: entityId }, select: { id: true } });
    if (!row) throw new BadRequestException("The linked record does not exist");
  }

  /** Validates where an upload goes and returns the category that decides its size limit. */
  private async prepareTarget(target: { documentId?: string; entityType?: string; entityId?: string; category?: string }) {
    if (target.documentId) {
      const document = await this.prisma.document.findFirst({ where: { id: target.documentId, deletedAt: null }, select: { category: true } });
      if (!document) throw new NotFoundException("Document not found");
      return document.category;
    }
    await this.assertEntity(target.entityType, target.entityId);
    return target.category || "OTHER";
  }

  private maxBytesFor(category: string) {
    return CAD_CATEGORIES.includes(category) ? CAD_MAX_BYTES : DOCUMENT_MAX_BYTES;
  }

  private keyFor(target: { documentId?: string; entityType?: string }, fileName: string) {
    return target.documentId ? `documents/${target.documentId}/${randomUUID()}-${fileName}` : `${target.entityType || "library"}/${randomUUID()}-${fileName}`;
  }

  /** Creates the document (version 1) or appends a new draft version to an existing one. */
  private async saveUpload(target: UploadTarget, file: StoredFile, req: ReqUser) {
    const ip = String(req.ip || "");
    if (target.documentId) {
      const documentId = target.documentId;
      return this.prisma.$transaction(async (tx) => {
        const latest = await tx.documentVersion.findFirst({ where: { documentId }, orderBy: { version: "desc" }, select: { version: true } });
        const version = (latest?.version || 0) + 1;
        const row = await tx.documentVersion.create({
          data: { documentId, version, status: "DRAFT", fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, storageKey: file.key, thumbnailKey: file.thumbnailKey, notes: target.notes, createdById: req.user.id },
          omit: { storageKey: true },
        });
        await tx.document.update({ where: { id: documentId }, data: { updatedAt: new Date() } });
        await this.audit.log({ actorId: req.user.id, action: "version", entityType: "document", entityId: documentId, after: { version, fileName: file.fileName, sizeBytes: file.sizeBytes }, ip }, tx);
        return row;
      });
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.document.create({
        data: {
          title: target.title || file.fileName,
          category: target.category || "OTHER",
          entityType: target.entityType,
          entityId: target.entityId,
          audiences: target.audiences,
          createdById: req.user.id,
          versions: {
            create: { version: 1, status: "DRAFT", fileName: file.fileName, mimeType: file.mimeType, sizeBytes: file.sizeBytes, storageKey: file.key, thumbnailKey: file.thumbnailKey, notes: target.notes, createdById: req.user.id },
          },
        },
        include: { versions: { omit: { storageKey: true } } },
      });
      await this.audit.log({ actorId: req.user.id, action: "create", entityType: "document", entityId: row.id, after: { title: row.title, category: row.category, audiences: row.audiences, fileName: file.fileName, sizeBytes: file.sizeBytes }, ip }, tx);
      return row;
    });
  }

  @Get("approvals")
  @RequirePermissions("approvals.view")
  async approvalInbox(@Req() req: ReqUser) {
    const elevated = req.user.roleKeys.some((role) => ELEVATED.has(role));
    const items = await this.prisma.approvalRequest.findMany({
      where: { status: "PENDING", approverRole: elevated ? undefined : { in: req.user.roleKeys } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return { items };
  }

  @Get("approval-rules")
  @RequirePermissions("approvals.view")
  rules() {
    return this.prisma.approvalRule.findMany({ orderBy: [{ entityType: "asc" }, { priority: "asc" }] });
  }

  @Post("approval-rules")
  @RequirePermissions("approvals.create")
  createRule(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(approvalRuleSchema, body);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.approvalRule.create({ data: input });
      await this.audit.log({ actorId: req.user.id, action: "create", entityType: "approval_rule", entityId: rule.id, after: input, ip: String(req.ip || "") }, tx);
      return rule;
    });
  }

  @Post("approvals/:id/decide")
  @RequirePermissions("approvals.approve")
  decide(@Param("id") id: string, @Body() raw: unknown, @Req() req: ReqUser) {
    const body = parseBody(decisionSchema, raw);
    return this.approvals.decide(id, body.decision, body.note || "", req.user, String(req.ip || ""));
  }

  @Get("workflow/:entityType/:entityId")
  async history(@Param("entityType") entityType: string, @Param("entityId") entityId: string, @Req() req: ReqUser) {
    assertCan(req.user, "approvals.view");
    const [events, comments] = await Promise.all([
      this.prisma.workflowEvent.findMany({ where: { entityType, entityId }, orderBy: { createdAt: "asc" } }),
      this.prisma.comment.findMany({ where: { entityType, entityId }, include: { author: { select: { name: true } } }, orderBy: { createdAt: "asc" } }),
    ]);
    return { events, comments };
  }
}
