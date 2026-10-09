import { BadRequestException, Body, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { randomUUID } from "crypto";
import ExcelJS from "exceljs";
import type { Response } from "express";
import { PDFDocument, StandardFonts } from "pdf-lib";
import {
  boqImportSchema,
  boqSchema,
  engineeringSchema,
  engineeringUpdateSchema,
  resolveSellPrice,
  submittalSchema,
  transitionAllowed,
  type PriceList,
} from "@fixotec/shared";
import { AuthUser, RequirePermissions, can, isExternal, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { ApprovalService } from "./platform";
import { documentAudience, documentScope, projectScope } from "./scope";
import { AuditService, NumberService, StorageService, Tx, WorkflowService, contentDisposition, toPlain } from "./services";
import { MB, Upload, inspectUpload, uploadLimits } from "./uploads";

type ReqUser = { user: AuthUser; ip?: string };

const MAX_IMPORT_ROWS = 2000;
const BOQ_MAX_BYTES = 10 * MB;

/** Portal users see engineering work on projects in their scope or raised for their account. */
function engineeringScope(user: AuthUser) {
  if (!isExternal(user)) return {};
  const customerId = user.customerId || "__none__";
  return { OR: [{ project: projectScope(user) }, { customerId }] };
}

function boqScope(user: AuthUser) {
  return isExternal(user) ? { project: projectScope(user) } : {};
}

@Controller()
export class EngineeringController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberService,
    private readonly workflow: WorkflowService,
    private readonly storage: StorageService,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  @Get("engineering")
  @RequirePermissions("engineering.view")
  async list(@Query() query: Record<string, string>, @Req() req: ReqUser) {
    const items = await this.prisma.engineeringRequest.findMany({
      where: {
        AND: [engineeringScope(req.user), { status: query.status ? String(query.status).slice(0, 40) : undefined, projectId: query.projectId ? String(query.projectId).slice(0, 64) : undefined }],
      },
      include: { project: { select: { name: true, code: true } }, customer: { select: { name: true } }, engineer: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const grouped = items.reduce<Record<string, number>>((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {});
    return { items, counts: grouped };
  }

  @Get("engineering/:id")
  @RequirePermissions("engineering.view")
  async detail(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.engineeringRequest.findFirst({
      where: { AND: [{ id }, engineeringScope(req.user)] },
      include: {
        project: { select: { id: true, name: true, code: true } },
        rfq: { select: { id: true, number: true, status: true } },
        customer: { select: { id: true, name: true } },
        engineer: { select: { id: true, name: true } },
      },
    });
    if (!row) throw new NotFoundException("Engineering request not found");
    const audience = isExternal(req.user) ? { audiences: { hasSome: documentAudience(req.user) } } : {};
    const documents = await this.prisma.document.findMany({ where: { entityType: "engineering", entityId: id, deletedAt: null, ...audience }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    return { ...row, documents };
  }

  @Post("engineering")
  @RequirePermissions("engineering.create")
  async create(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(engineeringSchema, body);
    let customerId = input.customerId;
    let rfqId = input.rfqId;
    let engineerId = input.engineerId;
    if (isExternal(req.user)) {
      if (input.projectId) {
        const project = await this.prisma.project.findFirst({ where: { AND: [{ id: input.projectId }, projectScope(req.user)] }, select: { customerId: true } });
        if (!project) throw new NotFoundException("Project not found");
        customerId = project.customerId;
      } else {
        customerId = req.user.customerId || undefined;
      }
      rfqId = undefined;
      engineerId = undefined;
    } else if (engineerId) {
      await this.requireStaff(engineerId);
    }
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("ENGINEERING", tx);
      const row = await tx.engineeringRequest.create({
        data: {
          number,
          projectId: input.projectId,
          rfqId,
          customerId,
          application: input.application,
          requiredSystem: input.requiredSystem,
          load: input.load,
          dimensions: input.dimensions,
          material: input.material,
          installationCondition: input.installationCondition,
          standard: input.standard,
          engineerId,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
          notes: input.notes,
          status: "NEW",
        },
      });
      await this.workflow.record("engineering", row.id, null, "NEW", req.user.id, undefined, tx);
      await this.log(req, "create", "engineering", row.id, undefined, { number }, tx);
      return row;
    });
  }

  @Patch("engineering/:id")
  @RequirePermissions("engineering.edit")
  async update(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(engineeringUpdateSchema, body);
    const before = await this.prisma.engineeringRequest.findFirst({ where: { AND: [{ id }, engineeringScope(req.user)] } });
    if (!before) throw new NotFoundException("Engineering request not found");
    if (input.status && input.status !== before.status) {
      if (!transitionAllowed("engineering", before.status, input.status)) throw new BadRequestException(`An engineering request cannot move from ${before.status} to ${input.status}`);
      if (input.status === "APPROVED" || input.status === "REJECTED") throw new ForbiddenException("Approval decisions are recorded through the approvals inbox");
    }
    if (isExternal(req.user) && (input.status || input.engineerId || input.customerId || input.rfqId || input.projectId)) {
      throw new ForbiddenException("Portal users can only edit the technical details");
    }
    if (input.engineerId) await this.requireStaff(input.engineerId);
    if (input.projectId) {
      const project = await this.prisma.project.findUnique({ where: { id: input.projectId }, select: { id: true } });
      if (!project) throw new BadRequestException("Project not found");
    }
    const row = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.engineeringRequest.update({
        where: { id },
        data: {
          projectId: input.projectId,
          rfqId: input.rfqId,
          customerId: input.customerId,
          application: input.application,
          requiredSystem: input.requiredSystem,
          load: input.load,
          dimensions: input.dimensions,
          material: input.material,
          installationCondition: input.installationCondition,
          standard: input.standard,
          engineerId: input.engineerId,
          notes: input.notes,
          status: input.status,
          dueDate: input.dueDate === undefined ? undefined : input.dueDate ? new Date(input.dueDate) : null,
        },
      });
      if (input.status && input.status !== before.status) {
        await this.workflow.record("engineering", id, before.status, input.status, req.user.id, undefined, tx);
        if (input.status === "CLIENT_APPROVAL") await this.approvals.open({ entityType: "ENGINEERING", entityId: id, requesterId: req.user.id, context: { clientSubmission: 1 } }, tx);
      }
      await this.log(req, "update", "engineering", id, { status: before.status, engineerId: before.engineerId }, { status: updated.status, engineerId: updated.engineerId }, tx);
      return updated;
    });
    return row;
  }

  @Get("boq")
  @RequirePermissions("boq.view")
  async boqs(@Query() query: Record<string, string>, @Req() req: ReqUser) {
    return this.prisma.boq.findMany({
      where: { AND: [boqScope(req.user), { projectId: query.projectId ? String(query.projectId).slice(0, 64) : undefined }] },
      include: { items: true, project: { select: { name: true, code: true } } },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
  }

  @Get("boq/:id")
  @RequirePermissions("boq.view")
  async boq(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.boq.findFirst({
      where: { AND: [{ id }, boqScope(req.user)] },
      include: { items: { orderBy: { lineNo: "asc" }, include: { variant: { select: { articleNumber: true, name: true } } } }, project: { select: { id: true, name: true, code: true } }, rfq: { select: { id: true, number: true } } },
    });
    if (!row) throw new NotFoundException("BOQ not found");
    return row;
  }

  @Post("boq")
  @RequirePermissions("boq.create")
  async createBoq(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(boqSchema, body);
    await this.assertProject(req.user, input.projectId);
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("BOQ", tx);
      const row = await tx.boq.create({
        data: {
          number,
          title: input.title,
          projectId: input.projectId,
          rfqId: isExternal(req.user) ? undefined : input.rfqId,
          source: "ERP",
          items: {
            create: (input.items || []).map((item, index) => ({
              lineNo: index + 1,
              description: item.description,
              qty: item.qty,
              unit: item.unit || "NOS",
              rate: item.rate || 0,
              amount: Math.round((item.rate || 0) * item.qty * 100) / 100,
              variantId: item.variantId,
            })),
          },
        },
        include: { items: true },
      });
      await this.log(req, "create", "boq", row.id, undefined, { number, lines: row.items.length }, tx);
      return row;
    });
  }

  @Post("boq/import")
  @RequirePermissions("boq.create")
  @UseInterceptors(FileInterceptor("file", uploadLimits(BOQ_MAX_BYTES)))
  async importBoq(@UploadedFile() file: Upload, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(boqImportSchema, body ?? {});
    const checked = await inspectUpload(file, ["csv", "xlsx", "pdf"], BOQ_MAX_BYTES);
    await this.assertProject(req.user, input.projectId);
    const title = (input.title || checked.fileName).slice(0, 200);
    if (checked.kind === "pdf") {
      const key = `boq/${randomUUID()}.pdf`;
      await this.storage.put(key, file.buffer, "application/pdf");
      return this.prisma.$transaction(async (tx) => {
        const number = await this.numbers.next("BOQ", tx);
        const boq = await tx.boq.create({ data: { number, title, projectId: input.projectId, source: "PDF", status: "DRAFT" } });
        await tx.document.create({
          data: {
            title,
            category: "BOQ",
            entityType: "boq",
            entityId: boq.id,
            createdById: req.user.id,
            versions: { create: { version: 1, status: "DRAFT", fileName: checked.fileName, mimeType: "application/pdf", sizeBytes: file.size, storageKey: key, notes: "PDF kept for manual line entry", createdById: req.user.id } },
          },
        });
        await this.log(req, "import", "boq", boq.id, undefined, { number, source: "PDF" }, tx);
        return { ...boq, items: [], message: "PDF stored. Enter the lines while reading it. Automatic PDF extraction is not claimed." };
      });
    }
    const rows = await this.rowsFromSheet(file.buffer, checked.kind === "csv" ? "csv" : "xlsx");
    if (rows.length > MAX_IMPORT_ROWS) throw new BadRequestException(`A BOQ import is limited to ${MAX_IMPORT_ROWS} lines`);
    const articles = [...new Set(rows.map((row) => String(row.article || row.sku || row.product || "").trim()).filter(Boolean))];
    const names = [...new Set(rows.map((row) => String(row.description || row.product || row.item || row.name || "").trim().slice(0, 500)).filter(Boolean))];
    const variants = await this.prisma.productVariant.findMany({
      where: { OR: [{ articleNumber: { in: articles, mode: "insensitive" } }, { name: { in: names, mode: "insensitive" } }] },
      select: { id: true, articleNumber: true, name: true, standardPrice: true },
      take: MAX_IMPORT_ROWS * 2,
    });
    const byArticle = new Map(variants.map((item) => [item.articleNumber.toLowerCase(), item]));
    const byName = new Map(variants.map((item) => [item.name.toLowerCase(), item]));
    const items = rows
      .map((row, index) => {
        const description = String(row.description || row.product || row.item || row.name || "").trim().slice(0, 500);
        const qty = Number(row.qty || row.quantity || 0);
        const article = String(row.article || row.sku || row.product || "").toLowerCase();
        const variant = byArticle.get(article) || byName.get(description.toLowerCase());
        const rate = Number(row.rate || row.price || variant?.standardPrice || 0);
        return { lineNo: index + 1, description: description || variant?.name || `Line ${index + 1}`, qty, unit: String(row.unit || "NOS").slice(0, 10), rate, amount: Math.round(rate * qty * 100) / 100, variantId: variant?.id };
      })
      .filter((item) => item.description && Number.isFinite(item.qty) && item.qty > 0 && item.qty <= 1e9 && Number.isFinite(item.rate) && item.rate >= 0 && item.rate <= 1e12);
    if (!items.length) throw new BadRequestException("No BOQ lines found. Use columns description, qty, unit, rate.");
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("BOQ", tx);
      const row = await tx.boq.create({
        data: { number, title, projectId: input.projectId, source: checked.kind === "csv" ? "CSV" : "EXCEL", items: { create: items } },
        include: { items: true },
      });
      await this.log(req, "import", "boq", row.id, undefined, { number, lines: items.length }, tx);
      return row;
    });
  }

  @Post("boq/:id/rfq")
  @RequirePermissions("rfqs.create")
  async boqToRfq(@Param("id") id: string, @Req() req: ReqUser) {
    const boq = await this.prisma.boq.findFirst({ where: { AND: [{ id }, boqScope(req.user)] }, include: { items: true, project: true } });
    if (!boq) throw new NotFoundException("BOQ not found");
    if (boq.status === "CONVERTED" || boq.rfqId) throw new BadRequestException("This BOQ has already been converted");
    if (!boq.items.length) throw new BadRequestException("Add lines before converting the BOQ");
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.boq.updateMany({ where: { id, status: { not: "CONVERTED" }, rfqId: null }, data: { status: "CONVERTED" } });
      if (!claimed.count) throw new BadRequestException("This BOQ has already been converted");
      const number = await this.numbers.next("RFQ", tx);
      const rfq = await tx.rfq.create({
        data: {
          number,
          projectId: boq.projectId,
          customerId: boq.project?.customerId,
          status: "RECEIVED",
          notes: `Created from ${boq.number}`,
          items: { create: boq.items.map((item) => ({ variantId: item.variantId, description: item.description, qty: item.qty, unit: item.unit })) },
        },
        include: { items: true },
      });
      await tx.boq.update({ where: { id }, data: { rfqId: rfq.id } });
      await this.workflow.record("rfq", rfq.id, null, "RECEIVED", req.user.id, boq.number, tx);
      await this.log(req, "convert", "boq", id, { status: boq.status }, { status: "CONVERTED", rfqId: rfq.id }, tx);
      return rfq;
    });
  }

  @Post("submittals")
  @RequirePermissions("engineering.create")
  async submittal(@Body() body: unknown, @Req() req: ReqUser, @Res() res: Response) {
    const input = parseBody(submittalSchema, body);
    const external = isExternal(req.user);
    const project = await this.prisma.project.findFirst({ where: { AND: [{ id: input.projectId }, projectScope(req.user)] }, include: { customer: true } });
    if (!project) throw new NotFoundException("Project not found");
    const visible = external ? { AND: [await documentScope(this.prisma, req.user), { audiences: { hasSome: documentAudience(req.user) } }] } : {};
    const documents = await this.prisma.document.findMany({ where: { id: { in: input.documentIds || [] }, deletedAt: null, ...visible }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    const variants = await this.prisma.productVariant.findMany({ where: { id: { in: input.variantIds || [] }, ...(external ? { product: { published: true } } : {}) }, include: { product: true } });
    const showPrice = !external && can(req.user, "quotations.view");
    const pdf = await PDFDocument.create();
    const font = await pdf.embedFont(StandardFonts.Helvetica);
    const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    const cover = pdf.addPage([595, 842]);
    const safe = (value: string) => value.replace(/[^\x20-\x7E]/g, "?").slice(0, 120);
    cover.drawText("FIXOTEC TECHNICAL SUBMITTAL", { x: 48, y: 760, size: 16, font: bold });
    cover.drawText(safe(input.title), { x: 48, y: 720, size: 14, font });
    cover.drawText(safe(project.name), { x: 48, y: 690, size: 12, font });
    cover.drawText(safe(project.customer.name), { x: 48, y: 670, size: 12, font });
    let y = 620;
    for (const variant of variants) {
      if (y < 80) break;
      cover.drawText(safe(`${variant.articleNumber}  ${variant.name}`), { x: 48, y, size: 11, font: bold });
      y -= 16;
      cover.drawText(safe(`${variant.product.material || ""}  ${variant.product.coating || ""}  ${variant.product.loadCapacity || ""}`.trim()), { x: 48, y, size: 10, font });
      y -= 14;
      if (showPrice) {
        const price = resolveSellPrice(toPlain(variant), (project.customer.priceList || "STANDARD") as PriceList);
        cover.drawText(`List INR ${price.toFixed(2)}`, { x: 48, y, size: 10, font });
      }
      y -= 22;
    }
    for (const document of documents) {
      const version = document.versions[0];
      const sheet = pdf.addPage([595, 842]);
      sheet.drawText(safe(document.title), { x: 48, y: 760, size: 16, font: bold });
      sheet.drawText(safe(`${document.category}  -  ${version ? `v${version.version} ${version.status}` : "no file"}`), { x: 48, y: 730, size: 11, font });
      if (version?.mimeType === "application/pdf") {
        try {
          const bytes = await this.storage.get(version.storageKey);
          const attached = await PDFDocument.load(bytes);
          const pages = await pdf.copyPages(attached, attached.getPageIndices());
          pages.forEach((page) => pdf.addPage(page));
        } catch {
          sheet.drawText("File could not be embedded. Download it from the document register.", { x: 48, y: 680, size: 11, font });
        }
      } else if (version) {
        sheet.drawText(safe(`Attached file: ${version.fileName}`), { x: 48, y: 680, size: 11, font });
      }
    }
    const bytes = Buffer.from(await pdf.save());
    const result = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("SUBMITTAL", tx);
      const key = `submittals/${number}.pdf`;
      await this.storage.put(key, bytes, "application/pdf");
      const document = await tx.document.create({
        data: {
          title: input.title,
          category: "SUBMITTAL",
          entityType: "project",
          entityId: project.id,
          audiences: ["CUSTOMER", "CONSULTANT"],
          createdById: req.user.id,
          versions: { create: { version: 1, status: "DRAFT", fileName: `${number}.pdf`, mimeType: "application/pdf", sizeBytes: bytes.length, storageKey: key, createdById: req.user.id } },
        },
      });
      const submittal = await tx.submittal.create({
        data: { number, projectId: project.id, title: input.title, selections: { documentIds: documents.map((row) => row.id), variantIds: variants.map((row) => row.id) }, documentId: document.id },
      });
      await this.log(req, "create", "submittal", submittal.id, undefined, { number, projectId: project.id }, tx);
      return { number, submittal };
    });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", contentDisposition(`${result.number}.pdf`));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Submittal-Id", result.submittal.id);
    res.send(bytes);
  }

  private async assertProject(user: AuthUser, projectId?: string) {
    if (!projectId) {
      if (isExternal(user)) throw new BadRequestException("Choose a project");
      return;
    }
    const project = await this.prisma.project.findFirst({ where: { AND: [{ id: projectId }, projectScope(user)] }, select: { id: true } });
    if (!project) throw new NotFoundException("Project not found");
  }

  private async requireStaff(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, active: true, kind: "STAFF" }, select: { id: true } });
    if (!user) throw new BadRequestException("Engineer must be an active staff user");
  }

  private async rowsFromSheet(buffer: Buffer, kind: "csv" | "xlsx"): Promise<Array<Record<string, string>>> {
    const table = kind === "csv" ? parseCsv(buffer.toString("utf8").replace(/^\uFEFF/, ""), MAX_IMPORT_ROWS + 1) : await readXlsx(buffer, MAX_IMPORT_ROWS + 1);
    if (!table.length) return [];
    const headers = table[0].map((cell) => cell.trim().toLowerCase());
    return table.slice(1).map((cells) => Object.fromEntries(headers.map((header, index) => [header, (cells[index] ?? "").trim()])));
  }
}

/** RFC 4180 CSV: quoted fields, escaped quotes and embedded commas/newlines. */
function parseCsv(text: string, maxRows: number) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length && rows.length < maxRows; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"' && field === "") quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      if (row.some((cell) => cell.trim())) rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if ((field || row.length) && rows.length < maxRows) {
    row.push(field);
    if (row.some((cell) => cell.trim())) rows.push(row);
  }
  return rows;
}

/** First worksheet as a string table; formulas contribute their cached result only. */
export async function readXlsx(buffer: Buffer, maxRows: number) {
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  } catch {
    throw new BadRequestException("The spreadsheet could not be read. Save it as .xlsx or .csv and try again.");
  }
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];
  const rows: string[][] = [];
  sheet.eachRow({ includeEmpty: false }, (row) => {
    if (rows.length >= maxRows) return;
    const cells: string[] = [];
    row.eachCell({ includeEmpty: true }, (cell, column) => {
      const value = cell.value as unknown;
      const plain =
        value == null
          ? ""
          : typeof value === "object" && value !== null && "result" in value
            ? String((value as { result?: unknown }).result ?? "")
            : typeof value === "object" && value !== null && "richText" in value
              ? (value as { richText: Array<{ text: string }> }).richText.map((part) => part.text).join("")
              : typeof value === "object" && value !== null && "text" in value
                ? String((value as { text: unknown }).text)
                : value instanceof Date
                  ? value.getUTCHours() || value.getUTCMinutes()
                    ? value.toISOString()
                    : value.toISOString().slice(0, 10)
                  : String(value);
      cells[column - 1] = plain.slice(0, 1000);
    });
    rows.push(Array.from(cells, (cell) => cell ?? ""));
  });
  return rows;
}
