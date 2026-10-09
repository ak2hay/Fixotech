import { z } from "zod";
import { round2 } from "./finance";

export type StatementLine = { date: Date; valueDate?: Date | null; description: string; reference?: string | null; debit: number; credit: number; balance?: number | null };
export type ParsedStatement = { bank: string | null; accountNo?: string | null; openingBalance?: number | null; closingBalance?: number | null; lines: StatementLine[]; warnings: string[] };

export const BANKS = ["HDFC", "ICICI", "SBI", "AXIS", "GENERIC"] as const;
export type BankCode = (typeof BANKS)[number];

const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };

/** Indian statements write dates day-first: 05/09/26, 05-09-2026, 5 Sep 2026, 05-Sep-26; ISO is accepted too. */
export function parseBankDate(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()));
  const text = String(value ?? "").trim();
  if (!text) return null;
  const year = (raw: string) => (raw.length === 2 ? 2000 + Number(raw) : Number(raw));
  const build = (y: number, m: number, d: number) => {
    const date = new Date(Date.UTC(y, m, d));
    return date.getUTCMonth() === m && date.getUTCDate() === d && y > 1990 && y < 2100 ? date : null;
  };
  let match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) return build(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  match = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2}|\d{4})\b/.exec(text);
  if (match) return build(year(match[3]), Number(match[2]) - 1, Number(match[1]));
  match = /^(\d{1,2})[\s\-/]([A-Za-z]{3,4})[A-Za-z]*[\s\-/,]+(\d{2}|\d{4})\b/.exec(text);
  if (match && MONTHS[match[2].toLowerCase()] !== undefined) return build(year(match[3]), MONTHS[match[2].toLowerCase()], Number(match[1]));
  return null;
}

/** "1,23,456.78", "(500.00)", "500.00 Dr", "₹ 1,000" → number; Dr / brackets / leading minus are negative. */
export function parseBankAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  let text = String(value ?? "").trim();
  if (!text || text === "-") return null;
  const negative = /^\(.*\)$/.test(text) || /\bdr\.?$/i.test(text) || text.startsWith("-");
  text = text.replace(/[^\d.]/g, "");
  if (!text || !/\d/.test(text)) return null;
  const amount = Number(text);
  if (!Number.isFinite(amount)) return null;
  return negative ? -amount : amount;
}

const norm = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
const COLUMN_ALIASES: Record<string, string[]> = {
  date: ["txndate", "transactiondate", "trandate", "date", "postdate", "postingdate"],
  valueDate: ["valuedate", "valuedt"],
  description: ["narration", "description", "particulars", "transactionremarks", "remarks", "details", "transactiondetails"],
  reference: ["chqrefno", "refnochequeno", "chequeno", "chqno", "chequenumber", "referenceno", "reference", "refno", "utr", "utrno"],
  debit: ["withdrawalamt", "withdrawalamountinr", "withdrawalamount", "withdrawal", "withdrawals", "debit", "debitamount", "dr", "debitinr"],
  credit: ["depositamt", "depositamountinr", "depositamount", "deposit", "deposits", "credit", "creditamount", "cr", "creditinr"],
  balance: ["closingbalance", "balance", "balanceinr", "availablebalance", "runningbalance"],
  amount: ["amount", "transactionamount", "amountinr", "txnamount"],
  drcr: ["crdr", "drcr", "type", "debitcredit", "transactiontype"],
};

function columnOf(header: string[], key: string) {
  const cells = header.map(norm);
  for (const alias of COLUMN_ALIASES[key]) {
    const exact = cells.indexOf(alias);
    if (exact >= 0) return exact;
  }
  for (const alias of COLUMN_ALIASES[key]) {
    if (alias.length < 5) continue;
    const loose = cells.findIndex((cell) => cell.startsWith(alias));
    if (loose >= 0) return loose;
  }
  return -1;
}

export function detectBank(text: string): BankCode {
  const upper = text.toUpperCase();
  if (upper.includes("HDFC")) return "HDFC";
  if (upper.includes("ICICI")) return "ICICI";
  if (upper.includes("STATE BANK") || /\bSBI(N)?\b/.test(upper)) return "SBI";
  if (upper.includes("AXIS")) return "AXIS";
  return "GENERIC";
}

/** Bank statement as a grid (CSV or Excel). Finds the header row, maps columns by name and skips banners and footers. */
export function parseStatementTable(rows: unknown[][]): ParsedStatement {
  const warnings: string[] = [];
  const text = rows.slice(0, 25).map((row) => row.join(" ")).join(" ");
  const bank = detectBank(text);
  const accountMatch = /(?:a\/?c|account)\s*(?:no\.?|number)?\s*[:\-]?\s*([0-9X*]{6,20})/i.exec(text);
  let headerIndex = -1;
  for (let index = 0; index < Math.min(rows.length, 60); index++) {
    const header = rows[index].map((cell) => String(cell ?? ""));
    if (columnOf(header, "date") >= 0 && (columnOf(header, "debit") >= 0 || columnOf(header, "credit") >= 0 || columnOf(header, "amount") >= 0)) {
      headerIndex = index;
      break;
    }
  }
  if (headerIndex < 0) return { bank, lines: [], warnings: ["Could not find the header row (Date, Narration, Withdrawal/Debit, Deposit/Credit, Balance)"] };
  const header = rows[headerIndex].map((cell) => String(cell ?? ""));
  const col = Object.fromEntries(Object.keys(COLUMN_ALIASES).map((key) => [key, columnOf(header, key)])) as Record<keyof typeof COLUMN_ALIASES, number>;
  if (col.balance === col.amount) col.amount = -1;
  const lines: StatementLine[] = [];
  let skipped = 0;
  for (const row of rows.slice(headerIndex + 1)) {
    const date = parseBankDate(row[col.date]);
    if (!date) {
      const tail = row.map((cell) => String(cell ?? "").trim()).filter(Boolean);
      if (lines.length && tail.length && col.description >= 0 && !String(row[col.date] ?? "").trim() && tail.length <= 2 && !/total|balance|statement|generated/i.test(tail.join(" "))) lines[lines.length - 1].description += ` ${tail.join(" ")}`;
      else if (tail.length) skipped++;
      continue;
    }
    let debit = col.debit >= 0 ? Math.abs(parseBankAmount(row[col.debit]) || 0) : 0;
    let credit = col.credit >= 0 ? Math.abs(parseBankAmount(row[col.credit]) || 0) : 0;
    if (col.debit < 0 && col.credit < 0 && col.amount >= 0) {
      const amount = parseBankAmount(row[col.amount]) || 0;
      const kind = col.drcr >= 0 ? norm(row[col.drcr]) : "";
      const isDebit = kind.startsWith("d") || kind === "withdrawal" || (!kind && amount < 0);
      debit = isDebit ? Math.abs(amount) : 0;
      credit = isDebit ? 0 : Math.abs(amount);
    }
    if (!debit && !credit) continue;
    lines.push({
      date,
      valueDate: col.valueDate >= 0 ? parseBankDate(row[col.valueDate]) : null,
      description: col.description >= 0 ? String(row[col.description] ?? "").replace(/\s+/g, " ").trim() : "",
      reference: col.reference >= 0 ? String(row[col.reference] ?? "").trim().replace(/^0+$/, "") || null : null,
      debit: round2(debit),
      credit: round2(credit),
      balance: col.balance >= 0 ? parseBankAmount(row[col.balance]) : null,
    });
  }
  if (skipped > 3) warnings.push(`${skipped} rows without a date were skipped`);
  const first = lines[0];
  const last = lines[lines.length - 1];
  return {
    bank,
    accountNo: accountMatch?.[1] || null,
    openingBalance: first && first.balance != null ? round2(first.balance - first.credit + first.debit) : null,
    closingBalance: last?.balance ?? null,
    lines,
    warnings: [...warnings, ...balanceWarnings(lines)],
  };
}

/** Running balance check catches dropped or doubled rows. */
function balanceWarnings(lines: StatementLine[]) {
  let breaks = 0;
  for (let index = 1; index < lines.length; index++) {
    const previous = lines[index - 1].balance;
    const current = lines[index].balance;
    if (previous == null || current == null) continue;
    if (Math.abs(round2(previous + lines[index].credit - lines[index].debit) - current) > 0.01) breaks++;
  }
  return breaks ? [`The running balance does not add up at ${breaks} row(s); the file may be sorted newest-first or have missing rows`] : [];
}

/** SWIFT MT940 (and the MT942 intraday variant): :60F: opening, :61: lines, :86: narrative, :62F: closing. */
export function parseMt940(text: string): ParsedStatement {
  const lines: StatementLine[] = [];
  const amountOf = (raw: string) => Number(raw.replace(",", "."));
  const balanceOf = (raw?: string) => {
    const match = /^([CD])(\d{6})([A-Z]{3})([\d,]+)/.exec(raw || "");
    return match ? (match[1] === "D" ? -1 : 1) * amountOf(match[4]) : null;
  };
  const tags = text.replace(/\r/g, "").split(/\n(?=:\d{2}[A-Z]?:)/);
  let accountNo: string | null = null;
  let opening: number | null = null;
  let closing: number | null = null;
  let running: number | null = null;
  for (const block of tags) {
    const match = /^:(\d{2}[A-Z]?):([\s\S]*)$/.exec(block.trim());
    if (!match) continue;
    const [, tag, body] = match;
    const value = body.trim();
    if (tag === "25") accountNo = value.split("/").pop() || value;
    else if (tag === "60F" || tag === "60M") running = opening = balanceOf(value);
    else if (tag === "62F" || tag === "62M") closing = balanceOf(value);
    else if (tag === "61") {
      const line = /^(\d{2})(\d{2})(\d{2})(\d{4})?(R?[CD])[A-Z]?([\d,]+)([A-Z]\w{3})?([^\n/]*)(?:\/\/([^\n]*))?/.exec(value);
      if (!line) continue;
      const date = new Date(Date.UTC(2000 + Number(line[1]), Number(line[2]) - 1, Number(line[3])));
      const amount = amountOf(line[6]);
      const credit = line[5] === "C" || line[5] === "RD";
      if (running !== null) running = round2(running + (credit ? amount : -amount));
      const entry = date.getUTCFullYear() && line[4] ? new Date(Date.UTC(date.getUTCFullYear(), Number(line[4].slice(0, 2)) - 1, Number(line[4].slice(2)))) : null;
      lines.push({ date: entry || date, valueDate: date, description: "", reference: (line[8] || "").trim().replace(/^NONREF$/, "") || line[9]?.trim() || null, debit: credit ? 0 : amount, credit: credit ? amount : 0, balance: running });
    } else if (tag === "86" && lines.length) lines[lines.length - 1].description = value.replace(/\n/g, " ").replace(/\?\d{2}/g, " ").replace(/\s+/g, " ").trim();
  }
  return { bank: detectBank(text), accountNo, openingBalance: opening, closingBalance: closing, lines, warnings: lines.length ? [] : ["No :61: transaction lines found"] };
}

const MONEY = /-?\(?[\d,]+\.\d{2}\)?(?:\s?(?:Cr|Dr|CR|DR))?/g;

/**
 * Text pulled from a PDF statement. A transaction row starts with a date and ends with the amount and the running balance;
 * whether the amount is a debit or a credit comes from how the balance moved.
 */
export function parsePdfStatement(text: string): ParsedStatement {
  const rows = text.replace(/\r/g, "").split("\n").map((row) => row.replace(/\s+/g, " ").trim()).filter(Boolean);
  const lines: StatementLine[] = [];
  let opening: number | null = null;
  for (const row of rows) {
    const openingMatch = /opening balance[^\d-]*(-?[\d,]+\.\d{2}(?:\s?(?:Cr|Dr|CR|DR))?)/i.exec(row);
    if (openingMatch && opening === null) {
      opening = parseBankAmount(openingMatch[1]);
      continue;
    }
    const date = parseBankDate(row);
    const amounts = row.match(MONEY) || [];
    if (date && amounts.length >= 2) {
      const balance = parseBankAmount(amounts[amounts.length - 1])!;
      const amount = Math.abs(parseBankAmount(amounts[amounts.length - 2])!);
      let description = row.replace(/^\S+(\s\S+\s\d{2,4})?/, "");
      for (const token of amounts) description = description.replace(token, "");
      description = description.replace(/\b\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4}\b/g, "").replace(/\s+/g, " ").trim();
      const previous = lines.length ? lines[lines.length - 1].balance : opening;
      let credit: boolean;
      if (previous != null) credit = Math.abs(round2(previous + amount) - balance) <= 0.01 ? true : Math.abs(round2(previous - amount) - balance) <= 0.01 ? false : /\b(cr|credit|deposit|by)\b/i.test(row);
      else credit = /\b(cr|credit|deposit|neft cr|imps cr|by)\b/i.test(row) && !/\b(dr|debit|withdrawal|to)\b/i.test(row);
      const ref = /\b(?:ref|chq|cheque|utr)[\s.:#no]*([A-Z0-9]{6,22})/i.exec(row);
      lines.push({ date, description, reference: ref?.[1] || null, debit: credit ? 0 : amount, credit: credit ? amount : 0, balance });
    } else if (!date && lines.length && !amounts.length && row.length < 120 && !/page \d|statement|balance|total|generated/i.test(row)) {
      lines[lines.length - 1].description = `${lines[lines.length - 1].description} ${row}`.trim();
    }
  }
  const warnings = lines.length ? balanceWarnings(lines) : ["No transaction rows found; export the statement as CSV or Excel instead"];
  return { bank: detectBank(rows.slice(0, 30).join(" ")), openingBalance: opening, closingBalance: lines[lines.length - 1]?.balance ?? null, lines, warnings };
}

/** UTR or bank reference embedded in the narration: NEFT/RTGS (16-22 chars), IMPS and UPI (12 digits). */
export function extractUtr(description: string): string | null {
  const text = description.toUpperCase();
  const patterns = [
    /\b(?:NEFT|RTGS)[\s\-/:]*(?:CR|DR)?[\s\-/:]*([A-Z]{4}[A-Z0-9]{8,18})\b/,
    /\bUTR[\s\-/:#NO.]*([A-Z0-9]{12,22})\b/,
    /\b(?:IMPS|UPI|MMT)[\s\-/:]*(?:P2A|P2M|CR|DR)?[\s\-/:]*(\d{12})\b/,
    /\b([A-Z]{4}[RHN]\d{9,17})\b/,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match) return match[1];
  }
  return null;
}

export function statementLineHash(accountId: string, line: StatementLine, occurrence = 0) {
  return [accountId, line.date.toISOString().slice(0, 10), line.debit.toFixed(2), line.credit.toFixed(2), line.balance == null ? "" : line.balance.toFixed(2), line.description.slice(0, 80).toUpperCase(), line.reference || "", occurrence].join("|");
}

// ---------- Matching ----------

export type BankLineForMatch = { id: string; date: Date; amount: number; description: string; reference?: string | null; utr?: string | null };
export type MatchCandidate = { id: string; date: Date; amount: number; reference?: string | null; partyName?: string | null; documentNumbers?: string[] };

const tokens = (value: string) => value.toUpperCase().split(/[^A-Z0-9]+/).filter((token) => token.length >= 4);

/**
 * 0-100. Amount must agree to the rupee; reference/UTR, document number in the narration, party name and date
 * proximity add confidence.
 */
export function scoreMatch(line: BankLineForMatch, candidate: MatchCandidate) {
  if (Math.sign(line.amount) !== Math.sign(candidate.amount) || Math.abs(Math.abs(line.amount) - Math.abs(candidate.amount)) > 1) return 0;
  let score = Math.abs(line.amount - candidate.amount) <= 0.01 ? 40 : 30;
  const days = Math.abs(line.date.getTime() - candidate.date.getTime()) / 86_400_000;
  score += days <= 1 ? 20 : days <= 3 ? 14 : days <= 7 ? 8 : days <= 30 ? 2 : -10;
  const narration = `${line.description} ${line.reference || ""}`.toUpperCase();
  const squashed = narration.replace(/[^A-Z0-9]/g, "");
  const reference = (candidate.reference || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (reference.length >= 6 && (squashed.includes(reference) || (line.utr && line.utr === reference))) score += 35;
  if ((candidate.documentNumbers || []).some((number) => number.length >= 4 && squashed.includes(number.toUpperCase().replace(/[^A-Z0-9]/g, "")))) score += 20;
  const party = tokens(candidate.partyName || "").filter((token) => !["PRIVATE", "LIMITED", "PVT", "LTD", "INDIA", "TRADERS", "ENTERPRISES", "COMPANY"].includes(token));
  if (party.length && party.some((token) => narration.includes(token))) score += 15;
  return Math.max(0, Math.min(100, score));
}

/** Greedy one-to-one assignment, best score first. Ties between two candidates at the same score stay unmatched. */
export function autoMatch(lines: BankLineForMatch[], candidates: MatchCandidate[], threshold = 70) {
  const pairs: Array<{ lineId: string; candidateId: string; score: number }> = [];
  for (const line of lines) {
    for (const candidate of candidates) {
      const score = scoreMatch(line, candidate);
      if (score >= 40) pairs.push({ lineId: line.id, candidateId: candidate.id, score });
    }
  }
  pairs.sort((a, b) => b.score - a.score);
  const usedLines = new Set<string>();
  const usedCandidates = new Set<string>();
  const matched: typeof pairs = [];
  const suggested: typeof pairs = [];
  for (const pair of pairs) {
    if (usedLines.has(pair.lineId) || usedCandidates.has(pair.candidateId)) continue;
    const rival = pairs.find((other) => other !== pair && other.score === pair.score && !usedCandidates.has(other.candidateId) && !usedLines.has(other.lineId) && (other.lineId === pair.lineId || other.candidateId === pair.candidateId));
    usedLines.add(pair.lineId);
    usedCandidates.add(pair.candidateId);
    if (pair.score >= threshold && !rival) matched.push(pair);
    else suggested.push(pair);
  }
  return { matched, suggested };
}

export type BankRuleLike = { id: string; contains: string; direction: string; minAmount?: number | null; maxAmount?: number | null; priority: number; bankAccountId?: string | null };

/** First rule (lowest priority number) whose keywords (separated by |) appear in the narration. */
export function ruleFor<T extends BankRuleLike>(line: { description: string; reference?: string | null; debit: number; credit: number; accountId?: string }, rules: T[]): T | null {
  const narration = `${line.description} ${line.reference || ""}`.toUpperCase();
  const amount = line.credit || line.debit;
  const direction = line.credit ? "IN" : "OUT";
  for (const rule of [...rules].sort((a, b) => a.priority - b.priority)) {
    if (rule.direction !== "ANY" && rule.direction !== direction) continue;
    if (rule.bankAccountId && line.accountId && rule.bankAccountId !== line.accountId) continue;
    if (rule.minAmount != null && amount < rule.minAmount) continue;
    if (rule.maxAmount != null && amount > rule.maxAmount) continue;
    const keywords = rule.contains.split("|").map((word) => word.trim().toUpperCase()).filter(Boolean);
    if (keywords.some((word) => narration.includes(word))) return rule;
  }
  return null;
}

// ---------- Bulk payment files ----------

export type PayoutItem = { payeeName: string; accountNo: string; ifsc: string; amount: number; reference: string; email?: string | null; mode?: string | null; code?: string | null };
export type PayoutFile = { content: string; filename: string; mime: string };

export const RTGS_MINIMUM = 200_000;

/** NEFT below ₹2 lakh, RTGS from ₹2 lakh, internal transfer when the payee banks with us (same IFSC prefix). */
export function payoutMode(item: Pick<PayoutItem, "amount" | "ifsc" | "mode">, debitIfsc?: string | null) {
  if (item.mode) return item.mode;
  if (debitIfsc && item.ifsc.slice(0, 4).toUpperCase() === debitIfsc.slice(0, 4).toUpperCase()) return "IFT";
  return item.amount >= RTGS_MINIMUM ? "RTGS" : "NEFT";
}

export function validatePayout(item: PayoutItem) {
  const problems: string[] = [];
  if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(item.ifsc.toUpperCase())) problems.push("invalid IFSC");
  if (!/^\d{6,18}$/.test(item.accountNo)) problems.push("account number must be 6-18 digits");
  if (!(item.amount > 0)) problems.push("amount must be positive");
  if (!item.payeeName.trim()) problems.push("payee name missing");
  return problems;
}

const clean = (value: string, max: number) => value.replace(/[^A-Za-z0-9 .\-/]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const ddmmyyyy = (date: Date, sep = "/") => [String(date.getUTCDate()).padStart(2, "0"), String(date.getUTCMonth() + 1).padStart(2, "0"), date.getUTCFullYear()].join(sep);

/**
 * Upload files for corporate net banking. Column layouts follow the banks' standard bulk templates
 * (HDFC ENet, ICICI CIB, SBI CINB, Axis CIB); banks occasionally customise them per client, so check the first file.
 */
export function bulkPaymentFile(bank: BankCode, debit: { accountNo: string; ifsc?: string | null }, items: PayoutItem[], valueDate: Date, runNumber: string): PayoutFile {
  const date = ddmmyyyy(valueDate);
  const rows = items.map((item) => ({ ...item, payeeName: clean(item.payeeName, 35), reference: clean(item.reference, 20), ifsc: item.ifsc.toUpperCase(), mode: payoutMode(item, debit.ifsc), amountText: item.amount.toFixed(2) }));
  const csv = (lines: Array<Array<string | number>>) => lines.map((line) => line.map((cell) => String(cell).replace(/,/g, " ")).join(",")).join("\r\n") + "\r\n";
  switch (bank) {
    case "HDFC": {
      const code = (mode: string) => (mode === "IFT" ? "I" : mode === "RTGS" ? "R" : mode === "IMPS" ? "M" : "N");
      return {
        filename: `${runNumber}-HDFC.txt`,
        mime: "text/plain",
        content: csv(rows.map((row) => [code(row.mode), row.code || "", row.accountNo, row.amountText, row.payeeName, "", "", "", "", "", "", "", "", row.reference, "", "", "", "", "", "", "", "", date, "", row.ifsc, "", "", row.email || ""])),
      };
    }
    case "ICICI": {
      const code = (mode: string) => (mode === "IFT" ? "FT" : mode === "RTGS" ? "RTG" : mode === "IMPS" ? "IFC" : "NEFT");
      return {
        filename: `${runNumber}-ICICI.csv`,
        mime: "text/csv",
        content: csv([["Debit Ac No", "Beneficiary Ac No", "Beneficiary Name", "Amt", "Pay Mod", "Date", "IFSC", "Payable Location", "Print Location", "Bene Mobile No.", "Bene Email ID", "Bene add1", "Bene add2", "Bene add3", "Bene add4", "Add Details 1", "Add Details 2", "Add Details 3", "Add Details 4", "Add Details 5", "Remarks"], ...rows.map((row) => [debit.accountNo, row.accountNo, row.payeeName, row.amountText, code(row.mode), date, row.ifsc, "", "", "", row.email || "", "", "", "", "", row.reference, "", "", "", "", row.reference])]),
      };
    }
    case "SBI":
      return {
        filename: `${runNumber}-SBI.txt`,
        mime: "text/plain",
        content: rows.map((row) => [row.mode === "IFT" ? "DCR" : row.mode === "RTGS" ? "RTGS" : "NEFT", row.ifsc, row.accountNo, row.payeeName, row.amountText, debit.accountNo, ddmmyyyy(valueDate, ""), row.reference, row.email || ""].join("#")).join("\r\n") + "\r\n",
      };
    case "AXIS": {
      const code = (mode: string) => (mode === "IFT" ? "I" : mode === "RTGS" ? "R" : "N");
      return {
        filename: `${runNumber}-AXIS.csv`,
        mime: "text/csv",
        content: csv([["Payment Method Name", "Payment Amount", "Activation Date", "Beneficiary Name", "Account No", "Debit Account No", "CRN No", "Receiver IFSC Code", "Receiver Account Type", "Remarks", "Email"], ...rows.map((row) => [code(row.mode), row.amountText, ddmmyyyy(valueDate, "-"), row.payeeName, row.accountNo, debit.accountNo, row.reference, row.ifsc, "11", row.reference, row.email || ""])]),
      };
    }
    default:
      return {
        filename: `${runNumber}.csv`,
        mime: "text/csv",
        content: csv([["Mode", "Payee", "Account", "IFSC", "Amount", "Value date", "Reference", "Email", "Debit account"], ...rows.map((row) => [row.mode, row.payeeName, row.accountNo, row.ifsc, row.amountText, date, row.reference, row.email || "", debit.accountNo])]),
      };
  }
}

// ---------- Schemas ----------

export const bankRuleSchema = z.object({
  name: z.string().trim().min(2).max(80),
  contains: z.string().trim().min(2).max(300),
  direction: z.enum(["IN", "OUT", "ANY"]).default("ANY"),
  bankAccountId: z.string().max(64).optional().or(z.literal("")),
  counterAccountId: z.string().min(1).max(64),
  minAmount: z.coerce.number().min(0).optional(),
  maxAmount: z.coerce.number().min(0).optional(),
  narration: z.string().trim().max(200).optional(),
  autoPost: z.boolean().default(false),
  priority: z.coerce.number().int().min(1).max(999).default(100),
  active: z.boolean().default(true),
});

export const bankMatchSchema = z.object({ paymentIds: z.array(z.string().max(64)).max(50).default([]), journalEntryId: z.string().max(64).optional() });
export const bankPostSchema = z.object({
  kind: z.enum(["ACCOUNT", "RECEIPT", "PAYMENT"]),
  counterAccountId: z.string().max(64).optional(),
  narration: z.string().trim().max(200).optional(),
  customerId: z.string().max(64).optional(),
  invoiceId: z.string().max(64).optional(),
  vendorId: z.string().max(64).optional(),
  vendorBillId: z.string().max(64).optional(),
  tdsAmount: z.coerce.number().min(0).default(0),
});

export const paymentRunSchema = z.object({
  kind: z.enum(["VENDOR", "SALARY", "OTHER"]).default("VENDOR"),
  accountId: z.string().min(1).max(64),
  bankFormat: z.enum(BANKS).default("GENERIC"),
  valueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  notes: z.string().trim().max(500).optional(),
  items: z
    .array(
      z.object({
        vendorBillId: z.string().max(64).optional(),
        vendorId: z.string().max(64).optional(),
        amount: z.coerce.number().positive(),
        tdsAmount: z.coerce.number().min(0).default(0),
        mode: z.enum(["NEFT", "RTGS", "IMPS", "IFT"]).optional(),
        reference: z.string().trim().max(40).optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const paymentLinkSchema = z.object({ amount: z.coerce.number().positive().optional(), expireDays: z.coerce.number().int().min(1).max(180).default(30), notify: z.boolean().default(true) });
