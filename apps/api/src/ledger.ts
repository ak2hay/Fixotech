import { BadRequestException, Body, ConflictException, Controller, Get, Injectable, Logger, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import {
  AGEING_LABELS,
  EXPENSE_ACCOUNT_KEYS,
  PARTY_TYPES,
  accountSchema,
  checkBalanced,
  compactLines,
  creditNoteSchema,
  csvRecords,
  debitNoteSchema,
  fifoAgeing,
  financialYearOf,
  gstSplit,
  journalSchema,
  mapZohoAccountType,
  naturalBalance,
  num,
  openingBalanceSchema,
  parseAmount,
  parseIndianDate,
  periodLockSchema,
  profitOf,
  reverseSchema,
  round2,
  stateCodeOf,
  tallyGroupFor,
  tallyXml,
  yearCloseSchema,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { z } from "zod";
import { AuthUser, RequirePermissions, assertStaff, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { AuditService, NumberService, Tx, contentDisposition, toPlain } from "./services";
import { GstService } from "./tax";
import { MB, Upload, uploadLimits } from "./uploads";

type ReqUser = { user: AuthUser; ip?: string };

export type PostLine = {
  /** System account key (AR, SALES, ...) or an explicit account id. */
  key?: string;
  accountId?: string;
  debit?: number;
  credit?: number;
  description?: string | null;
  partyType?: string | null;
  partyId?: string | null;
  costCenterId?: string | null;
  branchId?: string | null;
  projectId?: string | null;
  fcAmount?: number | null;
};

export type PostInput = {
  date: Date;
  narration: string;
  reference?: string | null;
  sourceType?: string;
  sourceId?: string;
  postingKey?: string;
  currency?: string;
  exchangeRate?: number;
  createdById?: string | null;
  reversalOfId?: string;
  /** Manual journals are rejected inside a locked period; system postings move to the first open day. */
  manual?: boolean;
  lines: PostLine[];
};

const DAY = 86_400_000;
const CSV_MAX_BYTES = 10 * MB;
const ROUNDING_TOLERANCE = 0.05;
const VOUCHER_TYPES: Record<string, string> = { invoice: "Sales", payment_in: "Receipt", payment_out: "Payment", vendor_bill: "Purchase", credit_note: "Credit Note", debit_note: "Debit Note" };

const rangeSchema = z.object({ from: z.string().optional(), to: z.string().optional(), branchId: z.string().max(64).optional(), costCenterId: z.string().max(64).optional() });
const partyImportSchema = z.object({ asOf: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date"), kind: z.enum(["CUSTOMER", "VENDOR"]) });
const asOfSchema = z.object({ asOf: z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date") });
const accountUpdateSchema = accountSchema.partial().omit({ code: true });

function dayStart(value: string | Date) {
  const date = new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function dayEnd(value: string | Date) {
  return new Date(dayStart(value).getTime() + DAY - 1);
}

/** Report window from the query; defaults to the current financial year to date. */
function rangeOf(query: Record<string, unknown>) {
  const input = rangeSchema.parse(query);
  const fy = financialYearOf(new Date());
  const from = input.from && !Number.isNaN(Date.parse(input.from)) ? dayStart(input.from) : fy.start;
  const to = input.to && !Number.isNaN(Date.parse(input.to)) ? dayEnd(input.to) : dayEnd(new Date());
  if (from > to) throw new BadRequestException("The start date is after the end date");
  return { from, to, branchId: input.branchId || null, costCenterId: input.costCenterId || null };
}

function isDbError(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError || error instanceof Prisma.PrismaClientUnknownRequestError;
}

function csvText(file: Upload | undefined) {
  if (!file?.buffer?.length) throw new BadRequestException("Choose a CSV file");
  if (file.size > CSV_MAX_BYTES) throw new BadRequestException("The file is larger than 10 MB");
  if (!/\.(csv|txt)$/i.test(file.originalname)) throw new BadRequestException("Upload a .csv export");
  const text = file.buffer.toString("utf8");
  if (text.includes("\u0000")) throw new BadRequestException("That is not a text CSV file");
  return text;
}

const pick = (row: Record<string, string>, ...keys: string[]) => keys.map((key) => row[key]).find((value) => value !== undefined && value !== "") || "";

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);
  private keyCache?: { at: number; map: Map<string, string> };

  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberService,
  ) {}

  invalidateAccounts() {
    this.keyCache = undefined;
  }

  private async systemAccounts(tx: Tx | PrismaService) {
    if (this.keyCache && Date.now() - this.keyCache.at < 5 * 60_000) return this.keyCache.map;
    const rows = await tx.account.findMany({ where: { systemKey: { not: null } }, select: { id: true, systemKey: true } });
    const map = new Map(rows.map((row) => [row.systemKey!, row.id]));
    this.keyCache = { at: Date.now(), map };
    return map;
  }

  async accountFor(key: string, tx: Tx | PrismaService = this.prisma) {
    const id = (await this.systemAccounts(tx)).get(key);
    if (!id) throw new BadRequestException(`Ledger account ${key} is missing from the chart of accounts`);
    return id;
  }

  /** Postings before this date are covered by the cut-over opening balances and are never posted. */
  async ledgerStart(tx: Tx | PrismaService = this.prisma) {
    const setting = await tx.businessSetting.findUnique({ where: { key: "ledger" } });
    const start = (setting?.value as { startDate?: string } | null)?.startDate;
    return start ? new Date(start) : null;
  }

  async lockedUntil(tx: Tx | PrismaService = this.prisma) {
    const lock = await tx.periodLock.findFirst({ orderBy: { createdAt: "desc" } });
    return lock?.lockedUntil || null;
  }

  private companyState() {
    return stateCodeOf(process.env.GSTIN);
  }

  /** Same-state supply (CGST+SGST) unless both GSTINs are known and differ, or it is an export. */
  intraState(partyGstin?: string | null, currency = "INR") {
    if (currency !== "INR") return false;
    const company = this.companyState();
    const party = stateCodeOf(partyGstin);
    return !company || !party || company === party;
  }

  /** Writes one balanced, immutable journal. Idempotent on `postingKey`. */
  async post(tx: Tx, input: PostInput) {
    if (input.postingKey) {
      const existing = await tx.journalEntry.findUnique({ where: { postingKey: input.postingKey } });
      if (existing) return existing;
    }
    const keys = await this.systemAccounts(tx);
    const rate = input.exchangeRate && input.exchangeRate > 0 ? input.exchangeRate : 1;
    const resolved = input.lines.map((line) => {
      const accountId = line.accountId || (line.key ? keys.get(line.key) : undefined);
      if (!accountId) throw new BadRequestException(`Ledger account ${line.key || "(none)"} is missing from the chart of accounts`);
      return { ...line, accountId, debit: round2(line.debit || 0), credit: round2(line.credit || 0) };
    });
    let lines = compactLines(resolved);
    const debit = round2(lines.reduce((sum, line) => sum + (line.debit || 0), 0));
    const credit = round2(lines.reduce((sum, line) => sum + (line.credit || 0), 0));
    const gap = round2(debit - credit);
    if (gap !== 0 && Math.abs(gap) <= ROUNDING_TOLERANCE && !input.manual) {
      const roundOff = keys.get("ROUND_OFF");
      if (roundOff) lines = [...lines, { accountId: roundOff, debit: gap < 0 ? -gap : 0, credit: gap > 0 ? gap : 0, description: "Rounding" }];
    }
    const check = checkBalanced(lines);
    if (check.errors.length) throw new BadRequestException(check.errors.join("; "));
    if (input.manual) {
      const accounts = await tx.account.findMany({ where: { id: { in: lines.map((line) => line.accountId) } }, select: { id: true, isGroup: true, active: true, name: true } });
      for (const line of lines) {
        const account = accounts.find((row) => row.id === line.accountId);
        if (!account) throw new BadRequestException("Unknown ledger account");
        if (account.isGroup) throw new BadRequestException(`${account.name} is a group; post to one of its ledgers`);
        if (!account.active) throw new BadRequestException(`${account.name} is inactive`);
      }
    }
    let date = input.date;
    const locked = await this.lockedUntil(tx);
    if (locked && date <= locked) {
      if (input.manual) throw new BadRequestException(`The books are locked up to ${locked.toISOString().slice(0, 10)}`);
      date = dayStart(new Date(locked.getTime() + DAY));
    }
    const number = await this.numbers.next("JOURNAL", tx);
    return tx.journalEntry.create({
      data: {
        number,
        date,
        narration: input.narration.slice(0, 1000),
        reference: input.reference || undefined,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        postingKey: input.postingKey,
        currency: input.currency || "INR",
        exchangeRate: rate,
        total: check.debit,
        createdById: input.createdById || undefined,
        reversalOfId: input.reversalOfId,
        lines: {
          create: lines.map((line) => ({
            accountId: line.accountId,
            date,
            debit: line.debit || 0,
            credit: line.credit || 0,
            fcAmount: line.fcAmount ?? undefined,
            description: line.description || undefined,
            partyType: line.partyType || undefined,
            partyId: line.partyId || undefined,
            costCenterId: line.costCenterId || undefined,
            branchId: line.branchId || undefined,
            projectId: line.projectId || undefined,
          })),
        },
      },
      include: { lines: true },
    });
  }

  /**
   * Inline posting from a business transaction: configuration problems (missing chart, unbalanced source data) are logged
   * and left for the sync job instead of blocking the invoice or payment. Database errors still abort the transaction.
   */
  async tryPost<T>(label: string, work: () => Promise<T>) {
    try {
      return await work();
    } catch (error) {
      if (isDbError(error)) throw error;
      this.logger.warn(`Ledger posting skipped for ${label}: ${(error as Error).message}`);
      return null;
    }
  }

  async reverse(tx: Tx, entryId: string, reason: string, actorId?: string | null, date?: Date) {
    const entry = await tx.journalEntry.findUnique({ where: { id: entryId }, include: { lines: true, reversedBy: true } });
    if (!entry) throw new NotFoundException("Journal not found");
    if (entry.reversedBy) throw new ConflictException(`Already reversed by ${entry.reversedBy.number}`);
    if (entry.reversalOfId) throw new BadRequestException("A reversal cannot itself be reversed; post a new journal");
    return this.post(tx, {
      date: date || new Date(),
      narration: `Reversal of ${entry.number}: ${reason}`,
      reference: entry.reference,
      sourceType: entry.sourceType || undefined,
      sourceId: entry.sourceId || undefined,
      postingKey: entry.postingKey ? `reversal:${entry.postingKey}` : undefined,
      currency: entry.currency,
      exchangeRate: num(entry.exchangeRate),
      createdById: actorId,
      reversalOfId: entry.id,
      lines: entry.lines.map((line) => ({
        accountId: line.accountId,
        debit: num(line.credit),
        credit: num(line.debit),
        fcAmount: line.fcAmount === null ? null : -num(line.fcAmount),
        description: line.description,
        partyType: line.partyType,
        partyId: line.partyId,
        costCenterId: line.costCenterId,
        branchId: line.branchId,
        projectId: line.projectId,
      })),
    });
  }

  private async beforeStart(tx: Tx, date: Date) {
    const start = await this.ledgerStart(tx);
    return Boolean(start && date < start);
  }

  async postInvoice(tx: Tx, invoiceId: string) {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { customer: true, salesOrder: { select: { projectId: true } } } });
    if (!invoice || invoice.source || invoice.status === "CANCELLED") return null;
    if (await this.beforeStart(tx, invoice.issueDate)) return null;
    const rate = num(invoice.exchangeRate) || 1;
    const foreign = invoice.currency !== "INR";
    const subtotal = num(invoice.subtotal);
    const tax = num(invoice.tax);
    const tcs = num(invoice.tcsAmount);
    const stored = num(invoice.cgst) + num(invoice.sgst) + num(invoice.igst) > 0 || invoice.supplyType.endsWith("WOP");
    const split = invoice.reverseCharge
      ? { cgst: 0, sgst: 0, igst: 0 }
      : stored
        ? { cgst: num(invoice.cgst) * rate, sgst: num(invoice.sgst) * rate, igst: num(invoice.igst) * rate }
        : gstSplit(tax * rate, this.intraState(invoice.customer.gstin, invoice.currency));
    const total = invoice.reverseCharge ? subtotal : num(invoice.total);
    const projectId = invoice.salesOrder?.projectId || null;
    return this.post(tx, {
      date: invoice.issueDate,
      narration: `Sales invoice ${invoice.number} to ${invoice.customer.name}`,
      reference: invoice.number,
      sourceType: "invoice",
      sourceId: invoice.id,
      postingKey: `invoice:${invoice.id}`,
      currency: invoice.currency,
      exchangeRate: rate,
      createdById: invoice.createdById,
      lines: [
        { key: "AR", debit: (total + tcs) * rate, partyType: "CUSTOMER", partyId: invoice.customerId, fcAmount: foreign ? total + tcs : null, projectId },
        { key: foreign || invoice.supplyType.startsWith("EXP") ? "SALES_EXPORT" : "SALES", credit: subtotal * rate, projectId },
        { key: "CGST_OUT", credit: split.cgst },
        { key: "SGST_OUT", credit: split.sgst },
        { key: "IGST_OUT", credit: split.igst },
        { key: "TCS_PAYABLE", credit: tcs * rate },
      ],
    });
  }

  async postPayment(tx: Tx, paymentId: string) {
    const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { invoice: true, vendorBill: true } });
    if (!payment || payment.source || payment.status !== "POSTED") return null;
    if (await this.beforeStart(tx, payment.paidAt)) return null;
    const rate = num(payment.exchangeRate) || 1;
    const amount = num(payment.amount);
    const tds = num(payment.tdsAmount);
    const charges = num(payment.charges);
    const bank = payment.accountId ? { accountId: payment.accountId } : { key: payment.method === "CASH" ? "CASH" : "BANK" };
    const foreign = payment.currency !== "INR";
    const base = { date: payment.paidAt, reference: payment.reference || payment.number, sourceId: payment.id, postingKey: `payment:${payment.id}`, currency: payment.currency, exchangeRate: rate, createdById: payment.createdById };
    if (payment.direction === "IN") {
      const bookedRate = payment.invoice && payment.invoice.currency === payment.currency ? num(payment.invoice.exchangeRate) || rate : rate;
      const fx = round2(amount * rate - amount * bookedRate);
      return this.post(tx, {
        ...base,
        narration: `Receipt ${payment.number}${payment.invoice ? ` against ${payment.invoice.number}` : " on account"}`,
        sourceType: "payment_in",
        lines: [
          { ...bank, debit: (amount - tds - charges) * rate },
          { key: "TDS_RECEIVABLE", debit: tds * rate, partyType: payment.customerId ? "CUSTOMER" : null, partyId: payment.customerId },
          { key: "BANK_CHARGES", debit: charges * rate },
          { key: "AR", credit: amount * bookedRate, partyType: payment.customerId ? "CUSTOMER" : null, partyId: payment.customerId, fcAmount: foreign ? -amount : null },
          fx >= 0 ? { key: "FX_GAIN_LOSS", credit: fx } : { key: "FX_GAIN_LOSS", debit: -fx },
        ],
      });
    }
    const vendorId = payment.vendorId || payment.vendorBill?.vendorId || null;
    return this.post(tx, {
      ...base,
      narration: `Payment ${payment.number}${payment.vendorBill ? ` against bill ${payment.vendorBill.number}` : ""}`,
      sourceType: "payment_out",
      lines: [
        vendorId ? { key: "AP", debit: amount * rate, partyType: "VENDOR", partyId: vendorId, fcAmount: foreign ? amount : null } : { key: "EXP_GENERAL", debit: amount * rate },
        { key: "BANK_CHARGES", debit: charges * rate },
        { key: "TDS_PAYABLE", credit: tds * rate, partyType: vendorId ? "VENDOR" : null, partyId: vendorId },
        { ...bank, credit: (amount - tds + charges) * rate },
      ],
    });
  }

  /** Stock bills clear GRNI at the received value; any price difference goes to purchase price variance. */
  async postVendorBill(tx: Tx, billId: string) {
    const bill = await tx.vendorBill.findUnique({ where: { id: billId }, include: { vendor: true } });
    if (!bill || bill.source || bill.status === "CANCELLED") return null;
    const date = bill.billDate || bill.createdAt;
    if (await this.beforeStart(tx, date)) return null;
    const total = num(bill.total);
    const tax = bill.tax !== null ? num(bill.tax) : 0;
    const subtotal = bill.subtotal !== null ? num(bill.subtotal) : bill.reverseCharge ? total : round2(total - tax);
    const stored = num(bill.cgst) + num(bill.sgst) + num(bill.igst) > 0;
    const split = stored ? { cgst: num(bill.cgst), sgst: num(bill.sgst), igst: num(bill.igst) } : gstSplit(tax, this.intraState(bill.vendor.gstin));
    const lines: PostLine[] = [{ key: "AP", credit: total, partyType: "VENDOR", partyId: bill.vendorId }];
    let capitalised = 0;
    if (bill.itcEligible) lines.push({ key: "CGST_IN", debit: split.cgst }, { key: "SGST_IN", debit: split.sgst }, { key: "IGST_IN", debit: split.igst });
    else capitalised = tax;
    if (bill.reverseCharge) lines.push({ key: "RCM_PAYABLE", credit: tax });
    else {
      const roundOff = round2(total - subtotal - tax);
      if (roundOff) lines.push(roundOff > 0 ? { key: "ROUND_OFF", debit: roundOff } : { key: "ROUND_OFF", credit: -roundOff });
    }
    if (capitalised) lines.push(bill.expenseAccountId ? { accountId: bill.expenseAccountId, debit: capitalised, description: "GST not claimable" } : { key: bill.goodsReceiptId || bill.purchaseOrderId ? "PPV" : "EXP_GENERAL", debit: capitalised, description: "GST not claimable" });
    if (bill.expenseAccountId) lines.push({ accountId: bill.expenseAccountId, debit: subtotal });
    else if (bill.goodsReceiptId || bill.purchaseOrderId) {
      const received = bill.goodsReceiptId
        ? await tx.inventoryTransaction.findMany({ where: { referenceType: "GRN", referenceId: bill.goodsReceiptId }, select: { qty: true, unitCost: true } })
        : [];
      const grnValue = round2(received.reduce((sum, row) => sum + Math.abs(num(row.qty)) * num(row.unitCost), 0));
      const cleared = grnValue > 0 ? grnValue : subtotal;
      const variance = round2(subtotal - cleared);
      lines.push({ key: "GRNI", debit: cleared });
      if (variance) lines.push(variance > 0 ? { key: "PPV", debit: variance } : { key: "PPV", credit: -variance });
    } else lines.push({ key: "EXP_GENERAL", debit: subtotal });
    return this.post(tx, {
      date,
      narration: `Vendor bill ${bill.number}${bill.vendorInvoiceNo ? ` (${bill.vendorInvoiceNo})` : ""} from ${bill.vendor.name}`,
      reference: bill.vendorInvoiceNo || bill.number,
      sourceType: "vendor_bill",
      sourceId: bill.id,
      postingKey: `vendor_bill:${bill.id}`,
      lines,
    });
  }

  async postExpense(tx: Tx, expenseId: string) {
    const expense = await tx.expense.findUnique({ where: { id: expenseId }, include: { employee: { select: { name: true, branchId: true } } } });
    if (!expense || expense.status !== "PAID") return null;
    const date = expense.updatedAt;
    if (await this.beforeStart(tx, date)) return null;
    const amount = num(expense.amount);
    return this.post(tx, {
      date,
      narration: `Expense claim ${expense.number}${expense.employee ? ` - ${expense.employee.name}` : ""}: ${expense.category}`,
      reference: expense.number,
      sourceType: "expense",
      sourceId: expense.id,
      postingKey: `expense:${expense.id}`,
      lines: [
        { key: EXPENSE_ACCOUNT_KEYS[expense.category] || "EXP_GENERAL", debit: amount, branchId: expense.employee?.branchId, description: expense.description },
        { key: expense.payslipId ? "SALARY_PAYABLE" : "BANK", credit: amount, partyType: expense.employeeId ? "EMPLOYEE" : null, partyId: expense.employeeId },
      ],
    });
  }

  async postCreditNote(tx: Tx, noteId: string) {
    const note = await tx.creditNote.findUnique({ where: { id: noteId }, include: { customer: true } });
    if (!note || note.status === "CANCELLED") return null;
    return this.post(tx, {
      date: note.date,
      narration: `Credit note ${note.number} to ${note.customer.name}: ${note.reason}`,
      reference: note.number,
      sourceType: "credit_note",
      sourceId: note.id,
      postingKey: `credit_note:${note.id}`,
      createdById: note.createdById,
      lines: [
        { key: "SALES_RETURNS", debit: num(note.subtotal) },
        { key: "CGST_OUT", debit: num(note.cgst) },
        { key: "SGST_OUT", debit: num(note.sgst) },
        { key: "IGST_OUT", debit: num(note.igst) },
        { key: "AR", credit: num(note.total), partyType: "CUSTOMER", partyId: note.customerId },
      ],
    });
  }

  async postDebitNote(tx: Tx, noteId: string) {
    const note = await tx.debitNote.findUnique({ where: { id: noteId }, include: { vendor: true } });
    if (!note || note.status === "CANCELLED") return null;
    return this.post(tx, {
      date: note.date,
      narration: `Debit note ${note.number} to ${note.vendor.name}: ${note.reason}`,
      reference: note.number,
      sourceType: "debit_note",
      sourceId: note.id,
      postingKey: `debit_note:${note.id}`,
      createdById: note.createdById,
      lines: [
        { key: "AP", debit: num(note.total), partyType: "VENDOR", partyId: note.vendorId },
        { key: "PURCHASE_RETURNS", credit: num(note.subtotal) },
        { key: "CGST_IN", credit: num(note.cgst) },
        { key: "SGST_IN", credit: num(note.sgst) },
        { key: "IGST_IN", credit: num(note.igst) },
      ],
    });
  }

  /**
   * Values stock movements for one reference at the cost recorded on each transaction:
   * receipts against GRNI, dispatch to COGS, job consumption into WIP, production receipts out of WIP, anything else to stock adjustment.
   */
  async postStock(tx: Tx, referenceType: string | null, referenceId: string | null) {
    const rows = await tx.inventoryTransaction.findMany({ where: { referenceType, referenceId, ledgerEntryId: null }, include: { variant: { select: { sku: true } } } });
    if (!rows.length) return null;
    const lines: PostLine[] = [];
    for (const row of rows) {
      const value = round2(Math.abs(num(row.qty)) * num(row.unitCost));
      if (!value) continue;
      const inbound = num(row.qty) > 0;
      const description = `${row.variant.sku} x ${Math.abs(num(row.qty))}`;
      const contra =
        row.type === "PURCHASE" ? "GRNI" : row.type === "SALES" ? "COGS" : row.type === "CONSUMPTION" ? "WIP" : row.type === "PRODUCTION_RECEIPT" ? "WIP" : row.type === "TRANSFER" ? "INVENTORY" : "STOCK_ADJUSTMENT";
      lines.push(inbound ? { key: "INVENTORY", debit: value, description } : { key: "INVENTORY", credit: value, description });
      lines.push(inbound ? { key: contra, credit: value } : { key: contra, debit: value });
    }
    const first = rows.reduce((min, row) => (row.createdAt < min ? row.createdAt : min), rows[0].createdAt);
    const ids = rows.map((row) => row.id);
    const transferOnly = rows.every((row) => row.type === "TRANSFER");
    if (!lines.length || transferOnly || (await this.beforeStart(tx, first))) {
      await tx.inventoryTransaction.updateMany({ where: { id: { in: ids } }, data: { ledgerEntryId: "NONE" } });
      return null;
    }
    const entry = await this.post(tx, {
      date: first,
      narration: `Stock ${referenceType || "movement"}${referenceId ? ` ${referenceId}` : ""} (${rows.length} line${rows.length === 1 ? "" : "s"})`,
      sourceType: `stock:${referenceType || "OTHER"}`,
      sourceId: referenceId || ids[0],
      postingKey: `stock:${ids.sort()[0]}`,
      lines,
    });
    await tx.inventoryTransaction.updateMany({ where: { id: { in: ids } }, data: { ledgerEntryId: entry.id } });
    return entry;
  }

  /** Posts every document that has no journal yet; safe to run repeatedly (all postings are idempotent). */
  async syncAll(limit = 500) {
    const counts: Record<string, number> = { invoices: 0, payments: 0, bills: 0, expenses: 0, creditNotes: 0, debitNotes: 0, stock: 0, reversals: 0, failed: 0 };
    const unposted = (table: string, prefix: string, where: Prisma.Sql) =>
      this.prisma.$queryRaw<Array<{ id: string }>>`SELECT t."id" FROM ${Prisma.raw(`"${table}"`)} t WHERE ${where} AND NOT EXISTS (SELECT 1 FROM "JournalEntry" j WHERE j."postingKey" = ${prefix} || t."id") LIMIT ${limit}`;
    const run = async (key: string, ids: Array<{ id: string }>, work: (tx: Tx, id: string) => Promise<unknown>) => {
      for (const { id } of ids) {
        try {
          const result = await this.prisma.$transaction((tx) => work(tx, id));
          if (result) counts[key] += 1;
        } catch (error) {
          counts.failed += 1;
          this.logger.warn(`Ledger sync ${key} ${id}: ${(error as Error).message}`);
        }
      }
    };
    await run("invoices", await unposted("Invoice", "invoice:", Prisma.sql`t."source" IS NULL AND t."status" <> 'CANCELLED'`), (tx, id) => this.postInvoice(tx, id));
    await run("bills", await unposted("VendorBill", "vendor_bill:", Prisma.sql`t."source" IS NULL AND t."status" <> 'CANCELLED'`), (tx, id) => this.postVendorBill(tx, id));
    await run("payments", await unposted("Payment", "payment:", Prisma.sql`t."source" IS NULL AND t."status" = 'POSTED'`), (tx, id) => this.postPayment(tx, id));
    await run("expenses", await unposted("Expense", "expense:", Prisma.sql`t."status" = 'PAID'`), (tx, id) => this.postExpense(tx, id));
    await run("creditNotes", await unposted("CreditNote", "credit_note:", Prisma.sql`t."status" <> 'CANCELLED'`), (tx, id) => this.postCreditNote(tx, id));
    await run("debitNotes", await unposted("DebitNote", "debit_note:", Prisma.sql`t."status" <> 'CANCELLED'`), (tx, id) => this.postDebitNote(tx, id));
    const cancelled = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT j."id" FROM "JournalEntry" j JOIN "Invoice" i ON j."postingKey" = 'invoice:' || i."id"
      WHERE i."status" = 'CANCELLED' AND NOT EXISTS (SELECT 1 FROM "JournalEntry" r WHERE r."reversalOfId" = j."id") LIMIT ${limit}`;
    await run("reversals", cancelled, (tx, id) => this.reverse(tx, id, "Invoice cancelled"));
    const groups = await this.prisma.$queryRaw<Array<{ referenceType: string | null; referenceId: string | null }>>`
      SELECT DISTINCT "referenceType", "referenceId" FROM "InventoryTransaction" WHERE "ledgerEntryId" IS NULL LIMIT ${limit}`;
    for (const group of groups) {
      try {
        const entry = await this.prisma.$transaction((tx) => this.postStock(tx, group.referenceType, group.referenceId));
        if (entry) counts.stock += 1;
      } catch (error) {
        counts.failed += 1;
        this.logger.warn(`Ledger sync stock ${group.referenceType}/${group.referenceId}: ${(error as Error).message}`);
      }
    }
    return counts;
  }

  /** Party ids that were merged into this one, so a merged customer's history stays on its survivor's statement. */
  async partyIds(partyType: string, partyId: string) {
    if (partyType !== "CUSTOMER") return [partyId];
    const merged = await this.prisma.customer.findMany({ where: { mergedIntoId: partyId }, select: { id: true } });
    return [partyId, ...merged.map((row) => row.id)];
  }

  async partyNames(pairs: Array<{ partyType: string | null; partyId: string | null }>) {
    const ids = (type: string) => [...new Set(pairs.filter((pair) => pair.partyType === type && pair.partyId).map((pair) => pair.partyId!))];
    const [customers, vendors, employees] = await Promise.all([
      this.prisma.customer.findMany({ where: { id: { in: ids("CUSTOMER") } }, select: { id: true, name: true, code: true, mergedIntoId: true } }),
      this.prisma.vendor.findMany({ where: { id: { in: ids("VENDOR") } }, select: { id: true, name: true, code: true } }),
      this.prisma.employee.findMany({ where: { id: { in: ids("EMPLOYEE") } }, select: { id: true, name: true, code: true } }),
    ]);
    const map = new Map<string, { name: string; code: string; mergedIntoId?: string | null }>();
    for (const row of [...customers, ...vendors, ...employees]) map.set(row.id, row);
    return map;
  }
}

@Controller()
export class AccountingController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly numbers: NumberService,
    private readonly audit: AuditService,
    private readonly gst: GstService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  // ---------- Chart of accounts ----------

  @Get("accounting/accounts")
  @RequirePermissions("accounting.view")
  async accounts(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    assertStaff(req.user);
    const where: Prisma.AccountWhereInput =
      query.kind === "cash" ? { subtype: { in: ["BANK", "CASH"] }, isGroup: false, active: true } : query.kind === "expense" ? { type: { in: ["EXPENSE", "ASSET"] }, isGroup: false, active: true } : {};
    const [accounts, balances] = await Promise.all([
      this.prisma.account.findMany({ where, orderBy: { code: "asc" }, include: { bankAccount: { select: { bankName: true, accountNo: true } } } }),
      this.prisma.journalLine.groupBy({ by: ["accountId"], _sum: { debit: true, credit: true } }),
    ]);
    const sums = new Map(balances.map((row) => [row.accountId, row._sum]));
    return accounts.map((account) => {
      const sum = sums.get(account.id);
      return toPlain({ ...account, bankAccount: account.bankAccount ? { bankName: account.bankAccount.bankName, last4: account.bankAccount.accountNo.slice(-4) } : null, balance: naturalBalance(account.type, num(sum?.debit), num(sum?.credit)) });
    });
  }

  @Post("accounting/accounts")
  @RequirePermissions("accounting.create")
  async createAccount(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(accountSchema, body);
    await this.assertParent(input.parentId, input.type);
    try {
      const row = await this.prisma.account.create({ data: { ...input, code: input.code.toUpperCase() } });
      this.ledger.invalidateAccounts();
      await this.log(req, "create", "account", row.id, undefined, { code: row.code, name: row.name });
      return row;
    } catch (error) {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException("That account code or bank account is already used");
      throw error;
    }
  }

  @Patch("accounting/accounts/:id")
  @RequirePermissions("accounting.edit")
  async updateAccount(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(accountUpdateSchema, body);
    const before = await this.prisma.account.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Account not found");
    if (input.type && input.type !== before.type && (await this.prisma.journalLine.count({ where: { accountId: id } }))) throw new BadRequestException("The type of an account with postings cannot change");
    if (before.systemKey && input.active === false) throw new BadRequestException("System accounts used by automatic postings cannot be deactivated");
    if (input.isGroup && (await this.prisma.journalLine.count({ where: { accountId: id } }))) throw new BadRequestException("An account with postings cannot become a group");
    if (input.parentId === id) throw new BadRequestException("An account cannot be its own parent");
    await this.assertParent(input.parentId, input.type || before.type);
    const row = await this.prisma.account.update({ where: { id }, data: input });
    this.ledger.invalidateAccounts();
    await this.log(req, "update", "account", id, { name: before.name, active: before.active }, { name: row.name, active: row.active });
    return row;
  }

  private async assertParent(parentId: string | undefined, type: string) {
    if (!parentId) return;
    const parent = await this.prisma.account.findUnique({ where: { id: parentId } });
    if (!parent) throw new BadRequestException("Parent account not found");
    if (!parent.isGroup) throw new BadRequestException("The parent must be a group account");
    if (parent.type !== type) throw new BadRequestException("A sub-account must have the same type as its group");
  }

  // ---------- Journals ----------

  @Get("accounting/journals")
  @RequirePermissions("accounting.view")
  async journals(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const { from, to } = rangeOf(query);
    const q = String(query.q || "").trim();
    const sourceType = String(query.sourceType || "").trim();
    const rows = await this.prisma.journalEntry.findMany({
      where: {
        date: { gte: from, lte: to },
        sourceType: sourceType ? (sourceType === "manual" ? null : { startsWith: sourceType }) : undefined,
        OR: q ? [{ number: { contains: q, mode: "insensitive" } }, { narration: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }] : undefined,
      },
      include: { lines: { include: { account: { select: { code: true, name: true } } } }, reversedBy: { select: { number: true } } },
      orderBy: [{ date: "desc" }, { number: "desc" }],
      take: 500,
    });
    const names = await this.ledger.partyNames(rows.flatMap((row) => row.lines));
    return toPlain(rows.map((row) => ({ ...row, lines: row.lines.map((line) => ({ ...line, partyName: line.partyId ? names.get(line.partyId)?.name : undefined })) })));
  }

  @Get("accounting/journals/:id")
  @RequirePermissions("accounting.view")
  async journal(@Param("id") id: string, @Req() req: ReqUser) {
    assertStaff(req.user);
    const row = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: { include: { account: { select: { code: true, name: true } } } }, reversedBy: { select: { id: true, number: true } }, reversalOf: { select: { id: true, number: true } } } });
    if (!row) throw new NotFoundException("Journal not found");
    const names = await this.ledger.partyNames(row.lines);
    return toPlain({ ...row, lines: row.lines.map((line) => ({ ...line, partyName: line.partyId ? names.get(line.partyId)?.name : undefined })) });
  }

  @Post("accounting/journals")
  @RequirePermissions("accounting.create")
  async createJournal(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(journalSchema, body);
    for (const line of input.lines) if (Boolean(line.partyType) !== Boolean(line.partyId)) throw new BadRequestException("Choose both the party type and the party");
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.ledger.post(tx, {
        date: dayStart(input.date),
        narration: input.narration,
        reference: input.reference,
        currency: input.currency,
        exchangeRate: input.exchangeRate,
        createdById: req.user.id,
        manual: true,
        lines: input.lines,
      });
      await this.log(req, "create", "journal", entry.id, undefined, { number: entry.number, total: entry.total }, tx);
      return toPlain(entry);
    });
  }

  @Post("accounting/journals/:id/reverse")
  @RequirePermissions("accounting.approve")
  async reverseJournal(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(reverseSchema, body);
    return this.prisma.$transaction(async (tx) => {
      const entry = await this.ledger.reverse(tx, id, input.reason, req.user.id, input.date ? dayStart(input.date) : undefined);
      await this.log(req, "reverse", "journal", id, undefined, { reversal: entry.number, reason: input.reason }, tx);
      return toPlain(entry);
    });
  }

  @Post("accounting/sync")
  @RequirePermissions("accounting.edit")
  async sync(@Req() req: ReqUser) {
    const counts = await this.ledger.syncAll();
    await this.log(req, "sync", "ledger", "all", undefined, counts);
    return counts;
  }

  // ---------- Period locks ----------

  @Get("accounting/locks")
  @RequirePermissions("accounting.view")
  locks() {
    return this.prisma.periodLock.findMany({ orderBy: { createdAt: "desc" }, take: 50 });
  }

  @Post("accounting/locks")
  @RequirePermissions("accounting.approve")
  async lock(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(periodLockSchema, body);
    const current = await this.ledger.lockedUntil();
    const lockedUntil = dayEnd(input.lockedUntil);
    if (current && lockedUntil < current && !req.user.permissions.includes("accounting.override")) throw new BadRequestException("Reopening a locked period needs accounting.override");
    const row = await this.prisma.periodLock.create({ data: { lockedUntil, reason: input.reason, createdById: req.user.id } });
    await this.log(req, "lock", "period", row.id, { lockedUntil: current }, { lockedUntil, reason: input.reason });
    return row;
  }

  // ---------- Reports ----------

  @Get("accounting/trial-balance")
  @RequirePermissions("accounting.view")
  async trialBalance(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const range = rangeOf(query);
    const rows = await this.balances(range);
    const totals = rows.reduce((sum, row) => ({ opening: sum.opening + row.opening, debit: sum.debit + row.debit, credit: sum.credit + row.credit, closing: sum.closing + row.closing }), { opening: 0, debit: 0, credit: 0, closing: 0 });
    return { from: range.from, to: range.to, rows: rows.filter((row) => row.opening || row.debit || row.credit), totals: { opening: round2(totals.opening), debit: round2(totals.debit), credit: round2(totals.credit), closing: round2(totals.closing) } };
  }

  /** Per-account opening (before `from`), period debits/credits and closing, all as debit-positive amounts. */
  private async balances(range: { from: Date; to: Date; branchId: string | null; costCenterId: string | null }) {
    const branch = range.branchId ? Prisma.sql`AND l."branchId" = ${range.branchId}` : Prisma.empty;
    const costCenter = range.costCenterId ? Prisma.sql`AND l."costCenterId" = ${range.costCenterId}` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<Array<{ id: string; code: string; name: string; type: string; subtype: string | null; parentId: string | null; systemKey: string | null; opening: number; debit: number; credit: number }>>`
      SELECT a."id", a."code", a."name", a."type", a."subtype", a."parentId", a."systemKey",
        COALESCE(SUM(CASE WHEN l."date" < ${range.from} THEN l."debit" - l."credit" END), 0)::float8 AS opening,
        COALESCE(SUM(CASE WHEN l."date" >= ${range.from} THEN l."debit" END), 0)::float8 AS debit,
        COALESCE(SUM(CASE WHEN l."date" >= ${range.from} THEN l."credit" END), 0)::float8 AS credit
      FROM "Account" a
      LEFT JOIN "JournalLine" l ON l."accountId" = a."id" AND l."date" <= ${range.to} ${branch} ${costCenter}
      WHERE a."isGroup" = false
      GROUP BY a."id" ORDER BY a."code"`;
    return rows.map((row) => ({ ...row, opening: round2(row.opening), debit: round2(row.debit), credit: round2(row.credit), closing: round2(row.opening + row.debit - row.credit) }));
  }

  @Get("accounting/profit-loss")
  @RequirePermissions("accounting.view")
  async profitLoss(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const range = rangeOf(query);
    const rows = (await this.balances(range)).filter((row) => row.type === "INCOME" || row.type === "EXPENSE");
    const lines = rows.map((row) => ({ id: row.id, code: row.code, name: row.name, type: row.type, subtype: row.subtype, amount: naturalBalance(row.type, row.debit, row.credit) })).filter((row) => row.amount);
    const summary = profitOf(rows);
    const cogs = round2(lines.filter((line) => line.subtype === "COGS" || line.subtype === "DIRECT_EXPENSE").reduce((sum, line) => sum + line.amount, 0));
    const revenue = round2(lines.filter((line) => line.subtype === "SALES").reduce((sum, line) => sum + line.amount, 0));
    return { from: range.from, to: range.to, income: lines.filter((line) => line.type === "INCOME"), expenses: lines.filter((line) => line.type === "EXPENSE"), revenue, grossProfit: round2(revenue - cogs), totalIncome: summary.income, totalExpense: summary.expense, profit: summary.profit };
  }

  @Get("accounting/balance-sheet")
  @RequirePermissions("accounting.view")
  async balanceSheet(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const asOf = dayEnd(typeof query.asOf === "string" && !Number.isNaN(Date.parse(query.asOf)) ? query.asOf : new Date());
    const rows = await this.balances({ from: new Date(0), to: asOf, branchId: null, costCenterId: null });
    const section = (type: string) => rows.filter((row) => row.type === type).map((row) => ({ id: row.id, code: row.code, name: row.name, subtype: row.subtype, amount: naturalBalance(type, row.debit + Math.max(row.opening, 0), row.credit + Math.max(-row.opening, 0)) })).filter((row) => row.amount);
    const assets = section("ASSET");
    const liabilities = section("LIABILITY");
    const equity = section("EQUITY");
    const { profit } = profitOf(rows.map((row) => ({ type: row.type, debit: row.debit + Math.max(row.opening, 0), credit: row.credit + Math.max(-row.opening, 0) })));
    if (profit) equity.push({ id: "current-profit", code: "", name: "Profit not yet closed to retained earnings", subtype: null, amount: profit });
    const total = (list: Array<{ amount: number }>) => round2(list.reduce((sum, row) => sum + row.amount, 0));
    const totalAssets = total(assets);
    const totalLiabilities = total(liabilities) + total(equity);
    return { asOf, assets, liabilities, equity, totalAssets, totalLiabilitiesAndEquity: round2(totalLiabilities), difference: round2(totalAssets - totalLiabilities) };
  }

  /** Direct method: every cash/bank movement classified by the largest non-cash line of the same journal. */
  @Get("accounting/cash-flow")
  @RequirePermissions("accounting.view")
  async cashFlow(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const range = rangeOf(query);
    const [movements, openingRow] = await Promise.all([
      this.prisma.$queryRaw<Array<{ delta: number; type: string | null; subtype: string | null; systemKey: string | null; code: string | null }>>`
        WITH cash AS (
          SELECT l."entryId", SUM(l."debit" - l."credit") AS delta FROM "JournalLine" l JOIN "Account" a ON a."id" = l."accountId"
          WHERE a."subtype" IN ('CASH', 'BANK') AND l."date" BETWEEN ${range.from} AND ${range.to}
          GROUP BY l."entryId" HAVING SUM(l."debit" - l."credit") <> 0
        ), counter AS (
          SELECT DISTINCT ON (l."entryId") l."entryId", a."type", a."subtype", a."systemKey", a."code" FROM "JournalLine" l
          JOIN "Account" a ON a."id" = l."accountId" JOIN cash c ON c."entryId" = l."entryId"
          WHERE a."subtype" IS NULL OR a."subtype" NOT IN ('CASH', 'BANK')
          ORDER BY l."entryId", (l."debit" + l."credit") DESC
        )
        SELECT c.delta::float8 AS delta, k."type", k."subtype", k."systemKey", k."code" FROM cash c LEFT JOIN counter k ON k."entryId" = c."entryId"`,
      this.prisma.$queryRaw<Array<{ opening: number }>>`
        SELECT COALESCE(SUM(l."debit" - l."credit"), 0)::float8 AS opening FROM "JournalLine" l JOIN "Account" a ON a."id" = l."accountId"
        WHERE a."subtype" IN ('CASH', 'BANK') AND l."date" < ${range.from}`,
    ]);
    const label = (row: (typeof movements)[number]) => {
      if (row.subtype === "FIXED_ASSET") return ["INVESTING", "Purchase / sale of fixed assets"];
      if (row.type === "EQUITY") return ["FINANCING", "Capital"];
      if (row.code?.startsWith("22")) return ["FINANCING", "Loans"];
      if (row.systemKey === "AR" || row.systemKey === "CUSTOMER_ADVANCE") return ["OPERATING", "Receipts from customers"];
      if (row.systemKey === "AP" || row.systemKey === "VENDOR_ADVANCE") return ["OPERATING", "Payments to suppliers"];
      if (row.systemKey === "SALARY_PAYABLE" || row.systemKey === "REIMBURSEMENT_PAYABLE" || row.systemKey === "EMPLOYEE_ADVANCE") return ["OPERATING", "Payments to employees"];
      if (row.subtype === "TAX") return ["OPERATING", "Taxes and statutory dues"];
      if (row.type === "INCOME") return ["OPERATING", "Other income received"];
      if (row.type === "EXPENSE") return ["OPERATING", "Expenses paid"];
      return ["OPERATING", "Other operating"];
    };
    const sections: Record<string, Map<string, number>> = { OPERATING: new Map(), INVESTING: new Map(), FINANCING: new Map() };
    for (const row of movements) {
      const [section, name] = label(row);
      sections[section].set(name, round2((sections[section].get(name) || 0) + row.delta));
    }
    const listOf = (section: string) => [...sections[section].entries()].map(([name, amount]) => ({ name, amount }));
    const sum = (section: string) => round2([...sections[section].values()].reduce((total, value) => total + value, 0));
    const opening = round2(openingRow[0]?.opening || 0);
    const net = round2(sum("OPERATING") + sum("INVESTING") + sum("FINANCING"));
    return {
      from: range.from,
      to: range.to,
      operating: listOf("OPERATING"),
      investing: listOf("INVESTING"),
      financing: listOf("FINANCING"),
      totals: { operating: sum("OPERATING"), investing: sum("INVESTING"), financing: sum("FINANCING") },
      opening,
      net,
      closing: round2(opening + net),
    };
  }

  @Get("accounting/ledger/:accountId")
  @RequirePermissions("accounting.view")
  async accountLedger(@Param("accountId") accountId: string, @Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const range = rangeOf(query);
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundException("Account not found");
    const [openingSum, lines] = await Promise.all([
      this.prisma.journalLine.aggregate({ where: { accountId, date: { lt: range.from } }, _sum: { debit: true, credit: true } }),
      this.prisma.journalLine.findMany({ where: { accountId, date: { gte: range.from, lte: range.to } }, include: { entry: { select: { number: true, narration: true, reference: true, sourceType: true, sourceId: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 5000 }),
    ]);
    return this.statement(account.type, num(openingSum._sum.debit) - num(openingSum._sum.credit), lines, { account: toPlain(account), from: range.from, to: range.to });
  }

  @Get("accounting/party-ledger/:partyType/:partyId")
  @RequirePermissions("accounting.view")
  async partyLedger(@Param("partyType") partyType: string, @Param("partyId") partyId: string, @Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    if (!(PARTY_TYPES as readonly string[]).includes(partyType)) throw new BadRequestException("Unknown party type");
    const range = rangeOf(query);
    const ids = await this.ledger.partyIds(partyType, partyId);
    const where = { partyType, partyId: { in: ids } };
    const [openingSum, lines, names] = await Promise.all([
      this.prisma.journalLine.aggregate({ where: { ...where, date: { lt: range.from } }, _sum: { debit: true, credit: true } }),
      this.prisma.journalLine.findMany({ where: { ...where, date: { gte: range.from, lte: range.to } }, include: { entry: { select: { number: true, narration: true, reference: true, sourceType: true, sourceId: true } }, account: { select: { code: true, name: true } } }, orderBy: [{ date: "asc" }, { id: "asc" }], take: 5000 }),
      this.ledger.partyNames([{ partyType, partyId }]),
    ]);
    const type = partyType === "CUSTOMER" ? "ASSET" : "LIABILITY";
    return this.statement(type, num(openingSum._sum.debit) - num(openingSum._sum.credit), lines, { party: { type: partyType, id: partyId, name: names.get(partyId)?.name }, from: range.from, to: range.to });
  }

  private statement(type: string, openingNet: number, lines: Array<{ debit: unknown; credit: unknown } & Record<string, unknown>>, meta: Record<string, unknown>) {
    let running = round2(openingNet);
    const rows = lines.map((line) => {
      running = round2(running + num(line.debit) - num(line.credit));
      return { ...toPlain(line), balance: naturalBalance(type, Math.max(running, 0), Math.max(-running, 0)) };
    });
    const debit = round2(lines.reduce((sum, line) => sum + num(line.debit), 0));
    const credit = round2(lines.reduce((sum, line) => sum + num(line.credit), 0));
    return { ...meta, opening: naturalBalance(type, Math.max(openingNet, 0), Math.max(-openingNet, 0)), debit, credit, closing: naturalBalance(type, Math.max(running, 0), Math.max(-running, 0)), lines: rows };
  }

  @Get("accounting/day-book")
  @RequirePermissions("accounting.view")
  dayBook(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    return this.journals({ from: query.date || query.from, to: query.date || query.to }, req);
  }

  @Get("accounting/ageing")
  @RequirePermissions("accounting.view")
  async ageing(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    assertStaff(req.user);
    const side = query.side === "AP" ? "AP" : "AR";
    const asOf = dayEnd(typeof query.asOf === "string" && !Number.isNaN(Date.parse(query.asOf)) ? query.asOf : new Date());
    const accountId = await this.ledger.accountFor(side);
    const lines = await this.prisma.journalLine.findMany({
      where: { accountId, partyId: { not: null }, date: { lte: asOf } },
      select: { partyType: true, partyId: true, date: true, debit: true, credit: true, entry: { select: { sourceType: true, sourceId: true, reference: true } } },
    });
    const invoiceIds = lines.filter((line) => line.entry.sourceType === "invoice" && line.entry.sourceId).map((line) => line.entry.sourceId!);
    const billIds = lines.filter((line) => line.entry.sourceType === "vendor_bill" && line.entry.sourceId).map((line) => line.entry.sourceId!);
    const [invoices, bills, names] = await Promise.all([
      this.prisma.invoice.findMany({ where: { id: { in: invoiceIds } }, select: { id: true, dueDate: true } }),
      this.prisma.vendorBill.findMany({ where: { id: { in: billIds } }, select: { id: true, dueDate: true } }),
      this.ledger.partyNames(lines),
    ]);
    const due = new Map([...invoices, ...bills].map((row) => [row.id, row.dueDate]));
    const byParty = new Map<string, Array<{ date: Date; debit: number; credit: number; dueDate: Date | null; ref?: string }>>();
    for (const line of lines) {
      const name = names.get(line.partyId!);
      const owner = name?.mergedIntoId || line.partyId!;
      const list = byParty.get(owner) || [];
      list.push({ date: line.date, debit: num(line.debit), credit: num(line.credit), dueDate: (line.entry.sourceId && due.get(line.entry.sourceId)) || null, ref: line.entry.reference || undefined });
      byParty.set(owner, list);
    }
    const owners = await this.ledger.partyNames([...byParty.keys()].map((partyId) => ({ partyType: side === "AR" ? "CUSTOMER" : "VENDOR", partyId })));
    const rows = [...byParty.entries()]
      .map(([partyId, partyLines]) => {
        const result = fifoAgeing(partyLines, asOf, side === "AR" ? "DEBIT" : "CREDIT");
        return { partyId, partyType: side === "AR" ? "CUSTOMER" : "VENDOR", name: owners.get(partyId)?.name || partyId, code: owners.get(partyId)?.code, ...result.buckets, outstanding: result.outstanding, advance: result.advance };
      })
      .filter((row) => row.outstanding || row.advance)
      .sort((a, b) => b.outstanding - a.outstanding);
    const totals = Object.fromEntries((Object.keys(AGEING_LABELS) as Array<keyof typeof AGEING_LABELS>).map((key) => [key, round2(rows.reduce((sum, row) => sum + row[key], 0))]));
    return { side, asOf, labels: AGEING_LABELS, rows, totals: { ...totals, outstanding: round2(rows.reduce((sum, row) => sum + row.outstanding, 0)) } };
  }

  // ---------- Year end ----------

  @Get("accounting/financial-years")
  @RequirePermissions("accounting.view")
  async financialYears() {
    const [years, closes] = await Promise.all([
      this.prisma.financialYear.findMany({ orderBy: { startDate: "desc" } }),
      this.prisma.journalEntry.findMany({ where: { sourceType: "year_close" }, select: { sourceId: true, number: true, date: true } }),
    ]);
    return years.map((year) => ({ ...year, closedBy: closes.find((entry) => entry.sourceId === year.id) || null }));
  }

  @Post("accounting/year-close")
  @RequirePermissions("accounting.approve")
  async yearClose(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(yearCloseSchema, body);
    const year = await this.prisma.financialYear.findUnique({ where: { id: input.financialYearId } });
    if (!year) throw new NotFoundException("Financial year not found");
    const end = dayEnd(year.endDate);
    if (end > new Date()) throw new BadRequestException("A financial year can be closed only after it ends");
    const rows = (await this.balances({ from: new Date(0), to: end, branchId: null, costCenterId: null })).filter((row) => row.type === "INCOME" || row.type === "EXPENSE");
    const lines: PostLine[] = rows.map((row) => {
      const net = round2(row.closing);
      return net > 0 ? { accountId: row.id, credit: net } : { accountId: row.id, debit: -net };
    });
    const { profit } = profitOf(rows.map((row) => ({ type: row.type, debit: Math.max(row.closing, 0), credit: Math.max(-row.closing, 0) })));
    lines.push(profit >= 0 ? { key: "RETAINED_EARNINGS", credit: profit } : { key: "RETAINED_EARNINGS", debit: -profit });
    return this.prisma.$transaction(async (tx) => {
      const locked = await this.ledger.lockedUntil(tx);
      if (locked && locked >= end) throw new BadRequestException(`The books are already locked up to ${locked.toISOString().slice(0, 10)}`);
      const entry = await this.ledger.post(tx, { date: end, narration: `Year-end close ${year.label}: profit ${profit.toFixed(2)} to retained earnings`, sourceType: "year_close", sourceId: year.id, postingKey: `yearclose:${year.id}`, createdById: req.user.id, lines });
      await tx.periodLock.create({ data: { lockedUntil: end, reason: `Year ${year.label} closed`, createdById: req.user.id } });
      await this.log(req, "close", "financial_year", year.id, undefined, { journal: entry.number, profit }, tx);
      return { journal: toPlain(entry), profit };
    });
  }

  // ---------- Opening balances ----------

  @Get("accounting/opening-balances")
  @RequirePermissions("accounting.view")
  async openings(@Req() req: ReqUser) {
    assertStaff(req.user);
    const rows = await this.prisma.openingBalance.findMany({ include: { account: { select: { code: true, name: true } } }, orderBy: { createdAt: "desc" }, take: 5000 });
    const names = await this.ledger.partyNames(rows);
    return { startDate: await this.ledger.ledgerStart(), rows: toPlain(rows.map((row) => ({ ...row, partyName: row.partyId ? names.get(row.partyId)?.name : undefined }))) };
  }

  @Post("accounting/opening-balances")
  @RequirePermissions("accounting.override")
  async openingBalances(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(openingBalanceSchema, body);
    return this.postOpenings(req, dayStart(input.asOf), input.lines.map((line) => ({ ...line, dueDate: line.dueDate ? new Date(line.dueDate) : undefined })), "Opening balances");
  }

  /** Posts opening lines as one journal; any difference goes to Opening Balance Equity. Sets the ledger start date. */
  private async postOpenings(req: ReqUser, asOf: Date, lines: Array<{ accountId: string; debit: number; credit: number; partyType?: string; partyId?: string; reference?: string; dueDate?: Date }>, narration: string, offsetKey = "OPENING_EQUITY") {
    const accounts = await this.prisma.account.findMany({ where: { id: { in: lines.map((line) => line.accountId) } }, select: { id: true, isGroup: true, name: true, type: true } });
    for (const line of lines) {
      const account = accounts.find((row) => row.id === line.accountId);
      if (!account) throw new BadRequestException("Unknown account in the opening balances");
      if (account.isGroup) throw new BadRequestException(`${account.name} is a group account`);
      if (Boolean(line.partyType) !== Boolean(line.partyId)) throw new BadRequestException("Choose both the party type and the party");
    }
    const netted = lines.map((line) => {
      const net = round2(line.debit - line.credit);
      return { ...line, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0 };
    }).filter((line) => line.debit || line.credit);
    if (!netted.length) throw new BadRequestException("Every opening line is zero");
    const debit = round2(netted.reduce((sum, line) => sum + line.debit, 0));
    const credit = round2(netted.reduce((sum, line) => sum + line.credit, 0));
    const difference = round2(debit - credit);
    return this.prisma.$transaction(async (tx) => {
      const offsetId = await this.ledger.accountFor(offsetKey, tx);
      const postLines: PostLine[] = netted.map((line) => ({ accountId: line.accountId, debit: line.debit, credit: line.credit, partyType: line.partyType, partyId: line.partyId, description: line.reference }));
      if (difference) postLines.push(difference > 0 ? { accountId: offsetId, credit: difference, description: "Balancing figure" } : { accountId: offsetId, debit: -difference, description: "Balancing figure" });
      const entry = await this.ledger.post(tx, { date: asOf, narration, sourceType: "opening", sourceId: asOf.toISOString().slice(0, 10), createdById: req.user.id, lines: postLines });
      await tx.openingBalance.createMany({ data: netted.map((line) => ({ accountId: line.accountId, partyType: line.partyType, partyId: line.partyId, debit: line.debit, credit: line.credit, asOf, reference: line.reference, dueDate: line.dueDate, journalEntryId: entry.id, createdById: req.user.id })) });
      const start = await this.ledger.ledgerStart(tx);
      if (!start) await tx.businessSetting.upsert({ where: { key: "ledger" }, update: { value: { startDate: new Date(asOf.getTime() + DAY).toISOString() } }, create: { key: "ledger", value: { startDate: new Date(asOf.getTime() + DAY).toISOString() } } });
      await this.log(req, "opening", "ledger", entry.id, undefined, { number: entry.number, lines: netted.length, difference }, tx);
      return { journal: toPlain(entry), lines: netted.length, balancingFigure: difference };
    });
  }

  // ---------- Credit and debit notes ----------

  @Get("accounting/credit-notes")
  @RequirePermissions("accounting.view")
  creditNotes(@Req() req: ReqUser) {
    assertStaff(req.user);
    return this.prisma.creditNote.findMany({ include: { customer: { select: { name: true, code: true } }, invoice: { select: { number: true } } }, orderBy: { date: "desc" }, take: 500 });
  }

  @Post("accounting/credit-notes")
  @RequirePermissions("accounting.create")
  async createCreditNote(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(creditNoteSchema, body);
    const customer = await this.prisma.customer.findUnique({ where: { id: input.customerId }, include: { addresses: true } });
    if (!customer) throw new NotFoundException("Customer not found");
    const original = input.invoiceId ? await this.prisma.invoice.findUnique({ where: { id: input.invoiceId }, select: { placeOfSupply: true, supplyType: true, currency: true } }) : null;
    const place = original?.placeOfSupply ? { placeOfSupply: original.placeOfSupply, supplyType: original.supplyType } : await this.gst.placeOf(customer, original?.currency || "INR");
    if (input.invoiceId) {
      const invoice = await this.prisma.invoice.findFirst({ where: { id: input.invoiceId, customerId: input.customerId }, include: { creditNotes: true } });
      if (!invoice) throw new BadRequestException("Invoice does not belong to this customer");
      const credited = invoice.creditNotes.filter((note) => note.status !== "CANCELLED").reduce((sum, note) => sum + num(note.total), 0);
      const total = this.noteTotals(input.lines, true).total;
      if (credited + total > num(invoice.total) + 0.5) throw new BadRequestException("Credit notes would exceed the invoice value");
    }
    const split = await this.gst.splitFor(input.lines, place.placeOfSupply, place.supplyType);
    const totals = { subtotal: split.subtotal, tax: split.tax, total: round2(split.subtotal + split.tax), cgst: split.cgst, sgst: split.sgst, igst: split.igst };
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("CREDIT_NOTE", tx);
      const note = await tx.creditNote.create({ data: { number, customerId: input.customerId, invoiceId: input.invoiceId, date: input.date ? dayStart(input.date) : new Date(), reason: input.reason, notes: input.notes, items: input.lines, ...totals, placeOfSupply: place.placeOfSupply, supplyType: place.supplyType, createdById: req.user.id } });
      await this.ledger.postCreditNote(tx, note.id);
      await this.log(req, "create", "credit_note", note.id, undefined, { number, total: totals.total }, tx);
      return note;
    });
  }

  @Get("accounting/debit-notes")
  @RequirePermissions("accounting.view")
  debitNotes(@Req() req: ReqUser) {
    assertStaff(req.user);
    return this.prisma.debitNote.findMany({ include: { vendor: { select: { name: true, code: true } }, vendorBill: { select: { number: true, vendorInvoiceNo: true } } }, orderBy: { date: "desc" }, take: 500 });
  }

  @Post("accounting/debit-notes")
  @RequirePermissions("accounting.create")
  async createDebitNote(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(debitNoteSchema, body);
    const vendor = await this.prisma.vendor.findUnique({ where: { id: input.vendorId } });
    if (!vendor) throw new NotFoundException("Vendor not found");
    if (input.vendorBillId && !(await this.prisma.vendorBill.findFirst({ where: { id: input.vendorBillId, vendorId: input.vendorId }, select: { id: true } }))) throw new BadRequestException("Bill does not belong to this vendor");
    const totals = this.noteTotals(input.lines, this.ledger.intraState(vendor.gstin));
    return this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("DEBIT_NOTE", tx);
      const note = await tx.debitNote.create({ data: { number, vendorId: input.vendorId, vendorBillId: input.vendorBillId, date: input.date ? dayStart(input.date) : new Date(), reason: input.reason, notes: input.notes, items: input.lines, ...totals, createdById: req.user.id } });
      await this.ledger.postDebitNote(tx, note.id);
      await this.log(req, "create", "debit_note", note.id, undefined, { number, total: totals.total }, tx);
      return note;
    });
  }

  private noteTotals(lines: Array<{ amount: number; taxRate: number }>, intra: boolean) {
    const subtotal = round2(lines.reduce((sum, line) => sum + line.amount, 0));
    const tax = round2(lines.reduce((sum, line) => sum + round2((line.amount * line.taxRate) / 100), 0));
    return { subtotal, tax, total: round2(subtotal + tax), ...gstSplit(tax, intra) };
  }

  // ---------- Exports ----------

  @Get("accounting/export/tally")
  @RequirePermissions("accounting.export")
  async tally(@Query() query: Record<string, unknown>, @Req() req: ReqUser, @Res() res: Response) {
    assertStaff(req.user);
    const range = rangeOf(query);
    const entries = await this.prisma.journalEntry.findMany({ where: { date: { gte: range.from, lte: range.to } }, include: { lines: { include: { account: true } } }, orderBy: [{ date: "asc" }, { number: "asc" }], take: 20_000 });
    const names = await this.ledger.partyNames(entries.flatMap((entry) => entry.lines));
    const ledgers = new Map<string, string>();
    const ledgerName = (line: (typeof entries)[number]["lines"][number]) => {
      if (line.partyId && names.get(line.partyId) && (line.account.systemKey === "AR" || line.account.systemKey === "AP")) {
        const name = names.get(line.partyId)!.name;
        ledgers.set(name, line.account.systemKey === "AR" ? "Sundry Debtors" : "Sundry Creditors");
        return name;
      }
      ledgers.set(line.account.name, tallyGroupFor(line.account));
      return line.account.name;
    };
    const vouchers = entries.map((entry) => ({
      type: VOUCHER_TYPES[entry.sourceType || ""] || "Journal",
      number: entry.number,
      date: entry.date,
      narration: `${entry.narration}${entry.reference ? ` [${entry.reference}]` : ""}`,
      lines: entry.lines.map((line) => ({ ledger: ledgerName(line), debit: num(line.debit), credit: num(line.credit) })),
    }));
    const company = process.env.TALLY_COMPANY || process.env.COMPANY_NAME || "Fixotec";
    const xml = tallyXml(company, [...ledgers.entries()].map(([name, group]) => ({ name, group })), vouchers);
    await this.log(req, "export", "ledger", "tally", undefined, { from: range.from, to: range.to, vouchers: vouchers.length });
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader("Content-Disposition", contentDisposition(`tally-${range.from.toISOString().slice(0, 10)}-${range.to.toISOString().slice(0, 10)}.xml`));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.send(xml);
  }

  // ---------- Zoho Books migration ----------

  /** Zoho "Chart of Accounts" export: Account Name, Account Code, Account Type, Parent Account. */
  @Post("accounting/import/zoho/accounts")
  @RequirePermissions("accounting.override")
  @UseInterceptors(FileInterceptor("file", uploadLimits(CSV_MAX_BYTES)))
  async importZohoAccounts(@UploadedFile() file: Upload, @Req() req: ReqUser) {
    const records = csvRecords(csvText(file));
    if (!records.length) throw new BadRequestException("The file has no rows");
    const existing = await this.prisma.account.findMany();
    const byName = new Map(existing.map((account) => [account.name.toLowerCase(), account]));
    const codes = new Set(existing.map((account) => account.code));
    let created = 0;
    let matched = 0;
    const skipped: string[] = [];
    const pending: Array<{ name: string; parent: string }> = [];
    let serial = 9000;
    for (const record of records) {
      const name = pick(record, "account_name", "name").trim();
      if (!name) continue;
      const found = byName.get(name.toLowerCase());
      if (found) {
        matched += 1;
        if (!found.externalRef) await this.prisma.account.update({ where: { id: found.id }, data: { externalRef: `zoho:${name}` } });
        continue;
      }
      const mapped = mapZohoAccountType(pick(record, "account_type", "type"));
      let code = pick(record, "account_code", "code").replace(/[^A-Za-z0-9.-]/g, "").slice(0, 20).toUpperCase();
      if (!code || codes.has(code)) {
        while (codes.has(`Z${serial}`)) serial += 1;
        code = `Z${serial}`;
      }
      codes.add(code);
      try {
        const row = await this.prisma.account.create({ data: { code, name: name.slice(0, 120), type: mapped.type, subtype: mapped.subtype, externalRef: `zoho:${name}`.slice(0, 200) } });
        byName.set(name.toLowerCase(), row);
        created += 1;
        const parent = pick(record, "parent_account", "parent_account_name");
        if (parent) pending.push({ name, parent });
      } catch (error) {
        skipped.push(`${name}: ${(error as Error).message.slice(0, 120)}`);
      }
    }
    for (const link of pending) {
      const child = byName.get(link.name.toLowerCase());
      const parent = byName.get(link.parent.toLowerCase());
      if (!child || !parent || parent.type !== child.type) continue;
      if (!parent.isGroup && !(await this.prisma.journalLine.count({ where: { accountId: parent.id } }))) {
        await this.prisma.account.update({ where: { id: parent.id }, data: { isGroup: true } });
        parent.isGroup = true;
      }
      if (parent.isGroup) await this.prisma.account.update({ where: { id: child.id }, data: { parentId: parent.id } });
    }
    this.ledger.invalidateAccounts();
    await this.log(req, "import", "zoho_accounts", "chart", undefined, { created, matched, skipped: skipped.length });
    return { created, matched, skipped };
  }

  /** Zoho "Trial Balance" as of the cut-over date: Account (or Account Code), Debit / Net Debit, Credit / Net Credit. */
  @Post("accounting/import/zoho/trial-balance")
  @RequirePermissions("accounting.override")
  @UseInterceptors(FileInterceptor("file", uploadLimits(CSV_MAX_BYTES)))
  async importZohoTrialBalance(@UploadedFile() file: Upload, @Body() body: unknown, @Req() req: ReqUser) {
    const { asOf } = parseBody(asOfSchema, body ?? {});
    const records = csvRecords(csvText(file));
    const accounts = await this.prisma.account.findMany({ where: { isGroup: false } });
    const byCode = new Map(accounts.map((account) => [account.code.toLowerCase(), account]));
    const byName = new Map(accounts.map((account) => [account.name.toLowerCase(), account]));
    const missing: string[] = [];
    const lines: Array<{ accountId: string; debit: number; credit: number; reference?: string }> = [];
    for (const record of records) {
      const name = pick(record, "account", "account_name", "name");
      if (!name || /^total/i.test(name)) continue;
      const account = byCode.get(pick(record, "account_code", "code").toLowerCase()) || byName.get(name.toLowerCase());
      if (!account) {
        missing.push(name);
        continue;
      }
      const debit = Math.abs(parseAmount(pick(record, "debit", "net_debit", "closing_debit", "debit_inr")));
      const credit = Math.abs(parseAmount(pick(record, "credit", "net_credit", "closing_credit", "credit_inr")));
      if (debit || credit) lines.push({ accountId: account.id, debit, credit, reference: `Zoho TB: ${name}`.slice(0, 100) });
    }
    if (missing.length) throw new BadRequestException(`Import the chart of accounts first; these accounts are not in the chart: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "…" : ""}`);
    if (!lines.length) throw new BadRequestException("No balances found in the file");
    return this.postOpenings(req, dayStart(asOf), lines, `Opening trial balance from Zoho Books as of ${asOf}`);
  }

  /**
   * Zoho customer or vendor balances: splits the receivable/payable total from the trial balance into parties
   * (Dr party / Cr control for customers, the reverse for vendors), so ageing and statements work from day one.
   */
  @Post("accounting/import/zoho/party-balances")
  @RequirePermissions("accounting.override")
  @UseInterceptors(FileInterceptor("file", uploadLimits(CSV_MAX_BYTES)))
  async importZohoParties(@UploadedFile() file: Upload, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(partyImportSchema, body ?? {});
    const records = csvRecords(csvText(file));
    const customer = input.kind === "CUSTOMER";
    const parties = customer
      ? await this.prisma.customer.findMany({ where: { mergedIntoId: null }, select: { id: true, name: true, gstin: true } })
      : await this.prisma.vendor.findMany({ select: { id: true, name: true, gstin: true } });
    const byName = new Map(parties.map((party) => [party.name.toLowerCase(), party]));
    const byGstin = new Map(parties.filter((party) => party.gstin).map((party) => [party.gstin!.toUpperCase(), party]));
    const control = await this.ledger.accountFor(customer ? "AR" : "AP");
    const missing: string[] = [];
    const lines: Array<{ accountId: string; debit: number; credit: number; partyType?: string; partyId?: string; reference?: string; dueDate?: Date }> = [];
    let total = 0;
    for (const record of records) {
      const name = pick(record, "display_name", "customer_name", "vendor_name", "contact_name", "company_name", "name");
      if (!name) continue;
      const gstin = pick(record, "gst_identification_number_gstin", "gstin", "gst_identification_number").toUpperCase();
      const party = (gstin && byGstin.get(gstin)) || byName.get(name.toLowerCase());
      const balance = parseAmount(pick(record, "closing_balance", "balance", customer ? "outstanding_receivable_amount" : "outstanding_payable_amount", "receivables", "payables"));
      if (!balance) continue;
      if (!party) {
        missing.push(name);
        continue;
      }
      const signed = customer ? balance : -balance;
      total = round2(total + signed);
      lines.push({ accountId: control, debit: signed > 0 ? signed : 0, credit: signed < 0 ? -signed : 0, partyType: input.kind, partyId: party.id, reference: `Zoho opening: ${name}`.slice(0, 100) });
    }
    if (missing.length) throw new BadRequestException(`Create or import these ${customer ? "customers" : "vendors"} first: ${missing.slice(0, 20).join(", ")}${missing.length > 20 ? "…" : ""}`);
    if (!lines.length) throw new BadRequestException("No balances found in the file");
    lines.push({ accountId: control, debit: total < 0 ? -total : 0, credit: total > 0 ? total : 0, reference: "Reclassified from the control total" });
    return this.postOpenings(req, dayStart(input.asOf), lines, `${customer ? "Customer" : "Vendor"} opening balances from Zoho Books`);
  }

  /**
   * Zoho invoice history (Invoice Number, Invoice Date, Customer Name, Total, Balance, Due Date, Currency Code).
   * Stored for reference, statements and CRM; never posted, because the opening balances already carry the money.
   */
  @Post("accounting/import/zoho/invoices")
  @RequirePermissions("accounting.override")
  @UseInterceptors(FileInterceptor("file", uploadLimits(CSV_MAX_BYTES)))
  async importZohoInvoices(@UploadedFile() file: Upload, @Req() req: ReqUser) {
    const records = csvRecords(csvText(file));
    const customers = await this.prisma.customer.findMany({ where: { mergedIntoId: null }, select: { id: true, name: true } });
    const byName = new Map(customers.map((row) => [row.name.toLowerCase(), row.id]));
    const seen = new Set<string>();
    let created = 0;
    let existing = 0;
    const skipped: string[] = [];
    for (const record of records) {
      const number = pick(record, "invoice_number", "invoice_no").slice(0, 60);
      if (!number || seen.has(number)) continue;
      seen.add(number);
      const customerName = pick(record, "customer_name", "display_name");
      const customerId = byName.get(customerName.toLowerCase());
      const date = parseIndianDate(pick(record, "invoice_date", "date"));
      const total = parseAmount(pick(record, "total", "invoice_total", "total_bcy"));
      if (!customerId || !date || !total) {
        skipped.push(`${number}: ${!customerId ? `unknown customer "${customerName}"` : !date ? "bad date" : "no total"}`);
        continue;
      }
      const balance = parseAmount(pick(record, "balance", "balance_due"));
      const zohoStatus = pick(record, "invoice_status", "status").toLowerCase();
      const status = zohoStatus === "void" ? "CANCELLED" : balance <= 0.004 ? "PAID" : balance < total ? "PARTIAL" : "ISSUED";
      const ours = (await this.prisma.invoice.findUnique({ where: { number }, select: { id: true, source: true } })) ? `ZB-${number}` : number;
      if (await this.prisma.invoice.findUnique({ where: { number: ours }, select: { id: true } })) {
        existing += 1;
        continue;
      }
      const subtotal = parseAmount(pick(record, "sub_total", "subtotal")) || total;
      await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            number: ours,
            customerId,
            status,
            issueDate: date,
            dueDate: parseIndianDate(pick(record, "due_date")) || undefined,
            currency: (pick(record, "currency_code") || "INR").slice(0, 3).toUpperCase(),
            exchangeRate: parseAmount(pick(record, "exchange_rate")) || 1,
            subtotal,
            tax: round2(total - subtotal),
            total,
            source: "ZOHO_IMPORT",
            createdById: req.user.id,
            items: { create: [{ description: `Imported from Zoho Books (${number})`, qty: 1, rate: subtotal, taxRate: subtotal ? round2(((total - subtotal) / subtotal) * 100) : 0, amount: subtotal }] },
          },
        });
        const paid = round2(total - Math.max(balance, 0));
        if (paid > 0 && status !== "CANCELLED") {
          const paymentNumber = await this.numbers.next("PAYMENT", tx);
          await tx.payment.create({ data: { number: paymentNumber, direction: "IN", amount: paid, customerId, invoiceId: invoice.id, method: "IMPORTED", reference: `Zoho ${number}`, source: "ZOHO_IMPORT", paidAt: date, createdById: req.user.id } });
        }
      });
      created += 1;
    }
    await this.log(req, "import", "zoho_invoices", "history", undefined, { created, existing, skipped: skipped.length });
    return { created, existing, skipped: skipped.slice(0, 200) };
  }
}
