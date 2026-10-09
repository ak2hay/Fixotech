import { z } from "zod";

export const ACCOUNT_TYPES = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];
export const PARTY_TYPES = ["CUSTOMER", "VENDOR", "EMPLOYEE"] as const;

/** Assets and expenses grow with debits; the rest with credits. */
export function normalSide(type: string): "DEBIT" | "CREDIT" {
  return type === "ASSET" || type === "EXPENSE" ? "DEBIT" : "CREDIT";
}

/** Balance in the account's natural direction (positive = normal). */
export function naturalBalance(type: string, debit: number, credit: number) {
  return round2(normalSide(type) === "DEBIT" ? debit - credit : credit - debit);
}

export function round2(value: number) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export type LedgerLine = { accountId: string; debit?: number; credit?: number };

/** A journal must have 2+ lines, each one-sided and non-negative, and total debits equal to total credits. */
export function checkBalanced(lines: LedgerLine[]) {
  const errors: string[] = [];
  if (lines.length < 2) errors.push("A journal needs at least two lines");
  let debit = 0;
  let credit = 0;
  lines.forEach((line, index) => {
    const d = round2(line.debit || 0);
    const c = round2(line.credit || 0);
    if (d < 0 || c < 0) errors.push(`Line ${index + 1}: amounts cannot be negative`);
    if (d > 0 && c > 0) errors.push(`Line ${index + 1}: use either debit or credit, not both`);
    if (d === 0 && c === 0) errors.push(`Line ${index + 1}: amount is zero`);
    debit += d;
    credit += c;
  });
  debit = round2(debit);
  credit = round2(credit);
  if (Math.abs(debit - credit) > 0.004) errors.push(`Debits (${debit.toFixed(2)}) and credits (${credit.toFixed(2)}) differ by ${(debit - credit).toFixed(2)}`);
  return { debit, credit, errors };
}

/** Drops zero lines and merges lines that hit the same account/party/side, so postings stay readable. */
export function compactLines<T extends LedgerLine & { partyType?: string | null; partyId?: string | null; description?: string | null }>(lines: T[]) {
  const merged = new Map<string, T>();
  for (const line of lines) {
    const debit = round2(line.debit || 0);
    const credit = round2(line.credit || 0);
    if (!debit && !credit) continue;
    const key = [line.accountId, line.partyType || "", line.partyId || "", debit ? "D" : "C"].join("|");
    const existing = merged.get(key);
    if (existing) {
      existing.debit = round2((existing.debit || 0) + debit);
      existing.credit = round2((existing.credit || 0) + credit);
    } else merged.set(key, { ...line, debit, credit });
  }
  return [...merged.values()];
}

/** First two digits of a GSTIN are the state code. */
export function stateCodeOf(gstin?: string | null) {
  const code = (gstin || "").trim().slice(0, 2);
  return /^\d{2}$/.test(code) ? code : null;
}

/** Intra-state supply splits tax equally into CGST and SGST; inter-state is IGST. Rounding remainder goes to SGST. */
export function gstSplit(tax: number, intraState: boolean) {
  const total = round2(tax);
  if (!intraState) return { cgst: 0, sgst: 0, igst: total };
  const cgst = round2(total / 2);
  return { cgst, sgst: round2(total - cgst), igst: 0 };
}

/** Gain (positive) or loss (negative) in INR when a foreign-currency receivable booked at one rate settles at another. */
export function fxGainOnReceipt(fcAmount: number, bookedRate: number, settledRate: number) {
  return round2(fcAmount * settledRate - fcAmount * bookedRate);
}

export type AgeingBuckets = { current: number; d30: number; d60: number; d90: number; d180: number; older: number };
export const AGEING_LABELS: Record<keyof AgeingBuckets, string> = { current: "Not due / 0-30", d30: "31-60", d60: "61-90", d90: "91-180", d180: "181-365", older: "365+" };

/**
 * FIFO ageing of one party's ledger: credits (receipts, credit notes) settle the oldest debits first.
 * For payables pass `side: "CREDIT"` so bills (credits) are aged and payments (debits) settle them.
 */
export function fifoAgeing(lines: Array<{ date: Date | string; debit: number; credit: number; dueDate?: Date | string | null; ref?: string }>, asOf: Date, side: "DEBIT" | "CREDIT" = "DEBIT") {
  const sorted = [...lines].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const open: Array<{ date: Date; due: Date; amount: number; ref?: string }> = [];
  let unapplied = 0;
  for (const line of sorted) {
    const charge = side === "DEBIT" ? line.debit : line.credit;
    let settle = side === "DEBIT" ? line.credit : line.debit;
    if (charge > 0) {
      let amount = charge;
      if (unapplied > 0) {
        const used = Math.min(unapplied, amount);
        unapplied = round2(unapplied - used);
        amount = round2(amount - used);
      }
      if (amount > 0) open.push({ date: new Date(line.date), due: new Date(line.dueDate || line.date), amount, ref: line.ref });
    }
    while (settle > 0.004 && open.length) {
      const head = open[0];
      const used = Math.min(head.amount, settle);
      head.amount = round2(head.amount - used);
      settle = round2(settle - used);
      if (head.amount <= 0.004) open.shift();
    }
    if (settle > 0.004) unapplied = round2(unapplied + settle);
  }
  const buckets: AgeingBuckets = { current: 0, d30: 0, d60: 0, d90: 0, d180: 0, older: 0 };
  for (const item of open) {
    const days = Math.floor((asOf.getTime() - item.due.getTime()) / 86_400_000);
    const key: keyof AgeingBuckets = days <= 30 ? "current" : days <= 60 ? "d30" : days <= 90 ? "d60" : days <= 180 ? "d90" : days <= 365 ? "d180" : "older";
    buckets[key] = round2(buckets[key] + item.amount);
  }
  const outstanding = round2(open.reduce((sum, item) => sum + item.amount, 0) - unapplied);
  return { buckets, outstanding, advance: unapplied, open };
}

/** Indian financial year (April-March) containing the date, e.g. 2026-27. */
export function financialYearOf(date: Date) {
  const year = date.getUTCMonth() >= 3 ? date.getUTCFullYear() : date.getUTCFullYear() - 1;
  return { label: `${year}-${String((year + 1) % 100).padStart(2, "0")}`, start: new Date(Date.UTC(year, 3, 1)), end: new Date(Date.UTC(year + 1, 2, 31, 23, 59, 59, 999)) };
}

/** Zoho Books account types → ours (Zoho CSV "Account Type" column). */
export function mapZohoAccountType(zohoType: string): { type: AccountType; subtype?: string } {
  const t = zohoType.trim().toLowerCase();
  if (t.includes("bank")) return { type: "ASSET", subtype: "BANK" };
  if (t === "cash") return { type: "ASSET", subtype: "CASH" };
  if (t.includes("accounts receivable")) return { type: "ASSET", subtype: "RECEIVABLE" };
  if (t.includes("stock") || t.includes("inventory")) return { type: "ASSET", subtype: "INVENTORY" };
  if (t.includes("fixed asset")) return { type: "ASSET", subtype: "FIXED_ASSET" };
  if (t.includes("asset")) return { type: "ASSET" };
  if (t.includes("accounts payable")) return { type: "LIABILITY", subtype: "PAYABLE" };
  if (t.includes("credit card")) return { type: "LIABILITY" };
  if (t.includes("liability") || t.includes("loan")) return { type: "LIABILITY" };
  if (t.includes("equity")) return { type: "EQUITY" };
  if (t.includes("cost of goods")) return { type: "EXPENSE", subtype: "COGS" };
  if (t.includes("expense")) return { type: "EXPENSE" };
  if (t.includes("income")) return { type: "INCOME" };
  return { type: "EXPENSE" };
}

/** Tally group a ledger belongs to, so an imported ledger lands in the right place in the CA's company. */
export function tallyGroupFor(account: { type: string; subtype?: string | null; systemKey?: string | null }) {
  switch (account.subtype) {
    case "BANK":
      return "Bank Accounts";
    case "CASH":
      return "Cash-in-Hand";
    case "RECEIVABLE":
      return "Sundry Debtors";
    case "PAYABLE":
      return "Sundry Creditors";
    case "TAX":
      return "Duties & Taxes";
    case "INVENTORY":
      return "Stock-in-Hand";
    case "FIXED_ASSET":
      return "Fixed Assets";
    case "COGS":
      return "Purchase Accounts";
    case "DIRECT_EXPENSE":
      return "Direct Expenses";
    case "SALES":
      return "Sales Accounts";
  }
  if (account.type === "INCOME") return "Indirect Incomes";
  if (account.type === "EXPENSE") return "Indirect Expenses";
  if (account.type === "EQUITY") return "Capital Account";
  if (account.type === "LIABILITY") return "Current Liabilities";
  return "Current Assets";
}

export function xmlEscape(value: unknown) {
  return String(value ?? "").replace(/[<>&'"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" })[char]!).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
}

export type TallyVoucher = { type: string; number: string; date: Date; narration?: string; lines: Array<{ ledger: string; debit: number; credit: number }> };

const tallyDate = (date: Date) => `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;

/** Tally "Import Data" envelope: ledger masters followed by vouchers. Tally signs debits negative. */
export function tallyXml(company: string, ledgers: Array<{ name: string; group: string }>, vouchers: TallyVoucher[]) {
  const masters = ledgers
    .map((ledger) => `<TALLYMESSAGE xmlns:UDF="TallyUDF"><LEDGER NAME="${xmlEscape(ledger.name)}" ACTION="Create"><NAME.LIST><NAME>${xmlEscape(ledger.name)}</NAME></NAME.LIST><PARENT>${xmlEscape(ledger.group)}</PARENT></LEDGER></TALLYMESSAGE>`)
    .join("\n");
  const entries = vouchers
    .map((voucher) => {
      const lines = voucher.lines
        .map((line) => {
          const debit = line.debit > 0;
          const amount = debit ? -round2(line.debit) : round2(line.credit);
          return `<ALLLEDGERENTRIES.LIST><LEDGERNAME>${xmlEscape(line.ledger)}</LEDGERNAME><ISDEEMEDPOSITIVE>${debit ? "Yes" : "No"}</ISDEEMEDPOSITIVE><AMOUNT>${amount.toFixed(2)}</AMOUNT></ALLLEDGERENTRIES.LIST>`;
        })
        .join("");
      return `<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="${xmlEscape(voucher.type)}" ACTION="Create"><DATE>${tallyDate(voucher.date)}</DATE><VOUCHERTYPENAME>${xmlEscape(voucher.type)}</VOUCHERTYPENAME><VOUCHERNUMBER>${xmlEscape(voucher.number)}</VOUCHERNUMBER><NARRATION>${xmlEscape(voucher.narration)}</NARRATION>${lines}</VOUCHER></TALLYMESSAGE>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<ENVELOPE>
<HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER>
<BODY><IMPORTDATA>
<REQUESTDESC><REPORTNAME>All Masters</REPORTNAME><STATICVARIABLES><SVCURRENTCOMPANY>${xmlEscape(company)}</SVCURRENTCOMPANY></STATICVARIABLES></REQUESTDESC>
<REQUESTDATA>
${masters}
${entries}
</REQUESTDATA>
</IMPORTDATA></BODY>
</ENVELOPE>
`;
}

export type ChartAccount = { code: string; name: string; type: AccountType; subtype?: string; parent?: string; systemKey?: string; group?: boolean };

/** Indian-standard chart (Schedule III-style grouping). `systemKey` is what the posting engine looks up. */
export const DEFAULT_CHART: ChartAccount[] = [
  { code: "1000", name: "Assets", type: "ASSET", group: true },
  { code: "1100", name: "Current Assets", type: "ASSET", parent: "1000", group: true },
  { code: "1110", name: "Cash in Hand", type: "ASSET", subtype: "CASH", parent: "1100", systemKey: "CASH" },
  { code: "1120", name: "Bank Accounts", type: "ASSET", subtype: "BANK", parent: "1100", group: true },
  { code: "1121", name: "Primary Bank Account", type: "ASSET", subtype: "BANK", parent: "1120", systemKey: "BANK" },
  { code: "1130", name: "Sundry Debtors", type: "ASSET", subtype: "RECEIVABLE", parent: "1100", systemKey: "AR" },
  { code: "1140", name: "Inventory", type: "ASSET", subtype: "INVENTORY", parent: "1100", systemKey: "INVENTORY" },
  { code: "1141", name: "Work in Progress", type: "ASSET", subtype: "INVENTORY", parent: "1100", systemKey: "WIP" },
  { code: "1150", name: "GST Input Credit", type: "ASSET", subtype: "TAX", parent: "1100", group: true },
  { code: "1151", name: "CGST Input", type: "ASSET", subtype: "TAX", parent: "1150", systemKey: "CGST_IN" },
  { code: "1152", name: "SGST Input", type: "ASSET", subtype: "TAX", parent: "1150", systemKey: "SGST_IN" },
  { code: "1153", name: "IGST Input", type: "ASSET", subtype: "TAX", parent: "1150", systemKey: "IGST_IN" },
  { code: "1160", name: "TDS Receivable", type: "ASSET", subtype: "TAX", parent: "1100", systemKey: "TDS_RECEIVABLE" },
  { code: "1161", name: "TCS Receivable", type: "ASSET", subtype: "TAX", parent: "1100", systemKey: "TCS_RECEIVABLE" },
  { code: "1170", name: "Employee Advances", type: "ASSET", parent: "1100", systemKey: "EMPLOYEE_ADVANCE" },
  { code: "1171", name: "Advances to Suppliers", type: "ASSET", parent: "1100", systemKey: "VENDOR_ADVANCE" },
  { code: "1180", name: "Payment Gateway Clearing", type: "ASSET", subtype: "BANK", parent: "1100", systemKey: "GATEWAY_CLEARING" },
  { code: "1200", name: "Fixed Assets", type: "ASSET", subtype: "FIXED_ASSET", parent: "1000", group: true },
  { code: "1210", name: "Plant and Machinery", type: "ASSET", subtype: "FIXED_ASSET", parent: "1200" },
  { code: "1220", name: "Furniture and Fixtures", type: "ASSET", subtype: "FIXED_ASSET", parent: "1200" },
  { code: "1230", name: "Computers", type: "ASSET", subtype: "FIXED_ASSET", parent: "1200" },
  { code: "1240", name: "Vehicles", type: "ASSET", subtype: "FIXED_ASSET", parent: "1200" },
  { code: "1290", name: "Accumulated Depreciation", type: "ASSET", subtype: "FIXED_ASSET", parent: "1200", systemKey: "ACCUMULATED_DEPRECIATION" },
  { code: "2000", name: "Liabilities", type: "LIABILITY", group: true },
  { code: "2100", name: "Current Liabilities", type: "LIABILITY", parent: "2000", group: true },
  { code: "2110", name: "Sundry Creditors", type: "LIABILITY", subtype: "PAYABLE", parent: "2100", systemKey: "AP" },
  { code: "2120", name: "Goods Received Not Invoiced", type: "LIABILITY", parent: "2100", systemKey: "GRNI" },
  { code: "2130", name: "GST Output Liability", type: "LIABILITY", subtype: "TAX", parent: "2100", group: true },
  { code: "2131", name: "CGST Output", type: "LIABILITY", subtype: "TAX", parent: "2130", systemKey: "CGST_OUT" },
  { code: "2132", name: "SGST Output", type: "LIABILITY", subtype: "TAX", parent: "2130", systemKey: "SGST_OUT" },
  { code: "2133", name: "IGST Output", type: "LIABILITY", subtype: "TAX", parent: "2130", systemKey: "IGST_OUT" },
  { code: "2134", name: "GST Payable (Reverse Charge)", type: "LIABILITY", subtype: "TAX", parent: "2130", systemKey: "RCM_PAYABLE" },
  { code: "2140", name: "TDS Payable", type: "LIABILITY", subtype: "TAX", parent: "2100", systemKey: "TDS_PAYABLE" },
  { code: "2141", name: "TCS Payable", type: "LIABILITY", subtype: "TAX", parent: "2100", systemKey: "TCS_PAYABLE" },
  { code: "2150", name: "Salaries Payable", type: "LIABILITY", parent: "2100", systemKey: "SALARY_PAYABLE" },
  { code: "2151", name: "PF Payable", type: "LIABILITY", subtype: "TAX", parent: "2100", systemKey: "PF_PAYABLE" },
  { code: "2152", name: "ESI Payable", type: "LIABILITY", subtype: "TAX", parent: "2100", systemKey: "ESI_PAYABLE" },
  { code: "2153", name: "Professional Tax Payable", type: "LIABILITY", subtype: "TAX", parent: "2100", systemKey: "PT_PAYABLE" },
  { code: "2154", name: "Labour Welfare Fund Payable", type: "LIABILITY", subtype: "TAX", parent: "2100", systemKey: "LWF_PAYABLE" },
  { code: "2155", name: "TDS on Salary Payable", type: "LIABILITY", subtype: "TAX", parent: "2100", systemKey: "TDS_SALARY_PAYABLE" },
  { code: "2160", name: "Customer Advances", type: "LIABILITY", parent: "2100", systemKey: "CUSTOMER_ADVANCE" },
  { code: "2170", name: "Reimbursements Payable", type: "LIABILITY", parent: "2100", systemKey: "REIMBURSEMENT_PAYABLE" },
  { code: "2200", name: "Loans", type: "LIABILITY", parent: "2000", group: true },
  { code: "2210", name: "Secured Loans", type: "LIABILITY", parent: "2200" },
  { code: "2220", name: "Unsecured Loans", type: "LIABILITY", parent: "2200" },
  { code: "3000", name: "Equity", type: "EQUITY", group: true },
  { code: "3100", name: "Share Capital", type: "EQUITY", parent: "3000" },
  { code: "3200", name: "Retained Earnings", type: "EQUITY", parent: "3000", systemKey: "RETAINED_EARNINGS" },
  { code: "3300", name: "Opening Balance Equity", type: "EQUITY", parent: "3000", systemKey: "OPENING_EQUITY" },
  { code: "4000", name: "Income", type: "INCOME", group: true },
  { code: "4100", name: "Sales - Domestic", type: "INCOME", subtype: "SALES", parent: "4000", systemKey: "SALES" },
  { code: "4110", name: "Sales - Export", type: "INCOME", subtype: "SALES", parent: "4000", systemKey: "SALES_EXPORT" },
  { code: "4120", name: "Sales Returns", type: "INCOME", subtype: "SALES", parent: "4000", systemKey: "SALES_RETURNS" },
  { code: "4130", name: "Service Income", type: "INCOME", subtype: "SALES", parent: "4000", systemKey: "SERVICE_INCOME" },
  { code: "4200", name: "Other Income", type: "INCOME", parent: "4000", group: true },
  { code: "4210", name: "Foreign Exchange Gain/Loss", type: "INCOME", parent: "4200", systemKey: "FX_GAIN_LOSS" },
  { code: "4220", name: "Round Off", type: "INCOME", parent: "4200", systemKey: "ROUND_OFF" },
  { code: "4230", name: "Interest Income", type: "INCOME", parent: "4200" },
  { code: "5000", name: "Expenses", type: "EXPENSE", group: true },
  { code: "5100", name: "Cost of Goods Sold", type: "EXPENSE", subtype: "COGS", parent: "5000", systemKey: "COGS" },
  { code: "5110", name: "Purchase Price Variance", type: "EXPENSE", subtype: "COGS", parent: "5000", systemKey: "PPV" },
  { code: "5120", name: "Purchase Returns", type: "EXPENSE", subtype: "COGS", parent: "5000", systemKey: "PURCHASE_RETURNS" },
  { code: "5130", name: "Stock Adjustments", type: "EXPENSE", subtype: "COGS", parent: "5000", systemKey: "STOCK_ADJUSTMENT" },
  { code: "5140", name: "Freight Inward", type: "EXPENSE", subtype: "DIRECT_EXPENSE", parent: "5000" },
  { code: "5200", name: "Employee Costs", type: "EXPENSE", parent: "5000", group: true },
  { code: "5210", name: "Salaries and Wages", type: "EXPENSE", parent: "5200", systemKey: "SALARY_EXPENSE" },
  { code: "5220", name: "Employer PF Contribution", type: "EXPENSE", parent: "5200", systemKey: "PF_EMPLOYER_EXPENSE" },
  { code: "5230", name: "Employer ESI Contribution", type: "EXPENSE", parent: "5200", systemKey: "ESI_EMPLOYER_EXPENSE" },
  { code: "5240", name: "Employer LWF Contribution", type: "EXPENSE", parent: "5200", systemKey: "LWF_EMPLOYER_EXPENSE" },
  { code: "5250", name: "Staff Welfare", type: "EXPENSE", parent: "5200" },
  { code: "5300", name: "Operating Expenses", type: "EXPENSE", parent: "5000", group: true },
  { code: "5310", name: "Travel and Conveyance", type: "EXPENSE", parent: "5300", systemKey: "EXP_TRAVEL" },
  { code: "5320", name: "Freight Outward", type: "EXPENSE", parent: "5300", systemKey: "EXP_FREIGHT" },
  { code: "5330", name: "Rent", type: "EXPENSE", parent: "5300" },
  { code: "5340", name: "Power and Utilities", type: "EXPENSE", parent: "5300" },
  { code: "5350", name: "Professional Fees", type: "EXPENSE", parent: "5300" },
  { code: "5360", name: "Meals and Entertainment", type: "EXPENSE", parent: "5300", systemKey: "EXP_MEALS" },
  { code: "5370", name: "Lodging", type: "EXPENSE", parent: "5300", systemKey: "EXP_LODGING" },
  { code: "5380", name: "Site Expenses", type: "EXPENSE", parent: "5300", systemKey: "EXP_SITE" },
  { code: "5390", name: "General Expenses", type: "EXPENSE", parent: "5300", systemKey: "EXP_GENERAL" },
  { code: "5400", name: "Bank Charges", type: "EXPENSE", parent: "5000", systemKey: "BANK_CHARGES" },
  { code: "5500", name: "Depreciation", type: "EXPENSE", parent: "5000", systemKey: "DEPRECIATION" },
  { code: "5600", name: "Bad Debts", type: "EXPENSE", parent: "5000", systemKey: "BAD_DEBTS" },
];

/** Expense claim category → system account it books to. */
export const EXPENSE_ACCOUNT_KEYS: Record<string, string> = {
  TRAVEL: "EXP_TRAVEL",
  FUEL: "EXP_TRAVEL",
  HOTEL: "EXP_LODGING",
  FOOD: "EXP_MEALS",
  CLIENT_MEETING: "EXP_MEALS",
  SITE: "EXP_SITE",
  PURCHASE: "EXP_GENERAL",
  OTHER: "EXP_GENERAL",
};

/** Profit for the period from account-type totals (income natural balance minus expense natural balance). */
export function profitOf(rows: Array<{ type: string; debit: number; credit: number }>) {
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    if (row.type === "INCOME") income += row.credit - row.debit;
    if (row.type === "EXPENSE") expense += row.debit - row.credit;
  }
  return { income: round2(income), expense: round2(expense), profit: round2(income - expense) };
}

const id = z.string().trim().min(1).max(64);
const amount = z.coerce.number().min(0).max(1e13);
const dateText = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const accountSchema = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9.-]{1,20}$/),
  name: z.string().trim().min(2).max(120),
  type: z.enum(ACCOUNT_TYPES),
  subtype: z.string().trim().max(40).optional(),
  parentId: id.optional(),
  isGroup: z.boolean().default(false),
  currency: z.string().length(3).default("INR"),
  bankAccountId: id.optional(),
  active: z.boolean().default(true),
});

export const journalLineSchema = z.object({
  accountId: id,
  debit: amount.default(0),
  credit: amount.default(0),
  description: z.string().trim().max(300).optional(),
  partyType: z.enum(PARTY_TYPES).optional(),
  partyId: id.optional(),
  costCenterId: id.optional(),
  branchId: id.optional(),
  projectId: id.optional(),
});

export const journalSchema = z.object({
  date: dateText,
  narration: z.string().trim().min(3).max(1000),
  reference: z.string().trim().max(100).optional(),
  currency: z.string().length(3).default("INR"),
  exchangeRate: z.coerce.number().positive().max(100000).default(1),
  lines: z.array(journalLineSchema).min(2).max(500),
});

export const reverseSchema = z.object({ date: dateText.optional(), reason: z.string().trim().min(3).max(500) });
export const periodLockSchema = z.object({ lockedUntil: dateText, reason: z.string().trim().min(3).max(300) });

const noteLine = z.object({ description: z.string().trim().min(1).max(300), amount: amount.refine((value) => value > 0, "Amount must be positive"), taxRate: z.coerce.number().min(0).max(28).default(18), hsn: z.string().trim().max(10).optional() });

export const creditNoteSchema = z.object({
  customerId: id,
  invoiceId: id.optional(),
  date: dateText.optional(),
  reason: z.enum(["RETURN", "PRICE_ADJUSTMENT", "DISCOUNT", "DEFICIENCY", "OTHER"]),
  notes: z.string().trim().max(1000).optional(),
  lines: z.array(noteLine).min(1).max(200),
});

export const debitNoteSchema = z.object({
  vendorId: id,
  vendorBillId: id.optional(),
  date: dateText.optional(),
  reason: z.enum(["RETURN", "PRICE_ADJUSTMENT", "SHORT_SUPPLY", "QUALITY", "OTHER"]),
  notes: z.string().trim().max(1000).optional(),
  lines: z.array(noteLine).min(1).max(200),
});

export const openingBalanceSchema = z.object({
  asOf: dateText,
  lines: z.array(z.object({ accountId: id, debit: amount.default(0), credit: amount.default(0), partyType: z.enum(PARTY_TYPES).optional(), partyId: id.optional(), reference: z.string().trim().max(100).optional(), dueDate: dateText.optional() })).min(1).max(5000),
});

export const yearCloseSchema = z.object({ financialYearId: id });
