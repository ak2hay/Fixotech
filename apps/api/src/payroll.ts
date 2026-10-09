import { BadRequestException, Body, ConflictException, Controller, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Put, Query, Req, Res } from "@nestjs/common";
import type { Response } from "express";
import { PDFDocument, StandardFonts, type PDFFont, type PDFPage } from "pdf-lib";
import {
  type Adjustment,
  DEFAULT_STATUTORY,
  type Declarations,
  type StatutoryRules,
  ageOn,
  computePayslip,
  dayKey,
  declarationSchema,
  declarationVerifySchema,
  ecrFile,
  employeeSalarySchema,
  fnfSchema,
  fyOf,
  fyRange,
  gratuityAmount,
  leaveEncashment,
  localDay,
  markPaidSchema,
  monthsRemainingInFy,
  noticeRecovery,
  num,
  payoutSchema,
  payrollRunSchema,
  payrollSettingsSchema,
  payslipUpdateSchema,
  periodRange,
  quarterOf,
  round2,
  salaryComponentSchema,
  salaryStructureSchema,
  statutoryPaymentSchema,
  statutoryRulesSchema,
  structureBreakdown,
  structurePreviewSchema,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { z } from "zod";
import { BankingService } from "./banking";
import { unsealPii } from "./crypto";
import { AuthUser, RequirePermissions, assertStaff, can, parseBody } from "./http";
import { LedgerService, type PostLine } from "./ledger";
import { PeopleService } from "./people";
import { PrismaService } from "./prisma.service";
import { AuditService, NumberService, Tx, WorkflowService, contentDisposition } from "./services";

type ReqUser = { user: AuthUser; ip?: string };
type Db = PrismaService | Tx;
type PayrollSettings = z.infer<typeof payrollSettingsSchema>;
type SalaryRow = Prisma.EmployeeSalaryGetPayload<{ include: { structure: true } }>;
type Projection = { reimbursementIds?: string[]; overrides?: { lopDays?: number; overtimeHours?: number }; [key: string]: unknown };

const IN_SERVICE = ["ONBOARDING", "ACTIVE", "NOTICE"];
const OT_ELIGIBLE = ["WORKER", "CONTRACT"];
const PAYABLE_KEYS: Record<string, string> = { TDS: "TDS_SALARY_PAYABLE", PF: "PF_PAYABLE", ESI: "ESI_PAYABLE", PT: "PT_PAYABLE", LWF: "LWF_PAYABLE" };
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const asDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);
const componentsSchema = z.array(salaryComponentSchema);
const fyQuery = z.object({ fy: z.string().regex(/^\d{4}-\d{2}$/).optional() });
const quarterQuery = z.object({ fy: z.string().regex(/^\d{4}-\d{2}$/), quarter: z.coerce.number().int().min(1).max(4) });
const rangeQuery = z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const currentFy = () => fyOf(localDay(new Date()).slice(0, 7));
const monthLabel = (period: string) => `${MONTHS[Number(period.slice(5, 7)) - 1]} ${period.slice(0, 4)}`;
const rs = (value: unknown) => `Rs. ${num(value).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function toCsv(rows: unknown[][]) {
  return rows.map((row) => row.map((cell) => { const text = cell === null || cell === undefined ? "" : String(cell); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }).join(",")).join("\r\n");
}

function sendText(res: Response, body: string, fileName: string, type = "text/csv; charset=utf-8") {
  res.setHeader("Content-Type", type);
  res.setHeader("Content-Disposition", contentDisposition(fileName));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(body);
}

function sendPdf(res: Response, bytes: Uint8Array, fileName: string) {
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", contentDisposition(fileName));
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(Buffer.from(bytes));
}

const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];
/** Indian numbering (lakh, crore), as printed on payslips. */
export function inWords(value: number): string {
  const n = Math.floor(Math.abs(value));
  if (!n) return "Zero";
  const two = (x: number) => (x < 20 ? ONES[x] : `${TENS[Math.floor(x / 10)]}${x % 10 ? ` ${ONES[x % 10]}` : ""}`);
  const three = (x: number) => (x >= 100 ? `${ONES[Math.floor(x / 100)]} Hundred${x % 100 ? ` ${two(x % 100)}` : ""}` : two(x));
  const parts: string[] = [];
  const crore = Math.floor(n / 1e7);
  const lakh = Math.floor((n % 1e7) / 1e5);
  const thousand = Math.floor((n % 1e5) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${inWords(crore)} Crore`);
  if (lakh) parts.push(`${two(lakh)} Lakh`);
  if (thousand) parts.push(`${two(thousand)} Thousand`);
  if (rest) parts.push(three(rest));
  return parts.join(" ");
}

type PdfSection = { heading?: string; rows: Array<[string, string]> };

/** Simple paginated two-column statement (payslips, Form 16 Part B). Helvetica only encodes WinAnsi, so text is reduced to ASCII. */
async function statementPdf(title: string, subtitle: string[], sections: PdfSection[], footer?: string) {
  const pdf = await PDFDocument.create();
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const safe = (text: string) => text.replace(/₹/g, "Rs.").replace(/[^\x20-\x7E]/g, " ");
  let page: PDFPage = pdf.addPage([595, 842]);
  let y = 790;
  const ensure = (height: number) => {
    if (y - height < 60) {
      page = pdf.addPage([595, 842]);
      y = 790;
    }
  };
  const text = (value: string, x: number, size: number, face: PDFFont, rightAlign = false) => {
    const clean = safe(value).slice(0, 110);
    page.drawText(clean, { x: rightAlign ? x - face.widthOfTextAtSize(clean, size) : x, y, size, font: face });
  };
  text(title, 48, 15, bold);
  y -= 20;
  for (const line of subtitle) {
    text(line, 48, 9.5, font);
    y -= 13;
  }
  y -= 6;
  for (const section of sections) {
    ensure(40);
    if (section.heading) {
      y -= 6;
      page.drawLine({ start: { x: 48, y: y + 12 }, end: { x: 547, y: y + 12 }, thickness: 0.5 });
      text(section.heading, 48, 11, bold);
      y -= 16;
    }
    for (const [label, value] of section.rows) {
      ensure(14);
      const strong = label.startsWith("*");
      text(strong ? label.slice(1) : label, 56, 9.5, strong ? bold : font);
      text(value, 547, 9.5, strong ? bold : font, true);
      y -= 13;
    }
  }
  if (footer) {
    ensure(30);
    y -= 14;
    text(footer, 48, 8, font);
  }
  return pdf.save();
}

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly people: PeopleService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly numbers: NumberService,
  ) {}

  async settings(db: Db = this.prisma): Promise<Partial<PayrollSettings>> {
    const row = await db.businessSetting.findUnique({ where: { key: "payroll" } });
    return (row?.value as Partial<PayrollSettings> | null) || {};
  }

  async rules(fy: string, db: Db = this.prisma): Promise<StatutoryRules> {
    const row = await db.statutoryConfig.findUnique({ where: { fy } });
    const parsed = row ? statutoryRulesSchema.safeParse(row.rules) : null;
    return parsed?.success ? (parsed.data as StatutoryRules) : DEFAULT_STATUTORY;
  }

  async salaryOn(employeeIds: string[], on: Date, db: Db = this.prisma) {
    const rows = await db.employeeSalary.findMany({ where: { employeeId: { in: employeeIds }, effectiveFrom: { lte: on } }, include: { structure: true }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }] });
    const latest = new Map<string, SalaryRow>();
    for (const row of rows) if (!latest.has(row.employeeId)) latest.set(row.employeeId, row);
    return latest;
  }

  breakdown(salary: SalaryRow, employee: { pfApplicable: boolean; esiApplicable: boolean }, rules: StatutoryRules) {
    const components = componentsSchema.parse(salary.structure.components);
    return structureBreakdown(components, round2(num(salary.annualCtc) / 12), { pf: employee.pfApplicable, esi: employee.esiApplicable, employerInCtc: salary.structure.employerInCtc, rules, overrides: (salary.overrides as Record<string, number> | null) || undefined });
  }

  /** (Re)computes every payslip of a draft run from salary, attendance, leave, overtime, expenses, YTD tax and declarations. */
  async computeRun(runId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId }, include: { payslips: true } });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status !== "DRAFT") throw new BadRequestException("Only a draft run can be recomputed");
    const options = (run.options as { includeReimbursements?: boolean; includeOvertime?: boolean } | null) || {};
    const { year, month, days, from, to } = periodRange(run.period);
    const fy = fyOf(run.period);
    const rules = await this.rules(fy);
    const existing = new Map(run.payslips.map((row) => [row.employeeId, row]));
    const employees = await this.prisma.employee.findMany({
      where:
        run.kind === "FNF"
          ? { id: { in: run.payslips.map((row) => row.employeeId) } }
          : {
              AND: [
                { OR: [{ joiningDate: null }, { joiningDate: { lte: asDate(to) } }] },
                { OR: [{ status: { in: IN_SERVICE } }, { lastWorkingDay: { gte: asDate(from) } }] },
                { payslips: { none: { period: run.period, run: { kind: "FNF", status: { not: "CANCELLED" } } } } },
              ],
            },
      include: { branch: { select: { state: true } } },
    });
    const ids = employees.map((row) => row.id);
    const salaries = await this.salaryOn(ids, asDate(to));
    const today = localDay(new Date());
    if (from <= today) await this.people.rebuild(ids, from, to < today ? to : today);
    const fyStart = fyRange(fy).periods[0];
    const contributionStart = month >= 4 && month <= 9 ? `${year}-04` : month >= 10 ? `${year}-10` : `${year - 1}-10`;
    const [attendance, leaves, policies, expenses, ytd, covered, declarations] = await Promise.all([
      this.prisma.attendance.findMany({ where: { employeeId: { in: ids }, day: { gte: asDate(from), lte: asDate(to) } } }),
      this.prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", fromDate: { lte: asDate(to) }, toDate: { gte: asDate(from) } } }),
      this.people.policies(),
      options.includeReimbursements === false ? Promise.resolve([]) : this.prisma.expense.findMany({ where: { employeeId: { in: ids }, status: "FINANCE", payslipId: null } }),
      this.prisma.payslip.groupBy({
        by: ["employeeId"],
        where: { employeeId: { in: ids }, period: { gte: fyStart, lte: run.period }, runId: { not: run.id }, status: { in: ["APPROVED", "PAID"] } },
        _sum: { taxable: true, basicEarned: true, hraEarned: true, pt: true, pfEmployee: true, tds: true },
      }),
      this.prisma.payslip.findMany({ where: { employeeId: { in: ids }, period: { gte: contributionStart, lt: run.period }, esiEmployee: { gt: 0 }, status: { in: ["APPROVED", "PAID"] } }, select: { employeeId: true }, distinct: ["employeeId"] }),
      this.prisma.taxDeclaration.findMany({ where: { employeeId: { in: ids }, fy } }),
    ]);
    const warningsAll: string[] = [];
    let computed = 0;
    for (const employee of employees) {
      const salary = salaries.get(employee.id);
      const prior = existing.get(employee.id);
      if (!salary) {
        warningsAll.push(`${employee.name} (${employee.code}) has no salary assigned on ${to}`);
        if (prior && run.kind !== "FNF") await this.prisma.payslip.delete({ where: { id: prior.id } });
        continue;
      }
      const bd = this.breakdown(salary, employee, rules);
      const warnings = [...bd.warnings];
      const start = employee.joiningDate && dayKey(employee.joiningDate) > from ? dayKey(employee.joiningDate) : from;
      const end = employee.lastWorkingDay && dayKey(employee.lastWorkingDay) < to ? dayKey(employee.lastWorkingDay) : to;
      const windowDays = start > end ? 0 : Math.round((asDate(end).getTime() - asDate(start).getTime()) / 86_400_000) + 1;
      const rows = attendance.filter((row) => row.employeeId === employee.id && dayKey(row.day) >= start && dayKey(row.day) <= end);
      const policy = this.people.policyFor(employee, policies);
      const paidType = (code: string) => policy?.types.find((type) => type.code === code)?.paid ?? true;
      let lop = 0;
      let missPunch = 0;
      for (const row of rows) {
        const day = dayKey(row.day);
        const leave = leaves.find((item) => item.employeeId === employee.id && dayKey(item.fromDate) <= day && dayKey(item.toDate) >= day);
        if (row.status === "ABSENT") lop += 1;
        else if (row.status === "HALF_DAY") lop += leave?.halfDay && paidType(leave.type) ? 0 : 0.5;
        else if (row.status === "LEAVE" && leave && !paidType(leave.type)) lop += leave.halfDay ? 0.5 : 1;
        else if (row.status === "MISS_PUNCH") missPunch++;
      }
      if (missPunch) warnings.push(`${missPunch} missed punch(es) not regularized; paid`);
      if (!rows.length && windowDays) warnings.push("No attendance recorded; paid for the full period");
      const projectionPrior = (prior?.projection as Projection | null) || {};
      const overrides = projectionPrior.overrides || {};
      if (overrides.lopDays !== undefined) lop = overrides.lopDays;
      const paidDays = Math.max(0, windowDays - lop);
      const overtimeMinutes = rows.reduce((sum, row) => sum + row.overtimeMinutes, 0);
      const overtimeHours = overrides.overtimeHours ?? (options.includeOvertime !== false && OT_ELIGIBLE.includes(employee.employmentType) ? round2(overtimeMinutes / 60) : 0);
      const claims = expenses.filter((row) => row.employeeId === employee.id);
      const reimbursements = round2(claims.reduce((sum, row) => sum + num(row.amount), 0));
      const adjustments = ((prior?.adjustments as Adjustment[] | null) || []).filter(Boolean);
      const sums = ytd.find((row) => row.employeeId === employee.id)?._sum;
      const declaration = declarations.find((row) => row.employeeId === employee.id);
      const declared = ((declaration?.status === "VERIFIED" ? declaration.verified : declaration?.items) as Declarations | null) || undefined;
      const regime = (declaration?.regime || employee.taxRegime) === "OLD" ? "OLD" : "NEW";
      const slip = computePayslip({
        lines: bd.lines,
        monthDays: days,
        paidDays,
        overtimeHours,
        adjustments,
        reimbursements,
        month,
        rules,
        employee: { pf: employee.pfApplicable, esi: employee.esiApplicable, pt: employee.ptApplicable, state: employee.branch?.state || null, gender: employee.gender, age: ageOn(employee.dob, asDate(to)), esiCovered: covered.some((row) => row.employeeId === employee.id) },
        tax: {
          regime,
          monthsRemaining: monthsRemainingInFy(month),
          ytd: { taxable: num(sums?.taxable), basic: num(sums?.basicEarned), hra: num(sums?.hraEarned), pt: num(sums?.pt), pfEmployee: num(sums?.pfEmployee), tds: num(sums?.tds) },
          declarations: declared,
          override: prior?.tdsOverride === null || prior?.tdsOverride === undefined ? null : num(prior.tdsOverride),
        },
      });
      warnings.push(...slip.warnings);
      if (employee.pfApplicable && !employee.uan && slip.pf.employee) warnings.push("UAN missing (needed for the PF ECR)");
      if (!employee.bankAccountEnc || !employee.ifsc) warnings.push("Bank account or IFSC missing");
      const data = {
        period: run.period,
        status: "DRAFT",
        structureId: salary.structureId,
        monthlyCtc: round2(num(salary.annualCtc) / 12),
        monthDays: days,
        paidDays,
        lopDays: lop,
        overtimeHours,
        gross: slip.gross,
        taxable: slip.taxable,
        totalDeductions: slip.totalDeductions,
        reimbursements: slip.reimbursements,
        net: slip.net,
        employerCost: slip.employerCost,
        pfWages: slip.pf.wages,
        epsWages: slip.pf.epsWages,
        edliWages: slip.pf.edliWages,
        pfEmployee: slip.pf.employee,
        pfEmployer: slip.pf.employer,
        eps: slip.pf.eps,
        pfAdmin: slip.pf.admin,
        edli: slip.pf.edli,
        esiWages: slip.esi.wages,
        esiEmployee: slip.esi.employee,
        esiEmployer: slip.esi.employer,
        pt: slip.pt,
        lwfEmployee: slip.lwf.employee,
        lwfEmployer: slip.lwf.employer,
        tds: slip.tds,
        basicEarned: slip.taxBasis.basic,
        hraEarned: slip.taxBasis.hra,
        regime,
        state: employee.branch?.state || null,
        earnings: slip.earnings as Prisma.InputJsonValue,
        deductions: slip.deductions as Prisma.InputJsonValue,
        adjustments: adjustments as Prisma.InputJsonValue,
        projection: { ...slip.projection, reimbursementIds: claims.map((row) => row.id), overrides } as Prisma.InputJsonValue,
        warnings: warnings as Prisma.InputJsonValue,
      };
      await this.prisma.payslip.upsert({ where: { runId_employeeId: { runId: run.id, employeeId: employee.id } }, update: data, create: { ...data, runId: run.id, employeeId: employee.id } });
      computed++;
    }
    if (run.kind !== "FNF") await this.prisma.payslip.deleteMany({ where: { runId: run.id, employeeId: { notIn: ids } } });
    const totals = await this.totals(run.id);
    await this.prisma.payrollRun.update({ where: { id: run.id }, data: { totals: { ...totals, warnings: warningsAll } as Prisma.InputJsonValue } });
    return { computed, warnings: warningsAll };
  }

  async totals(runId: string, db: Db = this.prisma) {
    const sum = await db.payslip.aggregate({
      where: { runId },
      _count: { _all: true },
      _sum: { gross: true, totalDeductions: true, reimbursements: true, net: true, employerCost: true, pfEmployee: true, pfEmployer: true, eps: true, pfAdmin: true, edli: true, esiEmployee: true, esiEmployer: true, pt: true, lwfEmployee: true, lwfEmployer: true, tds: true },
    });
    const value = (key: keyof typeof sum._sum) => round2(num(sum._sum[key]));
    return {
      employees: sum._count._all,
      gross: value("gross"),
      deductions: value("totalDeductions"),
      reimbursements: value("reimbursements"),
      net: value("net"),
      employerCost: value("employerCost"),
      pf: round2(value("pfEmployee") + value("pfEmployer") + value("eps") + value("pfAdmin") + value("edli")),
      esi: round2(value("esiEmployee") + value("esiEmployer")),
      pt: value("pt"),
      lwf: round2(value("lwfEmployee") + value("lwfEmployer")),
      tds: value("tds"),
      cost: round2(value("gross") + value("employerCost")),
    };
  }

  /** Salary journal: gross and employer contributions to expense; statutory dues, recoveries and net pay (per employee) to liabilities. */
  private journalLines(payslips: Array<Prisma.PayslipGetPayload<{ include: { employee: { select: { id: true; name: true; branchId: true } } } }>>) {
    const lines = new Map<string, PostLine>();
    const add = (key: string, amount: number, side: "debit" | "credit", extra: { branchId?: string | null; partyType?: string | null; partyId?: string | null; description?: string } = {}) => {
      if (Math.abs(amount) < 0.005) return;
      const actual = amount < 0 ? (side === "debit" ? "credit" : "debit") : side;
      const id = `${key}|${actual}|${extra.branchId || ""}|${extra.partyId || ""}`;
      const line = lines.get(id) || { key, debit: 0, credit: 0, ...extra };
      line[actual] = round2((line[actual] || 0) + Math.abs(amount));
      lines.set(id, line);
    };
    for (const slip of payslips) {
      const branchId = slip.employee.branchId;
      const party = { partyType: "EMPLOYEE", partyId: slip.employeeId };
      add("SALARY_EXPENSE", num(slip.gross), "debit", { branchId });
      add("PF_EMPLOYER_EXPENSE", num(slip.pfEmployer) + num(slip.eps) + num(slip.pfAdmin) + num(slip.edli), "debit", { branchId });
      add("ESI_EMPLOYER_EXPENSE", num(slip.esiEmployer), "debit", { branchId });
      add("LWF_EMPLOYER_EXPENSE", num(slip.lwfEmployer), "debit", { branchId });
      add("PF_PAYABLE", num(slip.pfEmployee) + num(slip.pfEmployer) + num(slip.eps) + num(slip.pfAdmin) + num(slip.edli), "credit");
      add("ESI_PAYABLE", num(slip.esiEmployee) + num(slip.esiEmployer), "credit");
      add("PT_PAYABLE", num(slip.pt), "credit");
      add("LWF_PAYABLE", num(slip.lwfEmployee) + num(slip.lwfEmployer), "credit");
      add("TDS_SALARY_PAYABLE", num(slip.tds), "credit");
      const statutory = new Set(["PF", "ESI", "PT", "LWF", "TDS"]);
      for (const row of (slip.deductions as Array<{ code: string; amount: number; ledger?: string | null }>) || []) {
        if (statutory.has(row.code)) continue;
        if (row.ledger === "ADVANCE") add("EMPLOYEE_ADVANCE", row.amount, "credit", { ...party, description: `${row.code} ${slip.employee.name}` });
        else add("SALARY_EXPENSE", row.amount, "credit", { branchId, description: `Recovery ${row.code}` });
      }
      add("SALARY_PAYABLE", num(slip.gross) - num(slip.totalDeductions), "credit", { ...party, description: slip.employee.name });
    }
    return [...lines.values()];
  }

  async approve(runId: string, actor: AuthUser, ip?: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: runId }, include: { payslips: { select: { id: true, net: true } } } });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status !== "DRAFT") throw new BadRequestException(`A ${run.status.toLowerCase()} run cannot be approved`);
    if (run.createdById === actor.id && !can(actor, "payroll.override")) throw new ForbiddenException("Payroll needs a second person to approve (maker-checker)");
    if (!run.payslips.length) throw new BadRequestException("This run has no payslips");
    const before = new Map(run.payslips.map((row) => [row.id, num(row.net)]));
    await this.computeRun(runId);
    const after = await this.prisma.payslip.findMany({ where: { runId }, select: { id: true, net: true } });
    if (after.length !== before.size || after.some((row) => Math.abs(num(row.net) - (before.get(row.id) ?? NaN)) > 0.009 || Number.isNaN(before.get(row.id) ?? NaN))) {
      throw new ConflictException("Attendance, expenses or salaries changed since this run was computed. It has been recomputed; review it and approve again.");
    }
    const { from, to } = periodRange(run.period);
    return this.prisma.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "PayrollRun" WHERE "id" = ${runId} FOR UPDATE`;
        const fresh = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
        if (fresh.status !== "DRAFT") throw new ConflictException("Run was changed by someone else");
        const payslips = await tx.payslip.findMany({ where: { runId }, include: { employee: { select: { id: true, name: true, branchId: true } } } });
        for (const slip of payslips) {
          const ids = ((slip.projection as Projection | null)?.reimbursementIds || []).filter(Boolean);
          if (!ids.length) continue;
          const result = await tx.expense.updateMany({ where: { id: { in: ids }, status: "FINANCE", payslipId: null }, data: { status: "PAID", payslipId: slip.id } });
          if (result.count !== ids.length) throw new ConflictException(`Expense claims for ${slip.employee.name} changed; recompute the run`);
          for (const id of ids) {
            await this.workflow.record("expense", id, "FINANCE", "PAID", actor.id, `Reimbursed in payroll ${fresh.number}`, tx);
            await this.ledger.postExpense(tx, id);
          }
        }
        const lines = this.journalLines(payslips);
        const entry = lines.length
          ? await this.ledger.post(tx, { date: asDate(to), narration: `Payroll ${fresh.number} for ${monthLabel(fresh.period)}${fresh.kind === "FNF" ? " (full and final)" : ""}`, reference: fresh.number, sourceType: "payroll_run", sourceId: fresh.id, postingKey: `payroll:${fresh.id}`, createdById: actor.id, lines })
          : null;
        await tx.payslip.updateMany({ where: { runId }, data: { status: "APPROVED" } });
        await tx.attendance.updateMany({ where: { employeeId: { in: payslips.map((row) => row.employeeId) }, day: { gte: asDate(from), lte: asDate(to) } }, data: { locked: true } });
        const totals = await this.totals(runId, tx);
        const updated = await tx.payrollRun.update({ where: { id: runId }, data: { status: "APPROVED", approvedById: actor.id, approvedAt: new Date(), journalEntryId: entry?.id, totals: { ...((fresh.totals as object) || {}), ...totals } as Prisma.InputJsonValue } });
        await this.workflow.record("payroll_run", runId, "DRAFT", "APPROVED", actor.id, undefined, tx);
        await this.audit.log({ actorId: actor.id, action: "approve", entityType: "payroll_run", entityId: runId, before: { status: "DRAFT" }, after: { status: "APPROVED", ...totals }, ip }, tx);
        return updated;
      },
      { timeout: 120_000 },
    );
  }

  async createFnf(employeeId: string, input: z.infer<typeof fnfSchema>, actor: AuthUser) {
    const preview = await this.fnfPreview(employeeId);
    const open = await this.prisma.payslip.findFirst({ where: { employeeId, run: { kind: "FNF", status: { not: "CANCELLED" } } }, include: { run: true } });
    if (open) throw new ConflictException(`Full and final already exists in ${open.run.number}`);
    const adjustments: Adjustment[] = [];
    const leaveDays = input.leaveDays ?? preview.leaveDays;
    if (leaveDays > 0) adjustments.push({ code: "LEAVE_ENC", name: `Leave encashment (${leaveDays} days)`, kind: "EARNING", amount: leaveEncashment(leaveDays, preview.basicDa), taxable: false });
    if (preview.gratuity.amount) adjustments.push({ code: "GRATUITY", name: `Gratuity (${preview.gratuity.years} years)`, kind: "EARNING", amount: preview.gratuity.amount, taxable: false });
    if (input.bonus) adjustments.push({ code: "BONUS", name: "Bonus / ex-gratia", kind: "EARNING", amount: input.bonus, taxable: true });
    if (input.noticeShortDays && !input.waiveNotice) adjustments.push({ code: "NOTICE_REC", name: `Notice pay recovery (${input.noticeShortDays} days)`, kind: "DEDUCTION", amount: noticeRecovery(input.noticeShortDays, preview.monthlyGross) });
    if (input.otherDeductions) adjustments.push({ code: "OTHER_REC", name: "Other recoveries", kind: "DEDUCTION", amount: input.otherDeductions });
    const { from, to, days } = periodRange(preview.period);
    const run = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("PAYROLL", tx);
      const created = await tx.payrollRun.create({ data: { number, kind: "FNF", period: preview.period, fromDate: asDate(from), toDate: asDate(to), notes: input.notes, createdById: actor.id, options: { includeReimbursements: true, includeOvertime: true } } });
      await tx.payslip.create({ data: { runId: created.id, employeeId, period: preview.period, monthDays: days, paidDays: 0, earnings: [], deductions: [], adjustments: adjustments as Prisma.InputJsonValue } });
      await this.workflow.record("payroll_run", created.id, null, "DRAFT", actor.id, "Full and final", tx);
      await this.audit.log({ actorId: actor.id, action: "create_fnf", entityType: "payroll_run", entityId: created.id, after: { employeeId, adjustments: adjustments.map((row) => `${row.code} ${row.amount}`) } }, tx);
      return created;
    });
    await this.computeRun(run.id);
    return run;
  }

  async fnfPreview(employeeId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException("Employee not found");
    if (!["NOTICE", "EXITED"].includes(employee.status) || !employee.lastWorkingDay) throw new BadRequestException("Start the employee's exit (with a last working day) first");
    const lwd = employee.lastWorkingDay;
    const period = dayKey(lwd).slice(0, 7);
    const rules = await this.rules(fyOf(period));
    const salary = (await this.salaryOn([employeeId], lwd)).get(employeeId);
    if (!salary) throw new BadRequestException("No salary is assigned to this employee");
    const bd = this.breakdown(salary, employee, rules);
    const basicDa = bd.lines.filter((row) => row.code === "BASIC" || row.code === "DA").reduce((sum, row) => sum + row.amount, 0);
    const [summary] = await this.people.leaveSummary([employeeId], lwd.getUTCFullYear());
    const policy = this.people.policyFor(employee, await this.people.policies());
    const encashable = (summary?.types || []).filter((type) => policy?.types.find((rule) => rule.code === type.code)?.encashable);
    const leaveDays = round2(encashable.reduce((sum, type) => sum + Math.max(0, type.available), 0));
    const gratuity = employee.joiningDate ? gratuityAmount(basicDa, employee.joiningDate, lwd, rules.gratuity) : { eligible: false, years: 0, amount: 0 };
    const assets = await this.prisma.assetItem.count({ where: { assignedEmployeeId: employeeId } });
    const advances = await this.prisma.journalLine.aggregate({ where: { partyType: "EMPLOYEE", partyId: employeeId, account: { systemKey: "EMPLOYEE_ADVANCE" } }, _sum: { debit: true, credit: true } });
    return {
      employee: { id: employee.id, code: employee.code, name: employee.name, joiningDate: employee.joiningDate, lastWorkingDay: lwd, status: employee.status },
      period,
      monthlyGross: bd.gross,
      basicDa,
      leaveDays,
      leaveTypes: encashable.map((type) => ({ code: type.code, available: type.available })),
      leaveEncashment: leaveEncashment(leaveDays, basicDa),
      gratuity,
      openAdvance: round2(num(advances._sum.debit) - num(advances._sum.credit)),
      assetsNotReturned: assets,
    };
  }

  /** Hourly cost per employee-month: (gross + employer contributions) ÷ paid hours; falls back to CTC ÷ 26 days × 8 hours. */
  async labourCost(fromDate: string, toDate: string) {
    const start = new Date(`${fromDate}T00:00:00+05:30`);
    const end = new Date(new Date(`${toDate}T00:00:00+05:30`).getTime() + 86_400_000);
    const [logs, visits] = await Promise.all([
      this.prisma.jobTimeLog.findMany({ where: { startedAt: { gte: start, lt: end } }, include: { jobCard: { select: { productionOrderId: true, productionOrder: { select: { number: true, status: true, variant: { select: { name: true } } } } } } } }),
      this.prisma.siteVisit.findMany({ where: { checkInAt: { gte: start, lt: end }, checkOutAt: { not: null }, userId: { not: null } }, include: { project: { select: { id: true, code: true, name: true } } } }),
    ]);
    const users = [...new Set(visits.map((row) => row.userId!))];
    const employees = await this.prisma.employee.findMany({ where: { OR: [{ id: { in: [...new Set(logs.map((row) => row.employeeId))] } }, { userId: { in: users } }] }, include: { shift: { select: { fullDayHours: true } } } });
    const byUser = new Map(employees.filter((row) => row.userId).map((row) => [row.userId!, row.id]));
    const ids = employees.map((row) => row.id);
    const periods = [...new Set([...logs.map((row) => localDay(row.startedAt).slice(0, 7)), ...visits.map((row) => localDay(row.checkInAt).slice(0, 7))])];
    const [payslips, salaries] = await Promise.all([
      this.prisma.payslip.findMany({ where: { employeeId: { in: ids }, period: { in: periods }, status: { not: "CANCELLED" } }, select: { employeeId: true, period: true, gross: true, employerCost: true, paidDays: true } }),
      this.salaryOn(ids, asDate(toDate)),
    ]);
    const hoursPerDay = new Map(employees.map((row) => [row.id, num(row.shift?.fullDayHours) || 8]));
    const rate = (employeeId: string, at: Date) => {
      const slip = payslips.find((row) => row.employeeId === employeeId && row.period === localDay(at).slice(0, 7));
      if (slip && num(slip.paidDays) > 0) return (num(slip.gross) + num(slip.employerCost)) / (num(slip.paidDays) * (hoursPerDay.get(employeeId) || 8));
      const salary = salaries.get(employeeId);
      return salary ? num(salary.annualCtc) / 12 / (26 * (hoursPerDay.get(employeeId) || 8)) : 0;
    };
    const orders = new Map<string, { id: string; number: string; product: string; status: string; minutes: number; cost: number; people: Set<string> }>();
    for (const log of logs) {
      const minutes = log.minutes ?? Math.max(0, Math.round(((log.endedAt ?? new Date()).getTime() - log.startedAt.getTime()) / 60_000));
      const order = log.jobCard.productionOrder;
      const row = orders.get(log.jobCard.productionOrderId) || { id: log.jobCard.productionOrderId, number: order.number, product: order.variant?.name || "", status: order.status, minutes: 0, cost: 0, people: new Set<string>() };
      row.minutes += minutes;
      row.cost += (minutes / 60) * rate(log.employeeId, log.startedAt);
      row.people.add(log.employeeId);
      orders.set(row.id, row);
    }
    const projects = new Map<string, { id: string; code: string; name: string; minutes: number; cost: number; people: Set<string> }>();
    for (const visit of visits) {
      const employeeId = byUser.get(visit.userId!);
      if (!employeeId) continue;
      const minutes = Math.max(0, Math.round((visit.checkOutAt!.getTime() - visit.checkInAt.getTime()) / 60_000));
      const row = projects.get(visit.projectId) || { id: visit.project.id, code: visit.project.code, name: visit.project.name, minutes: 0, cost: 0, people: new Set<string>() };
      row.minutes += minutes;
      row.cost += (minutes / 60) * rate(employeeId, visit.checkInAt);
      row.people.add(employeeId);
      projects.set(row.id, row);
    }
    const shape = <T extends { minutes: number; cost: number; people: Set<string> }>(row: T) => ({ ...row, hours: round2(row.minutes / 60), cost: round2(row.cost), people: row.people.size });
    return {
      orders: [...orders.values()].map(shape).sort((a, b) => b.cost - a.cost),
      projects: [...projects.values()].map(shape).sort((a, b) => b.cost - a.cost),
    };
  }

  async payslipPdf(id: string) {
    const slip = await this.prisma.payslip.findUnique({ where: { id }, include: { run: true, employee: { include: { department: true, branch: true } } } });
    if (!slip) throw new NotFoundException("Payslip not found");
    const settings = await this.settings();
    const company = settings.deductorName || (await this.prisma.legalEntity.findFirst({ where: { active: true }, select: { name: true } }))?.name || "Fixotec";
    const earnings = (slip.earnings as Array<{ name: string; rate: number; amount: number }>) || [];
    const deductions = (slip.deductions as Array<{ name: string; amount: number }>) || [];
    const e = slip.employee;
    const bytes = await statementPdf(
      `${company} - Payslip for ${monthLabel(slip.period)}`,
      [
        `${e.name} (${e.code})${e.designation ? ` - ${e.designation}` : ""}${e.department ? ` - ${e.department.name}` : ""}`,
        `PAN ${e.panMasked || "-"}   UAN ${e.uan || "-"}   ESIC ${e.esicNo || "-"}   Bank ${e.bankAccountMasked || "-"} ${e.ifsc || ""}`,
        `Days in month ${slip.monthDays}   Paid days ${num(slip.paidDays)}   LOP ${num(slip.lopDays)}${num(slip.overtimeHours) ? `   Overtime ${num(slip.overtimeHours)} h` : ""}   Tax regime ${slip.regime}`,
        slip.run.kind === "FNF" ? "Full and final settlement" : "",
      ].filter(Boolean),
      [
        { heading: "Earnings", rows: [...earnings.map((row): [string, string] => [row.name, rs(row.amount)]), ["*Gross earnings", rs(slip.gross)]] },
        { heading: "Deductions", rows: [...deductions.map((row): [string, string] => [row.name, rs(row.amount)]), ["*Total deductions", rs(slip.totalDeductions)]] },
        ...(num(slip.reimbursements) ? [{ heading: "Reimbursements", rows: [["Approved expense claims", rs(slip.reimbursements)] as [string, string]] }] : []),
        { heading: "Net pay", rows: [["*Net pay", rs(slip.net)], ["In words", `Rupees ${inWords(num(slip.net))} only`]] },
        { heading: "Employer contributions (not part of take-home)", rows: [["Provident fund (EPF + EPS)", rs(num(slip.pfEmployer) + num(slip.eps))], ["ESI", rs(slip.esiEmployer)], ["LWF", rs(slip.lwfEmployer)]] },
      ],
      "This is a computer-generated payslip and does not require a signature.",
    );
    return { bytes, fileName: `Payslip-${e.code}-${slip.period}.pdf`, employeeUserId: e.userId, status: slip.status };
  }

  async form16(employeeId: string, fy: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException("Employee not found");
    const slips = await this.prisma.payslip.findMany({ where: { employeeId, period: { in: fyRange(fy).periods }, status: { in: ["APPROVED", "PAID"] } }, orderBy: { period: "asc" } });
    if (!slips.length) throw new BadRequestException(`No approved payslips for ${fy}`);
    const settings = await this.settings();
    const last = slips[slips.length - 1];
    const projection = (last.projection as Record<string, number | string> | null) || {};
    const challans = await this.prisma.statutoryPayment.findMany({ where: { kind: "TDS", period: { in: fyRange(fy).periods } }, orderBy: { period: "asc" } });
    const gross = round2(slips.reduce((sum, row) => sum + num(row.gross), 0));
    const exempt = round2(slips.reduce((sum, row) => sum + ((row.earnings as Array<{ amount: number; taxable: boolean }>) || []).filter((item) => !item.taxable).reduce((a, b) => a + b.amount, 0), 0));
    const quarters = [1, 2, 3, 4].map((quarter) => {
      const rows = slips.filter((row) => quarterOf(Number(row.period.slice(5, 7))) === quarter);
      return { quarter, paid: round2(rows.reduce((sum, row) => sum + num(row.gross), 0)), tds: round2(rows.reduce((sum, row) => sum + num(row.tds), 0)) };
    });
    const tds = round2(quarters.reduce((sum, row) => sum + row.tds, 0));
    const pan = employee.panEnc ? unsealPii(employee.panEnc) : "PANNOTAVBL";
    const bytes = await statementPdf(
      `Form 16 Part B - FY ${fy} (AY ${Number(fy.slice(0, 4)) + 1}-${String((Number(fy.slice(0, 4)) + 2) % 100).padStart(2, "0")})`,
      [
        `Employer: ${settings.deductorName || "-"}   TAN ${settings.tan || "-"}   PAN ${settings.deductorPan || "-"}`,
        `Employee: ${employee.name} (${employee.code})   PAN ${pan}   Tax regime ${last.regime}${last.regime === "NEW" ? " (section 115BAC)" : ""}`,
        `Period of employment: ${slips[0].period} to ${last.period}`,
        "Part A (TDS deposited) is downloaded from TRACES; this annexure is Part B (details of salary and tax).",
      ],
      [
        {
          heading: "1. Gross salary",
          rows: [
            ["(a) Salary as per section 17(1)", rs(gross)],
            ["*Total", rs(gross)],
          ],
        },
        { heading: "2. Allowances exempt under section 10", rows: [["House rent allowance 10(13A)", rs(projection.hraExemption)], ["Gratuity / leave encashment 10(10), 10(10AA)", rs(exempt)]] },
        { heading: "3-5. Deductions under section 16", rows: [["Standard deduction 16(ia)", rs(projection.standard)], ["Tax on employment 16(iii)", rs(projection.professionalTax)]] },
        { heading: "6-10. Income and Chapter VI-A", rows: [["Income from previous employer / other income", rs(num(projection.gross) - gross)], ["Deductions under Chapter VI-A", rs(projection.chapterVIA)], ["*Total taxable income", rs(projection.taxableIncome)]] },
        {
          heading: "11-19. Tax",
          rows: [
            ["Tax on total income (after rebate 87A)", rs(projection.tax)],
            ["Surcharge", rs(projection.surcharge)],
            ["Health and education cess", rs(projection.cess)],
            ["*Tax payable", rs(projection.total)],
            ["*Tax deducted at source (this employer)", rs(tds)],
          ],
        },
        { heading: "Quarterly summary", rows: quarters.map((row): [string, string] => [`Q${row.quarter}  paid ${rs(row.paid)}`, `TDS ${rs(row.tds)}`]) },
        { heading: "TDS challans (company-wide)", rows: challans.length ? challans.map((row): [string, string] => [`${row.period}  BSR ${row.bsrCode || "-"}  serial ${row.challanSerial || "-"}  ${dayKey(row.paidOn)}`, rs(row.amount)]) : [["No challans recorded", "-"]] },
      ],
      `Verification: I, ${settings.responsiblePerson || "________"}, ${settings.responsibleDesignation || "________"}, certify that the information given above is true and correct.`,
    );
    return { bytes, fileName: `Form16-PartB-${employee.code}-${fy}.pdf`, employeeUserId: employee.userId };
  }
}

@Controller()
export class PayrollController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
    private readonly banking: BankingService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly numbers: NumberService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  // ---------- Settings & rules ----------

  @Get("payroll/settings")
  @RequirePermissions("payroll.view")
  async getSettings() {
    const [settings, accounts] = await Promise.all([this.payroll.settings(), this.prisma.account.findMany({ where: { subtype: "BANK", isGroup: false, active: true }, select: { id: true, code: true, name: true } })]);
    return { settings, accounts };
  }

  @Put("payroll/settings")
  @RequirePermissions("payroll.edit")
  async saveSettings(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(payrollSettingsSchema, body);
    await this.prisma.businessSetting.upsert({ where: { key: "payroll" }, update: { value: input }, create: { key: "payroll", value: input } });
    await this.log(req, "update", "payroll_settings", "payroll", undefined, { tan: input.tan, pf: input.pfEstablishmentCode, esi: input.esiEmployerCode });
    return input;
  }

  @Get("payroll/branches")
  @RequirePermissions("payroll.view")
  branches() {
    return this.prisma.branch.findMany({ where: { active: true }, select: { id: true, code: true, name: true, state: true, _count: { select: { employees: true } } }, orderBy: { name: "asc" } });
  }

  @Put("payroll/branches/:id/state")
  @RequirePermissions("payroll.edit")
  async branchState(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const { state } = parseBody(z.object({ state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use the 2-letter state code").nullable() }), body);
    const before = await this.prisma.branch.findUnique({ where: { id }, select: { state: true } });
    if (!before) throw new NotFoundException("Branch not found");
    const row = await this.prisma.branch.update({ where: { id }, data: { state }, select: { id: true, state: true } });
    await this.log(req, "update", "branch", id, before, { state });
    return row;
  }

  @Get("payroll/statutory")
  @RequirePermissions("payroll.view")
  async statutory(@Query() query: Record<string, unknown>) {
    const fy = parseBody(fyQuery, query).fy || currentFy();
    const row = await this.prisma.statutoryConfig.findUnique({ where: { fy } });
    return { fy, custom: Boolean(row), rules: await this.payroll.rules(fy), updatedAt: row?.updatedAt ?? null };
  }

  @Put("payroll/statutory/:fy")
  @RequirePermissions("payroll.approve")
  async saveStatutory(@Param("fy") fy: string, @Body() body: unknown, @Req() req: ReqUser) {
    if (!/^\d{4}-\d{2}$/.test(fy)) throw new BadRequestException("Use a financial year like 2026-27");
    const rules = parseBody(statutoryRulesSchema, body);
    const before = await this.prisma.statutoryConfig.findUnique({ where: { fy } });
    await this.prisma.statutoryConfig.upsert({ where: { fy }, update: { rules, updatedById: req.user.id }, create: { fy, rules, updatedById: req.user.id } });
    await this.log(req, "update", "statutory_config", fy, before?.rules, rules);
    return { fy, rules };
  }

  // ---------- Structures & salaries ----------

  @Get("payroll/structures")
  @RequirePermissions("payroll.view")
  structures() {
    return this.prisma.salaryStructure.findMany({ include: { _count: { select: { assignments: true } } }, orderBy: { name: "asc" } });
  }

  @Post("payroll/structures")
  @RequirePermissions("payroll.edit")
  async createStructure(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(salaryStructureSchema, body);
    this.checkFormulas(input.components);
    const row = await this.prisma.salaryStructure.create({ data: { ...input, components: input.components as Prisma.InputJsonValue } }).catch((error) => {
      if ((error as { code?: string }).code === "P2002") throw new ConflictException("A structure with this name exists");
      throw error;
    });
    await this.log(req, "create", "salary_structure", row.id, undefined, { name: row.name });
    return row;
  }

  @Patch("payroll/structures/:id")
  @RequirePermissions("payroll.edit")
  async updateStructure(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(salaryStructureSchema, body);
    this.checkFormulas(input.components);
    const before = await this.prisma.salaryStructure.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Structure not found");
    const row = await this.prisma.salaryStructure.update({ where: { id }, data: { ...input, components: input.components as Prisma.InputJsonValue } });
    await this.log(req, "update", "salary_structure", id, { components: before.components }, { components: input.components });
    return row;
  }

  private checkFormulas(components: z.infer<typeof salaryComponentSchema>[]) {
    try {
      structureBreakdown(components, 100000, { pf: true, esi: false, employerInCtc: true, rules: DEFAULT_STATUTORY });
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Post("payroll/structures/preview")
  @RequirePermissions("payroll.view")
  async preview(@Body() body: unknown) {
    const input = parseBody(structurePreviewSchema, body);
    let components = input.components;
    let employerInCtc = input.employerInCtc;
    if (input.structureId) {
      const structure = await this.prisma.salaryStructure.findUnique({ where: { id: input.structureId } });
      if (!structure) throw new NotFoundException("Structure not found");
      components = componentsSchema.parse(structure.components);
      employerInCtc = structure.employerInCtc;
    }
    if (!components?.length) throw new BadRequestException("Choose a structure");
    const rules = await this.payroll.rules(currentFy());
    try {
      const result = structureBreakdown(components, round2(input.annualCtc / 12), { pf: input.pf, esi: input.esi, employerInCtc, rules, overrides: input.overrides });
      return { ...result, annual: { ctc: round2(result.ctc * 12), gross: round2(result.gross * 12) } };
    } catch (error) {
      throw new BadRequestException((error as Error).message);
    }
  }

  @Get("payroll/salaries")
  @RequirePermissions("payroll.view")
  async salaries() {
    const employees = await this.prisma.employee.findMany({ where: { status: { in: IN_SERVICE } }, select: { id: true, code: true, name: true, designation: true, status: true, pfApplicable: true, esiApplicable: true, taxRegime: true, uan: true, bankAccountMasked: true, ifsc: true, branch: { select: { name: true, state: true } } }, orderBy: { name: "asc" } });
    const current = await this.payroll.salaryOn(employees.map((row) => row.id), new Date());
    return employees.map((employee) => {
      const salary = current.get(employee.id);
      return { ...employee, salary: salary ? { id: salary.id, structure: salary.structure.name, structureId: salary.structureId, annualCtc: num(salary.annualCtc), effectiveFrom: salary.effectiveFrom } : null };
    });
  }

  @Get("payroll/employees/:id/salary")
  @RequirePermissions("payroll.view")
  async salaryHistory(@Param("id") id: string) {
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { id: true, name: true, code: true, pfApplicable: true, esiApplicable: true } });
    if (!employee) throw new NotFoundException("Employee not found");
    const history = await this.prisma.employeeSalary.findMany({ where: { employeeId: id }, include: { structure: { select: { id: true, name: true } } }, orderBy: { effectiveFrom: "desc" } });
    const current = (await this.payroll.salaryOn([id], new Date())).get(id);
    const breakdown = current ? this.payroll.breakdown(current, employee, await this.payroll.rules(currentFy())) : null;
    return { employee, history, breakdown };
  }

  @Post("payroll/employees/:id/salary")
  @RequirePermissions("payroll.edit")
  async assignSalary(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(employeeSalarySchema, body);
    const [employee, structure] = await Promise.all([this.prisma.employee.findUnique({ where: { id } }), this.prisma.salaryStructure.findUnique({ where: { id: input.structureId } })]);
    if (!employee) throw new NotFoundException("Employee not found");
    if (!structure?.active) throw new BadRequestException("Choose an active salary structure");
    const locked = await this.prisma.payslip.findFirst({ where: { employeeId: id, period: { gte: input.effectiveFrom.slice(0, 7) }, status: { in: ["APPROVED", "PAID"] } }, select: { period: true } });
    if (locked) throw new BadRequestException(`Payroll for ${locked.period} is already approved; date the revision after it (arrears go in as a payslip adjustment)`);
    const breakdown = structureBreakdown(componentsSchema.parse(structure.components), round2(input.annualCtc / 12), { pf: employee.pfApplicable, esi: employee.esiApplicable, employerInCtc: structure.employerInCtc, rules: await this.payroll.rules(fyOf(input.effectiveFrom.slice(0, 7))), overrides: input.overrides });
    if (breakdown.warnings.length) throw new BadRequestException(breakdown.warnings.join("; "));
    const row = await this.prisma.$transaction(async (tx) => {
      const created = await tx.employeeSalary.create({ data: { employeeId: id, structureId: structure.id, annualCtc: input.annualCtc, effectiveFrom: asDate(input.effectiveFrom), overrides: input.overrides, notes: input.notes, createdById: req.user.id } });
      await tx.employee.update({ where: { id }, data: { salary: round2(input.annualCtc / 12) } });
      await this.log(req, "assign_salary", "employee", id, undefined, { structure: structure.name, annualCtc: input.annualCtc, effectiveFrom: input.effectiveFrom }, tx);
      return created;
    });
    return { ...row, breakdown };
  }

  // ---------- Declarations ----------

  @Get("payroll/declarations")
  @RequirePermissions("payroll.view")
  declarations(@Query() query: Record<string, unknown>) {
    const fy = parseBody(fyQuery, query).fy || currentFy();
    return this.prisma.taxDeclaration.findMany({ where: { fy }, include: { employee: { select: { id: true, code: true, name: true } } }, orderBy: { updatedAt: "desc" } });
  }

  @Post("payroll/declarations/:id/verify")
  @RequirePermissions("payroll.approve")
  async verify(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(declarationVerifySchema, body);
    const row = await this.prisma.taxDeclaration.update({ where: { id }, data: { verified: input.verified, status: "VERIFIED", verifiedById: req.user.id, verifiedAt: new Date(), note: input.note } }).catch(() => {
      throw new NotFoundException("Declaration not found");
    });
    await this.log(req, "verify", "tax_declaration", id, undefined, input.verified);
    return row;
  }

  // ---------- Runs ----------

  @Get("payroll/runs")
  @RequirePermissions("payroll.view")
  runs() {
    return this.prisma.payrollRun.findMany({ include: { _count: { select: { payslips: true } } }, orderBy: [{ period: "desc" }, { createdAt: "desc" }], take: 120 });
  }

  @Post("payroll/runs")
  @RequirePermissions("payroll.create")
  async createRun(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(payrollRunSchema, body);
    const clash = await this.prisma.payrollRun.findFirst({ where: { period: input.period, kind: "REGULAR", status: { not: "CANCELLED" } } });
    if (clash) throw new ConflictException(`${clash.number} already covers ${input.period}`);
    const { from, to } = periodRange(input.period);
    const run = await this.prisma.$transaction(async (tx) => {
      const number = await this.numbers.next("PAYROLL", tx);
      const created = await tx.payrollRun.create({ data: { number, kind: "REGULAR", period: input.period, fromDate: asDate(from), toDate: asDate(to), notes: input.notes, createdById: req.user.id, options: { includeReimbursements: input.includeReimbursements, includeOvertime: input.includeOvertime } } });
      await this.workflow.record("payroll_run", created.id, null, "DRAFT", req.user.id, undefined, tx);
      await this.log(req, "create", "payroll_run", created.id, undefined, { number, period: input.period }, tx);
      return created;
    });
    const result = await this.payroll.computeRun(run.id);
    return { ...run, ...result };
  }

  @Get("payroll/runs/:id")
  @RequirePermissions("payroll.view")
  async run(@Param("id") id: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id },
      include: { payslips: { include: { employee: { select: { id: true, code: true, name: true, designation: true, branch: { select: { name: true } } } } }, orderBy: { employee: { name: "asc" } } } },
    });
    if (!run) throw new NotFoundException("Payroll run not found");
    const paymentRun = run.paymentRunId ? await this.prisma.paymentRun.findUnique({ where: { id: run.paymentRunId }, select: { id: true, number: true, status: true } }) : null;
    return { ...run, paymentRun };
  }

  @Post("payroll/runs/:id/recompute")
  @RequirePermissions("payroll.edit")
  async recompute(@Param("id") id: string, @Req() req: ReqUser) {
    const result = await this.payroll.computeRun(id);
    await this.log(req, "recompute", "payroll_run", id, undefined, result);
    return result;
  }

  @Patch("payroll/payslips/:id")
  @RequirePermissions("payroll.edit")
  async updatePayslip(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(payslipUpdateSchema, body);
    const slip = await this.prisma.payslip.findUnique({ where: { id }, include: { run: true } });
    if (!slip) throw new NotFoundException("Payslip not found");
    if (slip.run.status !== "DRAFT") throw new BadRequestException("Only payslips in a draft run can be changed");
    const projection = (slip.projection as Projection | null) || {};
    const overrides = { ...(projection.overrides || {}) };
    if (input.lopDays !== undefined) overrides.lopDays = input.lopDays;
    if (input.overtimeHours !== undefined) overrides.overtimeHours = input.overtimeHours;
    await this.prisma.payslip.update({
      where: { id },
      data: {
        adjustments: input.adjustments === undefined ? undefined : (input.adjustments as Prisma.InputJsonValue),
        tdsOverride: input.tdsOverride === undefined ? undefined : input.tdsOverride,
        projection: { ...projection, overrides } as Prisma.InputJsonValue,
      },
    });
    await this.payroll.computeRun(slip.runId);
    await this.log(req, "adjust", "payslip", id, { adjustments: slip.adjustments, overrides: projection.overrides, tdsOverride: slip.tdsOverride }, input);
    return this.prisma.payslip.findUnique({ where: { id } });
  }

  @Post("payroll/runs/:id/approve")
  @RequirePermissions("payroll.approve")
  approve(@Param("id") id: string, @Req() req: ReqUser) {
    return this.payroll.approve(id, req.user, req.ip);
  }

  @Post("payroll/runs/:id/cancel")
  @RequirePermissions("payroll.edit")
  async cancel(@Param("id") id: string, @Req() req: ReqUser) {
    const result = await this.prisma.payrollRun.updateMany({ where: { id, status: "DRAFT" }, data: { status: "CANCELLED" } });
    if (!result.count) throw new BadRequestException("Only a draft run can be cancelled; approved payroll is corrected through next month's adjustments");
    await this.prisma.payslip.updateMany({ where: { runId: id }, data: { status: "CANCELLED" } });
    await this.workflow.record("payroll_run", id, "DRAFT", "CANCELLED", req.user.id);
    await this.log(req, "cancel", "payroll_run", id, { status: "DRAFT" }, { status: "CANCELLED" });
    return { cancelled: true };
  }

  /** Creates a salary payment run in Banking (maker-checker there) with one row per employee net pay. */
  @Post("payroll/runs/:id/payout")
  @RequirePermissions("payroll.export")
  async payout(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(payoutSchema, body);
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { payslips: { where: { status: "APPROVED", net: { gt: 0 } }, include: { employee: true } } } });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status !== "APPROVED") throw new BadRequestException("Approve the payroll before paying it");
    if (run.paymentRunId) {
      const existing = await this.prisma.paymentRun.findUnique({ where: { id: run.paymentRunId }, select: { number: true, status: true } });
      if (existing && existing.status !== "CANCELLED") throw new ConflictException(`Payment run ${existing.number} already exists for this payroll`);
    }
    const missing = run.payslips.filter((slip) => !slip.employee.bankAccountEnc || !slip.employee.ifsc).map((slip) => slip.employee.name);
    if (missing.length) throw new BadRequestException(`Add bank details for: ${missing.slice(0, 10).join(", ")}${missing.length > 10 ? "…" : ""}`);
    const paymentRun = await this.prisma.$transaction(async (tx) => {
      const created = await this.banking.createRun(
        tx,
        {
          kind: "SALARY",
          accountId: input.accountId,
          bankFormat: input.bankFormat,
          valueDate: asDate(input.valueDate),
          notes: `Salary ${monthLabel(run.period)} (${run.number})`,
          items: run.payslips.map((slip) => ({
            payeeName: slip.employee.name,
            accountNo: unsealPii(slip.employee.bankAccountEnc!),
            ifsc: slip.employee.ifsc!,
            email: slip.employee.personalEmail,
            amount: num(slip.net),
            reference: `SAL ${run.period} ${slip.employee.code}`,
            employeeId: slip.employeeId,
            sourceType: "PAYSLIP",
            sourceId: slip.id,
          })),
        },
        req.user.id,
      );
      await tx.payrollRun.update({ where: { id }, data: { paymentRunId: created.id } });
      await this.log(req, "payout", "payroll_run", id, undefined, { paymentRun: created.number, total: num(created.total) }, tx);
      return created;
    });
    return { id: paymentRun.id, number: paymentRun.number, total: num(paymentRun.total), items: paymentRun.items.length };
  }

  /** For salaries paid outside a payment run (cheque, manual transfer): clears salaries payable against a bank ledger. */
  @Post("payroll/runs/:id/mark-paid")
  @RequirePermissions("payroll.approve")
  async markPaid(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(markPaidSchema, body);
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { payslips: { where: { status: "APPROVED" }, include: { employee: { select: { name: true } } } } } });
    if (!run) throw new NotFoundException("Payroll run not found");
    if (run.status !== "APPROVED") throw new BadRequestException("Only an approved, unpaid run can be marked paid");
    if (run.paymentRunId) {
      const existing = await this.prisma.paymentRun.findUnique({ where: { id: run.paymentRunId }, select: { number: true, status: true } });
      if (existing && existing.status !== "CANCELLED") throw new ConflictException(`Complete or cancel payment run ${existing.number} instead`);
    }
    const account = await this.banking.cashAccount(input.accountId);
    const paidOn = asDate(input.paidOn);
    return this.prisma.$transaction(async (tx) => {
      const lines: PostLine[] = run.payslips.filter((slip) => num(slip.net) > 0).map((slip) => ({ key: "SALARY_PAYABLE", debit: num(slip.net), partyType: "EMPLOYEE", partyId: slip.employeeId, description: slip.employee.name }));
      const total = round2(lines.reduce((sum, line) => sum + (line.debit || 0), 0));
      if (total > 0) await this.ledger.post(tx, { date: paidOn, narration: `Salary paid ${run.number}${input.reference ? ` (${input.reference})` : ""}`, reference: input.reference || run.number, sourceType: "payroll_payment", sourceId: run.id, postingKey: `payroll-paid:${run.id}`, createdById: req.user.id, lines: [...lines, { accountId: account.id, credit: total }] });
      await tx.payslip.updateMany({ where: { runId: id, status: "APPROVED" }, data: { status: "PAID", paidAt: paidOn } });
      await tx.payrollRun.update({ where: { id }, data: { status: "PAID", paidAt: paidOn } });
      await this.workflow.record("payroll_run", id, "APPROVED", "PAID", req.user.id, input.reference, tx);
      await this.log(req, "mark_paid", "payroll_run", id, undefined, { total, accountId: account.id }, tx);
      return { paid: total };
    });
  }

  // ---------- Files ----------

  private async runForExport(id: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id }, include: { payslips: { where: { status: { not: "CANCELLED" } }, include: { employee: { include: { department: true, branch: true } } }, orderBy: { employee: { code: "asc" } } } } });
    if (!run) throw new NotFoundException("Payroll run not found");
    return run;
  }

  @Get("payroll/runs/:id/register")
  @RequirePermissions("payroll.export")
  async register(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    const run = await this.runForExport(id);
    const codes = [...new Set(run.payslips.flatMap((slip) => ((slip.earnings as Array<{ code: string }>) || []).map((row) => row.code)))];
    const header = ["Code", "Name", "Department", "Branch", "Days", "Paid days", "LOP", "OT hours", ...codes, "Gross", "PF", "ESI", "PT", "LWF", "TDS", "Other deductions", "Total deductions", "Reimbursements", "Net pay", "Employer PF", "Employer ESI", "Employer LWF", "Cost to company"];
    const rows = run.payslips.map((slip) => {
      const earnings = (slip.earnings as Array<{ code: string; amount: number }>) || [];
      const statutory = num(slip.pfEmployee) + num(slip.esiEmployee) + num(slip.pt) + num(slip.lwfEmployee) + num(slip.tds);
      return [
        slip.employee.code,
        slip.employee.name,
        slip.employee.department?.name || "",
        slip.employee.branch?.name || "",
        slip.monthDays,
        num(slip.paidDays),
        num(slip.lopDays),
        num(slip.overtimeHours),
        ...codes.map((code) => earnings.filter((row) => row.code === code).reduce((sum, row) => sum + row.amount, 0)),
        num(slip.gross),
        num(slip.pfEmployee),
        num(slip.esiEmployee),
        num(slip.pt),
        num(slip.lwfEmployee),
        num(slip.tds),
        round2(num(slip.totalDeductions) - statutory),
        num(slip.totalDeductions),
        num(slip.reimbursements),
        num(slip.net),
        round2(num(slip.pfEmployer) + num(slip.eps) + num(slip.pfAdmin) + num(slip.edli)),
        num(slip.esiEmployer),
        num(slip.lwfEmployer),
        round2(num(slip.gross) + num(slip.employerCost)),
      ];
    });
    await this.log(req, "export", "payroll_register", id);
    sendText(res, toCsv([header, ...rows]), `Salary-register-${run.period}-${run.number}.csv`);
  }

  @Get("payroll/runs/:id/ecr")
  @RequirePermissions("payroll.export")
  async ecr(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    const run = await this.runForExport(id);
    const members = run.payslips.filter((slip) => num(slip.pfEmployee) > 0);
    const missing = members.filter((slip) => !/^\d{12}$/.test(slip.employee.uan || "")).map((slip) => slip.employee.name);
    if (missing.length) throw new BadRequestException(`Add UANs before generating the ECR: ${missing.slice(0, 10).join(", ")}`);
    const body = ecrFile(members.map((slip) => ({ uan: slip.employee.uan!, name: slip.employee.name, gross: num(slip.gross), epfWages: num(slip.pfWages), epsWages: num(slip.epsWages), edliWages: num(slip.edliWages), employee: num(slip.pfEmployee), eps: num(slip.eps), employer: num(slip.pfEmployer), ncpDays: Math.round(num(slip.lopDays)) })));
    await this.log(req, "export", "pf_ecr", id, undefined, { members: members.length });
    sendText(res, body, `ECR-${run.period}.txt`, "text/plain; charset=utf-8");
  }

  @Get("payroll/runs/:id/esi")
  @RequirePermissions("payroll.export")
  async esi(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    const run = await this.runForExport(id);
    const members = run.payslips.filter((slip) => num(slip.esiEmployee) > 0 || num(slip.esiEmployer) > 0);
    const rows = members.map((slip) => {
      const exited = slip.employee.lastWorkingDay && dayKey(slip.employee.lastWorkingDay).slice(0, 7) === run.period;
      return [slip.employee.esicNo || "", slip.employee.name, Math.round(num(slip.paidDays)), Math.round(num(slip.esiWages)), num(slip.paidDays) === 0 ? (exited ? 2 : 1) : exited ? 2 : 0, exited ? dayKey(slip.employee.lastWorkingDay!).split("-").reverse().join("/") : ""];
    });
    await this.log(req, "export", "esi_contribution", id, undefined, { members: members.length });
    sendText(res, toCsv([["IP Number", "IP Name", "No of Days for which wages paid/payable during the month", "Total Monthly Wages", "Reason Code for Zero workings days", "Last Working Day"], ...rows]), `ESI-${run.period}.csv`);
  }

  @Get("payroll/runs/:id/statutory-summary")
  @RequirePermissions("payroll.view")
  async statutorySummary(@Param("id") id: string) {
    const run = await this.runForExport(id);
    const byState = new Map<string, { state: string; employees: number; pt: number; lwfEmployee: number; lwfEmployer: number }>();
    for (const slip of run.payslips) {
      const key = slip.state || "—";
      const row = byState.get(key) || { state: key, employees: 0, pt: 0, lwfEmployee: 0, lwfEmployer: 0 };
      row.employees++;
      row.pt = round2(row.pt + num(slip.pt));
      row.lwfEmployee = round2(row.lwfEmployee + num(slip.lwfEmployee));
      row.lwfEmployer = round2(row.lwfEmployer + num(slip.lwfEmployer));
      byState.set(key, row);
    }
    const sum = (pick: (slip: (typeof run.payslips)[number]) => number) => round2(run.payslips.reduce((total, slip) => total + pick(slip), 0));
    return {
      pf: { members: run.payslips.filter((slip) => num(slip.pfEmployee) > 0).length, employee: sum((slip) => num(slip.pfEmployee)), epf: sum((slip) => num(slip.pfEmployer)), eps: sum((slip) => num(slip.eps)), admin: sum((slip) => num(slip.pfAdmin)), edli: sum((slip) => num(slip.edli)) },
      esi: { members: run.payslips.filter((slip) => num(slip.esiEmployee) > 0).length, employee: sum((slip) => num(slip.esiEmployee)), employer: sum((slip) => num(slip.esiEmployer)) },
      tds: sum((slip) => num(slip.tds)),
      states: [...byState.values()],
    };
  }

  @Get("payroll/payslips/:id/pdf")
  @RequirePermissions("payroll.view")
  async payslipPdf(@Param("id") id: string, @Res() res: Response) {
    const file = await this.payroll.payslipPdf(id);
    sendPdf(res, file.bytes, file.fileName);
  }

  @Get("payroll/form16/:employeeId")
  @RequirePermissions("payroll.export")
  async form16(@Param("employeeId") employeeId: string, @Query() query: Record<string, unknown>, @Req() req: ReqUser, @Res() res: Response) {
    const fy = parseBody(fyQuery, query).fy || currentFy();
    const file = await this.payroll.form16(employeeId, fy);
    await this.log(req, "export", "form16", employeeId, undefined, { fy });
    sendPdf(res, file.bytes, file.fileName);
  }

  /** 24Q in the column order of the NSDL return preparation utility: Annexure I (deductee rows) every quarter, Annexure II (salary details) in Q4. */
  @Get("payroll/24q")
  @RequirePermissions("payroll.export")
  async form24q(@Query() query: Record<string, unknown>, @Req() req: ReqUser, @Res() res: Response) {
    const { fy, quarter } = parseBody(quarterQuery, query);
    const periods = fyRange(fy).periods.filter((period) => quarterOf(Number(period.slice(5, 7))) === quarter);
    const [slips, challans, settings] = await Promise.all([
      this.prisma.payslip.findMany({ where: { period: { in: periods }, status: { in: ["APPROVED", "PAID"] } }, include: { employee: true }, orderBy: [{ period: "asc" }, { employee: { code: "asc" } }] }),
      this.prisma.statutoryPayment.findMany({ where: { kind: "TDS", period: { in: periods } } }),
      this.payroll.settings(),
    ]);
    const pan = (employee: { panEnc: string | null }) => (employee.panEnc ? unsealPii(employee.panEnc) : "PANNOTAVBL");
    const rows: unknown[][] = [
      [`Form 24Q`, `FY ${fy}`, `Q${quarter}`, `TAN ${settings.tan || ""}`, settings.deductorName || ""],
      [],
      ["Annexure I"],
      ["Sr", "Challan BSR code", "Challan date", "Challan serial", "Employee code", "PAN", "Name", "Section", "Date of payment", "Amount paid", "Tax deducted", "Date of deduction", "Regime (115BAC)"],
    ];
    slips.forEach((slip, index) => {
      const challan = challans.find((row) => row.period === slip.period);
      const paid = slip.paidAt ? dayKey(slip.paidAt) : periodRange(slip.period).to;
      rows.push([index + 1, challan?.bsrCode || "", challan ? dayKey(challan.paidOn) : "", challan?.challanSerial || "", slip.employee.code, pan(slip.employee), slip.employee.name, "192", paid, num(slip.gross), num(slip.tds), paid, slip.regime === "NEW" ? "Y" : "N"]);
    });
    rows.push([], ["Challans"], ["Period", "BSR code", "Date", "Serial", "Amount"]);
    for (const challan of challans) rows.push([challan.period, challan.bsrCode || "", dayKey(challan.paidOn), challan.challanSerial || "", num(challan.amount)]);
    if (quarter === 4) {
      const yearSlips = await this.prisma.payslip.findMany({ where: { period: { in: fyRange(fy).periods }, status: { in: ["APPROVED", "PAID"] } }, include: { employee: true }, orderBy: { period: "asc" } });
      rows.push([], ["Annexure II"], ["Employee code", "PAN", "Name", "From", "To", "Regime", "Gross salary 17(1)", "HRA exempt", "Standard deduction", "Professional tax", "Chapter VI-A", "Total taxable income", "Tax", "Surcharge", "Cess", "Tax payable", "TDS deducted"]);
      const byEmployee = new Map<string, typeof yearSlips>();
      for (const slip of yearSlips) byEmployee.set(slip.employeeId, [...(byEmployee.get(slip.employeeId) || []), slip]);
      for (const list of byEmployee.values()) {
        const last = list[list.length - 1];
        const projection = (last.projection as Record<string, number> | null) || {};
        rows.push([last.employee.code, pan(last.employee), last.employee.name, periodRange(list[0].period).from, periodRange(last.period).to, last.regime, round2(list.reduce((sum, row) => sum + num(row.gross), 0)), projection.hraExemption || 0, projection.standard || 0, projection.professionalTax || 0, projection.chapterVIA || 0, projection.taxableIncome || 0, projection.tax || 0, projection.surcharge || 0, projection.cess || 0, projection.total || 0, round2(list.reduce((sum, row) => sum + num(row.tds), 0))]);
      }
    }
    await this.log(req, "export", "form24q", `${fy}-Q${quarter}`, undefined, { rows: slips.length });
    sendText(res, toCsv(rows), `24Q-${fy}-Q${quarter}.csv`);
  }

  // ---------- Statutory payments ----------

  @Get("payroll/statutory-payments")
  @RequirePermissions("payroll.view")
  statutoryPayments(@Query() query: Record<string, unknown>) {
    const fy = parseBody(fyQuery, query).fy || currentFy();
    return this.prisma.statutoryPayment.findMany({ where: { period: { in: fyRange(fy).periods } }, orderBy: [{ period: "desc" }, { kind: "asc" }] });
  }

  @Post("payroll/statutory-payments")
  @RequirePermissions("payroll.approve")
  async recordStatutoryPayment(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(statutoryPaymentSchema, body);
    const account = await this.banking.cashAccount(input.accountId);
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.statutoryPayment.create({ data: { kind: input.kind, period: input.period, state: input.state, amount: input.amount, paidOn: asDate(input.paidOn), accountId: account.id, reference: input.reference, bsrCode: input.bsrCode, challanSerial: input.challanSerial, notes: input.notes, createdById: req.user.id } });
      const entry = await this.ledger.post(tx, { date: asDate(input.paidOn), narration: `${input.kind} deposit for ${monthLabel(input.period)}${input.reference ? ` (${input.reference})` : ""}`, reference: input.reference || `${input.kind}-${input.period}`, sourceType: "statutory_payment", sourceId: row.id, postingKey: `statutory:${row.id}`, createdById: req.user.id, lines: [{ key: PAYABLE_KEYS[input.kind], debit: input.amount }, { accountId: account.id, credit: input.amount }] });
      await this.log(req, "create", "statutory_payment", row.id, undefined, { kind: input.kind, period: input.period, amount: input.amount }, tx);
      return tx.statutoryPayment.update({ where: { id: row.id }, data: { journalEntryId: entry.id } });
    });
  }

  // ---------- Full & final, labour cost ----------

  @Get("payroll/fnf/:employeeId")
  @RequirePermissions("payroll.view")
  fnfPreview(@Param("employeeId") employeeId: string) {
    return this.payroll.fnfPreview(employeeId);
  }

  @Post("payroll/fnf/:employeeId")
  @RequirePermissions("payroll.create")
  fnf(@Param("employeeId") employeeId: string, @Body() body: unknown, @Req() req: ReqUser) {
    return this.payroll.createFnf(employeeId, parseBody(fnfSchema, body ?? {}), req.user);
  }

  @Get("payroll/labour-cost")
  @RequirePermissions("payroll.view")
  labourCost(@Query() query: Record<string, unknown>) {
    const range = parseBody(rangeQuery, query);
    if (range.toDate < range.fromDate) throw new BadRequestException("Range ends before it starts");
    return this.payroll.labourCost(range.fromDate, range.toDate);
  }
}

/** Employee self-service for payslips, Form 16 and tax declarations. */
@Controller("me")
export class PayrollSelfController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly payroll: PayrollService,
    private readonly people: PeopleService,
    private readonly audit: AuditService,
  ) {}

  private async me(req: ReqUser) {
    assertStaff(req.user);
    return this.people.self(req.user.id);
  }

  @Get("payslips")
  async payslips(@Req() req: ReqUser) {
    const me = await this.me(req);
    return this.prisma.payslip.findMany({ where: { employeeId: me.id, status: { in: ["APPROVED", "PAID"] } }, select: { id: true, period: true, status: true, gross: true, totalDeductions: true, reimbursements: true, net: true, paidDays: true, lopDays: true, tds: true, paidAt: true, run: { select: { kind: true, number: true } } }, orderBy: { period: "desc" }, take: 60 });
  }

  @Get("payslips/:id/pdf")
  async payslipPdf(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    await this.me(req);
    const file = await this.payroll.payslipPdf(id);
    if (file.employeeUserId !== req.user.id || !["APPROVED", "PAID"].includes(file.status)) throw new NotFoundException("Payslip not found");
    sendPdf(res, file.bytes, file.fileName);
  }

  @Get("form16")
  async form16(@Query() query: Record<string, unknown>, @Req() req: ReqUser, @Res() res: Response) {
    const me = await this.me(req);
    const fy = parseBody(fyQuery, query).fy || currentFy();
    const file = await this.payroll.form16(me.id, fy);
    sendPdf(res, file.bytes, file.fileName);
  }

  @Get("salary")
  async salary(@Req() req: ReqUser) {
    const me = await this.me(req);
    const current = (await this.payroll.salaryOn([me.id], new Date())).get(me.id);
    if (!current) return null;
    const breakdown = this.payroll.breakdown(current, me, await this.payroll.rules(currentFy()));
    return { structure: current.structure.name, annualCtc: num(current.annualCtc), effectiveFrom: current.effectiveFrom, breakdown };
  }

  @Get("tax-declaration")
  async declaration(@Query() query: Record<string, unknown>, @Req() req: ReqUser) {
    const me = await this.me(req);
    const fy = parseBody(fyQuery, query).fy || currentFy();
    const row = await this.prisma.taxDeclaration.findUnique({ where: { employeeId_fy: { employeeId: me.id, fy } } });
    const last = await this.prisma.payslip.findFirst({ where: { employeeId: me.id, period: { in: fyRange(fy).periods }, status: { in: ["APPROVED", "PAID"] } }, orderBy: { period: "desc" }, select: { period: true, projection: true, regime: true } });
    return { fy, declaration: row, regime: row?.regime || me.taxRegime, projection: last?.projection || null };
  }

  @Put("tax-declaration")
  async saveDeclaration(@Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(declarationSchema, body);
    const existing = await this.prisma.taxDeclaration.findUnique({ where: { employeeId_fy: { employeeId: me.id, fy: input.fy } } });
    if (existing?.status === "VERIFIED") throw new BadRequestException("Your declaration is verified; ask payroll to reopen it");
    const status = input.submit ? "SUBMITTED" : existing?.status || "DRAFT";
    const row = await this.prisma.taxDeclaration.upsert({
      where: { employeeId_fy: { employeeId: me.id, fy: input.fy } },
      update: { regime: input.regime, items: input.items, status, submittedAt: input.submit ? new Date() : undefined },
      create: { employeeId: me.id, fy: input.fy, regime: input.regime, items: input.items, status, submittedAt: input.submit ? new Date() : undefined },
    });
    await this.audit.log({ actorId: req.user.id, action: input.submit ? "submit" : "save", entityType: "tax_declaration", entityId: row.id, after: { fy: input.fy, regime: input.regime }, ip: req.ip });
    return row;
  }
}
