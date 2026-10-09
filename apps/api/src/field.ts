import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, NotFoundException, Param, Patch, Post, Query, Req } from "@nestjs/common";
import {
  DEFAULT_SLA_HOURS,
  commentSchema,
  computeTax,
  expenseSchema,
  num,
  paymentSchema,
  siteIssueSchema,
  siteIssueUpdateSchema,
  siteReportSchema,
  siteVisitSchema,
  ticketSchema,
  ticketUpdateSchema,
  transitionAllowed,
  vendorBillSchema,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { z } from "zod";
import { AuthUser, RequirePermissions, assertStaff, can, isExternal, pageOf, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { assertProjectInScope, customerScope, viaProject } from "./scope";
import { GstService } from "./tax";
import { LedgerService } from "./ledger";
import { PaymentService } from "./banking";
import { AuditService, NumberService, Tx, WorkflowService } from "./services";

type ReqUser = { user: AuthUser; ip?: string };

const LIST_LIMIT = 500;
const syncSchema = z.object({ entityType: z.enum(["INVOICE", "PAYMENT", "VENDOR_BILL"]), entityId: z.string().min(1).max(64) });
const expenseDecisionSchema = z.object({ decision: z.enum(["FORWARD", "REJECTED"]).default("FORWARD") });

/** The Zoho OAuth token must only ever be sent over HTTPS to a Zoho-owned host. */
function isZohoUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)zoho(apis)?\.(com|eu|in|com\.au|jp|ca|sa|com\.cn|uk)$/.test(url.hostname);
  } catch {
    return false;
  }
}

@Controller()
export class FieldController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberService,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly gst: GstService,
    private readonly paymentService: PaymentService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  @Get("sites/visits")
  @RequirePermissions("sites.view")
  visits(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const page = pageOf(query);
    return this.prisma.siteVisit.findMany({
      where: viaProject(req.user),
      include: { project: { select: { name: true, code: true } }, user: { select: { name: true } }, reports: true },
      orderBy: { checkInAt: "desc" },
      skip: page.skip,
      take: Math.min(page.pageSize, 100),
    });
  }

  @Post("sites/visits")
  @RequirePermissions("sites.create")
  async checkIn(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(siteVisitSchema, body);
    await assertProjectInScope(this.prisma, req.user, input.projectId);
    const row = await this.prisma.siteVisit.create({ data: { projectId: input.projectId, userId: req.user.id, latitude: input.latitude, longitude: input.longitude, notes: input.notes } });
    await this.log(req, "check_in", "site_visit", row.id, undefined, { projectId: row.projectId });
    return row;
  }

  @Post("sites/visits/:id/checkout")
  @RequirePermissions("sites.edit")
  async checkOut(@Param("id") id: string, @Req() req: ReqUser) {
    const result = await this.prisma.siteVisit.updateMany({ where: { id, userId: req.user.id, checkOutAt: null }, data: { checkOutAt: new Date() } });
    if (!result.count) throw new NotFoundException("Open visit not found");
    await this.log(req, "check_out", "site_visit", id);
    return this.prisma.siteVisit.findUnique({ where: { id } });
  }

  @Post("sites/reports")
  @RequirePermissions("sites.create")
  async report(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(siteReportSchema, body);
    await assertProjectInScope(this.prisma, req.user, input.projectId);
    if (input.visitId) {
      const visit = await this.prisma.siteVisit.findFirst({ where: { id: input.visitId, projectId: input.projectId }, select: { id: true } });
      if (!visit) throw new BadRequestException("Visit does not belong to this project");
    }
    const row = await this.prisma.siteReport.create({
      data: {
        projectId: input.projectId,
        visitId: input.visitId,
        installationNotes: input.installationNotes,
        labourHours: input.labourHours || 0,
        clientSignatureName: input.clientSignatureName,
        signedAt: input.clientSignatureName ? new Date() : undefined,
        consumptions: { create: (input.consumption || []).map((item) => ({ projectId: input.projectId, variantId: item.variantId, description: item.description, qty: item.qty })) },
      },
      include: { consumptions: true },
    });
    await this.log(req, "create", "site_report", row.id, undefined, { projectId: row.projectId, lines: row.consumptions.length });
    return row;
  }

  @Get("sites/issues")
  @RequirePermissions("sites.view")
  issues(@Req() req: ReqUser) {
    return this.prisma.siteIssue.findMany({
      where: viaProject(req.user),
      include: { project: { select: { name: true, code: true } }, assignee: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    });
  }

  @Post("sites/issues")
  @RequirePermissions("sites.create")
  async createIssue(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(siteIssueSchema, body);
    await assertProjectInScope(this.prisma, req.user, input.projectId);
    if (input.assigneeId) await this.requireStaff(input.assigneeId);
    const row = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("ISSUE", tx);
      const created = await tx.siteIssue.create({
        data: { number, projectId: input.projectId, title: input.title, description: input.description, shortage: input.shortage ?? false, assigneeId: isExternal(req.user) ? undefined : input.assigneeId, status: input.assigneeId && !isExternal(req.user) ? "ASSIGNED" : "OPEN" },
      });
      await this.workflow.record("site_issue", created.id, null, created.status, req.user.id, undefined, tx);
      await this.log(req, "create", "site_issue", created.id, undefined, { number, title: created.title }, tx);
      return created;
    });
    return row;
  }

  @Patch("sites/issues/:id")
  @RequirePermissions("sites.edit")
  async updateIssue(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(siteIssueUpdateSchema, body);
    const before = await this.prisma.siteIssue.findFirst({ where: { id, ...viaProject(req.user) } });
    if (!before) throw new NotFoundException("Issue not found");
    if (input.status && !transitionAllowed("issue", before.status, input.status)) throw new BadRequestException(`An issue cannot move from ${before.status} to ${input.status}`);
    if (input.assigneeId) await this.requireStaff(input.assigneeId);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.siteIssue.updateMany({ where: { id, status: before.status }, data: { status: input.status, assigneeId: input.assigneeId, description: input.description } });
      if (!claimed.count) throw new ConflictException("Issue was changed by someone else; reload and try again");
      const row = await tx.siteIssue.findUniqueOrThrow({ where: { id } });
      if (input.status && input.status !== before.status) await this.workflow.record("site_issue", id, before.status, input.status, req.user.id, undefined, tx);
      await this.log(req, "update", "site_issue", id, { status: before.status, assigneeId: before.assigneeId }, { status: row.status, assigneeId: row.assigneeId }, tx);
      return row;
    });
  }

  @Get("service/tickets")
  @RequirePermissions("service.view")
  tickets(@Req() req: ReqUser) {
    return this.prisma.serviceTicket.findMany({
      where: { customerId: customerScope(req.user) },
      include: { customer: { select: { name: true } }, assignee: { select: { name: true } }, comments: true },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    });
  }

  @Post("service/tickets")
  @RequirePermissions("service.create")
  async createTicket(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(ticketSchema, body);
    const customerId = isExternal(req.user) ? req.user.customerId : input.customerId;
    if (isExternal(req.user) && !customerId) throw new BadRequestException("Portal user is not linked to a customer");
    await assertProjectInScope(this.prisma, req.user, input.projectId);
    const setting = await this.prisma.businessSetting.findUnique({ where: { key: "sla" } });
    const slaMap = ((setting?.value as Record<string, number> | null) || DEFAULT_SLA_HOURS) as Record<string, number>;
    const slaHours = slaMap[input.priority] || DEFAULT_SLA_HOURS[input.priority];
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("TICKET", tx);
      const row = await tx.serviceTicket.create({
        data: {
          number,
          customerId: customerId || undefined,
          projectId: input.projectId,
          priority: input.priority,
          subject: input.subject,
          description: input.description,
          slaHours,
          dueAt: new Date(Date.now() + slaHours * 3_600_000),
        },
      });
      await this.workflow.record("ticket", row.id, null, "OPEN", req.user.id, undefined, tx);
      await this.log(req, "create", "ticket", row.id, undefined, { number, subject: row.subject }, tx);
      return row;
    });
  }

  @Patch("service/tickets/:id")
  @RequirePermissions("service.edit")
  async updateTicket(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(ticketUpdateSchema, body);
    const before = await this.prisma.serviceTicket.findFirst({ where: { id, customerId: customerScope(req.user) } });
    if (!before) throw new NotFoundException("Ticket not found");
    if (input.status && !transitionAllowed("issue", before.status, input.status)) throw new BadRequestException(`A ticket cannot move from ${before.status} to ${input.status}`);
    if (input.assigneeId) await this.requireStaff(input.assigneeId);
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.serviceTicket.updateMany({
        where: { id, status: before.status },
        data: { status: input.status, assigneeId: input.assigneeId, priority: input.priority, closedAt: input.status === "CLOSED" ? new Date() : undefined },
      });
      if (!claimed.count) throw new ConflictException("Ticket was changed by someone else; reload and try again");
      const row = await tx.serviceTicket.findUniqueOrThrow({ where: { id } });
      if (input.status && input.status !== before.status) await this.workflow.record("ticket", id, before.status, input.status, req.user.id, undefined, tx);
      await this.log(req, "update", "ticket", id, { status: before.status, priority: before.priority, assigneeId: before.assigneeId }, { status: row.status, priority: row.priority, assigneeId: row.assigneeId }, tx);
      return row;
    });
  }

  @Post("service/tickets/:id/comments")
  @RequirePermissions("service.view")
  async comment(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(commentSchema, body);
    const ticket = await this.prisma.serviceTicket.findFirst({ where: { id, customerId: customerScope(req.user) }, select: { id: true, status: true } });
    if (!ticket) throw new NotFoundException("Ticket not found");
    if (ticket.status === "CLOSED") throw new BadRequestException("This ticket is closed");
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.ticketComment.create({ data: { ticketId: id, authorId: req.user.id, body: input.body } });
      await this.log(req, "comment", "ticket", id, undefined, { commentId: row.id }, tx);
      return row;
    });
  }

  @Get("invoices")
  @RequirePermissions("invoices.view")
  invoices(@Req() req: ReqUser) {
    return this.prisma.invoice.findMany({
      where: { customerId: customerScope(req.user) },
      include: { customer: { select: { name: true } }, items: true, payments: isExternal(req.user) ? { where: { direction: "IN" } } : true },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    });
  }

  @Post("invoices/from-dispatch/:id")
  @RequirePermissions("invoices.create")
  async invoiceFromDispatch(@Param("id") id: string, @Req() req: ReqUser) {
    const note = await this.prisma.dispatchNote.findUnique({
      where: { id },
      include: { items: { include: { salesOrderItem: { include: { variant: { include: { product: { select: { hsn: true } } } } } } } }, salesOrder: { include: { customer: { include: { addresses: true } } } } },
    });
    if (!note || !["SHIPPED", "DELIVERED"].includes(note.status)) throw new BadRequestException("Invoice a shipped dispatch");
    const place = await this.gst.placeOf(note.salesOrder.customer, note.salesOrder.currency);
    const taxed = computeTax(
      note.items.map((item) => {
        const rate = num(item.salesOrderItem?.unitPrice);
        const qty = num(item.pickedQty) || num(item.qty);
        return { amount: new Prisma.Decimal(qty).mul(rate).toDecimalPlaces(2).toNumber(), taxRate: num(item.salesOrderItem?.taxRate) || 18, hsn: item.salesOrderItem?.variant?.product.hsn || null, qty, uqc: "NOS" };
      }),
      { supplierState: await this.gst.supplierState(), ...place },
    );
    const items = note.items.map((item, index) => {
      const line = taxed.lines[index];
      return {
        salesOrderItemId: item.salesOrderItemId,
        description: item.salesOrderItem?.description || "Dispatch line",
        qty: new Prisma.Decimal(line.qty || 0),
        rate: new Prisma.Decimal(num(item.salesOrderItem?.unitPrice)),
        taxRate: new Prisma.Decimal(line.taxRate),
        amount: new Prisma.Decimal(line.amount),
        hsn: line.hsn,
        uqc: line.uqc,
        cgst: line.cgst,
        sgst: line.sgst,
        igst: line.igst,
      };
    });
    const subtotal = new Prisma.Decimal(taxed.subtotal);
    const tax = new Prisma.Decimal(taxed.tax);
    const fx = note.salesOrder.currency === "INR" ? null : await this.prisma.currency.findUnique({ where: { code: note.salesOrder.currency } });
    if (note.salesOrder.currency !== "INR" && !num(fx?.rateToInr)) throw new BadRequestException(`Set the ${note.salesOrder.currency} exchange rate under Organization â†’ Currencies first`);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.invoice.findFirst({ where: { dispatchId: id } });
        if (existing) return existing;
        const number = await this.numbers.next("INVOICE", tx);
        const invoice = await tx.invoice.create({
          data: {
            number,
            customerId: note.salesOrder.customerId,
            salesOrderId: note.salesOrderId,
            dispatchId: note.id,
            status: "ISSUED",
            createdById: req.user.id,
            dueDate: new Date(Date.now() + 30 * 86_400_000),
            subtotal,
            tax,
            total: subtotal.add(tax),
            currency: note.salesOrder.currency,
            exchangeRate: fx ? num(fx.rateToInr) : 1,
            placeOfSupply: place.placeOfSupply,
            supplyType: place.supplyType,
            cgst: taxed.cgst,
            sgst: taxed.sgst,
            igst: taxed.igst,
            items: { create: items },
          },
          include: { items: true },
        });
        await this.workflow.record("invoice", invoice.id, null, "ISSUED", req.user.id, undefined, tx);
        await this.ledger.tryPost(invoice.number, () => this.ledger.postInvoice(tx, invoice.id));
        await this.log(req, "create", "invoice", invoice.id, undefined, { number, total: invoice.total, dispatchId: id }, tx);
        return invoice;
      });
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") return this.prisma.invoice.findFirstOrThrow({ where: { dispatchId: id }, include: { items: true } });
      throw error;
    }
  }

  @Get("payments")
  @RequirePermissions("payments.view")
  payments(@Req() req: ReqUser) {
    return this.prisma.payment.findMany({
      where: isExternal(req.user) ? { customerId: customerScope(req.user), direction: "IN" } : {},
      include: { invoice: true, customer: isExternal(req.user) ? { select: { id: true, name: true } } : true },
      orderBy: { paidAt: "desc" },
      take: LIST_LIMIT,
    });
  }

  @Post("payments")
  @RequirePermissions("payments.create")
  async createPayment(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(paymentSchema, body);
    return this.prisma.$transaction(async (tx) => {
      const payment = await this.paymentService.record(tx, input, req.user.id);
      await this.log(req, "create", "payment", payment.id, undefined, { number: payment.number, amount: payment.amount, direction: input.direction, invoiceId: input.invoiceId, vendorBillId: input.vendorBillId }, tx);
      return payment;
    });
  }

  @Get("expenses")
  @RequirePermissions("expenses.view")
  expenses() {
    return this.prisma.expense.findMany({ include: { employee: { select: { id: true, name: true, code: true } } }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT });
  }

  @Post("expenses")
  @RequirePermissions("expenses.create")
  async createExpense(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(expenseSchema, body);
    const own = await this.prisma.employee.findUnique({ where: { userId: req.user.id }, select: { id: true } });
    const employeeId = input.employeeId && can(req.user, "expenses.edit") ? input.employeeId : own?.id;
    if (!employeeId) throw new BadRequestException("Your user is not linked to an employee record");
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("EXPENSE", tx);
      const row = await tx.expense.create({
        data: { number, employeeId, category: input.category, amount: input.amount, description: input.description, spentOn: input.spentOn ? new Date(input.spentOn) : undefined, status: "MANAGER" },
      });
      await this.workflow.record("expense", row.id, "DRAFT", "MANAGER", req.user.id, undefined, tx);
      await this.log(req, "create", "expense", row.id, undefined, { number, amount: row.amount }, tx);
      return row;
    });
  }

  @Post("expenses/:id/advance")
  @RequirePermissions("expenses.approve")
  async advanceExpense(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(expenseDecisionSchema, body ?? {});
    const expense = await this.prisma.expense.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
    if (!expense) throw new NotFoundException("Expense not found");
    if (expense.employee?.userId === req.user.id) throw new ForbiddenException("You cannot approve your own expense");
    if (!["MANAGER", "FINANCE"].includes(expense.status)) throw new BadRequestException(`An expense in ${expense.status} cannot be changed`);
    const next = input.decision === "REJECTED" ? "REJECTED" : expense.status === "MANAGER" ? "FINANCE" : "PAID";
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.expense.updateMany({ where: { id, status: expense.status }, data: { status: next } });
      if (!result.count) throw new ConflictException("Expense was updated by someone else; reload and try again");
      await this.workflow.record("expense", id, expense.status, next, req.user.id, undefined, tx);
      if (next === "PAID") await this.ledger.tryPost(expense.number, () => this.ledger.postExpense(tx, id));
      await this.log(req, "decide", "expense", id, { status: expense.status }, { status: next }, tx);
      return tx.expense.findUnique({ where: { id } });
    });
  }

  @Get("finance/payables")
  @RequirePermissions("payments.view")
  payables(@Req() req: ReqUser) {
    assertStaff(req.user);
    return this.prisma.vendorBill.findMany({ include: { vendor: { select: { id: true, name: true, code: true } }, payments: true }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT });
  }

  @Post("finance/bills")
  @RequirePermissions("payments.create")
  async bill(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(vendorBillSchema, body);
    if (input.purchaseOrderId) {
      const order = await this.prisma.purchaseOrder.findFirst({ where: { id: input.purchaseOrderId, vendorId: input.vendorId }, select: { id: true } });
      if (!order) throw new BadRequestException("Purchase order does not belong to this vendor");
    }
    if (input.subtotal !== undefined && input.tax !== undefined && !input.reverseCharge && Math.abs(input.subtotal + input.tax - input.total) > 1) throw new BadRequestException("Subtotal plus tax must equal the bill total");
    const splitTax = (input.igst || 0) + (input.cgst || 0) + (input.sgst || 0);
    if (splitTax && input.tax !== undefined && Math.abs(splitTax - input.tax) > 1) throw new BadRequestException("IGST + CGST + SGST must equal the tax");
    if (splitTax && input.tax === undefined) input.tax = splitTax;
    if (input.expenseAccountId) {
      const account = await this.prisma.account.findUnique({ where: { id: input.expenseAccountId }, select: { type: true, isGroup: true, active: true } });
      if (!account || account.isGroup || !account.active || !["EXPENSE", "ASSET"].includes(account.type)) throw new BadRequestException("Choose an active expense or asset ledger for this bill");
    }
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("VENDOR_BILL", tx);
      const row = await tx.vendorBill.create({
        data: {
          number,
          vendorId: input.vendorId,
          purchaseOrderId: input.purchaseOrderId,
          goodsReceiptId: input.goodsReceiptId,
          total: input.total,
          subtotal: input.subtotal,
          tax: input.tax,
          vendorInvoiceNo: input.vendorInvoiceNo,
          billDate: input.billDate ? new Date(input.billDate) : undefined,
          expenseAccountId: input.expenseAccountId,
          igst: input.igst ?? 0,
          cgst: input.cgst ?? 0,
          sgst: input.sgst ?? 0,
          reverseCharge: input.reverseCharge ?? false,
          itcEligible: input.itcEligible ?? true,
          dueDate: input.dueDate ? new Date(input.dueDate) : undefined,
        },
      });
      await this.ledger.tryPost(number, () => this.ledger.postVendorBill(tx, row.id));
      await this.log(req, "create", "vendor_bill", row.id, undefined, { number, total: row.total }, tx);
      return row;
    });
  }

  @Post("finance/sync")
  @RequirePermissions("invoices.export")
  async sync(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(syncSchema, body);
    const invoice = input.entityType === "INVOICE" ? await this.prisma.invoice.findUnique({ where: { id: input.entityId }, include: { items: true, customer: true } }) : null;
    if (input.entityType === "INVOICE" && !invoice) throw new NotFoundException("Invoice not found");
    const target = process.env.ACCOUNTING_TARGET === "ZOHO" ? "ZOHO" : "TALLY";
    const payload = invoice ? { number: invoice.number, customer: invoice.customer.name, total: num(invoice.total), tax: num(invoice.tax), items: invoice.items } : { entityType: input.entityType, entityId: input.entityId };
    const url = target === "ZOHO" ? process.env.ZOHO_BOOKS_BASE_URL : process.env.TALLY_BASE_URL;
    const configured = target === "ZOHO" ? Boolean(process.env.ZOHO_BOOKS_TOKEN && url && isZohoUrl(url)) : Boolean(url);
    const record = (status: string, message: string) =>
      this.prisma.accountingExport.create({ data: { target, entityType: input.entityType, entityId: input.entityId, payload: payload as Prisma.InputJsonValue, status, message: message.slice(0, 500) } });
    if (!configured || !url) return record("NOT_CONFIGURED", `${target} endpoint is not configured${target === "ZOHO" ? " (it must be an https Zoho URL)" : ""}. The payload is stored for the integration.`);
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (target === "ZOHO") headers.Authorization = `Zoho-oauthtoken ${process.env.ZOHO_BOOKS_TOKEN}`;
    try {
      const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(15_000) });
      const message = await response.text();
      const row = await record(response.ok ? "SYNCED" : "FAILED", message);
      await this.log(req, "sync", "accounting_export", row.id, undefined, { target, status: row.status, entityType: input.entityType, entityId: input.entityId });
      return row;
    } catch (error) {
      return record("FAILED", (error as Error).message);
    }
  }

  private async requireStaff(userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, active: true, kind: "STAFF" }, select: { id: true } });
    if (!user) throw new BadRequestException("Assignee must be an active staff user");
  }
}
