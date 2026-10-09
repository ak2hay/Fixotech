import { z } from "zod";
import { round2 } from "./finance";

// ---------- Periods ----------

/** "2026-10" → "2026-27" (Indian financial year April–March). */
export function fyOf(period: string) {
  const [year, month] = period.split("-").map(Number);
  const start = month >= 4 ? year : year - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
export function fyRange(fy: string) {
  const start = Number(fy.slice(0, 4));
  return { from: `${start}-04-01`, to: `${start + 1}-03-31`, periods: Array.from({ length: 12 }, (_, index) => { const month = ((index + 3) % 12) + 1; return `${month >= 4 ? start : start + 1}-${String(month).padStart(2, "0")}`; }) };
}
/** Months left in the financial year including this one (April = 12, March = 1). */
export const monthsRemainingInFy = (month: number) => (month >= 4 ? 16 - month : 4 - month);
export const quarterOf = (month: number) => (month >= 4 && month <= 6 ? 1 : month >= 7 && month <= 9 ? 2 : month >= 10 ? 3 : 4);
export function periodRange(period: string) {
  const [year, month] = period.split("-").map(Number);
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { year, month, days, from: `${period}-01`, to: `${period}-${String(days).padStart(2, "0")}` };
}
export function ageOn(dob: Date | null | undefined, on: Date) {
  if (!dob) return null;
  let age = on.getUTCFullYear() - dob.getUTCFullYear();
  if (on.getUTCMonth() < dob.getUTCMonth() || (on.getUTCMonth() === dob.getUTCMonth() && on.getUTCDate() < dob.getUTCDate())) age--;
  return age;
}

// ---------- Formulas ----------

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  MIN: (...args) => Math.min(...args),
  MAX: (...args) => Math.max(...args),
  ROUND: (value, digits = 0) => Math.round(value * 10 ** digits) / 10 ** digits,
  FLOOR: (value) => Math.floor(value),
  CEIL: (value) => Math.ceil(value),
  IF: (condition, a, b) => (condition ? a : b),
};

/** Arithmetic over component codes: + - * / ( ), comparisons, MIN MAX ROUND FLOOR CEIL IF. No other syntax is accepted. */
export function evaluateFormula(expression: string, vars: Record<string, number>) {
  const tokens = expression.toUpperCase().match(/\d+(?:\.\d+)?|[A-Z_][A-Z0-9_]*|>=|<=|==|!=|[-+*/(),<>]|\S/g) || [];
  let at = 0;
  const peek = () => tokens[at];
  const take = (expected?: string) => {
    const token = tokens[at++];
    if (expected && token !== expected) throw new Error(`Expected ${expected} in formula "${expression}"`);
    if (token === undefined) throw new Error(`Formula "${expression}" ends unexpectedly`);
    return token;
  };
  const factor = (): number => {
    const token = take();
    if (token === "-") return -factor();
    if (token === "+") return factor();
    if (token === "(") {
      const value = comparison();
      take(")");
      return value;
    }
    if (/^\d/.test(token)) return Number(token);
    if (/^[A-Z_]/.test(token)) {
      if (peek() === "(") {
        const fn = FUNCTIONS[token];
        if (!fn) throw new Error(`Unknown function ${token}`);
        take("(");
        const args: number[] = [];
        if (peek() !== ")") {
          args.push(comparison());
          while (peek() === ",") {
            take(",");
            args.push(comparison());
          }
        }
        take(")");
        return fn(...args);
      }
      if (!(token in vars)) throw new Error(`Unknown component ${token} in formula "${expression}"`);
      return vars[token];
    }
    throw new Error(`Unexpected "${token}" in formula "${expression}"`);
  };
  const term = (): number => {
    let value = factor();
    while (peek() === "*" || peek() === "/") {
      const op = take();
      const right = factor();
      value = op === "*" ? value * right : right === 0 ? 0 : value / right;
    }
    return value;
  };
  const sum = (): number => {
    let value = term();
    while (peek() === "+" || peek() === "-") value = take() === "+" ? value + term() : value - term();
    return value;
  };
  const comparison = (): number => {
    const left = sum();
    const op = peek();
    if (op && [">", "<", ">=", "<=", "==", "!="].includes(op)) {
      take();
      const right = sum();
      return Number(op === ">" ? left > right : op === "<" ? left < right : op === ">=" ? left >= right : op === "<=" ? left <= right : op === "==" ? left === right : left !== right);
    }
    return left;
  };
  const value = comparison();
  if (at < tokens.length) throw new Error(`Unexpected "${tokens[at]}" in formula "${expression}"`);
  if (!Number.isFinite(value)) throw new Error(`Formula "${expression}" is not a number`);
  return value;
}

// ---------- Statutory rules ----------

export type Slab = { upTo: number | null; amount: number; february?: number; gender?: "MALE" | "FEMALE" | "OTHER" };
export type PtRule = { label: string; frequency: "MONTHLY" | "HALF_YEARLY" | "NONE"; months?: number[]; slabs: Slab[] };
export type LwfRule = { label: string; employee: number; employer: number; months: number[]; minWage?: number };
export type TaxRegimeRules = { slabs: Array<{ upTo: number | null; rate: number }>; standardDeduction: number; rebateLimit: number; rebateMax: number; marginalRelief: boolean; surcharge: Array<{ above: number; rate: number }>; cess: number };
export type StatutoryRules = {
  pf: { employeeRate: number; employerRate: number; epsRate: number; wageCeiling: number; capWages: boolean; adminRate: number; edliRate: number; epsAgeLimit: number };
  esi: { employeeRate: number; employerRate: number; wageCeiling: number };
  pt: Record<string, PtRule>;
  lwf: Record<string, LwfRule>;
  tax: { NEW: TaxRegimeRules; OLD: TaxRegimeRules; caps: { section80C: number; section80CCD1B: number; section80D: number; section24B: number; section80TTA: number; professionalTax: number } };
  overtime: { multiplier: number; basis: "GROSS" | "BASIC"; daysPerMonth: number; hoursPerDay: number };
  gratuity: { cap: number; minServiceDays: number };
};

/**
 * Defaults for FY 2026-27, carried from the FY 2025-26 Finance Act and state notifications.
 * Payroll must confirm these with their CA each year and edit them under Payroll → Statutory.
 */
export const DEFAULT_STATUTORY: StatutoryRules = {
  pf: { employeeRate: 12, employerRate: 12, epsRate: 8.33, wageCeiling: 15000, capWages: true, adminRate: 0.5, edliRate: 0.5, epsAgeLimit: 58 },
  esi: { employeeRate: 0.75, employerRate: 3.25, wageCeiling: 21000 },
  pt: {
    MH: {
      label: "Maharashtra",
      frequency: "MONTHLY",
      slabs: [
        { upTo: 7500, amount: 0, gender: "MALE" },
        { upTo: 10000, amount: 175, gender: "MALE" },
        { upTo: null, amount: 200, february: 300, gender: "MALE" },
        { upTo: 25000, amount: 0, gender: "FEMALE" },
        { upTo: null, amount: 200, february: 300, gender: "FEMALE" },
      ],
    },
    TN: {
      label: "Tamil Nadu (half-yearly)",
      frequency: "HALF_YEARLY",
      months: [9, 3],
      slabs: [
        { upTo: 21000, amount: 0 },
        { upTo: 30000, amount: 180 },
        { upTo: 45000, amount: 425 },
        { upTo: 60000, amount: 930 },
        { upTo: 75000, amount: 1025 },
        { upTo: null, amount: 1250 },
      ],
    },
    KA: { label: "Karnataka", frequency: "MONTHLY", slabs: [{ upTo: 24999, amount: 0 }, { upTo: null, amount: 200, february: 300 }] },
    DL: { label: "Delhi (no professional tax)", frequency: "NONE", slabs: [] },
  },
  lwf: {
    MH: { label: "Maharashtra", employee: 25, employer: 75, months: [6, 12], minWage: 3000 },
    TN: { label: "Tamil Nadu", employee: 20, employer: 40, months: [12] },
    KA: { label: "Karnataka", employee: 50, employer: 100, months: [12] },
    DL: { label: "Delhi", employee: 0.75, employer: 2.25, months: [6, 12] },
  },
  tax: {
    NEW: {
      slabs: [
        { upTo: 400000, rate: 0 },
        { upTo: 800000, rate: 5 },
        { upTo: 1200000, rate: 10 },
        { upTo: 1600000, rate: 15 },
        { upTo: 2000000, rate: 20 },
        { upTo: 2400000, rate: 25 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 75000,
      rebateLimit: 1200000,
      rebateMax: 60000,
      marginalRelief: true,
      surcharge: [{ above: 5000000, rate: 10 }, { above: 10000000, rate: 15 }, { above: 20000000, rate: 25 }],
      cess: 4,
    },
    OLD: {
      slabs: [
        { upTo: 250000, rate: 0 },
        { upTo: 500000, rate: 5 },
        { upTo: 1000000, rate: 20 },
        { upTo: null, rate: 30 },
      ],
      standardDeduction: 50000,
      rebateLimit: 500000,
      rebateMax: 12500,
      marginalRelief: false,
      surcharge: [{ above: 5000000, rate: 10 }, { above: 10000000, rate: 15 }, { above: 20000000, rate: 25 }, { above: 50000000, rate: 37 }],
      cess: 4,
    },
    caps: { section80C: 150000, section80CCD1B: 50000, section80D: 100000, section24B: 200000, section80TTA: 10000, professionalTax: 2500 },
  },
  overtime: { multiplier: 2, basis: "GROSS", daysPerMonth: 26, hoursPerDay: 8 },
  gratuity: { cap: 2000000, minServiceDays: 4 * 365 + 240 },
};

export function ptFor(rule: PtRule | undefined, monthlyGross: number, month: number, gender: string | null | undefined) {
  if (!rule || rule.frequency === "NONE" || !rule.slabs.length) return 0;
  if (rule.frequency === "HALF_YEARLY" && !(rule.months || []).includes(month)) return 0;
  const base = rule.frequency === "HALF_YEARLY" ? monthlyGross * 6 : monthlyGross;
  const gendered = rule.slabs.filter((slab) => slab.gender && slab.gender === (gender === "FEMALE" ? "FEMALE" : "MALE"));
  const slabs = gendered.length ? gendered : rule.slabs.filter((slab) => !slab.gender);
  const slab = slabs.find((row) => row.upTo === null || base <= row.upTo);
  if (!slab) return 0;
  return month === 2 && slab.february !== undefined ? slab.february : slab.amount;
}

export function lwfFor(rule: LwfRule | undefined, monthlyGross: number, month: number) {
  if (!rule || !rule.months.includes(month) || (rule.minWage && monthlyGross < rule.minWage)) return { employee: 0, employer: 0 };
  return { employee: rule.employee, employer: rule.employer };
}

// ---------- Income tax ----------

function slabTax(income: number, slabs: TaxRegimeRules["slabs"]) {
  let tax = 0;
  let lower = 0;
  for (const slab of slabs) {
    const upper = slab.upTo ?? Infinity;
    if (income > lower) tax += ((Math.min(income, upper) - lower) * slab.rate) / 100;
    lower = upper;
  }
  return tax;
}

function taxWithSurcharge(income: number, rules: TaxRegimeRules): { tax: number; surcharge: number } {
  let tax = slabTax(income, rules.slabs);
  if (income <= rules.rebateLimit) tax = Math.max(0, tax - rules.rebateMax);
  else if (rules.marginalRelief) tax = Math.min(tax, income - rules.rebateLimit);
  const band = [...rules.surcharge].sort((a, b) => b.above - a.above).find((row) => income > row.above);
  if (!band) return { tax, surcharge: 0 };
  let surcharge = (tax * band.rate) / 100;
  const atThreshold = taxWithSurcharge(band.above, rules);
  const ceiling = atThreshold.tax + atThreshold.surcharge + (income - band.above);
  if (tax + surcharge > ceiling) surcharge = Math.max(0, ceiling - tax);
  return { tax, surcharge };
}

/** Tax on total income: slabs, 87A rebate (with new-regime marginal relief), surcharge with marginal relief, cess; rounded to ₹10 (s.288B). */
export function incomeTax(taxableIncome: number, rules: TaxRegimeRules) {
  const income = Math.max(0, Math.round(taxableIncome / 10) * 10);
  const { tax, surcharge } = taxWithSurcharge(income, rules);
  const cess = ((tax + surcharge) * rules.cess) / 100;
  return { income, tax: round2(tax), surcharge: round2(surcharge), cess: round2(cess), total: Math.round((tax + surcharge + cess) / 10) * 10 };
}

export type Declarations = {
  section80C?: number;
  section80CCD1B?: number;
  section80D?: number;
  section24B?: number;
  section80E?: number;
  section80G?: number;
  section80TTA?: number;
  otherDeductions?: number;
  rentPaidMonthly?: number;
  metro?: boolean;
  previousEmployerIncome?: number;
  previousEmployerTds?: number;
  previousEmployerPt?: number;
  otherIncome?: number;
};
type TaxBasis = { taxable: number; basic: number; hra: number; pt: number; pfEmployee: number };

export function projectTds(input: { regime: "OLD" | "NEW"; rules: StatutoryRules["tax"]; monthsRemaining: number; ytd: TaxBasis & { tds: number }; current: TaxBasis; recurring: TaxBasis; declarations?: Declarations; rentMonths?: number }) {
  const d = input.declarations || {};
  const future = Math.max(0, input.monthsRemaining - 1);
  const annual = (key: keyof TaxBasis) => input.ytd[key] + input.current[key] + input.recurring[key] * future;
  const regime = input.rules[input.regime];
  const caps = input.rules.caps;
  const salary = annual("taxable") + (d.previousEmployerIncome || 0);
  const gross = salary + (d.otherIncome || 0);
  const standard = Math.min(regime.standardDeduction, salary);
  let hraExemption = 0;
  let professionalTax = 0;
  let chapterVIA = 0;
  if (input.regime === "OLD") {
    const basic = annual("basic");
    const rent = (d.rentPaidMonthly || 0) * (input.rentMonths ?? 12);
    if (rent > 0) hraExemption = Math.max(0, Math.min(annual("hra"), rent - 0.1 * basic, (d.metro ? 0.5 : 0.4) * basic));
    professionalTax = Math.min(caps.professionalTax, annual("pt") + (d.previousEmployerPt || 0));
    chapterVIA =
      Math.min(caps.section80C, (d.section80C || 0) + annual("pfEmployee")) +
      Math.min(caps.section80CCD1B, d.section80CCD1B || 0) +
      Math.min(caps.section80D, d.section80D || 0) +
      Math.min(caps.section24B, d.section24B || 0) +
      (d.section80E || 0) +
      (d.section80G || 0) +
      Math.min(caps.section80TTA, d.section80TTA || 0) +
      (d.otherDeductions || 0);
  }
  const taxableIncome = Math.max(0, gross - standard - hraExemption - professionalTax - chapterVIA);
  const tax = incomeTax(taxableIncome, regime);
  const paid = input.ytd.tds + (d.previousEmployerTds || 0);
  const monthly = Math.max(0, Math.round(Math.max(0, tax.total - paid) / Math.max(1, input.monthsRemaining)));
  return { regime: input.regime, gross: round2(gross), standard, hraExemption: round2(hraExemption), professionalTax: round2(professionalTax), chapterVIA: round2(chapterVIA), taxableIncome: tax.income, ...tax, paid: round2(paid), monthly };
}

// ---------- Structures ----------

export const COMPONENT_CALCS = ["FIXED", "PERCENT_CTC", "PERCENT_BASIC", "FORMULA", "BALANCE"] as const;
export type SalaryComponent = { code: string; name: string; kind: "EARNING" | "DEDUCTION"; calc: (typeof COMPONENT_CALCS)[number]; value: number; formula?: string; taxable: boolean; pfWage: boolean; esiWage: boolean; prorate: boolean };
export type StructureLine = { code: string; name: string; kind: "EARNING" | "DEDUCTION"; amount: number; taxable: boolean; pfWage: boolean; esiWage: boolean; prorate: boolean };

/**
 * Full-month amounts for a monthly CTC. When employer contributions sit inside CTC, the BALANCE component
 * (special allowance) absorbs what is left after employer PF and, for ESI-eligible pay, employer ESI.
 */
export function structureBreakdown(components: SalaryComponent[], monthlyCtc: number, options: { pf: boolean; esi: boolean; employerInCtc: boolean; rules: StatutoryRules; overrides?: Record<string, number> }) {
  const vars: Record<string, number> = { CTC: monthlyCtc };
  const lines: StructureLine[] = [];
  const balance = components.find((row) => row.kind === "EARNING" && row.calc === "BALANCE");
  for (const component of components) {
    if (component === balance) continue;
    const override = options.overrides?.[component.code];
    let amount: number;
    if (override !== undefined) amount = override;
    else if (component.calc === "FIXED") amount = component.value;
    else if (component.calc === "PERCENT_CTC") amount = (monthlyCtc * component.value) / 100;
    else if (component.calc === "PERCENT_BASIC") amount = ((vars.BASIC ?? 0) * component.value) / 100;
    else if (component.calc === "FORMULA") amount = evaluateFormula(component.formula || "0", vars);
    else amount = 0;
    amount = Math.max(0, Math.round(amount));
    vars[component.code] = amount;
    lines.push({ code: component.code, name: component.name, kind: component.kind, amount, taxable: component.taxable, pfWage: component.pfWage, esiWage: component.esiWage, prorate: component.prorate });
  }
  const pf = options.rules.pf;
  const pfWages = lines.filter((row) => row.kind === "EARNING" && row.pfWage).reduce((sum, row) => sum + row.amount, 0);
  const employerPf = options.pf ? Math.round(((pf.capWages ? Math.min(pfWages, pf.wageCeiling) : pfWages) * pf.employerRate) / 100) : 0;
  const fixedEarnings = lines.filter((row) => row.kind === "EARNING").reduce((sum, row) => sum + row.amount, 0);
  let gross = fixedEarnings;
  let employerEsi = 0;
  const warnings: string[] = [];
  if (balance) {
    const available = options.employerInCtc ? monthlyCtc - employerPf : monthlyCtc;
    gross = available;
    if (options.esi && options.employerInCtc) {
      const esiGross = Math.floor(available / (1 + options.rules.esi.employerRate / 100));
      if (esiGross <= options.rules.esi.wageCeiling) gross = esiGross;
    }
    const amount = Math.round(gross - fixedEarnings);
    if (amount < 0) warnings.push(`Components exceed the CTC by ${-amount}`);
    lines.push({ code: balance.code, name: balance.name, kind: "EARNING", amount: Math.max(0, amount), taxable: balance.taxable, pfWage: false, esiWage: balance.esiWage, prorate: balance.prorate });
    gross = fixedEarnings + Math.max(0, amount);
  }
  if (options.esi && gross <= options.rules.esi.wageCeiling) employerEsi = Math.ceil((gross * options.rules.esi.employerRate) / 100);
  const order = new Map(components.map((row, index) => [row.code, index]));
  lines.sort((a, b) => (order.get(a.code) ?? 0) - (order.get(b.code) ?? 0));
  return { lines, gross, employerPf, employerEsi, ctc: options.employerInCtc ? gross + employerPf + employerEsi : monthlyCtc, warnings };
}

// ---------- Payslip ----------

export type Adjustment = { code: string; name: string; kind: "EARNING" | "DEDUCTION"; amount: number; taxable?: boolean; pfWage?: boolean; esiWage?: boolean; ledger?: "ADVANCE" | null };

export type PayslipInput = {
  lines: StructureLine[];
  monthDays: number;
  paidDays: number;
  overtimeHours: number;
  adjustments: Adjustment[];
  reimbursements: number;
  month: number;
  rules: StatutoryRules;
  employee: { pf: boolean; esi: boolean; pt: boolean; state: string | null; gender: string | null; age: number | null; esiCovered: boolean };
  tax: { regime: "OLD" | "NEW"; monthsRemaining: number; ytd: TaxBasis & { tds: number }; declarations?: Declarations; override?: number | null };
};

export function computePayslip(input: PayslipInput) {
  const { rules } = input;
  const factor = input.monthDays ? Math.min(1, Math.max(0, input.paidDays / input.monthDays)) : 0;
  const warnings: string[] = [];
  const earnings: Array<{ code: string; name: string; rate: number; amount: number; taxable: boolean }> = [];
  const deductions: Array<{ code: string; name: string; amount: number; ledger?: string | null }> = [];
  let pfWages = 0;
  let esiWages = 0;
  let taxable = 0;
  let basic = 0;
  let hra = 0;
  let rateGross = 0;
  let rateBasic = 0;
  let rateHra = 0;
  let rateTaxable = 0;
  for (const line of input.lines) {
    const amount = input.paidDays <= 0 ? 0 : line.prorate ? round2(line.amount * factor) : line.amount;
    if (line.kind === "EARNING") {
      earnings.push({ code: line.code, name: line.name, rate: line.amount, amount, taxable: line.taxable });
      rateGross += line.amount;
      if (line.pfWage) pfWages += amount;
      if (line.esiWage) esiWages += amount;
      if (line.taxable) {
        taxable += amount;
        rateTaxable += line.amount;
      }
      if (line.code === "BASIC" || line.code === "DA") {
        basic += amount;
        rateBasic += line.amount;
      }
      if (line.code === "HRA") {
        hra += amount;
        rateHra += line.amount;
      }
    } else if (amount) deductions.push({ code: line.code, name: line.name, amount });
  }
  const otBase = rules.overtime.basis === "BASIC" ? rateBasic : rateGross;
  const overtime = input.overtimeHours > 0 ? Math.round((input.overtimeHours * otBase * rules.overtime.multiplier) / (rules.overtime.daysPerMonth * rules.overtime.hoursPerDay)) : 0;
  if (overtime) {
    earnings.push({ code: "OT", name: "Overtime", rate: 0, amount: overtime, taxable: true });
    esiWages += overtime;
    taxable += overtime;
  }
  for (const adjustment of input.adjustments) {
    if (!adjustment.amount) continue;
    if (adjustment.kind === "EARNING") {
      earnings.push({ code: adjustment.code, name: adjustment.name, rate: 0, amount: round2(adjustment.amount), taxable: adjustment.taxable !== false });
      if (adjustment.taxable !== false) taxable += adjustment.amount;
      if (adjustment.pfWage) pfWages += adjustment.amount;
      if (adjustment.esiWage) esiWages += adjustment.amount;
    } else deductions.push({ code: adjustment.code, name: adjustment.name, amount: round2(adjustment.amount), ledger: adjustment.ledger || null });
  }
  const gross = round2(earnings.reduce((sum, row) => sum + row.amount, 0));

  const pf = rules.pf;
  const pfBase = Math.round(pf.capWages ? Math.min(pfWages, pf.wageCeiling) : pfWages);
  const ceilingWages = Math.round(Math.min(pfWages, pf.wageCeiling));
  const epsEligible = input.employee.age === null || input.employee.age < pf.epsAgeLimit;
  const pfEmployee = input.employee.pf ? Math.round((pfBase * pf.employeeRate) / 100) : 0;
  const pfEmployerTotal = input.employee.pf ? Math.round((pfBase * pf.employerRate) / 100) : 0;
  const eps = input.employee.pf && epsEligible ? Math.round((ceilingWages * pf.epsRate) / 100) : 0;
  const pfEmployer = pfEmployerTotal - eps;
  const pfAdmin = input.employee.pf ? Math.round((pfBase * pf.adminRate) / 100) : 0;
  const edli = input.employee.pf ? Math.round((ceilingWages * pf.edliRate) / 100) : 0;

  const esiApplies = input.employee.esi && (rateGross <= rules.esi.wageCeiling || input.employee.esiCovered);
  const esiEmployee = esiApplies ? Math.ceil((esiWages * rules.esi.employeeRate) / 100) : 0;
  const esiEmployer = esiApplies ? Math.ceil((esiWages * rules.esi.employerRate) / 100) : 0;

  const state = input.employee.state || "";
  const pt = input.employee.pt ? ptFor(rules.pt[state], gross, input.month, input.employee.gender) : 0;
  const lwf = lwfFor(rules.lwf[state], gross, input.month);

  const projection = projectTds({
    regime: input.tax.regime,
    rules: rules.tax,
    monthsRemaining: input.tax.monthsRemaining,
    ytd: input.tax.ytd,
    current: { taxable, basic, hra, pt, pfEmployee },
    recurring: { taxable: rateTaxable, basic: rateBasic, hra: rateHra, pt, pfEmployee: input.employee.pf ? Math.round(((pf.capWages ? Math.min(rateBasic, pf.wageCeiling) : rateBasic) * pf.employeeRate) / 100) : 0 },
    declarations: input.tax.declarations,
  });
  const tds = input.tax.override !== undefined && input.tax.override !== null ? Math.max(0, Math.round(input.tax.override)) : projection.monthly;

  if (pfEmployee) deductions.unshift({ code: "PF", name: "Provident fund", amount: pfEmployee });
  if (esiEmployee) deductions.push({ code: "ESI", name: "ESI", amount: esiEmployee });
  if (pt) deductions.push({ code: "PT", name: "Professional tax", amount: pt });
  if (lwf.employee) deductions.push({ code: "LWF", name: "Labour welfare fund", amount: lwf.employee });
  if (tds) deductions.push({ code: "TDS", name: "Income tax (TDS)", amount: tds });
  const totalDeductions = round2(deductions.reduce((sum, row) => sum + row.amount, 0));
  const net = round2(gross + input.reimbursements - totalDeductions);
  if (net < 0) warnings.push("Deductions exceed earnings");
  const employerCost = round2(pfEmployerTotal + pfAdmin + edli + esiEmployer + lwf.employer);
  return {
    earnings,
    deductions,
    gross,
    overtime,
    taxable: round2(taxable),
    totalDeductions,
    reimbursements: round2(input.reimbursements),
    net,
    pf: { wages: pfBase, epsWages: epsEligible && input.employee.pf ? ceilingWages : 0, edliWages: input.employee.pf ? ceilingWages : 0, employee: pfEmployee, employer: pfEmployer, eps, admin: pfAdmin, edli },
    esi: { wages: esiApplies ? round2(esiWages) : 0, employee: esiEmployee, employer: esiEmployer },
    pt,
    lwf,
    tds,
    projection,
    employerCost,
    taxBasis: { taxable: round2(taxable), basic: round2(basic), hra: round2(hra), pt, pfEmployee },
    warnings,
  };
}

// ---------- Full and final ----------

export function serviceDays(joining: Date, exit: Date) {
  return Math.max(0, Math.floor((exit.getTime() - joining.getTime()) / 86_400_000) + 1);
}

/** Payment of Gratuity Act: 15/26 of last basic + DA per completed year (part year over six months counts), from 4 years 240 days. */
export function gratuityAmount(monthlyBasicDa: number, joining: Date, exit: Date, rules: StatutoryRules["gratuity"] = DEFAULT_STATUTORY.gratuity) {
  const days = serviceDays(joining, exit);
  if (days < rules.minServiceDays) return { eligible: false, years: 0, amount: 0 };
  const months = (exit.getUTCFullYear() - joining.getUTCFullYear()) * 12 + (exit.getUTCMonth() - joining.getUTCMonth()) - (exit.getUTCDate() < joining.getUTCDate() ? 1 : 0);
  const years = Math.floor(months / 12) + (months % 12 >= 6 ? 1 : 0);
  return { eligible: true, years, amount: Math.min(rules.cap, Math.round((monthlyBasicDa * 15 * Math.max(years, 5)) / 26)) };
}
export const leaveEncashment = (days: number, monthlyBasicDa: number, divisor = 26) => round2((Math.max(0, days) * monthlyBasicDa) / divisor);
export const noticeRecovery = (shortDays: number, monthlyGross: number, divisor = 30) => round2((Math.max(0, shortDays) * monthlyGross) / divisor);

// ---------- Returns ----------

/** EPFO ECR 2.0 text: one member per line, 11 fields separated by #~#. */
export function ecrFile(rows: Array<{ uan: string; name: string; gross: number; epfWages: number; epsWages: number; edliWages: number; employee: number; eps: number; employer: number; ncpDays: number; refund?: number }>) {
  return rows
    .map((row) => [row.uan, row.name.replace(/#~#|[\r\n]/g, " ").toUpperCase(), Math.round(row.gross), Math.round(row.epfWages), Math.round(row.epsWages), Math.round(row.edliWages), Math.round(row.employee), Math.round(row.eps), Math.round(row.employer), Math.round(row.ncpDays), Math.round(row.refund || 0)].join("#~#"))
    .join("\n");
}

// ---------- Schemas ----------

const amount = z.coerce.number().min(0).max(1e9);
const periodText = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const fyText = z.string().regex(/^\d{4}-\d{2}$/, "Use 2026-27");
const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const salaryComponentSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,15}$/, "Codes are letters, digits and _"),
    name: z.string().trim().min(2).max(60),
    kind: z.enum(["EARNING", "DEDUCTION"]),
    calc: z.enum(COMPONENT_CALCS),
    value: z.coerce.number().min(0).max(1e9).default(0),
    formula: z.string().trim().max(300).optional(),
    taxable: z.boolean().default(true),
    pfWage: z.boolean().default(false),
    esiWage: z.boolean().default(true),
    prorate: z.boolean().default(true),
  })
  .refine((row) => row.calc !== "FORMULA" || Boolean(row.formula), "A formula component needs a formula");
export const salaryStructureSchema = z
  .object({ name: z.string().trim().min(2).max(80), description: z.string().trim().max(300).optional(), active: z.boolean().default(true), employerInCtc: z.boolean().default(true), components: z.array(salaryComponentSchema).min(1).max(40) })
  .superRefine((value, ctx) => {
    const codes = value.components.map((row) => row.code);
    if (new Set(codes).size !== codes.length) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Component codes must be unique" });
    if (!codes.includes("BASIC")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Every structure needs a BASIC component" });
    if (value.components.filter((row) => row.calc === "BALANCE").length > 1) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Only one component can take the balance" });
    if (codes.includes("CTC")) ctx.addIssue({ code: z.ZodIssueCode.custom, message: "CTC is reserved" });
  });
export const employeeSalarySchema = z.object({ structureId: z.string().min(1).max(64), annualCtc: z.coerce.number().min(0).max(1e10), effectiveFrom: dateText, overrides: z.record(z.string(), z.coerce.number().min(0).max(1e9)).optional(), notes: z.string().trim().max(300).optional() });
export const structurePreviewSchema = z.object({ structureId: z.string().max(64).optional(), components: z.array(salaryComponentSchema).optional(), employerInCtc: z.boolean().default(true), annualCtc: z.coerce.number().min(0).max(1e10), pf: z.boolean().default(true), esi: z.boolean().default(true), overrides: z.record(z.string(), z.coerce.number().min(0)).optional() });

export const payrollRunSchema = z.object({ period: periodText, includeReimbursements: z.boolean().default(true), includeOvertime: z.boolean().default(true), notes: z.string().trim().max(300).optional() });
export const adjustmentSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z][A-Z0-9_]{1,15}$/),
  name: z.string().trim().min(2).max(60),
  kind: z.enum(["EARNING", "DEDUCTION"]),
  amount,
  taxable: z.boolean().default(true),
  pfWage: z.boolean().default(false),
  esiWage: z.boolean().default(false),
  ledger: z.enum(["ADVANCE"]).nullable().optional(),
});
export const payslipUpdateSchema = z.object({ adjustments: z.array(adjustmentSchema).max(30).optional(), lopDays: z.coerce.number().min(0).max(31).optional(), overtimeHours: z.coerce.number().min(0).max(400).optional(), tdsOverride: z.coerce.number().min(0).max(1e9).nullable().optional() });
export const payoutSchema = z.object({ accountId: z.string().min(1).max(64), bankFormat: z.enum(["HDFC", "ICICI", "SBI", "AXIS", "GENERIC"]).default("GENERIC"), valueDate: dateText });
export const markPaidSchema = z.object({ accountId: z.string().min(1).max(64), paidOn: dateText, reference: z.string().trim().max(60).optional() });

const declared = z.coerce.number().min(0).max(1e8).optional();
export const declarationItemsSchema = z.object({
  section80C: declared,
  section80CCD1B: declared,
  section80D: declared,
  section24B: declared,
  section80E: declared,
  section80G: declared,
  section80TTA: declared,
  otherDeductions: declared,
  rentPaidMonthly: declared,
  metro: z.boolean().optional(),
  landlordPan: z.string().trim().toUpperCase().max(10).optional().or(z.literal("")),
  previousEmployerIncome: declared,
  previousEmployerTds: declared,
  previousEmployerPt: declared,
  otherIncome: declared,
});
export const declarationSchema = z.object({ fy: fyText, regime: z.enum(["OLD", "NEW"]), items: declarationItemsSchema, submit: z.boolean().default(false) });
export const declarationVerifySchema = z.object({ verified: declarationItemsSchema, note: z.string().trim().max(300).optional() });

const slabSchema = z.object({ upTo: z.number().nullable(), amount: z.number().min(0), february: z.number().min(0).optional(), gender: z.enum(["MALE", "FEMALE", "OTHER"]).optional() });
const regimeSchema = z.object({ slabs: z.array(z.object({ upTo: z.number().nullable(), rate: z.number().min(0).max(50) })).min(1), standardDeduction: z.number().min(0), rebateLimit: z.number().min(0), rebateMax: z.number().min(0), marginalRelief: z.boolean(), surcharge: z.array(z.object({ above: z.number().min(0), rate: z.number().min(0).max(50) })), cess: z.number().min(0).max(10) });
export const statutoryRulesSchema = z.object({
  pf: z.object({ employeeRate: z.number().min(0).max(20), employerRate: z.number().min(0).max(20), epsRate: z.number().min(0).max(20), wageCeiling: z.number().min(0), capWages: z.boolean(), adminRate: z.number().min(0).max(5), edliRate: z.number().min(0).max(5), epsAgeLimit: z.number().int().min(0).max(100) }),
  esi: z.object({ employeeRate: z.number().min(0).max(10), employerRate: z.number().min(0).max(10), wageCeiling: z.number().min(0) }),
  pt: z.record(z.string(), z.object({ label: z.string(), frequency: z.enum(["MONTHLY", "HALF_YEARLY", "NONE"]), months: z.array(z.number().int().min(1).max(12)).optional(), slabs: z.array(slabSchema) })),
  lwf: z.record(z.string(), z.object({ label: z.string(), employee: z.number().min(0), employer: z.number().min(0), months: z.array(z.number().int().min(1).max(12)), minWage: z.number().min(0).optional() })),
  tax: z.object({ NEW: regimeSchema, OLD: regimeSchema, caps: z.object({ section80C: z.number(), section80CCD1B: z.number(), section80D: z.number(), section24B: z.number(), section80TTA: z.number(), professionalTax: z.number() }) }),
  overtime: z.object({ multiplier: z.number().min(1).max(4), basis: z.enum(["GROSS", "BASIC"]), daysPerMonth: z.number().min(20).max(31), hoursPerDay: z.number().min(4).max(12) }),
  gratuity: z.object({ cap: z.number().min(0), minServiceDays: z.number().int().min(0) }),
});
export const payrollSettingsSchema = z.object({
  tan: z.string().trim().toUpperCase().regex(/^[A-Z]{4}\d{5}[A-Z]$/, "TAN is 4 letters, 5 digits, 1 letter").optional().or(z.literal("")),
  deductorName: z.string().trim().max(120).optional(),
  deductorPan: z.string().trim().toUpperCase().max(10).optional().or(z.literal("")),
  deductorAddress: z.string().trim().max(300).optional(),
  responsiblePerson: z.string().trim().max(80).optional(),
  responsibleDesignation: z.string().trim().max(80).optional(),
  pfEstablishmentCode: z.string().trim().max(30).optional(),
  esiEmployerCode: z.string().trim().max(30).optional(),
  payoutAccountId: z.string().max(64).optional().or(z.literal("")),
  bankFormat: z.enum(["HDFC", "ICICI", "SBI", "AXIS", "GENERIC"]).default("GENERIC"),
});
export const statutoryPaymentSchema = z.object({ kind: z.enum(["TDS", "PF", "ESI", "PT", "LWF"]), period: periodText, amount: z.coerce.number().positive().max(1e10), paidOn: dateText, accountId: z.string().min(1).max(64), reference: z.string().trim().max(40).optional(), bsrCode: z.string().trim().max(7).optional(), challanSerial: z.string().trim().max(10).optional(), state: z.string().trim().max(4).optional(), notes: z.string().trim().max(300).optional() });
export const fnfSchema = z.object({ leaveDays: z.coerce.number().min(0).max(400).optional(), noticeShortDays: z.coerce.number().min(0).max(180).default(0), waiveNotice: z.boolean().default(false), bonus: z.coerce.number().min(0).max(1e9).default(0), otherDeductions: z.coerce.number().min(0).max(1e9).default(0), notes: z.string().trim().max(300).optional() });
