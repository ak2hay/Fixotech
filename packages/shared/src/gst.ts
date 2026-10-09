import { z } from "zod";
import { round2 } from "./finance";

/** GST state codes (first two digits of a GSTIN; `Pos` on e-invoices). */
export const STATE_CODES: Record<string, string> = {
  "01": "Jammu and Kashmir",
  "02": "Himachal Pradesh",
  "03": "Punjab",
  "04": "Chandigarh",
  "05": "Uttarakhand",
  "06": "Haryana",
  "07": "Delhi",
  "08": "Rajasthan",
  "09": "Uttar Pradesh",
  "10": "Bihar",
  "11": "Sikkim",
  "12": "Arunachal Pradesh",
  "13": "Nagaland",
  "14": "Manipur",
  "15": "Mizoram",
  "16": "Tripura",
  "17": "Meghalaya",
  "18": "Assam",
  "19": "West Bengal",
  "20": "Jharkhand",
  "21": "Odisha",
  "22": "Chhattisgarh",
  "23": "Madhya Pradesh",
  "24": "Gujarat",
  "26": "Dadra and Nagar Haveli and Daman and Diu",
  "27": "Maharashtra",
  "29": "Karnataka",
  "30": "Goa",
  "31": "Lakshadweep",
  "32": "Kerala",
  "33": "Tamil Nadu",
  "34": "Puducherry",
  "35": "Andaman and Nicobar Islands",
  "36": "Telangana",
  "37": "Andhra Pradesh",
  "38": "Ladakh",
  "97": "Other Territory",
  "96": "Other Country",
};

const NAME_TO_CODE = new Map(Object.entries(STATE_CODES).map(([code, name]) => [name.toLowerCase().replace(/[^a-z]/g, ""), code]));
const ALIASES: Record<string, string> = { newdelhi: "07", nctofdelhi: "07", orissa: "21", pondicherry: "34", jk: "01", ap: "37", mh: "27", ka: "29", tn: "33", gj: "24", up: "09", wb: "19", tg: "36", ts: "36", dl: "07", hr: "06", rj: "08", mp: "23" };

/** "Maharashtra", "MH", "27" → "27". */
export function stateCodeFromName(value?: string | null) {
  const text = String(value || "").trim();
  if (/^\d{2}$/.test(text) && STATE_CODES[text]) return text;
  const key = text.toLowerCase().replace(/[^a-z]/g, "");
  return NAME_TO_CODE.get(key) || ALIASES[key] || null;
}

const GSTIN_CHARS = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
const GSTIN_SHAPE = /^[0-9]{2}[A-Z0-9]{10}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

/** Format and mod-36 check digit (the 15th character). */
export function isValidGstin(value?: string | null) {
  const gstin = String(value || "").trim().toUpperCase();
  if (!GSTIN_SHAPE.test(gstin) || !STATE_CODES[gstin.slice(0, 2)]) return false;
  let sum = 0;
  for (let i = 0; i < 14; i += 1) {
    const product = GSTIN_CHARS.indexOf(gstin[i]) * (i % 2 === 0 ? 1 : 2);
    sum += Math.floor(product / 36) + (product % 36);
  }
  return GSTIN_CHARS[(36 - (sum % 36)) % 36] === gstin[14];
}

/** PAN is characters 3-12 of a GSTIN. */
export function panFromGstin(gstin?: string | null) {
  const value = String(gstin || "").toUpperCase();
  return value.length === 15 ? value.slice(2, 12) : null;
}

export const SUPPLY_TYPES = ["B2B", "B2C", "SEZWP", "SEZWOP", "EXPWP", "EXPWOP", "DEXP"] as const;
export type SupplyType = (typeof SUPPLY_TYPES)[number];

export type TaxInputLine = { amount: number; taxRate: number; hsn?: string | null; qty?: number; uqc?: string | null; description?: string; exempt?: boolean };
export type TaxedLine = TaxInputLine & { cgst: number; sgst: number; igst: number; tax: number };

/**
 * Place-of-supply tax split. Intra-state → CGST+SGST; inter-state, SEZ and exports with payment → IGST;
 * exports and SEZ supplies under LUT (…WOP) and exempt lines carry no tax.
 */
export function computeTax(lines: TaxInputLine[], options: { supplierState: string | null; placeOfSupply: string | null; supplyType: SupplyType }) {
  const zeroRated = options.supplyType === "EXPWOP" || options.supplyType === "SEZWOP";
  const igstOnly = options.supplyType !== "B2B" && options.supplyType !== "B2C" ? true : Boolean(options.supplierState && options.placeOfSupply && options.supplierState !== options.placeOfSupply);
  const taxed: TaxedLine[] = lines.map((line) => {
    const amount = round2(line.amount);
    if (zeroRated || line.exempt || !line.taxRate) return { ...line, amount, cgst: 0, sgst: 0, igst: 0, tax: 0 };
    const tax = round2((amount * line.taxRate) / 100);
    if (igstOnly) return { ...line, amount, cgst: 0, sgst: 0, igst: tax, tax };
    const cgst = round2(tax / 2);
    return { ...line, amount, cgst, sgst: round2(tax - cgst), igst: 0, tax };
  });
  const sum = (key: "amount" | "cgst" | "sgst" | "igst" | "tax") => round2(taxed.reduce((total, line) => total + line[key], 0));
  return { lines: taxed, subtotal: sum("amount"), cgst: sum("cgst"), sgst: sum("sgst"), igst: sum("igst"), tax: sum("tax"), interState: igstOnly };
}

export type HsnRow = { hsn: string; uqc: string; rate: number; qty: number; taxable: number; igst: number; cgst: number; sgst: number; cess: number };

/** HSN-wise summary (GSTR-1 table 12): one row per HSN and rate. */
export function hsnSummary(lines: Array<{ hsn?: string | null; uqc?: string | null; taxRate: number; qty?: number; amount: number; igst: number; cgst: number; sgst: number; sign?: number }>) {
  const rows = new Map<string, HsnRow>();
  for (const line of lines) {
    const sign = line.sign ?? 1;
    const hsn = (line.hsn || "").replace(/\D/g, "") || "NA";
    const key = `${hsn}|${line.taxRate}`;
    const row = rows.get(key) || { hsn, uqc: line.uqc || "NOS", rate: line.taxRate, qty: 0, taxable: 0, igst: 0, cgst: 0, sgst: 0, cess: 0 };
    row.qty = Math.round((row.qty + sign * (line.qty || 0)) * 1000) / 1000;
    row.taxable = round2(row.taxable + sign * line.amount);
    row.igst = round2(row.igst + sign * line.igst);
    row.cgst = round2(row.cgst + sign * line.cgst);
    row.sgst = round2(row.sgst + sign * line.sgst);
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.hsn.localeCompare(b.hsn) || a.rate - b.rate);
}

/** Inter-state B2C invoices above this value are reported invoice-wise (B2CL); the rest are aggregated (B2CS). */
export const B2CL_THRESHOLD = 100_000;

export type ReturnDoc = {
  kind: "INVOICE" | "CREDIT_NOTE";
  number: string;
  date: Date;
  counterpartyGstin?: string | null;
  placeOfSupply: string;
  supplyType: SupplyType;
  reverseCharge?: boolean;
  total: number;
  lines: Array<{ amount: number; taxRate: number; hsn?: string | null; uqc?: string | null; qty?: number; igst: number; cgst: number; sgst: number }>;
};

const gstDate = (date: Date) => `${String(date.getUTCDate()).padStart(2, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${date.getUTCFullYear()}`;

/** Rate-wise items as the GSTN offline tool expects (`num` is 1-based; rt × 100 is the conventional item number). */
function rateItems(lines: ReturnDoc["lines"], sign = 1) {
  const byRate = new Map<number, { txval: number; iamt: number; camt: number; samt: number }>();
  for (const line of lines) {
    const row = byRate.get(line.taxRate) || { txval: 0, iamt: 0, camt: 0, samt: 0 };
    row.txval = round2(row.txval + sign * line.amount);
    row.iamt = round2(row.iamt + sign * line.igst);
    row.camt = round2(row.camt + sign * line.cgst);
    row.samt = round2(row.samt + sign * line.sgst);
    byRate.set(line.taxRate, row);
  }
  return [...byRate.entries()].map(([rt, row], index) => ({ num: index + 1, itm_det: { rt, txval: row.txval, iamt: row.iamt, camt: row.camt, samt: row.samt, csamt: 0 } }));
}

/** GSTR-1 JSON (GSTN offline-tool layout) for one return period, `fp` = MMYYYY. */
export function buildGstr1(gstin: string, period: string, docs: ReturnDoc[], supplierState: string) {
  const [year, month] = period.split("-");
  const b2b = new Map<string, unknown[]>();
  const cdnr = new Map<string, unknown[]>();
  const b2cl = new Map<string, unknown[]>();
  const b2cs = new Map<string, { sply_ty: string; pos: string; typ: string; rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }>();
  const exp: Record<string, unknown[]> = { WPAY: [], WOPAY: [] };
  const cdnur: unknown[] = [];
  const hsnB2b: Parameters<typeof hsnSummary>[0] = [];
  const hsnB2c: Parameters<typeof hsnSummary>[0] = [];
  const counts = { b2b: 0, b2cl: 0, b2cs: 0, exp: 0, cdnr: 0, cdnur: 0 };
  for (const doc of docs) {
    const sign = doc.kind === "CREDIT_NOTE" ? -1 : 1;
    const registered = Boolean(doc.counterpartyGstin) && (doc.supplyType === "B2B" || doc.supplyType.startsWith("SEZ") || doc.supplyType === "DEXP");
    const exportDoc = doc.supplyType === "EXPWP" || doc.supplyType === "EXPWOP";
    const interState = doc.placeOfSupply !== supplierState;
    (registered ? hsnB2b : hsnB2c).push(...doc.lines.map((line) => ({ ...line, sign })));
    const invTyp = doc.supplyType === "SEZWP" ? "SEWP" : doc.supplyType === "SEZWOP" ? "SEWOP" : doc.supplyType === "DEXP" ? "DE" : "R";
    if (doc.kind === "INVOICE") {
      if (registered) {
        const list = b2b.get(doc.counterpartyGstin!) || [];
        list.push({ inum: doc.number, idt: gstDate(doc.date), val: round2(doc.total), pos: doc.placeOfSupply, rchrg: doc.reverseCharge ? "Y" : "N", inv_typ: invTyp, itms: rateItems(doc.lines) });
        b2b.set(doc.counterpartyGstin!, list);
        counts.b2b += 1;
      } else if (exportDoc) {
        exp[doc.supplyType === "EXPWP" ? "WPAY" : "WOPAY"].push({ inum: doc.number, idt: gstDate(doc.date), val: round2(doc.total), itms: rateItems(doc.lines).map((item) => ({ txval: item.itm_det.txval, rt: item.itm_det.rt, iamt: item.itm_det.iamt, csamt: 0 })) });
        counts.exp += 1;
      } else if (interState && doc.total > B2CL_THRESHOLD) {
        const list = b2cl.get(doc.placeOfSupply) || [];
        list.push({ inum: doc.number, idt: gstDate(doc.date), val: round2(doc.total), itms: rateItems(doc.lines).map((item) => ({ num: item.num, itm_det: { rt: item.itm_det.rt, txval: item.itm_det.txval, iamt: item.itm_det.iamt, csamt: 0 } })) });
        b2cl.set(doc.placeOfSupply, list);
        counts.b2cl += 1;
      } else {
        for (const item of rateItems(doc.lines)) addB2cs(b2cs, doc.placeOfSupply, interState, item.itm_det);
        counts.b2cs += 1;
      }
    } else if (registered) {
      const list = cdnr.get(doc.counterpartyGstin!) || [];
      list.push({ ntty: "C", nt_num: doc.number, nt_dt: gstDate(doc.date), val: round2(doc.total), pos: doc.placeOfSupply, rchrg: doc.reverseCharge ? "Y" : "N", inv_typ: invTyp, itms: rateItems(doc.lines) });
      cdnr.set(doc.counterpartyGstin!, list);
      counts.cdnr += 1;
    } else if (exportDoc || (interState && doc.total > B2CL_THRESHOLD)) {
      cdnur.push({ ntty: "C", nt_num: doc.number, nt_dt: gstDate(doc.date), val: round2(doc.total), typ: exportDoc ? (doc.supplyType === "EXPWP" ? "EXPWP" : "EXPWOP") : "B2CL", pos: exportDoc ? undefined : doc.placeOfSupply, itms: rateItems(doc.lines) });
      counts.cdnur += 1;
    } else {
      for (const item of rateItems(doc.lines, -1)) addB2cs(b2cs, doc.placeOfSupply, interState, item.itm_det);
    }
  }
  const hsnRows = (rows: HsnRow[]) => rows.map((row, index) => ({ num: index + 1, hsn_sc: row.hsn, uqc: row.uqc, qty: row.qty, rt: row.rate, txval: row.taxable, iamt: row.igst, camt: row.cgst, samt: row.sgst, csamt: 0 }));
  const json = {
    gstin,
    fp: `${month}${year}`,
    version: "GST3.2",
    hash: "hash",
    b2b: [...b2b.entries()].map(([ctin, inv]) => ({ ctin, inv })),
    b2cl: [...b2cl.entries()].map(([pos, inv]) => ({ pos, inv })),
    b2cs: [...b2cs.values()],
    exp: Object.entries(exp).filter(([, inv]) => inv.length).map(([exp_typ, inv]) => ({ exp_typ, inv })),
    cdnr: [...cdnr.entries()].map(([ctin, nt]) => ({ ctin, nt })),
    cdnur,
    hsn: { hsn_b2b: hsnRows(hsnSummary(hsnB2b)), hsn_b2c: hsnRows(hsnSummary(hsnB2c)) },
  };
  return { json, counts };
}

function addB2cs(map: Map<string, { sply_ty: string; pos: string; typ: string; rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }>, pos: string, interState: boolean, item: { rt: number; txval: number; iamt: number; camt: number; samt: number }) {
  const key = `${pos}|${item.rt}`;
  const row = map.get(key) || { sply_ty: interState ? "INTER" : "INTRA", pos, typ: "OE", rt: item.rt, txval: 0, iamt: 0, camt: 0, samt: 0, csamt: 0 };
  row.txval = round2(row.txval + item.txval);
  row.iamt = round2(row.iamt + item.iamt);
  row.camt = round2(row.camt + item.camt);
  row.samt = round2(row.samt + item.samt);
  map.set(key, row);
}

export type TaxHeads = { igst: number; cgst: number; sgst: number };

/**
 * Utilises input tax credit against output liability in the statutory order:
 * IGST credit → IGST, then CGST, then SGST; CGST credit → CGST, then IGST; SGST credit → SGST, then IGST.
 * CGST credit can never pay SGST and vice versa. Returns cash payable and credit carried forward.
 */
export function setOffItc(liability: TaxHeads, credit: TaxHeads) {
  const due = { ...liability };
  const left = { ...credit };
  const utilised = { igstToIgst: 0, igstToCgst: 0, igstToSgst: 0, cgstToCgst: 0, cgstToIgst: 0, sgstToSgst: 0, sgstToIgst: 0 };
  const use = (from: keyof TaxHeads, to: keyof TaxHeads, key: keyof typeof utilised) => {
    const amount = round2(Math.min(left[from], due[to]));
    if (amount <= 0) return;
    left[from] = round2(left[from] - amount);
    due[to] = round2(due[to] - amount);
    utilised[key] = amount;
  };
  use("igst", "igst", "igstToIgst");
  use("igst", "cgst", "igstToCgst");
  use("igst", "sgst", "igstToSgst");
  use("cgst", "cgst", "cgstToCgst");
  use("cgst", "igst", "cgstToIgst");
  use("sgst", "sgst", "sgstToSgst");
  use("sgst", "igst", "sgstToIgst");
  return { cash: due, carryForward: left, utilised };
}

/** Invoice numbers as suppliers type them differ in case, separators and leading zeros. */
export function normalizeDocNumber(value?: string | null) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(^|[A-Z])0+(?=\d)/g, "$1");
}

export type TwoBEntry = { id: string; supplierGstin: string; invoiceNo: string; invoiceDate: Date; taxable: number; igst: number; cgst: number; sgst: number };
export type BookBill = { id: string; gstin: string | null; invoiceNo: string | null; date: Date; taxable: number; igst: number; cgst: number; sgst: number };

/**
 * GSTR-2B ↔ purchase register: exact match on GSTIN + normalised invoice number, then a probable match on GSTIN + tax within ₹1
 * and date within 10 days. Differences above ₹1 per head are reported as mismatches with the fields that differ.
 */
export function reconcile2b(entries: TwoBEntry[], bills: BookBill[], tolerance = 1) {
  const used = new Set<string>();
  const results: Array<{ entryId: string; billId: string | null; status: "MATCHED" | "MISMATCH" | "PROBABLE" | "MISSING_IN_BOOKS"; differences: string[] }> = [];
  const diffs = (entry: TwoBEntry, bill: BookBill) => {
    const out: string[] = [];
    for (const key of ["taxable", "igst", "cgst", "sgst"] as const) if (Math.abs(entry[key] - bill[key]) > tolerance) out.push(`${key}: 2B ${entry[key].toFixed(2)} vs books ${bill[key].toFixed(2)}`);
    if (Math.abs(entry.invoiceDate.getTime() - bill.date.getTime()) > 31 * 86_400_000) out.push("date");
    return out;
  };
  const byKey = new Map<string, BookBill[]>();
  for (const bill of bills) {
    if (!bill.gstin) continue;
    const key = `${bill.gstin.toUpperCase()}|${normalizeDocNumber(bill.invoiceNo)}`;
    byKey.set(key, [...(byKey.get(key) || []), bill]);
  }
  const pending: TwoBEntry[] = [];
  for (const entry of entries) {
    const candidate = (byKey.get(`${entry.supplierGstin.toUpperCase()}|${normalizeDocNumber(entry.invoiceNo)}`) || []).find((bill) => !used.has(bill.id));
    if (!candidate) {
      pending.push(entry);
      continue;
    }
    used.add(candidate.id);
    const differences = diffs(entry, candidate);
    results.push({ entryId: entry.id, billId: candidate.id, status: differences.length ? "MISMATCH" : "MATCHED", differences });
  }
  for (const entry of pending) {
    const tax = entry.igst + entry.cgst + entry.sgst;
    const candidate = bills.find(
      (bill) => !used.has(bill.id) && bill.gstin?.toUpperCase() === entry.supplierGstin.toUpperCase() && Math.abs(bill.igst + bill.cgst + bill.sgst - tax) <= tolerance && Math.abs(bill.date.getTime() - entry.invoiceDate.getTime()) <= 10 * 86_400_000,
    );
    if (candidate) used.add(candidate.id);
    results.push({ entryId: entry.id, billId: candidate?.id || null, status: candidate ? "PROBABLE" : "MISSING_IN_BOOKS", differences: candidate ? [`invoice number: 2B ${entry.invoiceNo} vs books ${candidate.invoiceNo || "—"}`] : [] });
  }
  const missingIn2b = bills.filter((bill) => bill.gstin && !used.has(bill.id)).map((bill) => bill.id);
  return { results, missingIn2b };
}

/**
 * TDS sections commonly deducted on vendor payments. Rates and thresholds as of FY 2025-26 (Finance Act 2025);
 * review every April with the CA. `rateNoPan` is the section 206AA rate.
 */
export const TDS_SECTIONS: Record<string, { label: string; rate: number; rateCompany?: number; single?: number; annual?: number; rateNoPan: number }> = {
  "194C": { label: "Contractors (individual/HUF 1%, others 2%)", rate: 1, rateCompany: 2, single: 30_000, annual: 100_000, rateNoPan: 20 },
  "194J-P": { label: "Professional fees", rate: 10, single: 50_000, rateNoPan: 20 },
  "194J-T": { label: "Technical services / royalty (call centre)", rate: 2, single: 50_000, rateNoPan: 20 },
  "194H": { label: "Commission or brokerage", rate: 2, annual: 20_000, rateNoPan: 20 },
  "194I-PM": { label: "Rent of plant and machinery", rate: 2, single: 50_000, rateNoPan: 20 },
  "194I-LB": { label: "Rent of land or building", rate: 10, single: 50_000, rateNoPan: 20 },
  "194Q": { label: "Purchase of goods above ₹50 lakh", rate: 0.1, annual: 5_000_000, rateNoPan: 5 },
  "194A": { label: "Interest (other than securities)", rate: 10, annual: 10_000, rateNoPan: 20 },
};

/** Fourth character of a PAN: C = company, F = firm, P = individual, H = HUF … */
export function tdsRateFor(section: string, pan?: string | null) {
  const rule = TDS_SECTIONS[section];
  if (!rule) return 0;
  const valid = /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(String(pan || "").toUpperCase());
  if (!valid) return rule.rateNoPan;
  const holder = String(pan).toUpperCase()[3];
  return rule.rateCompany && !["P", "H"].includes(holder) ? rule.rateCompany : rule.rate;
}

/** Quarter label "2026-Q2" → date range in the financial year (Q1 = Apr-Jun). */
export function quarterRange(label: string) {
  const match = /^(\d{4})-Q([1-4])$/.exec(label);
  if (!match) return null;
  const fyStart = Number(match[1]);
  const quarter = Number(match[2]);
  const startMonth = 3 + (quarter - 1) * 3;
  const start = new Date(Date.UTC(fyStart + Math.floor(startMonth / 12), startMonth % 12, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 3, 1) - 1);
  return { start, end };
}

/** "2026-09" → first and last instant of the month (UTC). */
export function monthRange(period: string) {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const start = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, 1));
  return { start, end: new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1) - 1) };
}

/** E-way bill validity: one day per 200 km (regular cargo), counted to midnight of the last day. */
export function ewbValidity(generatedAt: Date, distanceKm: number) {
  const days = Math.max(1, Math.ceil(Math.max(distanceKm, 1) / 200));
  const end = new Date(generatedAt.getTime() + days * 86_400_000);
  return new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate(), 18, 29, 59));
}

const period = z.string().regex(/^\d{4}-\d{2}$/, "Use YYYY-MM");
const dateText = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const gstSettingsSchema = z.object({
  legalName: z.string().trim().min(2).max(100),
  tradeName: z.string().trim().max(100).optional(),
  address1: z.string().trim().min(3).max(100),
  address2: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2).max(50),
  pincode: z.string().regex(/^[1-9]\d{5}$/, "6-digit PIN"),
  stateCode: z.string().regex(/^\d{2}$/),
  email: z.string().email().max(100).optional().or(z.literal("")),
  phone: z.string().max(12).optional(),
  lutNumber: z.string().trim().max(40).optional(),
  exportWithPayment: z.boolean().default(false),
  einvoiceEnabled: z.boolean().default(false),
  ewayBillThreshold: z.coerce.number().min(0).max(1e7).default(50_000),
});

export const einvoiceCancelSchema = z.object({ reason: z.enum(["1", "2", "3", "4"]), remark: z.string().trim().min(3).max(100) });
export const EINVOICE_CANCEL_REASONS: Record<string, string> = { "1": "Duplicate", "2": "Data entry mistake", "3": "Order cancelled", "4": "Other" };

export const ewayBillSchema = z.object({
  distanceKm: z.coerce.number().int().min(0).max(4000),
  transMode: z.enum(["1", "2", "3", "4"]).default("1"),
  transporterId: z.string().trim().max(15).optional(),
  transporterName: z.string().trim().max(100).optional(),
  vehicleNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,15}$/, "Vehicle number without spaces").optional(),
  transDocNo: z.string().trim().max(15).optional(),
});
export const ewayPartBSchema = z.object({ vehicleNo: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{4,15}$/), reason: z.enum(["1", "2", "3", "4"]).default("1"), remark: z.string().trim().max(50).default("Vehicle changed"), fromPlace: z.string().trim().min(2).max(50) });
export const ewayExtendSchema = z.object({ remainingKm: z.coerce.number().int().min(1).max(4000), reason: z.enum(["1", "2", "3", "4", "99"]), remark: z.string().trim().min(3).max(50), fromPlace: z.string().trim().min(2).max(50), fromPincode: z.string().regex(/^[1-9]\d{5}$/) });
export const ewayCancelSchema = z.object({ reason: z.enum(["1", "2", "3", "4"]), remark: z.string().trim().min(3).max(50) });

export const gstPeriodSchema = z.object({ period });
export const gstFilingSchema = z.object({ period, returnType: z.enum(["GSTR1", "GSTR3B"]), arn: z.string().trim().max(30).optional(), filedOn: dateText.optional(), lockBooks: z.boolean().default(true) });
export const twoBActionSchema = z.object({ action: z.enum(["ACCEPT", "PENDING", "FOLLOW_UP", "REJECT"]).optional(), notes: z.string().trim().max(500).optional(), billId: z.string().max(64).nullable().optional() });
export const vendorTaxSchema = z.object({ pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN").optional().or(z.literal("")), tdsSection: z.string().max(10).optional().or(z.literal("")), lowerDeductionRate: z.coerce.number().min(0).max(30).optional() });
