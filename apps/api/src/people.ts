import { BadRequestException, Body, ConflictException, Controller, Delete, ForbiddenException, Get, Injectable, NotFoundException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Response } from "express";
import { randomUUID } from "crypto";
import {
  DOCUMENT_TYPES,
  type ShiftRule,
  accruedLeave,
  appraisalCycleSchema,
  appraisalReviewSchema,
  assetSchema,
  attendanceEntrySchema,
  carryForward,
  checklistTemplateSchema,
  correctionSchema,
  dayKey,
  decisionSchema,
  eachDay,
  employeeCreateSchema,
  employeeProfileSchema,
  evaluateDay,
  exitSchema,
  expenseSchema,
  goalSchema,
  holidaySchema,
  leaveAdjustSchema,
  leaveApplySchema,
  leaveBalance,
  leaveDays,
  leavePolicySchema,
  localDay,
  localInstant,
  maskAadhaar,
  maskAccount,
  maskPan,
  num,
  parseBankDate,
  parseBiometric,
  parseCsv,
  punchSchema,
  rangeSchema,
  rosterSchema,
  round2,
  selfProfileSchema,
  shiftSchema,
  spansToDays,
  taskUpdateSchema,
} from "@fixotec/shared";
import { Prisma } from "@fixotec/db";
import { z } from "zod";
import { piiHash, sealPii, unsealPii } from "./crypto";
import { streamFile } from "./documents";
import { readXlsx } from "./engineering";
import { AuthUser, RequirePermissions, assertStaff, can, parseBody } from "./http";
import { PrismaService } from "./prisma.service";
import { AuditService, NumberService, StorageService, Tx, WorkflowService } from "./services";
import { MB, Upload, inspectUpload, uploadLimits } from "./uploads";

type ReqUser = { user: AuthUser; ip?: string };
type Db = PrismaService | Tx;
type ChecklistItem = { title: string; owner: string; dueDays: number };
type Profile = z.infer<typeof employeeProfileSchema>;

const LIST_LIMIT = 1000;
const IN_SERVICE = ["ONBOARDING", "ACTIVE", "NOTICE"];
/** Rows written by the builder from activity; biometric, manual and regularized punches take precedence over them. */
const AUTO_SOURCES = new Set(["SYSTEM", "SHOPFLOOR", "SITE"]);
const DOCUMENT_FILE_KINDS = ["pdf", "png", "jpg", "webp", "docx"];
const DEFAULT_SHIFT: ShiftRule = { startTime: "09:30", endTime: "18:30", breakMinutes: 60, graceMinutes: 15, halfDayHours: 4, fullDayHours: 8 };

const asDate = (day: string) => new Date(`${day.slice(0, 10)}T00:00:00Z`);
const addDays = (day: string, days: number) => dayKey(new Date(asDate(day).getTime() + days * 86_400_000));
const today = () => localDay(new Date());
const yearOf = (value: unknown) => {
  const year = Number(value);
  return Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : new Date().getUTCFullYear();
};

const idQuery = z.object({ employeeId: z.string().max(64).optional(), status: z.string().max(20).optional(), cycleId: z.string().max(64).optional() });
const yearEndSchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });
const lockSchema = z.object({ fromDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), toDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), locked: z.boolean().default(true) });
const documentSchema = z.object({ type: z.enum(DOCUMENT_TYPES), name: z.string().trim().min(2).max(120), expiresAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().or(z.literal("")) });
const assignSchema = z.object({ employeeId: z.string().max(64).nullable(), notes: z.string().trim().max(300).optional() });
const assetCreateSchema = assetSchema.extend({ category: z.string().trim().max(60).optional(), serialNo: z.string().trim().max(80).optional() });
const relieveSchema = z.object({ force: z.boolean().default(false) });
const goalUpdateSchema = goalSchema.partial().omit({ employeeId: true });
const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() });

type Sensitive = { salary?: unknown; panEnc?: unknown; panHash?: unknown; aadhaarEnc?: unknown; aadhaarHash?: unknown; bankAccountEnc?: unknown };

/** Ciphertexts and hashes never leave the API; salary only with hr.view_salary. */
export function employeeView<T extends Sensitive>(row: T, user: AuthUser) {
  const { panEnc, panHash, aadhaarEnc, aadhaarHash, bankAccountEnc, ...rest } = row;
  void [panEnc, panHash, aadhaarEnc, aadhaarHash, bankAccountEnc];
  return can(user, "hr.view_salary") ? rest : { ...rest, salary: undefined };
}

function profileData(input: Profile) {
  const text = (value?: string) => (value === undefined ? undefined : value || null);
  const date = (value?: string) => (value === undefined ? undefined : value ? asDate(value) : null);
  const data: Prisma.EmployeeUncheckedUpdateInput = {
    name: input.name,
    designation: text(input.designation),
    employmentType: input.employmentType,
    departmentId: text(input.departmentId),
    branchId: text(input.branchId),
    managerId: text(input.managerId),
    userId: text(input.userId),
    joiningDate: date(input.joiningDate),
    probationEndDate: date(input.probationEndDate),
    confirmationDate: date(input.confirmationDate),
    dob: date(input.dob),
    gender: input.gender === undefined ? undefined : input.gender || null,
    phone: text(input.phone),
    personalEmail: text(input.personalEmail),
    address: text(input.address),
    emergencyContact: text(input.emergencyContact),
    uan: text(input.uan),
    esicNo: text(input.esicNo),
    pfApplicable: input.pfApplicable,
    esiApplicable: input.esiApplicable,
    ptApplicable: input.ptApplicable,
    taxRegime: input.taxRegime,
    bankName: text(input.bankName),
    ifsc: text(input.ifsc),
    shiftId: text(input.shiftId),
    leavePolicyId: text(input.leavePolicyId),
    salary: input.salary,
  };
  if (input.pan !== undefined) Object.assign(data, input.pan ? { panEnc: sealPii(input.pan), panMasked: maskPan(input.pan), panHash: piiHash("pan", input.pan) } : { panEnc: null, panMasked: null, panHash: null });
  if (input.aadhaar !== undefined) {
    const aadhaar = input.aadhaar.replace(/\s/g, "");
    Object.assign(data, aadhaar ? { aadhaarEnc: sealPii(aadhaar), aadhaarMasked: maskAadhaar(aadhaar), aadhaarHash: piiHash("aadhaar", aadhaar) } : { aadhaarEnc: null, aadhaarMasked: null, aadhaarHash: null });
  }
  if (input.bankAccount !== undefined) Object.assign(data, input.bankAccount ? { bankAccountEnc: sealPii(input.bankAccount), bankAccountMasked: maskAccount(input.bankAccount) } : { bankAccountEnc: null, bankAccountMasked: null });
  return data;
}

async function guarded<T>(work: Promise<T>) {
  try {
    return await work;
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "P2002") {
      const target = String(((error as { meta?: { target?: string[] | string } }).meta?.target as string[] | string | undefined) ?? "");
      if (target.includes("pan")) throw new ConflictException("Another employee already has this PAN");
      if (target.includes("aadhaar")) throw new ConflictException("Another employee already has this Aadhaar number");
      if (target.includes("userId")) throw new ConflictException("This login is already linked to another employee");
      if (target.includes("code")) throw new ConflictException("That code is already used");
      throw new ConflictException("A record with these details already exists");
    }
    if (code === "P2003") throw new BadRequestException("A linked record (department, branch, manager, login, shift or policy) does not exist");
    throw error;
  }
}

const shiftRule = (shift: { startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; halfDayHours: Prisma.Decimal; fullDayHours: Prisma.Decimal } | null | undefined): ShiftRule | null =>
  shift ? { startTime: shift.startTime, endTime: shift.endTime, breakMinutes: shift.breakMinutes, graceMinutes: shift.graceMinutes, halfDayHours: num(shift.halfDayHours), fullDayHours: num(shift.fullDayHours) } : null;

/** Clock "HH:MM" on a local day; a check-out earlier than check-in is the next morning (night shift). */
function punchTimes(day: string, checkIn?: string, checkOut?: string) {
  const inAt = checkIn ? localInstant(day, checkIn) : undefined;
  let outAt = checkOut ? localInstant(day, checkOut) : undefined;
  if (inAt && outAt && outAt <= inAt) outAt = new Date(outAt.getTime() + 86_400_000);
  return { checkIn: inAt, checkOut: outAt };
}

/** Opens a labour time log on a job card for each operator not already clocked on it. */
export async function openJobTime(tx: Tx, jobCardId: string, employeeIds: string[]) {
  if (!employeeIds.length) return;
  const open = await tx.jobTimeLog.findMany({ where: { jobCardId, endedAt: null }, select: { employeeId: true } });
  const clocked = new Set(open.map((row) => row.employeeId));
  const startedAt = new Date();
  const rows = [...new Set(employeeIds)].filter((id) => !clocked.has(id)).map((employeeId) => ({ jobCardId, employeeId, startedAt }));
  if (rows.length) await tx.jobTimeLog.createMany({ data: rows });
}

export async function closeJobTime(tx: Tx, jobCardId: string) {
  const endedAt = new Date();
  const open = await tx.jobTimeLog.findMany({ where: { jobCardId, endedAt: null } });
  for (const log of open) {
    await tx.jobTimeLog.update({ where: { id: log.id }, data: { endedAt, minutes: Math.max(0, Math.round((endedAt.getTime() - log.startedAt.getTime()) / 60_000)) } });
  }
}

type PolicyWithTypes = Prisma.LeavePolicyGetPayload<{ include: { types: true } }>;
type EmployeeForDay = { id: string; branchId: string | null; leavePolicyId: string | null; shift: Prisma.ShiftGetPayload<object> | null };

@Injectable()
export class PeopleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
  ) {}

  async self(userId: string) {
    const employee = await this.prisma.employee.findUnique({ where: { userId } });
    if (!employee) throw new BadRequestException("Your login is not linked to an employee record; ask HR to link it");
    return employee;
  }

  /** Managers decide for their direct reports; HR (hr.approve) for anyone. Nobody decides their own requests. */
  async assertApprover(user: AuthUser, employee: { userId: string | null; managerId: string | null }) {
    assertStaff(user);
    if (employee.userId === user.id) throw new ForbiddenException("You cannot decide your own request");
    if (can(user, "hr.approve")) return;
    const me = await this.prisma.employee.findUnique({ where: { userId: user.id }, select: { id: true } });
    if (!me || employee.managerId !== me.id) throw new ForbiddenException("Only the employee's manager or HR can decide this");
  }

  async spawnTasks(tx: Tx, employeeId: string, kind: "ONBOARDING" | "EXIT", anchor: Date) {
    const templates = await tx.checklistTemplate.findMany({ where: { kind, active: true }, orderBy: { createdAt: "asc" } });
    const items = templates.flatMap((template) => (Array.isArray(template.items) ? (template.items as ChecklistItem[]) : []));
    if (!items.length) return 0;
    await tx.employeeTask.createMany({
      data: items.map((item, index) => ({ employeeId, kind, title: item.title, owner: item.owner || "HR", dueDate: new Date(anchor.getTime() + (item.dueDays || 0) * 86_400_000), sortOrder: index })),
    });
    return items.length;
  }

  // ---------- Leave ----------

  policies(db: Db = this.prisma) {
    return db.leavePolicy.findMany({ where: { active: true }, include: { types: true }, orderBy: { createdAt: "asc" } });
  }

  policyFor(employee: { leavePolicyId: string | null; branchId: string | null }, policies: PolicyWithTypes[]) {
    return (
      (employee.leavePolicyId && policies.find((policy) => policy.id === employee.leavePolicyId)) ||
      policies.find((policy) => policy.isDefault && policy.branchId && policy.branchId === employee.branchId) ||
      policies.find((policy) => policy.isDefault && !policy.branchId) ||
      policies.find((policy) => policy.isDefault) ||
      null
    );
  }

  async holidaySet(branchId: string | null, from: string, to: string, db: Db = this.prisma) {
    const rows = await db.holiday.findMany({ where: { date: { gte: asDate(from), lte: asDate(to) }, optional: false, OR: [{ branchId: null }, ...(branchId ? [{ branchId }] : [])] } });
    return new Set(rows.map((row) => dayKey(row.date)));
  }

  /** Per employee and leave type: opening + accrued + adjusted − used − encashed, and what is still free after pending requests. */
  async leaveSummary(employeeIds: string[] | null, year: number, db: Db = this.prisma) {
    const employees = await db.employee.findMany({
      where: employeeIds ? { id: { in: employeeIds } } : { status: { in: IN_SERVICE } },
      select: { id: true, code: true, name: true, branchId: true, leavePolicyId: true, joiningDate: true },
      orderBy: { name: "asc" },
      take: 5000,
    });
    const ids = employees.map((row) => row.id);
    const [policies, balances, usage] = await Promise.all([
      this.policies(db),
      db.leaveBalance.findMany({ where: { employeeId: { in: ids }, year } }),
      db.leaveRequest.groupBy({ by: ["employeeId", "type", "status"], where: { employeeId: { in: ids }, status: { in: ["APPROVED", "PENDING"] }, fromDate: { gte: asDate(`${year}-01-01`), lt: asDate(`${year + 1}-01-01`) } }, _sum: { days: true } }),
    ]);
    const now = new Date();
    return employees.map((employee) => {
      const policy = this.policyFor(employee, policies);
      const codes = new Set([...(policy?.types.map((type) => type.code) || []), ...balances.filter((row) => row.employeeId === employee.id).map((row) => row.type)]);
      const types = [...codes].map((code) => {
        const type = policy?.types.find((row) => row.code === code);
        const balance = balances.find((row) => row.employeeId === employee.id && row.type === code);
        const used = num(usage.find((row) => row.employeeId === employee.id && row.type === code && row.status === "APPROVED")?._sum.days);
        const pending = num(usage.find((row) => row.employeeId === employee.id && row.type === code && row.status === "PENDING")?._sum.days);
        const accrued = type ? accruedLeave({ annualQuota: num(type.annualQuota), accrual: type.accrual }, year, now, employee.joiningDate) : 0;
        const totals = leaveBalance({ opening: num(balance?.opening), accrued, adjusted: num(balance?.adjusted), used, encashed: num(balance?.encashed), pending });
        return { code, name: type?.name || code, paid: type?.paid ?? true, allowNegative: type?.allowNegative ?? false, opening: num(balance?.opening), accrued, adjusted: num(balance?.adjusted), encashed: num(balance?.encashed), used, pending, ...totals };
      });
      return { employee: { id: employee.id, code: employee.code, name: employee.name }, policy: policy ? { id: policy.id, name: policy.name } : null, types };
    });
  }

  async applyLeave(employeeId: string, input: z.infer<typeof leaveApplySchema>, actor: AuthUser, onBehalf: boolean) {
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) throw new NotFoundException("Employee not found");
    if (!IN_SERVICE.includes(employee.status)) throw new BadRequestException("This employee has exited");
    const policy = this.policyFor(employee, await this.policies());
    const type = policy?.types.find((row) => row.code === input.type);
    if (!policy || !type) throw new BadRequestException(`Leave type ${input.type} is not in ${policy ? `the ${policy.name} policy` : "any leave policy"}`);
    if (input.halfDay && !type.allowHalfDay) throw new BadRequestException(`${type.name} cannot be taken as a half day`);
    if (input.fromDate.slice(0, 4) !== input.toDate.slice(0, 4)) throw new BadRequestException("Leave crossing a year end must be applied as two requests");
    if (!onBehalf && type.minNoticeDays) {
      const notice = (asDate(input.fromDate).getTime() - asDate(today()).getTime()) / 86_400_000;
      if (notice < type.minNoticeDays) throw new BadRequestException(`${type.name} needs ${type.minNoticeDays} day(s) notice`);
    }
    const holidays = await this.holidaySet(employee.branchId, input.fromDate, input.toDate);
    const days = leaveDays(input.fromDate, input.toDate, { halfDay: Boolean(input.halfDay), holidays, weeklyOffs: policy.weeklyOffs, countOffs: type.countOffs });
    if (!days) throw new BadRequestException("Those dates are all holidays or weekly offs");
    const overlap = await this.prisma.leaveRequest.findFirst({ where: { employeeId, status: { in: ["PENDING", "APPROVED"] }, fromDate: { lte: asDate(input.toDate) }, toDate: { gte: asDate(input.fromDate) } } });
    if (overlap) throw new ConflictException("Another leave request already covers some of these dates");
    if (!type.allowNegative) {
      const [summary] = await this.leaveSummary([employeeId], Number(input.fromDate.slice(0, 4)));
      const available = summary?.types.find((row) => row.code === type.code)?.available ?? 0;
      if (available < days) throw new BadRequestException(`Only ${available} day(s) of ${type.name} available`);
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.leaveRequest.create({
        data: { employeeId, type: type.code, fromDate: asDate(input.fromDate), toDate: asDate(input.toDate), days, halfDay: input.halfDay, reason: input.reason, appliedById: actor.id, status: "PENDING" },
      });
      await this.workflow.record("leave", row.id, null, "PENDING", actor.id, undefined, tx);
      await this.audit.log({ actorId: actor.id, action: "apply", entityType: "leave", entityId: row.id, after: { employeeId, type: row.type, days } }, tx);
      return row;
    });
  }

  async decideLeave(id: string, input: z.infer<typeof decisionSchema>, actor: AuthUser, ip?: string) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id }, include: { employee: { select: { userId: true, managerId: true } } } });
    if (!leave) throw new NotFoundException("Leave request not found");
    await this.assertApprover(actor, leave.employee);
    const row = await this.prisma.$transaction(async (tx) => {
      const result = await tx.leaveRequest.updateMany({ where: { id, status: "PENDING" }, data: { status: input.status, decidedById: actor.id, decidedAt: new Date(), decisionNote: input.note } });
      if (!result.count) throw new BadRequestException("Leave request is no longer pending");
      await this.workflow.record("leave", id, "PENDING", input.status, actor.id, input.note, tx);
      await this.audit.log({ actorId: actor.id, action: "decide", entityType: "leave", entityId: id, before: { status: "PENDING" }, after: { status: input.status }, ip }, tx);
      return tx.leaveRequest.findUniqueOrThrow({ where: { id } });
    });
    if (input.status === "APPROVED") await this.rebuild([leave.employeeId], dayKey(leave.fromDate), dayKey(leave.toDate));
    return row;
  }

  async cancelLeave(id: string, actor: AuthUser, own: boolean, reason?: string) {
    const leave = await this.prisma.leaveRequest.findUnique({ where: { id }, include: { employee: { select: { userId: true } } } });
    if (!leave) throw new NotFoundException("Leave request not found");
    if (own && leave.employee.userId !== actor.id) throw new NotFoundException("Leave request not found");
    if (!["PENDING", "APPROVED"].includes(leave.status)) throw new BadRequestException(`A ${leave.status.toLowerCase()} request cannot be cancelled`);
    if (own && leave.status === "APPROVED" && dayKey(leave.fromDate) <= today()) throw new BadRequestException("Leave that has started can only be cancelled by HR");
    const locked = await this.prisma.attendance.count({ where: { employeeId: leave.employeeId, locked: true, day: { gte: leave.fromDate, lte: leave.toDate } } });
    if (locked) throw new BadRequestException("Payroll for these dates is locked");
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.leaveRequest.updateMany({ where: { id, status: leave.status }, data: { status: "CANCELLED", decisionNote: reason } });
      if (!result.count) throw new ConflictException("Leave request was changed; reload and try again");
      await this.workflow.record("leave", id, leave.status, "CANCELLED", actor.id, reason, tx);
      await this.audit.log({ actorId: actor.id, action: "cancel", entityType: "leave", entityId: id, before: { status: leave.status }, after: { status: "CANCELLED" } }, tx);
    });
    if (leave.status === "APPROVED") await this.rebuild([leave.employeeId], dayKey(leave.fromDate), dayKey(leave.toDate));
    return { cancelled: true };
  }

  // ---------- Attendance ----------

  private async dayContext(employees: EmployeeForDay[], from: string, to: string, db: Db) {
    const ids = employees.map((row) => row.id);
    const [holidays, roster, leaves, policies, fallback] = await Promise.all([
      db.holiday.findMany({ where: { date: { gte: asDate(from), lte: asDate(to) }, optional: false } }),
      db.rosterEntry.findMany({ where: { employeeId: { in: ids }, day: { gte: asDate(from), lte: asDate(to) } }, include: { shift: true } }),
      db.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "APPROVED", fromDate: { lte: asDate(to) }, toDate: { gte: asDate(from) } } }),
      this.policies(db),
      db.shift.findFirst({ where: { active: true }, orderBy: [{ code: "asc" }] }),
    ]);
    const rosterBy = new Map(roster.map((row) => [`${row.employeeId}|${dayKey(row.day)}`, row]));
    return (employee: EmployeeForDay, day: string) => {
      const planned = rosterBy.get(`${employee.id}|${day}`);
      const shift = planned?.shift || employee.shift || fallback;
      const weekday = asDate(day).getUTCDay();
      const weeklyOff = planned ? planned.off : (shift?.weeklyOffs ?? [0]).includes(weekday);
      const holiday = holidays.some((row) => dayKey(row.date) === day && (!row.branchId || row.branchId === employee.branchId));
      const leaveRow = leaves.find((row) => row.employeeId === employee.id && dayKey(row.fromDate) <= day && dayKey(row.toDate) >= day);
      let leave: "FULL" | "HALF" | null = leaveRow ? (leaveRow.halfDay ? "HALF" : "FULL") : null;
      if (leaveRow && (holiday || weeklyOff)) {
        const type = this.policyFor(employee, policies)?.types.find((row) => row.code === leaveRow.type);
        if (!type?.countOffs) leave = null;
      }
      return { shiftId: shift?.id ?? null, shift: shiftRule(shift) || DEFAULT_SHIFT, weeklyOff, holiday, leave };
    };
  }

  /**
   * Builds attendance for a date range (never beyond today): merges job-card time logs and site visits as punches,
   * then evaluates every employee-day against shift, roster, holidays and approved leave. Locked days are untouched.
   */
  async rebuild(employeeIds: string[] | null, from: string, to: string) {
    const end = to > today() ? today() : to;
    if (from > end) return { days: 0, updated: 0 };
    const employees = await this.prisma.employee.findMany({
      where: {
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
        OR: [{ status: { in: IN_SERVICE } }, { lastWorkingDay: { gte: asDate(from) } }],
      },
      include: { shift: true },
      take: 5000,
    });
    if (!employees.length) return { days: 0, updated: 0 };
    const ids = employees.map((row) => row.id);
    const rangeStart = localInstant(from, "00:00");
    const rangeEnd = localInstant(addDays(end, 1), "00:00");
    const byUser = new Map(employees.filter((row) => row.userId).map((row) => [row.userId!, row.id]));
    const [logs, visits, existing] = await Promise.all([
      this.prisma.jobTimeLog.findMany({ where: { employeeId: { in: ids }, startedAt: { gte: rangeStart, lt: rangeEnd } } }),
      byUser.size ? this.prisma.siteVisit.findMany({ where: { userId: { in: [...byUser.keys()] }, checkInAt: { gte: rangeStart, lt: rangeEnd } } }) : Promise.resolve([]),
      this.prisma.attendance.findMany({ where: { employeeId: { in: ids }, day: { gte: asDate(from), lte: asDate(end) } } }),
    ]);
    const activity = new Map<string, { checkIn: Date; checkOut: Date | null; source: string }>();
    const addActivity = (rows: ReturnType<typeof spansToDays>, source: string) => {
      for (const row of rows) {
        const key = `${row.employeeId}|${row.day}`;
        const current = activity.get(key);
        if (!current) activity.set(key, { checkIn: row.checkIn, checkOut: row.checkOut, source });
        else {
          if (row.checkIn < current.checkIn) current.checkIn = row.checkIn;
          if (row.checkOut && (!current.checkOut || row.checkOut > current.checkOut)) current.checkOut = row.checkOut;
        }
      }
    };
    addActivity(spansToDays(logs.map((log) => ({ employeeId: log.employeeId, start: log.startedAt, end: log.endedAt }))), "SHOPFLOOR");
    addActivity(spansToDays(visits.flatMap((visit) => (visit.userId && byUser.has(visit.userId) ? [{ employeeId: byUser.get(visit.userId)!, start: visit.checkInAt, end: visit.checkOutAt ?? null }] : []))), "SITE");
    const rows = new Map(existing.map((row) => [`${row.employeeId}|${dayKey(row.day)}`, row]));
    const dayInfo = await this.dayContext(employees, from, end, this.prisma);
    let updated = 0;
    let days = 0;
    for (const employee of employees) {
      for (const day of eachDay(from, end)) {
        if (employee.joiningDate && day < dayKey(employee.joiningDate)) continue;
        if (employee.lastWorkingDay && day > dayKey(employee.lastWorkingDay)) continue;
        days++;
        const key = `${employee.id}|${day}`;
        const row = rows.get(key);
        if (row?.locked) continue;
        let checkIn = row?.checkIn ?? null;
        let checkOut = row?.checkOut ?? null;
        let source = row?.source ?? "SYSTEM";
        const seen = activity.get(key);
        if (seen) {
          if (!row || AUTO_SOURCES.has(row.source)) {
            checkIn = seen.checkIn;
            checkOut = seen.checkOut;
            source = seen.source;
          } else {
            checkIn ??= seen.checkIn;
            checkOut ??= seen.checkOut;
          }
        }
        const info = dayInfo(employee, day);
        const result = evaluateDay({ day, shift: info.shift, checkIn, checkOut, holiday: info.holiday, weeklyOff: info.weeklyOff, leave: info.leave });
        const same =
          row &&
          row.status === result.status &&
          row.workedMinutes === result.workedMinutes &&
          row.lateMinutes === result.lateMinutes &&
          row.overtimeMinutes === result.overtimeMinutes &&
          row.checkIn?.getTime() === checkIn?.getTime() &&
          row.checkOut?.getTime() === checkOut?.getTime() &&
          row.shiftId === info.shiftId;
        if (same) continue;
        const data = { checkIn, checkOut, source, shiftId: info.shiftId, ...result };
        if (row) await this.prisma.attendance.update({ where: { id: row.id }, data });
        else await this.prisma.attendance.create({ data: { employeeId: employee.id, day: asDate(day), ...data } });
        updated++;
      }
    }
    return { days, updated };
  }

  /** Writes punches for one employee-day then re-evaluates it. */
  async writePunch(employeeId: string, day: string, times: { checkIn?: Date; checkOut?: Date }, source: string, extra: { notes?: string; latitude?: number; longitude?: number } = {}, override = false) {
    const existing = await this.prisma.attendance.findUnique({ where: { employeeId_day: { employeeId, day: asDate(day) } } });
    if (existing?.locked && !override) throw new BadRequestException(`Attendance for ${day} is locked for payroll`);
    const data = { ...times, source, notes: extra.notes, latitude: extra.latitude, longitude: extra.longitude };
    if (existing) await this.prisma.attendance.update({ where: { id: existing.id }, data });
    else await this.prisma.attendance.create({ data: { employeeId, day: asDate(day), ...data } });
    if (existing?.locked) await this.prisma.attendance.update({ where: { id: existing.id }, data: { locked: false } });
    await this.rebuild([employeeId], day, day);
    if (existing?.locked) await this.prisma.attendance.update({ where: { id: existing.id }, data: { locked: true } });
    return this.prisma.attendance.findUnique({ where: { employeeId_day: { employeeId, day: asDate(day) } } });
  }

  async decideCorrection(id: string, input: z.infer<typeof decisionSchema>, actor: AuthUser, ip?: string) {
    const correction = await this.prisma.attendanceCorrection.findUnique({ where: { id }, include: { employee: { select: { userId: true, managerId: true } } } });
    if (!correction) throw new NotFoundException("Correction not found");
    await this.assertApprover(actor, correction.employee);
    const result = await this.prisma.attendanceCorrection.updateMany({ where: { id, status: "PENDING" }, data: { status: input.status, decidedById: actor.id, decidedAt: new Date(), note: input.note } });
    if (!result.count) throw new BadRequestException("Correction is no longer pending");
    if (input.status === "APPROVED") {
      await this.writePunch(correction.employeeId, dayKey(correction.day), { checkIn: correction.checkIn ?? undefined, checkOut: correction.checkOut ?? undefined }, "REGULARIZED", { notes: correction.reason });
    }
    await this.audit.log({ actorId: actor.id, action: "decide", entityType: "attendance_correction", entityId: id, before: { status: "PENDING" }, after: { status: input.status }, ip });
    return this.prisma.attendanceCorrection.findUnique({ where: { id } });
  }

  async attendanceRange(employeeIds: string[] | null, from: string, to: string) {
    return this.prisma.attendance.findMany({
      where: { ...(employeeIds ? { employeeId: { in: employeeIds } } : {}), day: { gte: asDate(from), lte: asDate(to) } },
      include: { employee: { select: { id: true, code: true, name: true } } },
      orderBy: [{ day: "asc" }],
      take: 20_000,
    });
  }

  // ---------- Appraisals ----------

  async review(id: string, input: z.infer<typeof appraisalReviewSchema>, actor: AuthUser) {
    const appraisal = await this.prisma.appraisal.findUnique({ where: { id }, include: { employee: { select: { userId: true, managerId: true } }, cycle: true } });
    if (!appraisal) throw new NotFoundException("Appraisal not found");
    if (appraisal.cycle.status !== "OPEN") throw new BadRequestException("This appraisal cycle is not open");
    await this.assertApprover(actor, appraisal.employee);
    const row = await this.prisma.appraisal.update({ where: { id }, data: { managerRating: input.rating, managerComments: input.comments, reviewerId: actor.id, status: "DONE", completedAt: new Date() } });
    await this.audit.log({ actorId: actor.id, action: "review", entityType: "appraisal", entityId: id, after: { rating: input.rating } });
    return row;
  }

  async createExpense(employeeId: string, input: z.infer<typeof expenseSchema>, actorId: string, numbers: NumberService) {
    return this.prisma.$transaction(async (tx) => {
      const number = await numbers.next("EXPENSE", tx);
      const row = await tx.expense.create({
        data: { number, employeeId, category: input.category, amount: input.amount, description: input.description, spentOn: input.spentOn ? new Date(input.spentOn) : undefined, status: "MANAGER" },
      });
      await this.workflow.record("expense", row.id, "DRAFT", "MANAGER", actorId, undefined, tx);
      await this.audit.log({ actorId, action: "create", entityType: "expense", entityId: row.id, after: { number, amount: row.amount } }, tx);
      return row;
    });
  }
}

@Controller()
export class PeopleController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
    private readonly audit: AuditService,
    private readonly workflow: WorkflowService,
    private readonly storage: StorageService,
  ) {}

  private log(req: ReqUser, action: string, entityType: string, entityId: string, before?: unknown, after?: unknown, tx?: Tx) {
    return this.audit.log({ actorId: req.user.id, action, entityType, entityId, before, after, ip: req.ip }, tx);
  }

  @Get("hr/summary")
  @RequirePermissions("hr.view")
  async summary() {
    const day = today();
    const soon = asDate(addDays(day, 30));
    const [byStatus, attendance, leave, corrections, tasks, expiring, probation] = await Promise.all([
      this.prisma.employee.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.attendance.groupBy({ by: ["status"], where: { day: asDate(day) }, _count: { _all: true } }),
      this.prisma.leaveRequest.count({ where: { status: "PENDING" } }),
      this.prisma.attendanceCorrection.count({ where: { status: "PENDING" } }),
      this.prisma.employeeTask.count({ where: { status: "PENDING" } }),
      this.prisma.employeeDocument.findMany({ where: { expiresAt: { gte: asDate(day), lte: soon } }, include: { employee: { select: { id: true, name: true, code: true } } }, orderBy: { expiresAt: "asc" }, take: 50 }),
      this.prisma.employee.findMany({ where: { status: { in: IN_SERVICE }, confirmationDate: null, probationEndDate: { gte: asDate(day), lte: soon } }, select: { id: true, name: true, code: true, probationEndDate: true }, take: 50 }),
    ]);
    return {
      headcount: Object.fromEntries(byStatus.map((row) => [row.status, row._count._all])),
      today: Object.fromEntries(attendance.map((row) => [row.status, row._count._all])),
      pending: { leave, corrections, tasks },
      expiringDocuments: expiring,
      probationEnding: probation,
    };
  }

  @Get("hr/lookups")
  @RequirePermissions("hr.view")
  async lookups() {
    const [branches, departments, shifts, policies, users, employees, cycles] = await Promise.all([
      this.prisma.branch.findMany({ where: { active: true }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.department.findMany({ select: { id: true, code: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.shift.findMany({ where: { active: true }, select: { id: true, code: true, name: true, startTime: true, endTime: true }, orderBy: { code: "asc" } }),
      this.prisma.leavePolicy.findMany({ where: { active: true }, select: { id: true, name: true, isDefault: true, types: { select: { code: true, name: true } } }, orderBy: { name: "asc" } }),
      this.prisma.user.findMany({ where: { active: true, kind: "STAFF" }, select: { id: true, name: true, email: true, employee: { select: { id: true } } }, orderBy: { name: "asc" }, take: 5000 }),
      this.prisma.employee.findMany({ where: { status: { in: IN_SERVICE } }, select: { id: true, code: true, name: true }, orderBy: { name: "asc" }, take: 5000 }),
      this.prisma.appraisalCycle.findMany({ where: { status: { not: "CLOSED" } }, select: { id: true, name: true, status: true }, orderBy: { startDate: "desc" } }),
    ]);
    return { branches, departments, shifts, policies, users: users.map(({ employee, ...user }) => ({ ...user, linked: Boolean(employee) })), employees, cycles };
  }

  // ---------- Employees ----------

  @Get("hr/employees")
  @RequirePermissions("hr.view")
  async employees(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const { status } = parseBody(idQuery, query);
    const rows = await this.prisma.employee.findMany({
      where: status ? { status } : undefined,
      include: { department: true, branch: true, shift: { select: { id: true, code: true, name: true } }, user: { select: { email: true } } },
      orderBy: { name: "asc" },
      take: 5000,
    });
    return rows.map((row) => employeeView(row, req.user));
  }

  @Get("hr/employees/:id")
  @RequirePermissions("hr.view")
  async employee(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        department: true,
        branch: true,
        shift: true,
        leavePolicy: { select: { id: true, name: true } },
        user: { select: { id: true, email: true, name: true } },
        documents: { orderBy: { createdAt: "desc" } },
        tasks: { orderBy: [{ kind: "asc" }, { sortOrder: "asc" }] },
        assets: true,
      },
    });
    if (!row) throw new NotFoundException("Employee not found");
    const [manager, reports, [leave]] = await Promise.all([
      row.managerId ? this.prisma.employee.findUnique({ where: { id: row.managerId }, select: { id: true, name: true, code: true } }) : null,
      this.prisma.employee.findMany({ where: { managerId: id, status: { in: IN_SERVICE } }, select: { id: true, name: true, code: true, designation: true } }),
      this.people.leaveSummary([id], new Date().getUTCFullYear()),
    ]);
    return { ...employeeView(row, req.user), manager, reports, leave };
  }

  @Post("hr/employees")
  @RequirePermissions("hr.create")
  async createEmployee(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(employeeCreateSchema, body);
    if (input.salary !== undefined && !can(req.user, "hr.view_salary")) throw new ForbiddenException("Setting salary needs hr.view_salary");
    const data = profileData(input) as Omit<Prisma.EmployeeUncheckedCreateInput, "code" | "name">;
    const shiftId = data.shiftId ?? (await this.prisma.shift.findFirst({ where: { active: true }, orderBy: { createdAt: "asc" }, select: { id: true } }))?.id;
    const row = await guarded(
      this.prisma.$transaction(async (tx) => {
        const created = await tx.employee.create({ data: { ...data, code: input.code, name: input.name, status: "ONBOARDING", shiftId } });
        const tasks = await this.people.spawnTasks(tx, created.id, "ONBOARDING", created.joiningDate ?? new Date());
        await this.log(req, "create", "employee", created.id, undefined, { code: created.code, name: created.name, tasks }, tx);
        return created;
      }),
    );
    return employeeView(row, req.user);
  }

  @Patch("hr/employees/:id")
  @RequirePermissions("hr.edit")
  async updateEmployee(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(employeeProfileSchema, body);
    if (input.salary !== undefined && !can(req.user, "hr.view_salary")) throw new ForbiddenException("Changing salary needs hr.view_salary");
    if (input.managerId === id) throw new BadRequestException("An employee cannot report to themselves");
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Employee not found");
    const row = await guarded(this.prisma.employee.update({ where: { id }, data: profileData(input) }));
    const changed = Object.keys(input).filter((key) => input[key as keyof Profile] !== undefined);
    await this.log(req, "update", "employee", id, undefined, { fields: changed });
    return employeeView(row, req.user);
  }

  /** Full PAN / Aadhaar / account number for statutory filings; every reveal is audited. */
  @Post("hr/employees/:id/reveal")
  @RequirePermissions("hr.override")
  async reveal(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.employee.findUnique({ where: { id }, select: { panEnc: true, aadhaarEnc: true, bankAccountEnc: true } });
    if (!row) throw new NotFoundException("Employee not found");
    await this.log(req, "reveal_pii", "employee", id, undefined, { pan: Boolean(row.panEnc), aadhaar: Boolean(row.aadhaarEnc), bankAccount: Boolean(row.bankAccountEnc) });
    return { pan: row.panEnc ? unsealPii(row.panEnc) : null, aadhaar: row.aadhaarEnc ? unsealPii(row.aadhaarEnc) : null, bankAccount: row.bankAccountEnc ? unsealPii(row.bankAccountEnc) : null };
  }

  @Post("hr/employees/:id/activate")
  @RequirePermissions("hr.edit")
  async activate(@Param("id") id: string, @Req() req: ReqUser) {
    const result = await this.prisma.employee.updateMany({ where: { id, status: "ONBOARDING" }, data: { status: "ACTIVE", active: true } });
    if (!result.count) throw new BadRequestException("Only an onboarding employee can be activated");
    await this.workflow.record("employee", id, "ONBOARDING", "ACTIVE", req.user.id);
    await this.log(req, "activate", "employee", id, { status: "ONBOARDING" }, { status: "ACTIVE" });
    return this.prisma.employee.findUnique({ where: { id }, select: { id: true, status: true } });
  }

  @Post("hr/employees/:id/exit")
  @RequirePermissions("hr.edit")
  async startExit(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(exitSchema, body);
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException("Employee not found");
    if (!["ACTIVE", "ONBOARDING"].includes(employee.status)) throw new BadRequestException(`An employee in ${employee.status} cannot start an exit`);
    return this.prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data: { status: "NOTICE", resignationDate: asDate(input.resignationDate), lastWorkingDay: asDate(input.lastWorkingDay), exitReason: input.reason } });
      const tasks = await this.people.spawnTasks(tx, id, "EXIT", asDate(input.lastWorkingDay));
      await this.workflow.record("employee", id, employee.status, "NOTICE", req.user.id, input.reason, tx);
      await this.log(req, "exit", "employee", id, { status: employee.status }, { status: "NOTICE", lastWorkingDay: input.lastWorkingDay, tasks }, tx);
      return tx.employee.findUniqueOrThrow({ where: { id }, select: { id: true, status: true, lastWorkingDay: true } });
    });
  }

  @Post("hr/employees/:id/withdraw-exit")
  @RequirePermissions("hr.edit")
  async withdrawExit(@Param("id") id: string, @Req() req: ReqUser) {
    return this.prisma.$transaction(async (tx) => {
      const result = await tx.employee.updateMany({ where: { id, status: "NOTICE" }, data: { status: "ACTIVE", resignationDate: null, lastWorkingDay: null, exitReason: null } });
      if (!result.count) throw new BadRequestException("Employee is not serving notice");
      await tx.employeeTask.updateMany({ where: { employeeId: id, kind: "EXIT", status: "PENDING" }, data: { status: "NA", notes: "Exit withdrawn" } });
      await this.workflow.record("employee", id, "NOTICE", "ACTIVE", req.user.id, "Exit withdrawn", tx);
      await this.log(req, "withdraw_exit", "employee", id, { status: "NOTICE" }, { status: "ACTIVE" }, tx);
      return { id, status: "ACTIVE" };
    });
  }

  /** Final step of an exit: blocks while exit tasks are open or company assets are still assigned, unless forced with hr.override. */
  @Post("hr/employees/:id/relieve")
  @RequirePermissions("hr.approve")
  async relieve(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(relieveSchema, body ?? {});
    const employee = await this.prisma.employee.findUnique({ where: { id } });
    if (!employee) throw new NotFoundException("Employee not found");
    if (employee.status !== "NOTICE") throw new BadRequestException("Start the exit before relieving the employee");
    const [openTasks, assets] = await Promise.all([this.prisma.employeeTask.count({ where: { employeeId: id, kind: "EXIT", status: "PENDING" } }), this.prisma.assetItem.count({ where: { assignedEmployeeId: id } })]);
    if ((openTasks || assets) && !(input.force && can(req.user, "hr.override"))) {
      throw new BadRequestException(`${openTasks} exit task(s) open and ${assets} asset(s) still assigned`);
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.employee.update({ where: { id }, data: { status: "EXITED", active: false, lastWorkingDay: employee.lastWorkingDay ?? asDate(today()) } });
      if (employee.userId) await tx.user.update({ where: { id: employee.userId }, data: { active: false } });
      await this.workflow.record("employee", id, "NOTICE", "EXITED", req.user.id, input.force ? "Relieved with open items" : undefined, tx);
      await this.log(req, "relieve", "employee", id, { status: "NOTICE" }, { status: "EXITED", forced: input.force, openTasks, assets }, tx);
      return { id, status: "EXITED" };
    });
  }

  // ---------- Documents ----------

  @Post("hr/employees/:id/documents")
  @RequirePermissions("hr.edit")
  @UseInterceptors(FileInterceptor("file", uploadLimits(10 * MB)))
  async uploadDocument(@Param("id") id: string, @UploadedFile() file: Upload, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(documentSchema, body);
    const employee = await this.prisma.employee.findUnique({ where: { id }, select: { id: true } });
    if (!employee) throw new NotFoundException("Employee not found");
    const checked = await inspectUpload(file, DOCUMENT_FILE_KINDS, 10 * MB);
    const key = `hr/${id}/${randomUUID()}-${checked.fileName}`;
    await this.storage.put(key, file.buffer, checked.mimeType);
    const row = await this.prisma.employeeDocument.create({
      data: { employeeId: id, type: input.type, name: input.name, fileKey: key, fileName: checked.fileName, mimeType: checked.mimeType, size: file.size, expiresAt: input.expiresAt ? asDate(input.expiresAt) : null, uploadedById: req.user.id },
    });
    await this.log(req, "upload", "employee_document", row.id, undefined, { employeeId: id, type: row.type });
    return row;
  }

  @Get("hr/documents/:id/file")
  @RequirePermissions("hr.view")
  async documentFile(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    const row = await this.prisma.employeeDocument.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Document not found");
    await this.log(req, "download", "employee_document", id);
    await streamFile(res, this.storage, { storageKey: row.fileKey, mimeType: row.mimeType, fileName: row.fileName });
  }

  @Delete("hr/documents/:id")
  @RequirePermissions("hr.delete")
  async deleteDocument(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.employeeDocument.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Document not found");
    await this.prisma.employeeDocument.delete({ where: { id } });
    await this.storage.remove(row.fileKey).catch(() => undefined);
    await this.log(req, "delete", "employee_document", id, { employeeId: row.employeeId, type: row.type });
    return { deleted: true };
  }

  // ---------- Checklists ----------

  @Get("hr/checklists")
  @RequirePermissions("hr.view")
  checklists() {
    return this.prisma.checklistTemplate.findMany({ orderBy: [{ kind: "asc" }, { createdAt: "asc" }] });
  }

  @Post("hr/checklists")
  @RequirePermissions("hr.edit")
  async createChecklist(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(checklistTemplateSchema, body);
    const row = await this.prisma.checklistTemplate.create({ data: { kind: input.kind, name: input.name, active: input.active, items: input.items } });
    await this.log(req, "create", "checklist_template", row.id, undefined, { kind: row.kind, items: input.items.length });
    return row;
  }

  @Patch("hr/checklists/:id")
  @RequirePermissions("hr.edit")
  async updateChecklist(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(checklistTemplateSchema, body);
    const row = await this.prisma.checklistTemplate.update({ where: { id }, data: { kind: input.kind, name: input.name, active: input.active, items: input.items } }).catch(() => {
      throw new NotFoundException("Checklist not found");
    });
    await this.log(req, "update", "checklist_template", id, undefined, { items: input.items.length, active: input.active });
    return row;
  }

  @Get("hr/tasks")
  @RequirePermissions("hr.view")
  tasks(@Query() query: Record<string, unknown>) {
    const { status, employeeId } = parseBody(idQuery, query);
    return this.prisma.employeeTask.findMany({
      where: { status: status || "PENDING", ...(employeeId ? { employeeId } : {}) },
      include: { employee: { select: { id: true, name: true, code: true, status: true } } },
      orderBy: [{ dueDate: "asc" }, { sortOrder: "asc" }],
      take: LIST_LIMIT,
    });
  }

  @Patch("hr/tasks/:id")
  @RequirePermissions("hr.edit")
  async updateTask(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(taskUpdateSchema, body);
    const row = await this.prisma.employeeTask
      .update({ where: { id }, data: { status: input.status, notes: input.notes, completedById: input.status === "PENDING" ? null : req.user.id, completedAt: input.status === "PENDING" ? null : new Date() } })
      .catch(() => {
        throw new NotFoundException("Task not found");
      });
    await this.log(req, "update", "employee_task", id, undefined, { status: input.status });
    return row;
  }

  // ---------- Leave policies, holidays, shifts, roster ----------

  @Get("hr/leave-policies")
  @RequirePermissions("hr.view")
  leavePolicies() {
    return this.prisma.leavePolicy.findMany({ include: { types: { orderBy: { code: "asc" } }, branch: { select: { id: true, name: true } }, _count: { select: { employees: true } } }, orderBy: { createdAt: "asc" } });
  }

  private policyTypes(input: z.infer<typeof leavePolicySchema>) {
    const codes = input.types.map((type) => type.code);
    if (new Set(codes).size !== codes.length) throw new BadRequestException("Each leave type code can appear once");
    return input.types;
  }

  @Post("hr/leave-policies")
  @RequirePermissions("hr.edit")
  async createLeavePolicy(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(leavePolicySchema, body);
    const types = this.policyTypes(input);
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.leavePolicy.updateMany({ where: { isDefault: true, branchId: input.branchId || null }, data: { isDefault: false } });
      const row = await tx.leavePolicy.create({ data: { name: input.name, branchId: input.branchId || null, isDefault: input.isDefault, active: input.active, weeklyOffs: input.weeklyOffs, types: { create: types } }, include: { types: true } });
      await this.log(req, "create", "leave_policy", row.id, undefined, { name: row.name, types: types.map((type) => type.code) }, tx);
      return row;
    });
  }

  @Patch("hr/leave-policies/:id")
  @RequirePermissions("hr.edit")
  async updateLeavePolicy(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(leavePolicySchema, body);
    const types = this.policyTypes(input);
    const existing = await this.prisma.leavePolicy.findUnique({ where: { id }, include: { types: true } });
    if (!existing) throw new NotFoundException("Leave policy not found");
    return this.prisma.$transaction(async (tx) => {
      if (input.isDefault) await tx.leavePolicy.updateMany({ where: { isDefault: true, branchId: input.branchId || null, id: { not: id } }, data: { isDefault: false } });
      await tx.leavePolicy.update({ where: { id }, data: { name: input.name, branchId: input.branchId || null, isDefault: input.isDefault, active: input.active, weeklyOffs: input.weeklyOffs } });
      await tx.leaveType.deleteMany({ where: { policyId: id, code: { notIn: types.map((type) => type.code) } } });
      for (const type of types) await tx.leaveType.upsert({ where: { policyId_code: { policyId: id, code: type.code } }, update: type, create: { ...type, policyId: id } });
      await this.log(req, "update", "leave_policy", id, { types: existing.types.map((type) => type.code) }, { types: types.map((type) => type.code) }, tx);
      return tx.leavePolicy.findUniqueOrThrow({ where: { id }, include: { types: true } });
    });
  }

  @Get("hr/holidays")
  @RequirePermissions("hr.view")
  holidays(@Query("year") year: string) {
    const y = yearOf(year);
    return this.prisma.holiday.findMany({ where: { date: { gte: asDate(`${y}-01-01`), lte: asDate(`${y}-12-31`) } }, include: { branch: { select: { id: true, name: true } } }, orderBy: { date: "asc" } });
  }

  @Post("hr/holidays")
  @RequirePermissions("hr.edit")
  async createHoliday(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(holidaySchema, body);
    const branchId = input.branchId || null;
    const duplicate = await this.prisma.holiday.findFirst({ where: { date: asDate(input.date), branchId } });
    if (duplicate) throw new ConflictException(`${input.date} is already a holiday (${duplicate.name})`);
    const row = await guarded(this.prisma.holiday.create({ data: { date: asDate(input.date), name: input.name, branchId, optional: input.optional } }));
    await this.log(req, "create", "holiday", row.id, undefined, { date: input.date, name: row.name, branchId });
    if (input.date <= today()) await this.people.rebuild(null, input.date, input.date);
    return row;
  }

  @Delete("hr/holidays/:id")
  @RequirePermissions("hr.edit")
  async deleteHoliday(@Param("id") id: string, @Req() req: ReqUser) {
    const row = await this.prisma.holiday.findUnique({ where: { id } });
    if (!row) throw new NotFoundException("Holiday not found");
    await this.prisma.holiday.delete({ where: { id } });
    await this.log(req, "delete", "holiday", id, { date: dayKey(row.date), name: row.name });
    if (dayKey(row.date) <= today()) await this.people.rebuild(null, dayKey(row.date), dayKey(row.date));
    return { deleted: true };
  }

  @Get("hr/shifts")
  @RequirePermissions("hr.view")
  shifts() {
    return this.prisma.shift.findMany({ include: { _count: { select: { employees: true } } }, orderBy: { code: "asc" } });
  }

  @Post("hr/shifts")
  @RequirePermissions("hr.edit")
  async createShift(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(shiftSchema, body);
    const row = await guarded(this.prisma.shift.create({ data: input }));
    await this.log(req, "create", "shift", row.id, undefined, { code: row.code });
    return row;
  }

  @Patch("hr/shifts/:id")
  @RequirePermissions("hr.edit")
  async updateShift(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(shiftSchema, body);
    const row = await guarded(this.prisma.shift.update({ where: { id }, data: input }));
    await this.log(req, "update", "shift", id, undefined, { code: row.code, startTime: row.startTime, endTime: row.endTime });
    return row;
  }

  @Get("hr/roster")
  @RequirePermissions("hr.view")
  roster(@Query() query: Record<string, unknown>) {
    const range = parseBody(rangeSchema, query);
    return this.prisma.rosterEntry.findMany({ where: { day: { gte: asDate(range.fromDate), lte: asDate(range.toDate) } }, include: { shift: { select: { id: true, code: true, name: true } } }, take: 20_000 });
  }

  /** Assigns a shift (or a weekly off) to employees for a date range; neither clears the roster back to their default shift. */
  @Post("hr/roster")
  @RequirePermissions("hr.edit")
  async setRoster(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(rosterSchema, body);
    const days = eachDay(input.fromDate, input.toDate);
    if (days.length * input.employeeIds.length > 10_000) throw new BadRequestException("Roster at most 10,000 employee-days at a time");
    if (input.shiftId && !(await this.prisma.shift.findUnique({ where: { id: input.shiftId }, select: { id: true } }))) throw new BadRequestException("Shift not found");
    const where = { employeeId: { in: input.employeeIds }, day: { gte: asDate(input.fromDate), lte: asDate(input.toDate) } };
    await this.prisma.$transaction(async (tx) => {
      await tx.rosterEntry.deleteMany({ where });
      if (input.shiftId || input.off) {
        await tx.rosterEntry.createMany({ data: input.employeeIds.flatMap((employeeId) => days.map((day) => ({ employeeId, day: asDate(day), shiftId: input.shiftId || null, off: input.off }))) });
      }
      await this.log(req, "roster", "roster", input.fromDate, undefined, { employees: input.employeeIds.length, days: days.length, shiftId: input.shiftId, off: input.off }, tx);
    });
    if (input.fromDate <= today()) await this.people.rebuild(input.employeeIds, input.fromDate, input.toDate);
    return { entries: input.shiftId || input.off ? days.length * input.employeeIds.length : 0 };
  }

  // ---------- Attendance ----------

  @Get("hr/attendance")
  @RequirePermissions("hr.view")
  attendanceList(@Query() query: Record<string, unknown>) {
    const range = parseBody(rangeSchema, query);
    const { employeeId } = parseBody(idQuery, query);
    return this.people.attendanceRange(employeeId ? [employeeId] : null, range.fromDate, range.toDate);
  }

  @Post("hr/attendance")
  @RequirePermissions("hr.edit")
  async attendance(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(attendanceEntrySchema, body);
    if (input.day > today()) throw new BadRequestException("Attendance cannot be marked for a future date");
    const row = await this.people.writePunch(input.employeeId, input.day, punchTimes(input.day, input.checkIn || undefined, input.checkOut || undefined), "MANUAL", { notes: input.notes }, can(req.user, "hr.override"));
    await this.log(req, "upsert", "attendance", row?.id || input.employeeId, undefined, { employeeId: input.employeeId, day: input.day, checkIn: input.checkIn, checkOut: input.checkOut });
    return row;
  }

  @Post("hr/attendance/import")
  @RequirePermissions("hr.edit")
  @UseInterceptors(FileInterceptor("file", uploadLimits(10 * MB)))
  async importBiometric(@UploadedFile() file: Upload, @Req() req: ReqUser) {
    if (!file?.buffer?.length) throw new BadRequestException("Choose the biometric export (CSV or Excel)");
    const head = file.buffer.subarray(0, 4).toString("latin1");
    let rows: unknown[][];
    if (head.startsWith("PK")) rows = await readXlsx(file.buffer, 100_000);
    else {
      const text = file.buffer.toString("utf8").replace(/^\uFEFF/, "");
      const sample = text.split("\n").slice(0, 30).join("\n");
      const separator = (sample.match(/\t/g) || []).length > (sample.match(/,/g) || []).length ? "\t" : (sample.match(/;/g) || []).length > (sample.match(/,/g) || []).length ? ";" : undefined;
      rows = parseCsv(text, separator);
    }
    const parsed = parseBiometric(rows, parseBankDate);
    if (!parsed.days.length) throw new BadRequestException(parsed.warnings[0] || "No attendance rows found");
    const employees = await this.prisma.employee.findMany({ select: { id: true, code: true } });
    const byCode = new Map(employees.map((row) => [row.code.toUpperCase(), row.id]));
    const unknown = new Set<string>();
    const latest = today();
    const touched = new Set<string>();
    let from = latest;
    let to = "0000-00-00";
    let written = 0;
    let locked = 0;
    for (const day of parsed.days) {
      const employeeId = byCode.get(day.code.toUpperCase());
      if (!employeeId) {
        unknown.add(day.code);
        continue;
      }
      if (day.day > latest) continue;
      const existing = await this.prisma.attendance.findUnique({ where: { employeeId_day: { employeeId, day: asDate(day.day) } } });
      if (existing?.locked) {
        locked++;
        continue;
      }
      const data = { checkIn: day.checkIn ?? existing?.checkIn ?? null, checkOut: day.checkOut ?? existing?.checkOut ?? null, source: "BIOMETRIC" };
      if (existing) await this.prisma.attendance.update({ where: { id: existing.id }, data });
      else await this.prisma.attendance.create({ data: { employeeId, day: asDate(day.day), ...data } });
      touched.add(employeeId);
      if (day.day < from) from = day.day;
      if (day.day > to) to = day.day;
      written++;
    }
    if (touched.size) {
      if ((asDate(to).getTime() - asDate(from).getTime()) / 86_400_000 > 92) throw new BadRequestException("Import at most 3 months of punches at a time");
      await this.people.rebuild([...touched], from, to);
    }
    const warnings = [...parsed.warnings];
    if (unknown.size) warnings.push(`Unknown employee codes: ${[...unknown].slice(0, 20).join(", ")}${unknown.size > 20 ? "…" : ""}`);
    if (locked) warnings.push(`${locked} day(s) skipped because payroll is locked`);
    await this.log(req, "import", "attendance", from, undefined, { file: file.originalname, written, employees: touched.size, unknown: unknown.size });
    return { written, employees: touched.size, fromDate: touched.size ? from : null, toDate: touched.size ? to : null, warnings };
  }

  @Post("hr/attendance/build")
  @RequirePermissions("hr.edit")
  async build(@Body() body: unknown, @Req() req: ReqUser) {
    const range = parseBody(rangeSchema, body);
    const result = await this.people.rebuild(null, range.fromDate, range.toDate);
    await this.log(req, "build", "attendance", range.fromDate, undefined, { ...range, ...result });
    return result;
  }

  @Post("hr/attendance/lock")
  @RequirePermissions("hr.approve")
  async lock(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(lockSchema, body);
    if (!input.locked && !can(req.user, "hr.override")) throw new ForbiddenException("Unlocking attendance needs hr.override");
    const result = await this.prisma.attendance.updateMany({ where: { day: { gte: asDate(input.fromDate), lte: asDate(input.toDate) } }, data: { locked: input.locked } });
    await this.log(req, input.locked ? "lock" : "unlock", "attendance", input.fromDate, undefined, { ...input, rows: result.count });
    return { rows: result.count };
  }

  @Get("hr/attendance/corrections")
  @RequirePermissions("hr.view")
  corrections(@Query() query: Record<string, unknown>) {
    const { status } = parseBody(idQuery, query);
    return this.prisma.attendanceCorrection.findMany({ where: { status: status || "PENDING" }, include: { employee: { select: { id: true, name: true, code: true } } }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT });
  }

  @Post("hr/attendance/corrections/:id/decide")
  @RequirePermissions("hr.approve")
  decideCorrection(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    return this.people.decideCorrection(id, parseBody(decisionSchema, body), req.user, req.ip);
  }

  // ---------- Leave ----------

  @Get("hr/leave")
  @RequirePermissions("hr.view")
  leave(@Query() query: Record<string, unknown>) {
    const { status, employeeId } = parseBody(idQuery, query);
    return this.prisma.leaveRequest.findMany({
      where: { ...(status ? { status } : {}), ...(employeeId ? { employeeId } : {}) },
      include: { employee: { select: { id: true, name: true, code: true } } },
      orderBy: { createdAt: "desc" },
      take: LIST_LIMIT,
    });
  }

  @Post("hr/leave")
  @RequirePermissions("hr.create")
  createLeave(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(leaveApplySchema, body);
    if (!input.employeeId) throw new BadRequestException("Choose the employee");
    return this.people.applyLeave(input.employeeId, input, req.user, true);
  }

  @Post("hr/leave/:id/decide")
  @RequirePermissions("hr.approve")
  decideLeave(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    return this.people.decideLeave(id, parseBody(decisionSchema, body), req.user, req.ip);
  }

  @Post("hr/leave/:id/cancel")
  @RequirePermissions("hr.edit")
  cancelLeave(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    return this.people.cancelLeave(id, req.user, false, parseBody(cancelSchema, body ?? {}).reason);
  }

  @Get("hr/leave/balances")
  @RequirePermissions("hr.view")
  balances(@Query("year") year: string) {
    return this.people.leaveSummary(null, yearOf(year));
  }

  @Post("hr/leave/balances")
  @RequirePermissions("hr.edit")
  async adjustBalance(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(leaveAdjustSchema, body);
    const before = await this.prisma.leaveBalance.findUnique({ where: { employeeId_year_type: { employeeId: input.employeeId, year: input.year, type: input.type } } });
    const data = { opening: input.opening, adjusted: input.adjusted, note: input.note };
    const row = await guarded(
      this.prisma.leaveBalance.upsert({ where: { employeeId_year_type: { employeeId: input.employeeId, year: input.year, type: input.type } }, update: data, create: { employeeId: input.employeeId, year: input.year, type: input.type, ...data } }),
    );
    await this.log(req, "adjust", "leave_balance", row.id, before ? { opening: before.opening, adjusted: before.adjusted } : undefined, { opening: row.opening, adjusted: row.adjusted, note: input.note });
    return row;
  }

  /** Carries each closing balance into next year's opening, capped by the type's carry-forward limit. */
  @Post("hr/leave/year-end")
  @RequirePermissions("hr.approve")
  async yearEnd(@Body() body: unknown, @Req() req: ReqUser) {
    const { year } = parseBody(yearEndSchema, body);
    const policies = await this.people.policies();
    const summary = await this.people.leaveSummary(null, year);
    const employees = await this.prisma.employee.findMany({ where: { id: { in: summary.map((row) => row.employee.id) } }, select: { id: true, branchId: true, leavePolicyId: true } });
    let carried = 0;
    const lapsed: Array<{ employeeId: string; type: string; days: number; encashable: boolean }> = [];
    await this.prisma.$transaction(async (tx) => {
      for (const row of summary) {
        const employee = employees.find((item) => item.id === row.employee.id);
        const policy = employee ? this.people.policyFor(employee, policies) : null;
        for (const type of row.types) {
          const rule = policy?.types.find((item) => item.code === type.code);
          if (!rule) continue;
          const opening = carryForward(type.balance, num(rule.carryForwardMax));
          const excess = round2(Math.max(0, type.balance - opening));
          if (excess) lapsed.push({ employeeId: row.employee.id, type: type.code, days: excess, encashable: rule.encashable });
          if (!opening) continue;
          await tx.leaveBalance.upsert({
            where: { employeeId_year_type: { employeeId: row.employee.id, year: year + 1, type: type.code } },
            update: { opening, note: `Carried forward from ${year}` },
            create: { employeeId: row.employee.id, year: year + 1, type: type.code, opening, note: `Carried forward from ${year}` },
          });
          carried++;
        }
      }
      await this.log(req, "year_end", "leave_balance", String(year), undefined, { carried, lapsed: lapsed.length }, tx);
    }, { timeout: 120_000 });
    return { carried, lapsed };
  }

  // ---------- Assets ----------

  @Get("hr/assets")
  @RequirePermissions("hr.view")
  assets() {
    return this.prisma.assetItem.findMany({ include: { employee: { select: { id: true, name: true, code: true } } }, orderBy: { code: "asc" }, take: 5000 });
  }

  @Post("hr/assets")
  @RequirePermissions("hr.create")
  async createAsset(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(assetCreateSchema, body);
    const row = await guarded(
      this.prisma.assetItem.create({
        data: { code: input.code, name: input.name, category: input.category || null, serialNo: input.serialNo || null, assignedEmployeeId: input.assignedEmployeeId, assignedAt: input.assignedEmployeeId ? new Date() : null, status: input.assignedEmployeeId ? "ASSIGNED" : "AVAILABLE" },
      }),
    );
    await this.log(req, "create", "asset", row.id, undefined, { code: row.code });
    return row;
  }

  @Post("hr/assets/:id/assign")
  @RequirePermissions("hr.edit")
  async assignAsset(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(assignSchema, body);
    const before = await this.prisma.assetItem.findUnique({ where: { id } });
    if (!before) throw new NotFoundException("Asset not found");
    const row = await guarded(
      this.prisma.assetItem.update({ where: { id }, data: { assignedEmployeeId: input.employeeId, assignedAt: input.employeeId ? new Date() : null, status: input.employeeId ? "ASSIGNED" : "AVAILABLE", notes: input.notes } }),
    );
    await this.log(req, input.employeeId ? "assign" : "return", "asset", id, { employeeId: before.assignedEmployeeId }, { employeeId: input.employeeId });
    return row;
  }

  // ---------- Performance ----------

  @Get("hr/appraisal-cycles")
  @RequirePermissions("hr.view")
  cycles() {
    return this.prisma.appraisalCycle.findMany({ include: { _count: { select: { appraisals: true, goals: true } } }, orderBy: { startDate: "desc" } });
  }

  @Post("hr/appraisal-cycles")
  @RequirePermissions("hr.edit")
  async createCycle(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(appraisalCycleSchema, body);
    if (input.endDate < input.startDate) throw new BadRequestException("Cycle ends before it starts");
    const row = await this.prisma.appraisalCycle.create({
      data: { name: input.name, startDate: asDate(input.startDate), endDate: asDate(input.endDate), selfDue: input.selfDue ? asDate(input.selfDue) : null, managerDue: input.managerDue ? asDate(input.managerDue) : null },
    });
    await this.log(req, "create", "appraisal_cycle", row.id, undefined, { name: row.name });
    return row;
  }

  @Post("hr/appraisal-cycles/:id/open")
  @RequirePermissions("hr.approve")
  async openCycle(@Param("id") id: string, @Req() req: ReqUser) {
    const cycle = await this.prisma.appraisalCycle.findUnique({ where: { id } });
    if (!cycle) throw new NotFoundException("Cycle not found");
    if (cycle.status === "CLOSED") throw new BadRequestException("This cycle is closed");
    const employees = await this.prisma.employee.findMany({ where: { status: { in: ["ACTIVE", "NOTICE"] }, OR: [{ joiningDate: null }, { joiningDate: { lte: cycle.endDate } }] }, select: { id: true } });
    const result = await this.prisma.appraisal.createMany({ data: employees.map((row) => ({ cycleId: id, employeeId: row.id })), skipDuplicates: true });
    await this.prisma.appraisalCycle.update({ where: { id }, data: { status: "OPEN" } });
    await this.log(req, "open", "appraisal_cycle", id, { status: cycle.status }, { status: "OPEN", appraisals: result.count });
    return { opened: result.count };
  }

  @Post("hr/appraisal-cycles/:id/close")
  @RequirePermissions("hr.approve")
  async closeCycle(@Param("id") id: string, @Req() req: ReqUser) {
    const result = await this.prisma.appraisalCycle.updateMany({ where: { id, status: "OPEN" }, data: { status: "CLOSED" } });
    if (!result.count) throw new BadRequestException("Only an open cycle can be closed");
    await this.log(req, "close", "appraisal_cycle", id, { status: "OPEN" }, { status: "CLOSED" });
    return { closed: true };
  }

  @Get("hr/appraisals")
  @RequirePermissions("hr.view")
  appraisals(@Query() query: Record<string, unknown>) {
    const { cycleId } = parseBody(idQuery, query);
    return this.prisma.appraisal.findMany({ where: cycleId ? { cycleId } : undefined, include: { employee: { select: { id: true, name: true, code: true, managerId: true } }, cycle: { select: { id: true, name: true, status: true } } }, take: 5000 });
  }

  @Get("hr/goals")
  @RequirePermissions("hr.view")
  goals(@Query() query: Record<string, unknown>) {
    const { employeeId, cycleId } = parseBody(idQuery, query);
    return this.prisma.goal.findMany({ where: { ...(employeeId ? { employeeId } : {}), ...(cycleId ? { cycleId } : {}) }, include: { employee: { select: { id: true, name: true, code: true } } }, orderBy: { createdAt: "desc" }, take: LIST_LIMIT });
  }

  @Post("hr/goals")
  @RequirePermissions("hr.edit")
  async createGoal(@Body() body: unknown, @Req() req: ReqUser) {
    const input = parseBody(goalSchema, body);
    if (!input.employeeId) throw new BadRequestException("Choose the employee");
    const row = await guarded(this.prisma.goal.create({ data: { ...input, employeeId: input.employeeId, cycleId: input.cycleId || null } }));
    await this.log(req, "create", "goal", row.id, undefined, { employeeId: row.employeeId, title: row.title });
    return row;
  }

  /** Manager (or HR) review; no permission decorator because line managers usually hold no HR role. */
  @Post("appraisals/:id/review")
  review(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    return this.people.review(id, parseBody(appraisalReviewSchema, body), req.user);
  }
}

/** Employee self-service. Any staff user linked to an employee record; no HR permissions required. */
@Controller("me")
export class SelfServiceController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
    private readonly audit: AuditService,
    private readonly numbers: NumberService,
    private readonly storage: StorageService,
  ) {}

  private async me(req: ReqUser) {
    assertStaff(req.user);
    return this.people.self(req.user.id);
  }

  @Get("employee")
  async profile(@Req() req: ReqUser) {
    const me = await this.me(req);
    const row = await this.prisma.employee.findUniqueOrThrow({
      where: { id: me.id },
      include: { department: true, branch: true, shift: true, leavePolicy: { include: { types: true } }, documents: { orderBy: { createdAt: "desc" } }, assets: true },
    });
    const manager = row.managerId ? await this.prisma.employee.findUnique({ where: { id: row.managerId }, select: { id: true, name: true, code: true } }) : null;
    const { salary, ...rest } = employeeView(row, req.user);
    void salary;
    return { ...rest, manager };
  }

  @Patch("employee")
  async updateProfile(@Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(selfProfileSchema, body);
    const text = (value?: string) => (value === undefined ? undefined : value || null);
    await this.prisma.employee.update({ where: { id: me.id }, data: { phone: text(input.phone), personalEmail: text(input.personalEmail), address: text(input.address), emergencyContact: text(input.emergencyContact) } });
    await this.audit.log({ actorId: req.user.id, action: "self_update", entityType: "employee", entityId: me.id, after: { fields: Object.keys(input) }, ip: req.ip });
    return this.profile(req);
  }

  @Get("documents/:id/file")
  async documentFile(@Param("id") id: string, @Req() req: ReqUser, @Res() res: Response) {
    const me = await this.me(req);
    const row = await this.prisma.employeeDocument.findFirst({ where: { id, employeeId: me.id } });
    if (!row) throw new NotFoundException("Document not found");
    await streamFile(res, this.storage, { storageKey: row.fileKey, mimeType: row.mimeType, fileName: row.fileName });
  }

  @Get("leave")
  async leave(@Req() req: ReqUser, @Query("year") year: string) {
    const me = await this.me(req);
    const y = yearOf(year);
    const [requests, [summary], holidays] = await Promise.all([
      this.prisma.leaveRequest.findMany({ where: { employeeId: me.id, fromDate: { gte: asDate(`${y}-01-01`), lt: asDate(`${y + 1}-01-01`) } }, orderBy: { fromDate: "desc" } }),
      this.people.leaveSummary([me.id], y),
      this.prisma.holiday.findMany({ where: { date: { gte: asDate(`${y}-01-01`), lte: asDate(`${y}-12-31`) }, OR: [{ branchId: null }, ...(me.branchId ? [{ branchId: me.branchId }] : [])] }, orderBy: { date: "asc" } }),
    ]);
    return { requests, balances: summary?.types || [], policy: summary?.policy || null, holidays };
  }

  @Post("leave")
  async applyLeave(@Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    return this.people.applyLeave(me.id, { ...parseBody(leaveApplySchema, body), employeeId: me.id }, req.user, false);
  }

  @Post("leave/:id/cancel")
  async cancelLeave(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    await this.me(req);
    return this.people.cancelLeave(id, req.user, true, parseBody(cancelSchema, body ?? {}).reason);
  }

  @Get("attendance")
  async attendance(@Req() req: ReqUser, @Query() query: Record<string, unknown>) {
    const me = await this.me(req);
    const range = parseBody(rangeSchema, query);
    const [rows, corrections] = await Promise.all([
      this.people.attendanceRange([me.id], range.fromDate, range.toDate),
      this.prisma.attendanceCorrection.findMany({ where: { employeeId: me.id, day: { gte: asDate(range.fromDate), lte: asDate(range.toDate) } }, orderBy: { createdAt: "desc" } }),
    ]);
    return { rows, corrections };
  }

  /** Web/mobile punch: first call checks in, later calls move the check-out forward. */
  @Post("attendance/punch")
  async punch(@Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(punchSchema, body ?? {});
    const now = new Date();
    const day = localDay(now);
    const existing = await this.prisma.attendance.findUnique({ where: { employeeId_day: { employeeId: me.id, day: asDate(day) } } });
    const times = existing?.checkIn ? { checkOut: now } : { checkIn: now };
    const row = await this.people.writePunch(me.id, day, times, existing?.source && !AUTO_SOURCES.has(existing.source) ? existing.source : "SELF", { latitude: input.latitude, longitude: input.longitude });
    await this.audit.log({ actorId: req.user.id, action: existing?.checkIn ? "punch_out" : "punch_in", entityType: "attendance", entityId: row?.id || me.id, after: { day, latitude: input.latitude, longitude: input.longitude }, ip: req.ip });
    return row;
  }

  @Post("attendance/corrections")
  async requestCorrection(@Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(correctionSchema, body);
    if (input.day > today()) throw new BadRequestException("You cannot regularize a future date");
    if (!input.checkIn && !input.checkOut) throw new BadRequestException("Give the correct check-in and/or check-out time");
    const locked = await this.prisma.attendance.findFirst({ where: { employeeId: me.id, day: asDate(input.day), locked: true }, select: { id: true } });
    if (locked) throw new BadRequestException("Payroll for this date is already processed");
    const pending = await this.prisma.attendanceCorrection.findFirst({ where: { employeeId: me.id, day: asDate(input.day), status: "PENDING" }, select: { id: true } });
    if (pending) throw new ConflictException("A correction for this date is already pending");
    const times = punchTimes(input.day, input.checkIn || undefined, input.checkOut || undefined);
    const row = await this.prisma.attendanceCorrection.create({ data: { employeeId: me.id, day: asDate(input.day), checkIn: times.checkIn, checkOut: times.checkOut, reason: input.reason } });
    await this.audit.log({ actorId: req.user.id, action: "request", entityType: "attendance_correction", entityId: row.id, after: { day: input.day }, ip: req.ip });
    return row;
  }

  @Get("expenses")
  async expenses(@Req() req: ReqUser) {
    const me = await this.me(req);
    return this.prisma.expense.findMany({ where: { employeeId: me.id }, orderBy: { createdAt: "desc" }, take: 200 });
  }

  @Post("expenses")
  async createExpense(@Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(expenseSchema, body);
    return this.people.createExpense(me.id, { ...input, employeeId: undefined }, req.user.id, this.numbers);
  }

  @Get("goals")
  async goals(@Req() req: ReqUser) {
    const me = await this.me(req);
    const [goals, appraisals] = await Promise.all([
      this.prisma.goal.findMany({ where: { employeeId: me.id }, include: { cycle: { select: { id: true, name: true } } }, orderBy: { createdAt: "desc" } }),
      this.prisma.appraisal.findMany({ where: { employeeId: me.id }, include: { cycle: true }, orderBy: { cycle: { startDate: "desc" } } }),
    ]);
    return { goals, appraisals };
  }

  @Post("goals")
  async createGoal(@Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(goalSchema, body);
    return guarded(this.prisma.goal.create({ data: { ...input, employeeId: me.id, cycleId: input.cycleId || null } }));
  }

  @Patch("goals/:id")
  async updateGoal(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(goalUpdateSchema, body);
    const goal = await this.prisma.goal.findUnique({ where: { id }, include: { employee: { select: { managerId: true } } } });
    if (!goal || (goal.employeeId !== me.id && goal.employee.managerId !== me.id)) throw new NotFoundException("Goal not found");
    return this.prisma.goal.update({ where: { id }, data: { ...input, cycleId: input.cycleId === undefined ? undefined : input.cycleId || null } });
  }

  @Post("appraisals/:id/self")
  async selfReview(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(appraisalReviewSchema, body);
    const appraisal = await this.prisma.appraisal.findFirst({ where: { id, employeeId: me.id }, include: { cycle: true } });
    if (!appraisal) throw new NotFoundException("Appraisal not found");
    if (appraisal.cycle.status !== "OPEN" || appraisal.status !== "SELF") throw new BadRequestException("Self review is not open for this appraisal");
    return this.prisma.appraisal.update({ where: { id }, data: { selfRating: input.rating, selfComments: input.comments, status: "MANAGER" } });
  }

  // ---------- Manager views ----------

  @Get("team")
  async team(@Req() req: ReqUser) {
    const me = await this.me(req);
    const reports = await this.prisma.employee.findMany({ where: { managerId: me.id, status: { in: IN_SERVICE } }, select: { id: true, code: true, name: true, designation: true, status: true }, orderBy: { name: "asc" } });
    const ids = reports.map((row) => row.id);
    const [attendance, leave, corrections, appraisals] = await Promise.all([
      this.prisma.attendance.findMany({ where: { employeeId: { in: ids }, day: asDate(today()) } }),
      this.prisma.leaveRequest.findMany({ where: { employeeId: { in: ids }, status: "PENDING" }, include: { employee: { select: { id: true, name: true, code: true } } }, orderBy: { fromDate: "asc" } }),
      this.prisma.attendanceCorrection.findMany({ where: { employeeId: { in: ids }, status: "PENDING" }, include: { employee: { select: { id: true, name: true, code: true } } }, orderBy: { day: "asc" } }),
      this.prisma.appraisal.findMany({ where: { employeeId: { in: ids }, status: "MANAGER", cycle: { status: "OPEN" } }, include: { employee: { select: { id: true, name: true, code: true } }, cycle: { select: { id: true, name: true } } } }),
    ]);
    return { reports: reports.map((row) => ({ ...row, today: attendance.find((item) => item.employeeId === row.id) || null })), leave, corrections, appraisals };
  }

  @Post("team/leave/:id/decide")
  decideLeave(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    return this.people.decideLeave(id, parseBody(decisionSchema, body), req.user, req.ip);
  }

  @Post("team/corrections/:id/decide")
  decideCorrection(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    return this.people.decideCorrection(id, parseBody(decisionSchema, body), req.user, req.ip);
  }

  @Post("team/appraisals/:id/review")
  review(@Param("id") id: string, @Body() body: unknown, @Req() req: ReqUser) {
    return this.people.review(id, parseBody(appraisalReviewSchema, body), req.user);
  }

  @Post("team/goals")
  async teamGoal(@Body() body: unknown, @Req() req: ReqUser) {
    const me = await this.me(req);
    const input = parseBody(goalSchema, body);
    const report = input.employeeId ? await this.prisma.employee.findFirst({ where: { id: input.employeeId, managerId: me.id }, select: { id: true } }) : null;
    if (!report) throw new ForbiddenException("You can set goals only for your direct reports");
    return guarded(this.prisma.goal.create({ data: { ...input, employeeId: report.id, cycleId: input.cycleId || null } }));
  }
}
