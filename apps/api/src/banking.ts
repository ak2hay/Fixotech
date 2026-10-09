import { BadGatewayException, BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Headers, Injectable, Logger, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { createHash, createHmac } from "crypto";
import {
  type BankCode,
  type MatchCandidate,
  type ParsedStatement,
  autoMatch,
  bankMatchSchema,
  bankPostSchema,
  bankRuleSchema,
  bulkPaymentFile,
  extractUtr,
  num,
  parseCsv,
  parseMt940,
  parsePdfStatement,
  parseStatementTable,
  paymentLinkSchema,
  paymentRunSchema,
  payoutMode,
  round2,
  ruleFor,
  scoreMatch,
  statementLineHash,
  validatePayout,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { z } from "zod";
import { safeEqual } from "./crypto";
import { readXlsx } from "./engineering";
import { env } from "./env";
import { AuthUser, Public, RequirePermissions, assertStaff, can, parseBody } from "./http";
import { LedgerService } from "./ledger";
import { PrismaService } from "./prisma.service";
import { AuditService, NumberService, Tx, WorkflowService, contentDisposition } from "./services";
import { MB, Upload, uploadLimits } from "./uploads";

type ReqUser = { user: AuthUser; ip?: string };
type RawReq = { rawBody?: Buffer; ip?: string };

const DAY = 86_400_000;
const OPEN_INVOICE = ["ISSUED", "PARTIAL", "OVERDUE"];
const OPEN_BILL = ["OPEN", "PARTIAL"];
const NOT_BANK_MATCHABLE = ["payment_in", "payment_out", "opening", "year_close"];

export type PaymentInput = {
  direction: "IN" | "OUT";
  amount: number;
  invoiceId?: string;
  vendorBillId?: string;
  customerId?: string;
  vendorId?: string;
  method?: string;
  reference?: string | null;
  paidAt?: string | Date;
  currency?: string;
  exchangeRate?: number;
  accountId?: string | null;
  tdsAmount?: number;
  tdsSection?: string;
  bankCharges?: number;
};

/** The one path every receipt and payment takes: manual entry, bank reconciliation, payment runs and gateway webhooks. */
@Injectable()
export class PaymentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly numbers: NumberService,
    private readonly workflow: WorkflowService,
    private readonly ledger: LedgerService,
  ) {}

  async assertCashAccount(accountId: string, tx: Tx | PrismaService = this.prisma) {
    const account = await tx.account.findUnique({ where: { id: accountId }, select: { subtype: true, isGroup: true, active: true } });
    if (!account || account.isGroup || !account.active || !["BANK", "CASH"].includes(account.subtype || "")) throw new BadRequestException("Choose an active bank or cash ledger");
  }

  async record(tx: Tx, input: PaymentInput, actorId: string | null) {
    if (input.direction === "IN" && input.vendorBillId) throw new BadRequestException("Incoming payments settle invoices, not vendor bills");
    if (input.direction === "OUT" && input.invoiceId) throw new BadRequestException("Outgoing payments settle vendor bills, not invoices");
    const amount = new Prisma.Decimal(input.amount).toDecimalPlaces(2);
    if ((input.tdsAmount || 0) + (input.direction === "IN" ? input.bankCharges || 0 : 0) > input.amount) throw new BadRequestException("TDS and charges cannot exceed the amount settled");
    if (input.accountId) await this.assertCashAccount(input.accountId, tx);
    let customerId = input.customerId;
    let vendorId = input.vendorId;
    if (input.invoiceId) {
      await tx.$queryRaw`SELECT "id" FROM "Invoice" WHERE "id" = ${input.invoiceId} FOR UPDATE`;
      const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId }, include: { payments: true } });
      if (!invoice) throw new NotFoundException("Invoice not found");
      if (invoice.status === "CANCELLED") throw new BadRequestException("Invoice is cancelled");
      customerId = invoice.customerId;
      const paid = invoice.payments.filter((payment) => payment.direction === "IN").reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      if (paid.add(amount).gt(new Prisma.Decimal(invoice.total).add(0.5))) throw new BadRequestException(`Payment exceeds the balance of ${invoice.number}`);
    } else if (customerId && !(await tx.customer.findUnique({ where: { id: customerId }, select: { id: true } }))) throw new NotFoundException("Customer not found");
    if (input.vendorBillId) {
      await tx.$queryRaw`SELECT "id" FROM "VendorBill" WHERE "id" = ${input.vendorBillId} FOR UPDATE`;
      const bill = await tx.vendorBill.findUnique({ where: { id: input.vendorBillId }, include: { payments: true } });
      if (!bill) throw new NotFoundException("Vendor bill not found");
      if (bill.status === "CANCELLED") throw new BadRequestException("Bill is cancelled");
      vendorId = bill.vendorId;
      const paid = bill.payments.reduce((sum, payment) => sum.add(payment.amount), new Prisma.Decimal(0));
      if (paid.add(amount).gt(new Prisma.Decimal(bill.total).add(0.5))) throw new BadRequestException(`Payment exceeds the balance of bill ${bill.number}`);
    } else if (vendorId && !(await tx.vendor.findUnique({ where: { id: vendorId }, select: { id: true } }))) throw new NotFoundException("Vendor not found");
    const number = await this.numbers.next("PAYMENT", tx);
    const payment = await tx.payment.create({
      data: {
        number,
        direction: input.direction,
        amount,
        invoiceId: input.invoiceId,
        vendorBillId: input.vendorBillId,
        customerId,
        vendorId,
        method: input.method || "NEFT",
        reference: input.reference || undefined,
        paidAt: input.paidAt ? new Date(input.paidAt) : undefined,
        currency: input.currency?.toUpperCase() || "INR",
        exchangeRate: input.exchangeRate || 1,
        accountId: input.accountId || undefined,
        tdsAmount: input.tdsAmount || 0,
        tdsSection: input.tdsSection,
        charges: input.bankCharges || 0,
        createdById: actorId,
      },
    });
    if (input.invoiceId) await this.refreshInvoice(tx, input.invoiceId);
    if (input.vendorBillId) await this.refreshBill(tx, input.vendorBillId);
    await this.workflow.record("payment", payment.id, null, "POSTED", actorId || undefined, undefined, tx);
    await this.ledger.tryPost(payment.number, () => this.ledger.postPayment(tx, payment.id));
    return payment;
  }

  async refreshInvoice(tx: Tx, invoiceId: string) {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { payments: true } });
    if (!invoice || invoice.status === "CANCELLED") return;
    const paid = invoice.payments.filter((payment) => payment.direction === "IN").reduce((sum, payment) => sum + num(payment.amount), 0);
    const status = paid <= 0 ? "ISSUED" : paid + 0.5 >= num(invoice.total) ? "PAID" : "PARTIAL";
    await tx.invoice.update({ where: { id: invoiceId }, data: { status } });
  }

  async refreshBill(tx: Tx, billId: string) {
    const bill = await tx.vendorBill.findUnique({ where: { id: billId }, include: { payments: true } });
    if (!bill || ![...OPEN_BILL, "PAID"].includes(bill.status)) return;
    const paid = bill.payments.reduce((sum, payment) => sum + num(payment.amount), 0);
    const status = paid <= 0 ? "OPEN" : paid + 0.5 >= num(bill.total) ? "PAID" : "PARTIAL";
    if (status !== bill.status) await tx.vendorBill.update({ where: { id: billId }, data: { status } });
  }
}

type CashAccount = { id: string; code: string; name: string; systemKey: string | null; subtype: string | null; bankAccount: { accountNo: string; ifsc: string | null; bankName: string } | null };
type PaymentForCash = { direction: string; amount: unknown; tdsAmount: unknown; charges: unknown; exchangeRate: unknown };
export type RunItemInput = { payeeName: string; accountNo: string; ifsc: string; email?: string | null; amount: number; tdsAmount?: number; mode?: string | null; reference: string; vendorId?: string | null; vendorBillId?: string | null; employeeId?: string | null; sourceType?: string | null; sourceId?: string | null };

/** Rupees that actually crossed the bank account for a payment: + in, - out. */
export function cashMoved(payment: PaymentForCash) {
  const rate = num(payment.exchangeRate) || 1;
  const amount = num(payment.amount);
  const tds = num(payment.tdsAmount);
  const charges = num(payment.charges);
  return payment.direction === "IN" ? round2((amount - tds - charges) * rate) : -round2((amount - tds + charges) * rate);
}

const methodOf = (description: string) => {
  const text = description.toUpperCase();
  for (const method of ["RTGS", "NEFT", "IMPS", "UPI"]) if (text.includes(method)) return method;
  if (/CHQ|CHEQUE|CLG/.test(text)) return "CHEQUE";
  if (/CASH/.test(text)) return "CASH";
  return "BANK";
};

@Injectable()
export class BankingService {
  private readonly logger = new Logger(BankingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly payments: PaymentService,
    private readonly numbers: NumberService,
  ) {}

  async cashAccount(accountId: string, tx: Tx | PrismaService = this.prisma): Promise<CashAccount> {
    const account = await tx.account.findUnique({ where: { id: accountId }, include: { bankAccount: { select: { accountNo: true, ifsc: true, bankName: true } } } });
    if (!account || account.isGroup || !["BANK", "CASH"].includes(account.subtype || "")) throw new BadRequestException("Choose a bank or cash ledger");
    return account;
  }

  /** Payments recorded through this ledger; payments without an account fall to the primary bank (or cash for CASH). */
  paymentScope(account: Pick<CashAccount, "id" | "systemKey">): Prisma.PaymentWhereInput {
    const legacy: Prisma.PaymentWhereInput | null = account.systemKey === "BANK" ? { accountId: null, method: { not: "CASH" } } : account.systemKey === "CASH" ? { accountId: null, method: "CASH" } : null;
    return { status: "POSTED", source: null, OR: [{ accountId: account.id }, ...(legacy ? [legacy] : [])] };
  }

  /** Journals hitting this account that are not payments (transfers, manual entries, rule postings), net per entry. */
  async openJournals(accountId: string, from: Date, to: Date) {
    const lines = await this.prisma.journalLine.findMany({
      where: { accountId, date: { gte: from, lte: to }, entry: { bankMatch: null, reversedBy: null, reversalOfId: null, OR: [{ sourceType: null }, { sourceType: { notIn: NOT_BANK_MATCHABLE } }] } },
      include: { entry: { select: { id: true, number: true, reference: true, narration: true, date: true } } },
      take: 3000,
    });
    const byEntry = new Map<string, { id: string; number: string; reference: string | null; narration: string; date: Date; amount: number }>();
    for (const line of lines) {
      const row = byEntry.get(line.entryId) || { id: line.entry.id, number: line.entry.number, reference: line.entry.reference, narration: line.entry.narration, date: line.entry.date, amount: 0 };
      row.amount = round2(row.amount + num(line.debit) - num(line.credit));
      byEntry.set(line.entryId, row);
    }
    return [...byEntry.values()].filter((row) => Math.abs(row.amount) >= 0.01);
  }

  // ---------- Import ----------

  async parseFile(file: Upload): Promise<{ format: string; parsed: ParsedStatement }> {
    const head = file.buffer.subarray(0, 8).toString("latin1");
    if (head.startsWith("%PDF")) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse: (data: Buffer) => Promise<{ text: string }> = require("pdf-parse/lib/pdf-parse.js");
      let text = "";
      try {
        text = (await pdfParse(file.buffer)).text;
      } catch {
        throw new BadRequestException("The PDF could not be read (it may be password-protected). Remove the password or download CSV/Excel.");
      }
      if (text.trim().length < 50) throw new BadRequestException("This PDF has no text layer (scanned). Download the statement as CSV or Excel from net banking.");
      return { format: "PDF", parsed: parsePdfStatement(text) };
    }
    if (head.startsWith("PK")) return { format: "XLSX", parsed: parseStatementTable(await readXlsx(file.buffer, 20_000)) };
    if (head.charCodeAt(0) === 0xd0 && head.charCodeAt(1) === 0xcf) throw new BadRequestException("Old .xls files are not supported. Open it in Excel and save as .xlsx or CSV.");
    const text = file.buffer.toString("utf8").replace(/^\uFEFF/, "");
    if (/(^|\n):20:/.test(text.slice(0, 2000)) && /\n:61:/.test(text)) return { format: "MT940", parsed: parseMt940(text) };
    const sample = text.split("\n").slice(0, 30).join("\n");
    const separator = (sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length ? "\t" : (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ";" : undefined;
    return { format: "CSV", parsed: parseStatementTable(parseCsv(text, separator)) };
  }

  async importStatement(accountId: string, file: Upload, actorId: string) {
    const account = await this.cashAccount(accountId);
    const { format, parsed } = await this.parseFile(file);
    if (!parsed.lines.length) throw new BadRequestException(parsed.warnings[0] || "No transactions found in the file");
    const fileLast4 = (parsed.accountNo || "").replace(/\D/g, "").slice(-4);
    const ourLast4 = (account.bankAccount?.accountNo || "").replace(/\D/g, "").slice(-4);
    if (fileLast4.length === 4 && ourLast4.length === 4 && fileLast4 !== ourLast4) throw new BadRequestException(`This statement is for account ending ${fileLast4}, but ${account.name} is linked to account ending ${ourLast4}`);
    const seen = new Map<string, number>();
    const rows = parsed.lines.map((line) => {
      const base = statementLineHash(account.id, line);
      const occurrence = seen.get(base) || 0;
      seen.set(base, occurrence + 1);
      const hash = createHash("sha256").update(statementLineHash(account.id, line, occurrence)).digest("hex");
      return { line, hash };
    });
    const dates = parsed.lines.map((line) => line.date.getTime());
    return this.prisma.$transaction(async (tx) => {
      const statement = await tx.bankStatement.create({
        data: { accountId: account.id, fileName: file.originalname.slice(0, 200), format, bank: parsed.bank, fromDate: new Date(Math.min(...dates)), toDate: new Date(Math.max(...dates)), openingBalance: parsed.openingBalance ?? undefined, closingBalance: parsed.closingBalance ?? undefined, warnings: parsed.warnings, importedById: actorId },
      });
      const created = await tx.bankTransaction.createMany({
        data: rows.map(({ line, hash }) => ({ accountId: account.id, statementId: statement.id, date: line.date, valueDate: line.valueDate || undefined, description: line.description.slice(0, 500) || "(no narration)", reference: line.reference?.slice(0, 60) || undefined, utr: extractUtr(`${line.description} ${line.reference || ""}`), debit: line.debit, credit: line.credit, balance: line.balance ?? undefined, hash })),
        skipDuplicates: true,
      });
      await tx.bankStatement.update({ where: { id: statement.id }, data: { lineCount: created.count, duplicates: rows.length - created.count } });
      return { statementId: statement.id, format, bank: parsed.bank, lines: rows.length, created: created.count, duplicates: rows.length - created.count, warnings: parsed.warnings };
    });
  }

  // ---------- Matching ----------

  private async candidatePool(account: CashAccount, from: Date, to: Date) {
    const [payments, journals] = await Promise.all([
      this.prisma.payment.findMany({
        where: { ...this.paymentScope(account), bankMatch: null, paidAt: { gte: from, lte: to } },
        include: { customer: { select: { name: true } }, vendor: { select: { name: true } }, invoice: { select: { number: true } }, vendorBill: { select: { number: true, vendorInvoiceNo: true } } },
        take: 5000,
      }),
      this.openJournals(account.id, from, to),
    ]);
    const candidates: Array<MatchCandidate & { kind: "PAYMENT" | "JOURNAL"; label: string }> = [
      ...payments.map((payment) => ({
        kind: "PAYMENT" as const,
        id: `p:${payment.id}`,
        date: payment.paidAt,
        amount: cashMoved(payment),
        reference: payment.reference,
        partyName: payment.customer?.name || payment.vendor?.name || null,
        documentNumbers: [payment.number, payment.invoice?.number, payment.vendorBill?.number, payment.vendorBill?.vendorInvoiceNo].filter((value): value is string => Boolean(value)),
        label: `${payment.number} · ${payment.customer?.name || payment.vendor?.name || (payment.direction === "IN" ? "Receipt" : "Payment")}${payment.invoice ? ` · ${payment.invoice.number}` : payment.vendorBill ? ` · ${payment.vendorBill.vendorInvoiceNo || payment.vendorBill.number}` : ""}`,
      })),
      ...journals.map((journal) => ({ kind: "JOURNAL" as const, id: `j:${journal.id}`, date: journal.date, amount: journal.amount, reference: journal.reference, documentNumbers: [journal.number], label: `${journal.number} · ${journal.narration}`.slice(0, 120) })),
    ];
    return candidates;
  }

  async autoReconcile(accountId: string, actorId: string | null) {
    const account = await this.cashAccount(accountId);
    const lines = await this.prisma.bankTransaction.findMany({ where: { accountId, status: { in: ["UNMATCHED", "SUGGESTED"] } }, orderBy: { date: "asc" }, take: 3000 });
    if (!lines.length) return { matched: 0, suggested: 0, posted: 0 };
    const from = new Date(Math.min(...lines.map((line) => line.date.getTime())) - 45 * DAY);
    const to = new Date(Math.max(...lines.map((line) => line.date.getTime())) + 15 * DAY);
    const candidates = await this.candidatePool(account, from, to);
    const byId = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const { matched, suggested } = autoMatch(lines.map((line) => ({ id: line.id, date: line.date, amount: round2(num(line.credit) - num(line.debit)), description: line.description, reference: line.reference, utr: line.utr })), candidates);
    const lineById = new Map(lines.map((line) => [line.id, line]));
    await this.prisma.$transaction(async (tx) => {
      for (const pair of matched) {
        const candidate = byId.get(pair.candidateId)!;
        const line = lineById.get(pair.lineId)!;
        await tx.bankMatch.create({ data: { transactionId: line.id, paymentId: candidate.kind === "PAYMENT" ? candidate.id.slice(2) : undefined, journalEntryId: candidate.kind === "JOURNAL" ? candidate.id.slice(2) : undefined, amount: Math.abs(candidate.amount) } });
        await tx.bankTransaction.update({ where: { id: line.id }, data: { status: "MATCHED", matchedAt: new Date(), matchedById: actorId, suggestion: { auto: true, score: pair.score } } });
      }
      for (const pair of suggested) {
        const candidate = byId.get(pair.candidateId)!;
        await tx.bankTransaction.update({ where: { id: pair.lineId }, data: { status: "SUGGESTED", suggestion: { kind: candidate.kind, id: candidate.id.slice(2), score: pair.score, label: candidate.label } } });
      }
    });
    const touched = new Set([...matched, ...suggested].map((pair) => pair.lineId));
    const rules = await this.prisma.bankRule.findMany({ where: { active: true } });
    const ruleShaped = rules.map((rule) => ({ ...rule, minAmount: rule.minAmount === null ? null : num(rule.minAmount), maxAmount: rule.maxAmount === null ? null : num(rule.maxAmount) }));
    let posted = 0;
    let ruleSuggested = 0;
    for (const line of lines) {
      if (touched.has(line.id)) continue;
      const rule = ruleFor({ description: line.description, reference: line.reference, debit: num(line.debit), credit: num(line.credit), accountId }, ruleShaped);
      if (!rule) continue;
      if (rule.autoPost) {
        try {
          await this.prisma.$transaction((tx) => this.postToAccount(tx, line.id, rule.counterAccountId, rule.narration || null, actorId, rule.id));
          posted++;
        } catch (error) {
          this.logger.warn(`Rule ${rule.name} could not post bank line ${line.id}: ${(error as Error).message}`);
        }
      } else {
        await this.prisma.bankTransaction.update({ where: { id: line.id }, data: { status: "SUGGESTED", ruleId: rule.id, suggestion: { kind: "RULE", id: rule.counterAccountId, ruleId: rule.id, label: rule.name } } });
        ruleSuggested++;
      }
    }
    return { matched: matched.length, suggested: suggested.length + ruleSuggested, posted };
  }

  private async lockLine(tx: Tx, id: string) {
    await tx.$queryRaw`SELECT "id" FROM "BankTransaction" WHERE "id" = ${id} FOR UPDATE`;
    const line = await tx.bankTransaction.findUnique({ where: { id } });
    if (!line) throw new NotFoundException("Bank line not found");
    if (line.status === "MATCHED") throw new ConflictException("This bank line is already reconciled");
    if (line.status === "IGNORED") throw new BadRequestException("Restore the line before reconciling it");
    return line;
  }

  async postToAccount(tx: Tx, lineId: string, counterAccountId: string, narration: string | null, actorId: string | null, ruleId?: string) {
    const line = await this.lockLine(tx, lineId);
    if (counterAccountId === line.accountId) throw new BadRequestException("The counter account cannot be the bank account itself");
    const counter = await tx.account.findUnique({ where: { id: counterAccountId }, select: { isGroup: true, active: true } });
    if (!counter || counter.isGroup || !counter.active) throw new BadRequestException("Choose an active ledger (not a group)");
    const credit = num(line.credit);
    const debit = num(line.debit);
    const previous = await tx.journalEntry.count({ where: { sourceType: "bank_txn", sourceId: line.id } });
    const entry = await this.ledger.post(tx, {
      date: line.date,
      narration: (narration || line.description).slice(0, 200),
      reference: line.utr || line.reference,
      sourceType: "bank_txn",
      sourceId: line.id,
      postingKey: `bank:${line.id}:${previous}`,
      createdById: actorId,
      lines: credit > 0 ? [{ accountId: line.accountId, debit: credit }, { accountId: counterAccountId, credit }] : [{ accountId: counterAccountId, debit }, { accountId: line.accountId, credit: debit }],
    });
    await tx.bankMatch.create({ data: { transactionId: line.id, journalEntryId: entry.id, amount: credit || debit } });
    await tx.bankTransaction.update({ where: { id: line.id }, data: { status: "MATCHED", matchedAt: new Date(), matchedById: actorId, ruleId: ruleId || line.ruleId, suggestion: Prisma.DbNull } });
    return entry;
  }

  async match(lineId: string, input: z.infer<typeof bankMatchSchema>, actorId: string) {
    if (!input.paymentIds.length && !input.journalEntryId) throw new BadRequestException("Pick the payments or journal this line clears");
    return this.prisma.$transaction(async (tx) => {
      const line = await this.lockLine(tx, lineId);
      const account = await this.cashAccount(line.accountId, tx);
      const target = round2(num(line.credit) - num(line.debit));
      const payments = input.paymentIds.length ? await tx.payment.findMany({ where: { id: { in: input.paymentIds }, ...this.paymentScope(account) }, include: { bankMatch: true } }) : [];
      if (payments.length !== input.paymentIds.length) throw new BadRequestException("Some payments were not recorded through this bank account");
      if (payments.some((payment) => payment.bankMatch)) throw new ConflictException("A payment is already matched to another bank line");
      let total = payments.reduce((sum, payment) => sum + cashMoved(payment), 0);
      let journalAmount = 0;
      if (input.journalEntryId) {
        const [journal] = (await this.openJournals(account.id, new Date(0), new Date(8.64e15))).filter((row) => row.id === input.journalEntryId);
        if (!journal) throw new BadRequestException("That journal does not touch this account or is already matched");
        journalAmount = journal.amount;
        total += journal.amount;
      }
      if (Math.abs(round2(total) - target) > 1) throw new BadRequestException(`Selected entries total ${round2(total).toFixed(2)} but the bank line is ${target.toFixed(2)}`);
      for (const payment of payments) await tx.bankMatch.create({ data: { transactionId: line.id, paymentId: payment.id, amount: Math.abs(cashMoved(payment)) } });
      if (input.journalEntryId) await tx.bankMatch.create({ data: { transactionId: line.id, journalEntryId: input.journalEntryId, amount: Math.abs(journalAmount) } });
      return tx.bankTransaction.update({ where: { id: line.id }, data: { status: "MATCHED", matchedAt: new Date(), matchedById: actorId, suggestion: Prisma.DbNull } });
    });
  }

  /** Records the receipt or payment the bank line evidences (or posts it straight to a ledger) and reconciles it. */
  async postLine(lineId: string, input: z.infer<typeof bankPostSchema>, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      if (input.kind === "ACCOUNT") {
        if (!input.counterAccountId) throw new BadRequestException("Choose the ledger to post to");
        return this.postToAccount(tx, lineId, input.counterAccountId, input.narration || null, actorId);
      }
      const line = await this.lockLine(tx, lineId);
      const credit = num(line.credit);
      const debit = num(line.debit);
      const common = { accountId: line.accountId, paidAt: line.date, reference: line.utr || line.reference || undefined, method: methodOf(line.description), tdsAmount: input.tdsAmount || 0 };
      let payment;
      if (input.kind === "RECEIPT") {
        if (!credit) throw new BadRequestException("Only deposits can be recorded as receipts");
        if (!input.invoiceId && !input.customerId) throw new BadRequestException("Choose the customer or invoice");
        payment = await this.payments.record(tx, { ...common, direction: "IN", amount: round2(credit + (input.tdsAmount || 0)), invoiceId: input.invoiceId, customerId: input.customerId }, actorId);
      } else {
        if (!debit) throw new BadRequestException("Only withdrawals can be recorded as vendor payments");
        if (!input.vendorBillId && !input.vendorId) throw new BadRequestException("Choose the vendor or bill");
        payment = await this.payments.record(tx, { ...common, direction: "OUT", amount: round2(debit + (input.tdsAmount || 0)), vendorBillId: input.vendorBillId, vendorId: input.vendorId }, actorId);
      }
      await tx.bankMatch.create({ data: { transactionId: line.id, paymentId: payment.id, amount: credit || debit } });
      await tx.bankTransaction.update({ where: { id: line.id }, data: { status: "MATCHED", matchedAt: new Date(), matchedById: actorId, suggestion: Prisma.DbNull } });
      return payment;
    });
  }

  async unmatch(lineId: string, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "BankTransaction" WHERE "id" = ${lineId} FOR UPDATE`;
      const line = await tx.bankTransaction.findUnique({ where: { id: lineId }, include: { matches: { include: { journalEntry: { include: { reversedBy: true } } } } } });
      if (!line) throw new NotFoundException("Bank line not found");
      for (const match of line.matches) {
        const entry = match.journalEntry;
        if (entry && entry.sourceType === "bank_txn" && entry.sourceId === line.id && !entry.reversedBy) await this.ledger.reverse(tx, entry.id, `Bank line unreconciled: ${line.description.slice(0, 80)}`, actorId);
      }
      await tx.bankMatch.deleteMany({ where: { transactionId: lineId } });
      return tx.bankTransaction.update({ where: { id: lineId }, data: { status: "UNMATCHED", matchedAt: null, matchedById: null, suggestion: Prisma.DbNull, ruleId: null } });
    });
  }

  async candidates(lineId: string) {
    const line = await this.prisma.bankTransaction.findUnique({ where: { id: lineId } });
    if (!line) throw new NotFoundException("Bank line not found");
    const account = await this.cashAccount(line.accountId);
    const amount = round2(num(line.credit) - num(line.debit));
    const shaped = { id: line.id, date: line.date, amount, description: line.description, reference: line.reference, utr: line.utr };
    const pool = await this.candidatePool(account, new Date(line.date.getTime() - 90 * DAY), new Date(line.date.getTime() + 30 * DAY));
    const entries = pool
      .filter((candidate) => Math.sign(candidate.amount) === Math.sign(amount))
      .map((candidate) => ({ kind: candidate.kind, id: candidate.id.slice(2), label: candidate.label, date: candidate.date, amount: candidate.amount, score: scoreMatch(shaped, candidate) }))
      .sort((a, b) => b.score - a.score || Math.abs(Math.abs(a.amount) - Math.abs(amount)) - Math.abs(Math.abs(b.amount) - Math.abs(amount)))
      .slice(0, 40);
    const narration = `${line.description} ${line.reference || ""}`.toUpperCase();
    const squashed = narration.replace(/[^A-Z0-9]/g, "");
    const rank = (balance: number, number: string, party: string) => {
      let score = 0;
      if (Math.abs(balance - Math.abs(amount)) <= 1) score += 50;
      else if (balance >= Math.abs(amount) * 0.85 && balance <= Math.abs(amount) * 1.15) score += 20;
      if (squashed.includes(number.toUpperCase().replace(/[^A-Z0-9]/g, ""))) score += 40;
      if (party.toUpperCase().split(/[^A-Z0-9]+/).some((token) => token.length >= 4 && narration.includes(token))) score += 25;
      return score;
    };
    let documents: Array<{ kind: "INVOICE" | "BILL"; id: string; number: string; party: string; partyId: string; date: Date; balance: number; score: number }> = [];
    if (amount > 0) {
      const invoices = await this.prisma.invoice.findMany({ where: { status: { in: OPEN_INVOICE }, source: null }, include: { customer: { select: { id: true, name: true } }, payments: { select: { amount: true, direction: true } } }, orderBy: { issueDate: "desc" }, take: 1000 });
      documents = invoices.map((invoice) => {
        const balance = round2(num(invoice.total) - invoice.payments.filter((payment) => payment.direction === "IN").reduce((sum, payment) => sum + num(payment.amount), 0));
        return { kind: "INVOICE" as const, id: invoice.id, number: invoice.number, party: invoice.customer.name, partyId: invoice.customer.id, date: invoice.issueDate, balance, score: rank(balance, invoice.number, invoice.customer.name) };
      });
    } else {
      const bills = await this.prisma.vendorBill.findMany({ where: { status: { in: OPEN_BILL }, source: null }, include: { vendor: { select: { id: true, name: true } }, payments: { select: { amount: true } } }, orderBy: { createdAt: "desc" }, take: 1000 });
      documents = bills.map((bill) => {
        const balance = round2(num(bill.total) - bill.payments.reduce((sum, payment) => sum + num(payment.amount), 0));
        return { kind: "BILL" as const, id: bill.id, number: bill.vendorInvoiceNo || bill.number, party: bill.vendor.name, partyId: bill.vendor.id, date: bill.billDate || bill.createdAt, balance, score: rank(balance, `${bill.number} ${bill.vendorInvoiceNo || ""}`, bill.vendor.name) };
      });
    }
    documents = documents.filter((doc) => doc.balance > 0.5).sort((a, b) => b.score - a.score).slice(0, 25);
    return { line: { ...line, debit: num(line.debit), credit: num(line.credit), balance: line.balance === null ? null : num(line.balance), amount }, entries, documents };
  }

  /** Bank reconciliation statement: book balance, items in transit, items only in the bank, and the bank balance. */
  async summary(accountId: string, asOfText?: string) {
    const account = await this.cashAccount(accountId);
    const asOf = asOfText && /^\d{4}-\d{2}-\d{2}$/.test(asOfText) ? new Date(`${asOfText}T23:59:59.999Z`) : new Date();
    const firstStatement = await this.prisma.bankStatement.findFirst({ where: { accountId }, orderBy: { fromDate: "asc" } });
    const lastStatement = await this.prisma.bankStatement.findFirst({ where: { accountId, toDate: { lte: asOf } }, orderBy: [{ toDate: "desc" }, { createdAt: "desc" }] });
    const since = firstStatement?.fromDate ? new Date(firstStatement.fromDate.getTime() - 30 * DAY) : new Date(asOf.getTime() - 90 * DAY);
    const [book, payments, journals, unrecorded] = await Promise.all([
      this.prisma.journalLine.aggregate({ where: { accountId, date: { lte: asOf } }, _sum: { debit: true, credit: true } }),
      this.prisma.payment.findMany({ where: { ...this.paymentScope(account), bankMatch: null, paidAt: { gte: since, lte: asOf } }, include: { customer: { select: { name: true } }, vendor: { select: { name: true } } }, orderBy: { paidAt: "asc" }, take: 2000 }),
      this.openJournals(accountId, since, asOf),
      this.prisma.bankTransaction.findMany({ where: { accountId, status: { in: ["UNMATCHED", "SUGGESTED"] }, date: { lte: asOf } }, orderBy: { date: "asc" }, take: 2000 }),
    ]);
    const bookBalance = round2(num(book._sum.debit) - num(book._sum.credit));
    const inTransit = [
      ...payments.map((payment) => ({ kind: "PAYMENT", id: payment.id, number: payment.number, date: payment.paidAt, party: payment.customer?.name || payment.vendor?.name || "", amount: cashMoved(payment) })),
      ...journals.map((journal) => ({ kind: "JOURNAL", id: journal.id, number: journal.number, date: journal.date, party: journal.narration, amount: journal.amount })),
    ];
    const depositsInTransit = round2(inTransit.filter((row) => row.amount > 0).reduce((sum, row) => sum + row.amount, 0));
    const chequesNotCleared = round2(-inTransit.filter((row) => row.amount < 0).reduce((sum, row) => sum + row.amount, 0));
    const bankOnlyCredits = round2(unrecorded.reduce((sum, line) => sum + num(line.credit), 0));
    const bankOnlyDebits = round2(unrecorded.reduce((sum, line) => sum + num(line.debit), 0));
    const expectedBank = round2(bookBalance - depositsInTransit + chequesNotCleared + bankOnlyCredits - bankOnlyDebits);
    const bankBalance = lastStatement?.closingBalance != null ? num(lastStatement.closingBalance) : null;
    return {
      account: { id: account.id, code: account.code, name: account.name, bank: account.bankAccount ? `${account.bankAccount.bankName} ···${account.bankAccount.accountNo.slice(-4)}` : null },
      asOf,
      since,
      bookBalance,
      depositsInTransit,
      chequesNotCleared,
      bankOnlyCredits,
      bankOnlyDebits,
      expectedBank,
      bankBalance,
      statementDate: lastStatement?.toDate || null,
      difference: bankBalance === null ? null : round2(bankBalance - expectedBank),
      inTransit: inTransit.sort((a, b) => a.date.getTime() - b.date.getTime()).slice(0, 500),
    };
  }

  // ---------- Payment runs ----------

  /** Used by vendor runs below and by payroll for salary runs. */
  async createRun(tx: Tx, input: { kind: string; accountId: string; bankFormat: BankCode; valueDate: Date; notes?: string; items: RunItemInput[] }, actorId: string | null) {
    const account = await this.cashAccount(input.accountId, tx);
    if (account.subtype !== "BANK" || !account.bankAccount) throw new BadRequestException(`Link ${account.name} to a bank account (Organization → Bank accounts) so the file carries the debit account number`);
    const problems = input.items.flatMap((item) => validatePayout({ ...item, amount: round2(item.amount - (item.tdsAmount || 0)) }).map((problem) => `${item.payeeName}: ${problem}`));
    if (problems.length) throw new BadRequestException(`Fix the beneficiary details first: ${problems.slice(0, 6).join("; ")}${problems.length > 6 ? "…" : ""}`);
    const number = await this.numbers.next("PAYMENT_RUN", tx);
    const total = round2(input.items.reduce((sum, item) => sum + item.amount - (item.tdsAmount || 0), 0));
    return tx.paymentRun.create({
      data: {
        number,
        kind: input.kind,
        accountId: account.id,
        bankFormat: input.bankFormat,
        valueDate: input.valueDate,
        total,
        notes: input.notes,
        createdById: actorId,
        items: {
          create: input.items.map((item) => ({ payeeName: item.payeeName.slice(0, 100), accountNo: item.accountNo.replace(/\s/g, ""), ifsc: item.ifsc.toUpperCase(), email: item.email || undefined, amount: item.amount, tdsAmount: item.tdsAmount || 0, mode: item.mode || payoutMode({ ...item, amount: item.amount - (item.tdsAmount || 0) }, account.bankAccount!.ifsc), reference: item.reference.slice(0, 40), vendorId: item.vendorId || undefined, vendorBillId: item.vendorBillId || undefined, employeeId: item.employeeId || undefined, sourceType: item.sourceType || undefined, sourceId: item.sourceId || undefined })),
        },
      },
      include: { items: true },
    });
  }

  /** Marks the bank's accepted rows paid: vendor rows become payments against their bills, salary rows clear salaries payable. */
  async completeRun(runId: string, failed: Record<string, string>, actorId: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PaymentRun" WHERE "id" = ${runId} FOR UPDATE`;
      const run = await tx.paymentRun.findUnique({ where: { id: runId }, include: { items: true } });
      if (!run) throw new NotFoundException("Payment run not found");
      if (!["APPROVED", "EXPORTED"].includes(run.status)) throw new BadRequestException(`A ${run.status.toLowerCase()} run cannot be completed`);
      const journalLines: Array<{ key?: string; accountId?: string; debit?: number; credit?: number; partyType?: string | null; partyId?: string | null; description?: string }> = [];
      for (const item of run.items) {
        if (item.status !== "PENDING") continue;
        if (failed[item.id] !== undefined) {
          await tx.paymentRunItem.update({ where: { id: item.id }, data: { status: "FAILED", error: failed[item.id] || "Rejected by bank" } });
          continue;
        }
        const payout = round2(num(item.amount) - num(item.tdsAmount));
        if (run.kind === "VENDOR") {
          const payment = await this.payments.record(tx, { direction: "OUT", amount: num(item.amount), tdsAmount: num(item.tdsAmount), vendorBillId: item.vendorBillId || undefined, vendorId: item.vendorId || undefined, accountId: run.accountId, paidAt: run.valueDate, method: item.mode || "NEFT", reference: `${run.number}/${item.reference}`.slice(0, 120) }, actorId);
          await tx.paymentRunItem.update({ where: { id: item.id }, data: { status: "PAID", paymentId: payment.id } });
        } else {
          journalLines.push({ key: run.kind === "SALARY" ? "SALARY_PAYABLE" : "REIMBURSEMENT_PAYABLE", debit: payout, partyType: item.employeeId ? "EMPLOYEE" : null, partyId: item.employeeId, description: item.payeeName });
          await tx.paymentRunItem.update({ where: { id: item.id }, data: { status: "PAID" } });
          if (item.sourceType === "PAYSLIP" && item.sourceId) await tx.payslip.updateMany({ where: { id: item.sourceId, status: "APPROVED" }, data: { status: "PAID", paidAt: run.valueDate } });
        }
      }
      const payrollRuns = await tx.payrollRun.findMany({ where: { paymentRunId: run.id, status: "APPROVED" }, select: { id: true } });
      for (const payroll of payrollRuns) {
        const unpaid = await tx.payslip.count({ where: { runId: payroll.id, status: "APPROVED", net: { gt: 0 } } });
        if (!unpaid) await tx.payrollRun.update({ where: { id: payroll.id }, data: { status: "PAID", paidAt: run.valueDate } });
      }
      if (journalLines.length) {
        const total = round2(journalLines.reduce((sum, line) => sum + (line.debit || 0), 0));
        await this.ledger.post(tx, { date: run.valueDate, narration: `${run.kind === "SALARY" ? "Salary" : "Reimbursement"} payout ${run.number}`, reference: run.number, sourceType: "payment_run", sourceId: run.id, postingKey: `payrun:${run.id}`, createdById: actorId, lines: [...journalLines, { accountId: run.accountId, credit: total }] });
      }
      return tx.paymentRun.update({ where: { id: run.id }, data: { status: "COMPLETED", completedAt: new Date() }, include: { items: true } });
    });
  }
}

@Injectable()
export class RazorpayClient {
  get configured() {
    return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
  }

  private async call<T>(path: string, body: unknown): Promise<T> {
    if (!this.configured) throw new BadRequestException("Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)");
    const response = await fetch(`https://api.razorpay.com/v1${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Basic ${Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString("base64")}` },
      body: JSON.stringify(body ?? {}),
      signal: AbortSignal.timeout(20_000),
    });
    const data = (await response.json().catch(() => ({}))) as { error?: { description?: string } } & T;
    if (!response.ok) throw new BadGatewayException(`Razorpay: ${data.error?.description || response.statusText}`);
    return data;
  }

  createLink(body: Record<string, unknown>) {
    return this.call<{ id: string; short_url: string; status: string; expire_by?: number }>("/payment_links", body);
  }

  cancelLink(id: string) {
    return this.call<{ id: string; status: string }>(`/payment_links/${encodeURIComponent(id)}/cancel`, {});
  }

  verify(raw: Buffer | undefined, signature: string | undefined) {
    if (!env.RAZORPAY_WEBHOOK_SECRET || !raw || !signature) return false;
    return safeEqual(signature, createHmac("sha256", env.RAZORPAY_WEBHOOK_SECRET).update(raw).digest("hex"));
  }
}

const accountQuery = z.object({ accountId: z.string().min(1).max(64) });
const ignoreSchema = z.object({ notes: z.string().trim().max(300).optional() });
const completeSchema = z.object({ failed: z.record(z.string().max(64), z.string().max(200)).default({}) });
type RazorpayWebhook = {
  event?: string;
  payload?: {
    payment_link?: { entity?: { id?: string; status?: string } };
    payment?: { entity?: { id?: string; amount?: number; fee?: number; method?: string; created_at?: number; status?: string } };
  };
};

@Controller()
export class BankingController {
  private readonly logger = new Logger(BankingController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly banking: BankingService,
    private readonly payments: PaymentService,
    private readonly ledger: LedgerService,
    private readonly razorpay: RazorpayClient,
    private readonly audit: AuditService,
  ) {}

  private log(req: { user?: AuthUser; ip?: string }, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user?.id || null, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  // ---------- Accounts and statements ----------

  @Get("banking/accounts")
  @RequirePermissions("banking.view")
  async accounts(@Req() req: ReqUser) {
    assertStaff(req.user);
    const accounts = await this.prisma.account.findMany({ where: { subtype: { in: ["BANK", "CASH"] }, isGroup: false, active: true }, include: { bankAccount: { select: { bankName: true, accountNo: true, ifsc: true } } }, orderBy: { code: "asc" } });
    const ids = accounts.map((account) => account.id);
    const [sums, open, statements] = await Promise.all([
      this.prisma.journalLine.groupBy({ by: ["accountId"], where: { accountId: { in: ids } }, _sum: { debit: true, credit: true } }),
      this.prisma.bankTransaction.groupBy({ by: ["accountId"], where: { accountId: { in: ids }, status: { in: ["UNMATCHED", "SUGGESTED"] } }, _count: { _all: true } }),
      this.prisma.bankStatement.findMany({ where: { accountId: { in: ids } }, orderBy: [{ toDate: "desc" }, { createdAt: "desc" }], distinct: ["accountId"] }),
    ]);
    return accounts.map((account) => {
      const sum = sums.find((row) => row.accountId === account.id)?._sum;
      const statement = statements.find((row) => row.accountId === account.id);
      return {
        id: account.id,
        code: account.code,
        name: account.name,
        subtype: account.subtype,
        systemKey: account.systemKey,
        bank: account.bankAccount ? { name: account.bankAccount.bankName, last4: account.bankAccount.accountNo.slice(-4), ifsc: account.bankAccount.ifsc } : null,
        bookBalance: round2(num(sum?.debit) - num(sum?.credit)),
        unreconciled: open.find((row) => row.accountId === account.id)?._count._all || 0,
        statement: statement ? { toDate: statement.toDate, closingBalance: statement.closingBalance === null ? null : num(statement.closingBalance) } : null,
      };
    });
  }

  @Post("banking/statements/import")
  @RequirePermissions("banking.create")
  @UseInterceptors(FileInterceptor("file", uploadLimits(15 * MB)))
  async importStatement(@UploadedFile() file: Upload, @Body() body: unknown, @Req() req: ReqUser) {
    if (!file?.buffer?.length) throw new BadRequestException("Choose the statement file (CSV, Excel, MT940 or PDF)");
    const { accountId } = parseBody(accountQuery, body);
    const result = await this.banking.importStatement(accountId, file, req.user.id);
    await this.log(req, "import", "bank_statement", result.statementId, undefined, { accountId, created: result.created, duplicates: result.duplicates, format: result.format });
    const reconciled = result.created ? await this.banking.autoReconcile(accountId, req.user.id) : { matched: 0, suggested: 0, posted: 0 };
    return { ...result, ...reconciled };
  }

  @Get("banking/statements")
  @RequirePermissions("banking.view")
  statements(@Query() query: Record<string, unknown>) {
    const { accountId } = parseBody(accountQuery, query);
    return this.prisma.bankStatement.findMany({ where: { accountId }, orderBy: { createdAt: "desc" }, take: 100 });
  }

  @Delete("banking/statements/:id")
  @RequirePermissions("banking.delete")
  async deleteStatement(@Param("id") id: string, @Req() req: ReqUser) {
    const statement = await this.prisma.bankStatement.findUnique({ where: { id } });
    if (!statement) throw new NotFoundException("Statement not found");
    const matched = await this.prisma.bankTransaction.count({ where: { statementId: id, status: "MATCHED" } });
    if (matched) throw new BadRequestException(`${matched} line(s) from this file are reconciled; unreconcile them first`);
    await this.prisma.$transaction([this.prisma.bankTransaction.deleteMany({ where: { statementId: id } }), this.prisma.bankStatement.delete({ where: { id } })]);
    await this.log(req, "delete", "bank_statement", id, { fileName: statement.fileName, lines: statement.lineCount });
    return { deleted: true };
  }

  @Get("banking/transactions")
  @RequirePermissions("banking.view")
  async transactions(@Query() query: Record<string, unknown>) {
    const { accountId } = parseBody(accountQuery, query);
    const status = typeof query.status === "string" && query.status ? query.status.split(",") : undefined;
    const q = typeof query.q === "string" ? query.q.trim() : "";
    const rows = await this.prisma.bankTransaction.findMany({
      where: { accountId, status: status ? { in: status } : undefined, OR: q ? [{ description: { contains: q, mode: "insensitive" } }, { reference: { contains: q, mode: "insensitive" } }, { utr: { contains: q, mode: "insensitive" } }] : undefined },
      include: { matches: { include: { payment: { select: { id: true, number: true, customer: { select: { name: true } }, vendor: { select: { name: true } } } }, journalEntry: { select: { id: true, number: true, narration: true } } } } },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 1000,
    });
    return rows.map((row) => ({ ...row, debit: num(row.debit), credit: num(row.credit), balance: row.balance === null ? null : num(row.balance), matches: row.matches.map((match) => ({ ...match, amount: num(match.amount) })) }));
  }

  @Get("banking/summary")
  @RequirePermissions("banking.view")
  summary(@Query() query: Record<string, unknown>) {
    const { accountId } = parseBody(accountQuery, query);
    return this.banking.summary(accountId, typeof query.asOf === "string" ? query.asOf : undefined);
  }

  // ---------- Reconciliation ----------

  @Post("banking/reconcile/auto")
  @RequirePermissions("banking.create")
  autoReconcile(@Body() body: unknown, @Req() req: ReqUser) {
    const { accountId } = parseBody(accountQuery, body);
    return this.banking.autoReconcile(accountId, req.user.id);
  }

  @Get("banking/transactions/:id/candidates")
  @RequirePermissions("banking.view")
  candidates(@Param("id") id: string) {
    return this.banking.candidates(id);
  }

  @Post("banking/transactions/:id/match")
  @RequirePermissions("banking.create")
  async match(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(bankMatchSchema, body);
    const row = await this.banking.match(id, input, req.user.id);
    await this.log(req, "reconcile", "bank_transaction", id, undefined, input);
    return row;
  }

  @Post("banking/transactions/:id/post")
  @RequirePermissions("banking.create")
  async postLine(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(bankPostSchema, body);
    if (input.kind !== "ACCOUNT" && !can(req.user, "payments.create")) throw new ForbiddenException("Recording receipts and payments needs payments.create");
    const row = await this.banking.postLine(id, input, req.user.id);
    await this.log(req, "reconcile_post", "bank_transaction", id, undefined, input);
    return row;
  }

  @Post("banking/transactions/:id/unmatch")
  @RequirePermissions("banking.edit")
  async unmatch(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.banking.unmatch(id, req.user.id);
    await this.log(req, "unreconcile", "bank_transaction", id);
    return row;
  }

  @Post("banking/transactions/:id/ignore")
  @RequirePermissions("banking.edit")
  async ignore(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const { notes } = parseBody(ignoreSchema, body ?? {});
    const updated = await this.prisma.bankTransaction.updateMany({ where: { id, status: { in: ["UNMATCHED", "SUGGESTED"] } }, data: { status: "IGNORED", notes, matchedById: req.user.id, matchedAt: new Date() } });
    if (!updated.count) throw new BadRequestException("Only open lines can be ignored");
    await this.log(req, "ignore", "bank_transaction", id, undefined, { notes });
    return { ignored: true };
  }

  @Post("banking/transactions/:id/restore")
  @RequirePermissions("banking.edit")
  async restore(@Param("id") id: string, @Req() req: ReqUser) {
    const updated = await this.prisma.bankTransaction.updateMany({ where: { id, status: "IGNORED" }, data: { status: "UNMATCHED", matchedById: null, matchedAt: null } });
    if (!updated.count) throw new BadRequestException("The line is not ignored");
    await this.log(req, "restore", "bank_transaction", id);
    return { restored: true };
  }

  // ---------- Rules ----------

  @Get("banking/rules")
  @RequirePermissions("banking.view")
  rules() {
    return this.prisma.bankRule.findMany({ include: { counterAccount: { select: { code: true, name: true } } }, orderBy: [{ priority: "asc" }, { name: "asc" }] });
  }

  private async ruleData(input: z.infer<typeof bankRuleSchema>) {
    const counter = await this.prisma.account.findUnique({ where: { id: input.counterAccountId }, select: { isGroup: true, active: true } });
    if (!counter || counter.isGroup || !counter.active) throw new BadRequestException("Choose an active ledger (not a group) to post to");
    if (input.minAmount !== undefined && input.maxAmount !== undefined && input.minAmount > input.maxAmount) throw new BadRequestException("Minimum is above maximum");
    return { ...input, bankAccountId: input.bankAccountId || null, minAmount: input.minAmount ?? null, maxAmount: input.maxAmount ?? null, narration: input.narration || null };
  }

  @Post("banking/rules")
  @RequirePermissions("banking.edit")
  async createRule(@Body() body: unknown, @Req() req: ReqUser) {
    const row = await this.prisma.bankRule.create({ data: await this.ruleData(parseBody(bankRuleSchema, body)) });
    await this.log(req, "create", "bank_rule", row.id, undefined, { name: row.name });
    return row;
  }

  @Patch("banking/rules/:id")
  @RequirePermissions("banking.edit")
  async updateRule(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const before = await this.prisma.bankRule.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Rule not found");
    const row = await this.prisma.bankRule.update({ where: { id }, data: await this.ruleData(parseBody(bankRuleSchema, body)) });
    await this.log(req, "update", "bank_rule", id, before, row);
    return row;
  }

  @Delete("banking/rules/:id")
  @RequirePermissions("banking.edit")
  async deleteRule(@Param("id") id: string, @Req() req: ReqUser) {
    await this.prisma.bankRule.delete({ where: { id } }).catch(() => {
      throw new NotFoundException("Rule not found");
    });
    await this.log(req, "delete", "bank_rule", id);
    return { deleted: true };
  }

  // ---------- Payment runs ----------

  @Get("banking/payables")
  @RequirePermissions("banking.view")
  async payables() {
    const [bills, reserved] = await Promise.all([
      this.prisma.vendorBill.findMany({ where: { status: { in: OPEN_BILL }, source: null }, include: { vendor: { select: { id: true, name: true, bankAccount: true, ifsc: true, tdsSection: true } }, payments: { select: { amount: true } } }, orderBy: [{ dueDate: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }], take: 2000 }),
      this.prisma.paymentRunItem.findMany({ where: { status: "PENDING", vendorBillId: { not: null }, run: { status: { in: ["DRAFT", "APPROVED", "EXPORTED"] } } }, select: { vendorBillId: true, run: { select: { number: true } } } }),
    ]);
    const inRun = new Map(reserved.map((item) => [item.vendorBillId!, item.run.number]));
    return bills
      .map((bill) => {
        const paid = bill.payments.reduce((sum, payment) => sum + num(payment.amount), 0);
        return {
          id: bill.id,
          number: bill.number,
          vendorInvoiceNo: bill.vendorInvoiceNo,
          vendor: { id: bill.vendor.id, name: bill.vendor.name, tdsSection: bill.vendor.tdsSection, bankReady: Boolean(bill.vendor.bankAccount && bill.vendor.ifsc) },
          billDate: bill.billDate || bill.createdAt,
          dueDate: bill.dueDate,
          total: num(bill.total),
          balance: round2(num(bill.total) - paid),
          inRun: inRun.get(bill.id) || null,
        };
      })
      .filter((bill) => bill.balance > 0.5);
  }

  @Get("banking/runs")
  @RequirePermissions("banking.view")
  runs() {
    return this.prisma.paymentRun.findMany({ include: { account: { select: { code: true, name: true } }, _count: { select: { items: true } } }, orderBy: { createdAt: "desc" }, take: 200 });
  }

  @Get("banking/runs/:id")
  @RequirePermissions("banking.view")
  async run(@Param("id") id: string) {
    const run = await this.prisma.paymentRun.findUnique({ where: { id }, include: { account: { select: { code: true, name: true } }, items: { include: { payment: { select: { number: true } } }, orderBy: { payeeName: "asc" } } } });
    if (!run) throw new NotFoundException("Payment run not found");
    return { ...run, total: num(run.total), items: run.items.map((item) => ({ ...item, accountNo: `···${item.accountNo.slice(-4)}`, amount: num(item.amount), tdsAmount: num(item.tdsAmount), payout: round2(num(item.amount) - num(item.tdsAmount)) })) };
  }

  @Post("banking/runs")
  @RequirePermissions("banking.create")
  async createRun(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(paymentRunSchema, body);
    if (input.kind !== "VENDOR") throw new BadRequestException("Salary and reimbursement runs are created from payroll");
    if (!can(req.user, "payments.create")) throw new ForbiddenException("Vendor payment runs need payments.create");
    const billIds = input.items.map((item) => item.vendorBillId).filter((value): value is string => Boolean(value));
    if (new Set(billIds).size !== billIds.length) throw new BadRequestException("A bill appears twice in the run");
    const run = await this.prisma.$transaction(async (tx) => {
      const clash = billIds.length ? await tx.paymentRunItem.findFirst({ where: { vendorBillId: { in: billIds }, status: "PENDING", run: { status: { in: ["DRAFT", "APPROVED", "EXPORTED"] } } }, include: { run: { select: { number: true } } } }) : null;
      if (clash) throw new ConflictException(`A bill is already in payment run ${clash.run.number}`);
      const items: RunItemInput[] = [];
      for (const item of input.items) {
        const bill = item.vendorBillId ? await tx.vendorBill.findUnique({ where: { id: item.vendorBillId }, include: { payments: { select: { amount: true } } } }) : null;
        if (item.vendorBillId && (!bill || !OPEN_BILL.includes(bill.status))) throw new BadRequestException("A bill in the run is not open");
        const vendorId = bill?.vendorId || item.vendorId;
        if (!vendorId) throw new BadRequestException("Every row needs a bill or a vendor");
        const vendor = await tx.vendor.findUnique({ where: { id: vendorId } });
        if (!vendor) throw new NotFoundException("Vendor not found");
        if (!vendor.bankAccount || !vendor.ifsc) throw new BadRequestException(`${vendor.name} has no bank account or IFSC on file`);
        if (bill) {
          const balance = num(bill.total) - bill.payments.reduce((sum, payment) => sum + num(payment.amount), 0);
          if (item.amount > balance + 0.5) throw new BadRequestException(`${item.amount} exceeds the balance ${round2(balance)} of bill ${bill.vendorInvoiceNo || bill.number}`);
        }
        if (item.tdsAmount >= item.amount) throw new BadRequestException("TDS must be less than the amount");
        items.push({ payeeName: vendor.name, accountNo: vendor.bankAccount, ifsc: vendor.ifsc, email: vendor.email, amount: item.amount, tdsAmount: item.tdsAmount, mode: item.mode, reference: item.reference || bill?.vendorInvoiceNo || bill?.number || vendor.code, vendorId, vendorBillId: bill?.id });
      }
      return this.banking.createRun(tx, { kind: "VENDOR", accountId: input.accountId, bankFormat: input.bankFormat, valueDate: new Date(`${input.valueDate}T00:00:00Z`), notes: input.notes, items }, req.user.id);
    });
    await this.log(req, "create", "payment_run", run.id, undefined, { number: run.number, total: run.total, items: run.items.length });
    return run;
  }

  @Post("banking/runs/:id/approve")
  @RequirePermissions("banking.approve")
  async approveRun(@Param("id") id: string, @Req() req: ReqUser) {
    const run = await this.prisma.paymentRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundException("Payment run not found");
    if (run.status !== "DRAFT") throw new BadRequestException("Only draft runs can be approved");
    if (run.createdById === req.user.id && !can(req.user, "banking.override")) throw new ForbiddenException("Someone other than the preparer must approve a payment run");
    const row = await this.prisma.paymentRun.update({ where: { id }, data: { status: "APPROVED", approvedById: req.user.id, approvedAt: new Date() } });
    await this.log(req, "approve", "payment_run", id, { status: run.status }, { status: row.status });
    return row;
  }

  @Get("banking/runs/:id/file")
  @RequirePermissions("banking.export")
  async runFile(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    assertStaff(req.user);
    const run = await this.prisma.paymentRun.findUnique({ where: { id }, include: { items: { where: { status: "PENDING" } }, account: { include: { bankAccount: true } } } });
    if (!run) throw new NotFoundException("Payment run not found");
    if (!["APPROVED", "EXPORTED"].includes(run.status)) throw new BadRequestException("Approve the run before downloading the bank file");
    if (!run.account.bankAccount) throw new BadRequestException("The paying ledger is not linked to a bank account");
    const file = bulkPaymentFile(run.bankFormat as BankCode, { accountNo: run.account.bankAccount.accountNo, ifsc: run.account.bankAccount.ifsc }, run.items.map((item) => ({ payeeName: item.payeeName, accountNo: item.accountNo, ifsc: item.ifsc, amount: round2(num(item.amount) - num(item.tdsAmount)), reference: `${run.number} ${item.reference}`, email: item.email, mode: item.mode })), run.valueDate, run.number);
    await this.prisma.paymentRun.update({ where: { id }, data: { status: "EXPORTED", exportedAt: run.exportedAt || new Date() } });
    await this.log(req, "export", "payment_run", id, undefined, { format: run.bankFormat, items: run.items.length });
    res.setHeader("Content-Type", `${file.mime}; charset=utf-8`);
    res.setHeader("Content-Disposition", contentDisposition(file.filename));
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    res.send(file.content);
  }

  @Post("banking/runs/:id/complete")
  @RequirePermissions("banking.approve")
  async completeRun(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const { failed } = parseBody(completeSchema, body ?? {});
    const row = await this.banking.completeRun(id, failed, req.user.id);
    await this.log(req, "complete", "payment_run", id, undefined, { failed: Object.keys(failed).length });
    return row;
  }

  @Post("banking/runs/:id/cancel")
  @RequirePermissions("banking.approve")
  async cancelRun(@Param("id") id: string, @Req() req: ReqUser) {
    const updated = await this.prisma.paymentRun.updateMany({ where: { id, status: { in: ["DRAFT", "APPROVED", "EXPORTED"] } }, data: { status: "CANCELLED" } });
    if (!updated.count) throw new BadRequestException("Only open runs can be cancelled");
    await this.prisma.paymentRunItem.updateMany({ where: { runId: id, status: "PENDING" }, data: { status: "CANCELLED" } });
    await this.log(req, "cancel", "payment_run", id);
    return { cancelled: true };
  }

  // ---------- Payment links (Razorpay) ----------

  @Get("banking/payment-links")
  @RequirePermissions("invoices.view")
  async links(@Req() req: ReqUser) {
    assertStaff(req.user);
    const rows = await this.prisma.paymentLink.findMany({ include: { invoice: { select: { number: true, customer: { select: { name: true } } } }, payment: { select: { number: true } } }, orderBy: { createdAt: "desc" }, take: 300 });
    return { configured: this.razorpay.configured, webhook: Boolean(env.RAZORPAY_WEBHOOK_SECRET), links: rows.map((row) => ({ ...row, amount: num(row.amount), fee: row.fee === null ? null : num(row.fee) })) };
  }

  @Post("invoices/:id/payment-link")
  @RequirePermissions("invoices.edit")
  async createLink(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(paymentLinkSchema, body ?? {});
    const invoice = await this.prisma.invoice.findUnique({ where: { id }, include: { customer: true, payments: { select: { amount: true, direction: true } }, paymentLinks: true } });
    if (!invoice) throw new NotFoundException("Invoice not found");
    if (!OPEN_INVOICE.includes(invoice.status)) throw new BadRequestException("Only unpaid issued invoices can be paid by link");
    const active = invoice.paymentLinks.find((link) => link.status === "CREATED" && (!link.expiresAt || link.expiresAt > new Date()));
    if (active) return active;
    const balance = round2(num(invoice.total) - invoice.payments.filter((payment) => payment.direction === "IN").reduce((sum, payment) => sum + num(payment.amount), 0));
    const amount = round2(input.amount ?? balance);
    if (amount <= 0 || amount > balance + 0.5) throw new BadRequestException(`The amount must be between 1 and the balance ${balance}`);
    const expiresAt = new Date(Date.now() + input.expireDays * DAY);
    const phone = (invoice.customer.phone || "").replace(/[^\d+]/g, "");
    const link = await this.razorpay.createLink({
      amount: Math.round(amount * 100),
      currency: invoice.currency,
      accept_partial: false,
      reference_id: `${invoice.number}-${invoice.paymentLinks.length + 1}`.slice(0, 40),
      description: `Invoice ${invoice.number}`.slice(0, 2048),
      customer: { name: invoice.customer.name.slice(0, 100), email: invoice.customer.email || undefined, contact: phone || undefined },
      notify: { sms: input.notify && Boolean(phone), email: input.notify && Boolean(invoice.customer.email) },
      reminder_enable: true,
      expire_by: Math.floor(expiresAt.getTime() / 1000),
      notes: { invoiceId: invoice.id, invoiceNumber: invoice.number },
    });
    const row = await this.prisma.paymentLink.create({ data: { invoiceId: invoice.id, providerId: link.id, shortUrl: link.short_url, amount, currency: invoice.currency, expiresAt, createdById: req.user.id } });
    await this.log(req, "payment_link", "invoice", invoice.id, undefined, { linkId: link.id, amount });
    return row;
  }

  @Post("banking/payment-links/:id/cancel")
  @RequirePermissions("invoices.edit")
  async cancelLink(@Param("id") id: string, @Req() req: ReqUser) {
    const link = await this.prisma.paymentLink.findUnique({ where: { id } });
    if (!link) throw new NotFoundException("Link not found");
    if (link.status !== "CREATED") throw new BadRequestException("Only open links can be cancelled");
    await this.razorpay.cancelLink(link.providerId);
    const row = await this.prisma.paymentLink.update({ where: { id }, data: { status: "CANCELLED" } });
    await this.log(req, "cancel", "payment_link", id);
    return row;
  }

  /** Paid links become receipts into the gateway clearing ledger; the settlement line on the bank statement clears it (bank rule). */
  @Public()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post("public/razorpay/webhook")
  async razorpayWebhook(@Body() body: RazorpayWebhook, @Headers("x-razorpay-signature") signature: string | undefined, @Req() req: RawReq) {
    if (!env.RAZORPAY_WEBHOOK_SECRET) throw new NotFoundException();
    if (!this.razorpay.verify(req.rawBody, signature)) throw new ForbiddenException("Invalid signature");
    const linkId = body.payload?.payment_link?.entity?.id;
    if (!linkId) return { ok: true };
    const link = await this.prisma.paymentLink.findUnique({ where: { providerId: linkId }, include: { invoice: { select: { customerId: true, exchangeRate: true } } } });
    if (!link) return { ok: true };
    if (body.event === "payment_link.expired" || body.event === "payment_link.cancelled") {
      await this.prisma.paymentLink.updateMany({ where: { id: link.id, status: "CREATED" }, data: { status: body.event === "payment_link.expired" ? "EXPIRED" : "CANCELLED" } });
      return { ok: true };
    }
    if (body.event !== "payment_link.paid") return { ok: true };
    const paid = body.payload?.payment?.entity;
    if (!paid?.id || !paid.amount) return { ok: true };
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "PaymentLink" WHERE "id" = ${link.id} FOR UPDATE`;
      const fresh = await tx.paymentLink.findUnique({ where: { id: link.id } });
      if (!fresh || fresh.paymentId) return;
      const gateway = await this.ledger.accountFor("GATEWAY_CLEARING", tx);
      const amount = round2(paid.amount! / 100);
      const fee = round2((paid.fee || 0) / 100);
      const base = { direction: "IN" as const, amount, accountId: gateway, bankCharges: fee, reference: paid.id, method: "GATEWAY", paidAt: paid.created_at ? new Date(paid.created_at * 1000) : new Date(), currency: link.currency, exchangeRate: link.currency === "INR" ? 1 : num(link.invoice.exchangeRate) || 1 };
      let payment;
      try {
        payment = await this.payments.record(tx, { ...base, invoiceId: link.invoiceId }, null);
      } catch (error) {
        if (!(error instanceof BadRequestException)) throw error;
        this.logger.warn(`Razorpay ${paid.id} recorded on account: ${error.message}`);
        payment = await this.payments.record(tx, { ...base, customerId: link.invoice.customerId }, null);
      }
      await tx.paymentLink.update({ where: { id: link.id }, data: { status: "PAID", paidAt: base.paidAt, providerPaymentId: paid.id, fee, paymentId: payment.id } });
      await this.log({ ip: req.ip }, "gateway_receipt", "payment", payment.id, undefined, { provider: "RAZORPAY", paymentId: paid.id, amount, fee }, tx);
    });
    return { ok: true };
  }
}
