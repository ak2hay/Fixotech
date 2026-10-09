import { describe, expect, it } from "vitest";
import { DEFAULT_STATUTORY, type SalaryComponent, computePayslip, ecrFile, evaluateFormula, fyOf, fyRange, gratuityAmount, incomeTax, lwfFor, monthsRemainingInFy, projectTds, ptFor, quarterOf, structureBreakdown } from "./payroll";

const STRUCTURE: SalaryComponent[] = [
  { code: "BASIC", name: "Basic", kind: "EARNING", calc: "PERCENT_CTC", value: 50, taxable: true, pfWage: true, esiWage: true, prorate: true },
  { code: "HRA", name: "HRA", kind: "EARNING", calc: "PERCENT_BASIC", value: 40, taxable: true, pfWage: false, esiWage: true, prorate: true },
  { code: "CONV", name: "Conveyance", kind: "EARNING", calc: "FORMULA", value: 0, formula: "MIN(1600, BASIC*0.1)", taxable: true, pfWage: false, esiWage: true, prorate: true },
  { code: "SPECIAL", name: "Special allowance", kind: "EARNING", calc: "BALANCE", value: 0, taxable: true, pfWage: false, esiWage: true, prorate: true },
];
const zeroYtd = { taxable: 0, basic: 0, hra: 0, pt: 0, pfEmployee: 0, tds: 0 };

describe("periods", () => {
  it("maps months to financial years and quarters", () => {
    expect(fyOf("2026-10")).toBe("2026-27");
    expect(fyOf("2027-03")).toBe("2026-27");
    expect(fyRange("2026-27").periods[0]).toBe("2026-04");
    expect(fyRange("2026-27").periods[11]).toBe("2027-03");
    expect(monthsRemainingInFy(4)).toBe(12);
    expect(monthsRemainingInFy(10)).toBe(6);
    expect(monthsRemainingInFy(3)).toBe(1);
    expect(quarterOf(1)).toBe(4);
    expect(quarterOf(10)).toBe(3);
  });
});

describe("formulas", () => {
  it("evaluates arithmetic, functions and comparisons safely", () => {
    expect(evaluateFormula("MIN(1600, BASIC*0.1)", { BASIC: 30000 })).toBe(1600);
    expect(evaluateFormula("round(basic / 3, 2)", { BASIC: 100 })).toBe(33.33);
    expect(evaluateFormula("IF(CTC > 50000, 2000, 0)", { CTC: 60000 })).toBe(2000);
    expect(() => evaluateFormula("process.exit()", {})).toThrow();
    expect(() => evaluateFormula("UNKNOWN * 2", {})).toThrow(/Unknown component/);
  });
});

describe("income tax", () => {
  it("applies the new-regime rebate with marginal relief", () => {
    expect(incomeTax(1200000, DEFAULT_STATUTORY.tax.NEW).total).toBe(0);
    expect(incomeTax(1210000, DEFAULT_STATUTORY.tax.NEW).total).toBe(10400);
    expect(incomeTax(1600000, DEFAULT_STATUTORY.tax.NEW).total).toBe(124800);
  });

  it("computes old-regime slabs with the 87A rebate", () => {
    expect(incomeTax(500000, DEFAULT_STATUTORY.tax.OLD).total).toBe(0);
    expect(incomeTax(1000000, DEFAULT_STATUTORY.tax.OLD).total).toBe(117000);
  });

  it("projects monthly TDS from year-to-date and future salary", () => {
    const projection = projectTds({ regime: "NEW", rules: DEFAULT_STATUTORY.tax, monthsRemaining: 12, ytd: zeroYtd, current: { taxable: 150000, basic: 75000, hra: 30000, pt: 200, pfEmployee: 1800 }, recurring: { taxable: 150000, basic: 75000, hra: 30000, pt: 200, pfEmployee: 1800 } });
    expect(projection.gross).toBe(1800000);
    expect(projection.taxableIncome).toBe(1725000);
    expect(projection.total).toBe(150800);
    expect(projection.monthly).toBe(Math.round(projection.total / 12));
    const old = projectTds({ regime: "OLD", rules: DEFAULT_STATUTORY.tax, monthsRemaining: 12, ytd: zeroYtd, current: { taxable: 100000, basic: 50000, hra: 20000, pt: 200, pfEmployee: 1800 }, recurring: { taxable: 100000, basic: 50000, hra: 20000, pt: 200, pfEmployee: 1800 }, declarations: { section80C: 150000, rentPaidMonthly: 25000, metro: true } });
    expect(old.hraExemption).toBe(240000);
    expect(old.chapterVIA).toBe(150000);
    expect(old.professionalTax).toBe(2400);
  });
});

describe("structure", () => {
  it("splits CTC with employer PF inside and a balancing special allowance", () => {
    const result = structureBreakdown(STRUCTURE, 50000, { pf: true, esi: true, employerInCtc: true, rules: DEFAULT_STATUTORY });
    const amount = (code: string) => result.lines.find((line) => line.code === code)!.amount;
    expect(amount("BASIC")).toBe(25000);
    expect(amount("HRA")).toBe(10000);
    expect(amount("CONV")).toBe(1600);
    expect(result.employerPf).toBe(1800);
    expect(result.employerEsi).toBe(0);
    expect(amount("SPECIAL")).toBe(50000 - 1800 - 25000 - 10000 - 1600);
    expect(result.ctc).toBe(50000);
  });

  it("leaves room for employer ESI on low wages", () => {
    const result = structureBreakdown(STRUCTURE, 18000, { pf: true, esi: true, employerInCtc: true, rules: DEFAULT_STATUTORY });
    expect(result.employerEsi).toBeGreaterThan(0);
    expect(result.gross + result.employerPf + result.employerEsi).toBeLessThanOrEqual(18000 + 1);
  });
});

describe("state levies", () => {
  it("reads PT slabs by state, gender and month", () => {
    expect(ptFor(DEFAULT_STATUTORY.pt.MH, 9000, 5, "MALE")).toBe(175);
    expect(ptFor(DEFAULT_STATUTORY.pt.MH, 30000, 2, "MALE")).toBe(300);
    expect(ptFor(DEFAULT_STATUTORY.pt.MH, 20000, 5, "FEMALE")).toBe(0);
    expect(ptFor(DEFAULT_STATUTORY.pt.TN, 12000, 9, "MALE")).toBe(1025);
    expect(ptFor(DEFAULT_STATUTORY.pt.TN, 13000, 3, "MALE")).toBe(1250);
    expect(ptFor(DEFAULT_STATUTORY.pt.TN, 12000, 10, "MALE")).toBe(0);
    expect(ptFor(DEFAULT_STATUTORY.pt.DL, 90000, 5, "MALE")).toBe(0);
    expect(lwfFor(DEFAULT_STATUTORY.lwf.MH, 30000, 6)).toEqual({ employee: 25, employer: 75 });
    expect(lwfFor(DEFAULT_STATUTORY.lwf.MH, 30000, 7)).toEqual({ employee: 0, employer: 0 });
  });
});

describe("payslip", () => {
  const base = structureBreakdown(STRUCTURE, 20000, { pf: true, esi: true, employerInCtc: true, rules: DEFAULT_STATUTORY });

  it("prorates for loss of pay and computes PF, ESI, PT and overtime", () => {
    const slip = computePayslip({
      lines: base.lines,
      monthDays: 30,
      paidDays: 27,
      overtimeHours: 4,
      adjustments: [{ code: "ADV", name: "Advance recovery", kind: "DEDUCTION", amount: 1000, ledger: "ADVANCE" }],
      reimbursements: 500,
      month: 10,
      rules: DEFAULT_STATUTORY,
      employee: { pf: true, esi: true, pt: true, state: "MH", gender: "MALE", age: 30, esiCovered: false },
      tax: { regime: "NEW", monthsRemaining: 6, ytd: zeroYtd },
    });
    const basic = slip.earnings.find((row) => row.code === "BASIC")!;
    expect(basic.amount).toBe(9000);
    expect(slip.overtime).toBe(Math.round((4 * base.gross * 2) / (26 * 8)));
    expect(slip.pf.wages).toBe(9000);
    expect(slip.pf.employee).toBe(1080);
    expect(slip.pf.eps).toBe(750);
    expect(slip.pf.employer).toBe(1080 - 750);
    expect(slip.esi.employee).toBe(Math.ceil(slip.esi.wages * 0.0075));
    expect(slip.pt).toBe(200);
    expect(slip.tds).toBe(0);
    expect(slip.net).toBe(Math.round((slip.gross + 500 - slip.totalDeductions) * 100) / 100);
  });

  it("stops EPS at 58 and caps PF wages", () => {
    const rich = structureBreakdown(STRUCTURE, 150000, { pf: true, esi: false, employerInCtc: true, rules: DEFAULT_STATUTORY });
    const slip = computePayslip({ lines: rich.lines, monthDays: 31, paidDays: 31, overtimeHours: 0, adjustments: [], reimbursements: 0, month: 4, rules: DEFAULT_STATUTORY, employee: { pf: true, esi: false, pt: false, state: null, gender: null, age: 59, esiCovered: false }, tax: { regime: "NEW", monthsRemaining: 12, ytd: zeroYtd } });
    expect(slip.pf.wages).toBe(15000);
    expect(slip.pf.eps).toBe(0);
    expect(slip.pf.employer).toBe(1800);
    expect(slip.esi.employee).toBe(0);
    expect(slip.tds).toBeGreaterThan(0);
  });
});

describe("full and final", () => {
  it("pays gratuity from 4 years 240 days, capped", () => {
    expect(gratuityAmount(26000, new Date("2020-01-01"), new Date("2024-06-30")).eligible).toBe(false);
    const due = gratuityAmount(26000, new Date("2018-01-01"), new Date("2026-08-15"));
    expect(due.years).toBe(9);
    expect(due.amount).toBe(15000 * 9);
  });
});

describe("ECR", () => {
  it("writes #~# separated member lines", () => {
    expect(ecrFile([{ uan: "100123456789", name: "Ravi Kumar", gross: 20000.4, epfWages: 15000, epsWages: 15000, edliWages: 15000, employee: 1800, eps: 1250, employer: 550, ncpDays: 2 }])).toBe("100123456789#~#RAVI KUMAR#~#20000#~#15000#~#15000#~#15000#~#1800#~#1250#~#550#~#2#~#0");
  });
});
