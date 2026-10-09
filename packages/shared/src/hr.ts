import { z } from "zod";
import { round2 } from "./finance";

/** Company local time (IST). Attendance days and shift times are local; timestamps are stored in UTC. */
export const LOCAL_OFFSET_MINUTES = 330;

export const EMPLOYEE_STATUSES = ["ONBOARDING", "ACTIVE", "NOTICE", "EXITED"] as const;
export const EMPLOYMENT_TYPES = ["PERMANENT", "PROBATION", "CONTRACT", "INTERN", "CONSULTANT", "WORKER"] as const;
export const ATTENDANCE_STATUSES = ["PRESENT", "HALF_DAY", "ABSENT", "LEAVE", "HOLIDAY", "WEEKLY_OFF", "MISS_PUNCH", "ON_DUTY"] as const;
export const ATTENDANCE_SOURCES = ["SYSTEM", "MANUAL", "BIOMETRIC", "SELF", "SITE", "SHOPFLOOR", "REGULARIZED"] as const;
export const DOCUMENT_TYPES = ["OFFER_LETTER", "APPOINTMENT", "ID_PROOF", "ADDRESS_PROOF", "PAN", "AADHAAR", "BANK_PROOF", "EDUCATION", "EXPERIENCE", "RELIEVING", "OTHER"] as const;
export const TASK_OWNERS = ["HR", "IT", "ADMIN", "MANAGER", "FINANCE", "EMPLOYEE"] as const;

// ---------- Identity numbers ----------

const VERHOEFF_D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VERHOEFF_P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
const VERHOEFF_INV = [0, 4, 3, 2, 1, 5, 6, 7, 8, 9];

export function verhoeffCheckDigit(digits: string) {
  let check = 0;
  [...digits].reverse().forEach((digit, index) => {
    check = VERHOEFF_D[check][VERHOEFF_P[(index + 1) % 8][Number(digit)]];
  });
  return VERHOEFF_INV[check];
}

/** 12 digits, first digit 2-9, Verhoeff checksum (UIDAI). */
export function isValidAadhaar(value?: string | null) {
  const digits = String(value || "").replace(/\s/g, "");
  if (!/^[2-9]\d{11}$/.test(digits)) return false;
  let check = 0;
  [...digits].reverse().forEach((digit, index) => {
    check = VERHOEFF_D[check][VERHOEFF_P[index % 8][Number(digit)]];
  });
  return check === 0;
}

export const isValidPan = (value?: string | null) => /^[A-Z]{5}\d{4}[A-Z]$/.test(String(value || "").toUpperCase());
export const isValidIfsc = (value?: string | null) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(String(value || "").toUpperCase());
export const isValidUan = (value?: string | null) => /^\d{12}$/.test(String(value || ""));
export const isValidEsic = (value?: string | null) => /^\d{10}(\d{7})?$/.test(String(value || ""));

export const maskAadhaar = (value: string) => `XXXX XXXX ${value.replace(/\s/g, "").slice(-4)}`;
export const maskPan = (value: string) => `${value.slice(0, 2)}XXX${value.slice(5, 9)}${value.slice(-1)}`.toUpperCase();
export const maskAccount = (value: string) => `${"X".repeat(Math.max(0, value.length - 4))}${value.slice(-4)}`;

// ---------- Dates ----------

export const dayKey = (date: Date) => date.toISOString().slice(0, 10);
/** Local calendar day of an instant. */
export const localDay = (at: Date, offset = LOCAL_OFFSET_MINUTES) => dayKey(new Date(at.getTime() + offset * 60_000));
/** "2026-09-05" + "09:30" local → UTC instant. */
export function localInstant(day: string, time: string, offset = LOCAL_OFFSET_MINUTES) {
  const [h, m] = parseClock(time) ?? [0, 0];
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d, h, m) - offset * 60_000);
}

/** "9:05", "09:05:33", "9:05 PM", "2105" → [hours, minutes]. */
export function parseClock(value: unknown): [number, number] | null {
  const text = String(value ?? "").trim().toUpperCase();
  const iso = /^\d{4}-\d{2}-\d{2}T(\d{2}):(\d{2})/.exec(text);
  if (iso) return [Number(iso[1]), Number(iso[2])];
  const match = /^(\d{1,2})[:.](\d{2})(?::\d{2})?\s*(AM|PM)?$/.exec(text) || /^(\d{2})(\d{2})$/.exec(text);
  if (!match) return null;
  let hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (match[3] === "PM" && hours < 12) hours += 12;
  if (match[3] === "AM" && hours === 12) hours = 0;
  if (hours > 23 || minutes > 59) return null;
  return [hours, minutes];
}

export function eachDay(from: string, to: string) {
  const days: string[] = [];
  for (let at = Date.parse(`${from}T00:00:00Z`), end = Date.parse(`${to}T00:00:00Z`); at <= end && days.length < 400; at += 86_400_000) days.push(dayKey(new Date(at)));
  return days;
}

// ---------- Leave ----------

export type LeaveTypeRule = { code: string; annualQuota: number; accrual: string; carryForwardMax: number; paid: boolean; allowHalfDay: boolean; allowNegative: boolean; countOffs?: boolean };

/** Working days in a leave: weekly offs and holidays are skipped unless the type counts them (e.g. maternity). */
export function leaveDays(from: string, to: string, options: { halfDay?: boolean; holidays?: Set<string>; weeklyOffs?: number[]; countOffs?: boolean } = {}) {
  if (options.halfDay) return from === to ? 0.5 : NaN;
  let days = 0;
  for (const day of eachDay(from, to)) {
    const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (!options.countOffs && ((options.weeklyOffs || [0]).includes(weekday) || options.holidays?.has(day))) continue;
    days++;
  }
  return days;
}

/**
 * Entitlement earned in a calendar leave year by `asOf`. YEARLY credits the full (pro-rated) quota on 1 Jan or on joining;
 * MONTHLY credits 1/12 at the start of each month. Joining after the 15th starts accrual the next month.
 */
export function accruedLeave(type: Pick<LeaveTypeRule, "annualQuota" | "accrual">, year: number, asOf: Date, joiningDate?: Date | null) {
  if (type.accrual === "NONE" || !type.annualQuota) return 0;
  const yearStart = new Date(Date.UTC(year, 0, 1));
  if (asOf < yearStart) return 0;
  let startMonth = 0;
  if (joiningDate && joiningDate > yearStart) {
    if (joiningDate.getUTCFullYear() > year) return 0;
    startMonth = joiningDate.getUTCMonth() + (joiningDate.getUTCDate() > 15 ? 1 : 0);
    if (startMonth > 11) return 0;
  }
  if (type.accrual === "YEARLY") return round2((type.annualQuota * (12 - startMonth)) / 12);
  const asOfMonth = asOf.getUTCFullYear() > year ? 11 : asOf.getUTCMonth();
  const months = Math.max(0, asOfMonth - startMonth + 1);
  return round2((type.annualQuota / 12) * Math.min(months, 12 - startMonth));
}

export function leaveBalance(input: { opening: number; accrued: number; adjusted: number; used: number; encashed?: number; pending?: number }) {
  const balance = round2(input.opening + input.accrued + input.adjusted - input.used - (input.encashed || 0));
  return { balance, available: round2(balance - (input.pending || 0)) };
}

export const carryForward = (closing: number, max: number) => round2(Math.max(0, Math.min(closing, max)));

// ---------- Attendance ----------

export type ShiftRule = { startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; halfDayHours: number; fullDayHours: number };

/** Status, worked time, lateness and overtime for one employee-day. */
export function evaluateDay(input: { day: string; shift: ShiftRule | null; checkIn?: Date | null; checkOut?: Date | null; holiday?: boolean; weeklyOff?: boolean; leave?: "FULL" | "HALF" | null; onDuty?: boolean }) {
  const shift = input.shift || { startTime: "09:30", endTime: "18:30", breakMinutes: 60, graceMinutes: 15, halfDayHours: 4, fullDayHours: 8 };
  const off = input.holiday || input.weeklyOff;
  if (!input.checkIn && !input.checkOut) {
    const status = input.leave === "FULL" ? "LEAVE" : input.onDuty ? "ON_DUTY" : input.holiday ? "HOLIDAY" : input.weeklyOff ? "WEEKLY_OFF" : input.leave === "HALF" ? "HALF_DAY" : "ABSENT";
    return { status, workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0 };
  }
  if (!input.checkIn || !input.checkOut || input.checkOut <= input.checkIn) return { status: off ? (input.holiday ? "HOLIDAY" : "WEEKLY_OFF") : "MISS_PUNCH", workedMinutes: 0, lateMinutes: 0, overtimeMinutes: 0 };
  const span = Math.round((input.checkOut.getTime() - input.checkIn.getTime()) / 60_000);
  const worked = Math.max(0, span - (span > 300 ? shift.breakMinutes : 0));
  const start = localInstant(input.day, shift.startTime);
  const late = Math.round((input.checkIn.getTime() - start.getTime()) / 60_000);
  const lateMinutes = !off && late > shift.graceMinutes ? late : 0;
  const full = shift.fullDayHours * 60;
  if (off) return { status: "PRESENT", workedMinutes: worked, lateMinutes: 0, overtimeMinutes: worked };
  const status = worked >= full ? "PRESENT" : worked >= shift.halfDayHours * 60 || input.leave === "HALF" ? "HALF_DAY" : "ABSENT";
  return { status: input.leave === "FULL" ? "LEAVE" : status, workedMinutes: worked, lateMinutes, overtimeMinutes: Math.max(0, worked - full) };
}

const normHeader = (value: unknown) => String(value ?? "").toLowerCase().replace(/[^a-z]/g, "");
const BIO_COLUMNS: Record<string, string[]> = {
  code: ["empcode", "employeecode", "employeeid", "empid", "employeeno", "empno", "code", "userid", "enrollno", "enrollmentno", "cardno", "badgeno"],
  date: ["date", "attendancedate", "punchdate", "workdate", "day"],
  in: ["intime", "in", "checkin", "firstin", "punchin", "timein"],
  out: ["outtime", "out", "checkout", "lastout", "punchout", "timeout"],
  stamp: ["punchtime", "datetime", "logtime", "timestamp", "punch", "logdatetime", "punchdatetime"],
  time: ["time", "logtime"],
};

/** Biometric export as a grid: either one row per day (code, date, in, out) or one row per punch (code, timestamp). */
export function parseBiometric(rows: unknown[][], parseDate: (value: unknown) => Date | null) {
  const warnings: string[] = [];
  let header = -1;
  let col: Record<string, number> = {};
  for (let index = 0; index < Math.min(rows.length, 30); index++) {
    const cells = rows[index].map(normHeader);
    const find = (key: string) => {
      for (const alias of BIO_COLUMNS[key]) {
        const at = cells.indexOf(alias);
        if (at >= 0) return at;
      }
      return -1;
    };
    col = Object.fromEntries(Object.keys(BIO_COLUMNS).map((key) => [key, find(key)]));
    if (col.code >= 0 && (col.stamp >= 0 || col.date >= 0)) {
      header = index;
      break;
    }
  }
  if (header < 0) return { days: [], warnings: ["Could not find the Employee code and Date / Punch time columns"] };
  const byKey = new Map<string, { code: string; day: string; checkIn: Date | null; checkOut: Date | null }>();
  const touch = (code: string, day: string, at: Date | null, kind: "in" | "out" | "any") => {
    const key = `${code}|${day}`;
    const row = byKey.get(key) || { code, day, checkIn: null, checkOut: null };
    if (at) {
      if ((kind === "in" || kind === "any") && (!row.checkIn || at < row.checkIn)) row.checkIn = at;
      if ((kind === "out" || kind === "any") && (!row.checkOut || at > row.checkOut)) row.checkOut = at;
    }
    byKey.set(key, row);
  };
  let skipped = 0;
  for (const row of rows.slice(header + 1)) {
    const code = String(row[col.code] ?? "").trim();
    if (!code) continue;
    if (col.stamp >= 0 && col.date < 0) {
      const text = String(row[col.stamp] ?? "").trim();
      const date = parseDate(text);
      const clock = parseClock(text) || parseClock(/(\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:AM|PM)?)\s*$/i.exec(text)?.[1]);
      if (!date || !clock) {
        skipped++;
        continue;
      }
      const day = dayKey(date);
      touch(code, day, localInstant(day, `${clock[0]}:${String(clock[1]).padStart(2, "0")}`), "any");
      continue;
    }
    const date = parseDate(row[col.date]);
    if (!date) {
      skipped++;
      continue;
    }
    const day = dayKey(date);
    const at = (index: number) => {
      const clock = index >= 0 ? parseClock(row[index]) : null;
      return clock ? localInstant(day, `${clock[0]}:${String(clock[1]).padStart(2, "0")}`) : null;
    };
    if (col.in >= 0 || col.out >= 0) {
      touch(code, day, at(col.in), "in");
      touch(code, day, at(col.out), "out");
    } else touch(code, day, at(col.time >= 0 ? col.time : col.stamp), "any");
  }
  if (skipped) warnings.push(`${skipped} row(s) without a readable date or time were skipped`);
  const days = [...byKey.values()].map((row) => (row.checkIn && row.checkOut && row.checkIn.getTime() === row.checkOut.getTime() ? { ...row, checkOut: null } : row));
  return { days, warnings };
}

/** Earliest start and latest end per local day from activity spans (job card time logs, site visits). */
export function spansToDays(spans: Array<{ employeeId: string; start: Date; end: Date | null }>) {
  const days = new Map<string, { employeeId: string; day: string; checkIn: Date; checkOut: Date | null }>();
  for (const span of spans) {
    const day = localDay(span.start);
    const key = `${span.employeeId}|${day}`;
    const row = days.get(key) || { employeeId: span.employeeId, day, checkIn: span.start, checkOut: span.end };
    if (span.start < row.checkIn) row.checkIn = span.start;
    if (span.end && (!row.checkOut || span.end > row.checkOut)) row.checkOut = span.end;
    days.set(key, row);
  }
  return [...days.values()];
}

// ---------- Schemas ----------

const dateText = z.string().regex(/^\d{4}-\d{2}-\d{2}/, "Use YYYY-MM-DD");
const optionalText = (max: number) => z.string().trim().max(max).optional().or(z.literal(""));
const timeText = z.string().regex(/^\d{2}:\d{2}$/, "Use HH:MM");

export const employeeProfileSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  designation: optionalText(80),
  employmentType: z.enum(EMPLOYMENT_TYPES).optional(),
  departmentId: z.string().max(64).optional().or(z.literal("")),
  branchId: z.string().max(64).optional().or(z.literal("")),
  managerId: z.string().max(64).optional().or(z.literal("")),
  userId: z.string().max(64).optional().or(z.literal("")),
  joiningDate: dateText.optional().or(z.literal("")),
  probationEndDate: dateText.optional().or(z.literal("")),
  confirmationDate: dateText.optional().or(z.literal("")),
  dob: dateText.optional().or(z.literal("")),
  gender: z.enum(["MALE", "FEMALE", "OTHER", ""]).optional(),
  phone: optionalText(20),
  personalEmail: z.string().trim().email().max(200).optional().or(z.literal("")),
  address: optionalText(500),
  emergencyContact: optionalText(200),
  pan: z.string().trim().toUpperCase().refine(isValidPan, "Invalid PAN").optional().or(z.literal("")),
  aadhaar: z.string().trim().refine(isValidAadhaar, "Invalid Aadhaar number").optional().or(z.literal("")),
  uan: z.string().trim().refine(isValidUan, "UAN is 12 digits").optional().or(z.literal("")),
  esicNo: z.string().trim().refine(isValidEsic, "ESIC IP number is 10 or 17 digits").optional().or(z.literal("")),
  pfApplicable: z.boolean().optional(),
  esiApplicable: z.boolean().optional(),
  ptApplicable: z.boolean().optional(),
  taxRegime: z.enum(["OLD", "NEW"]).optional(),
  bankName: optionalText(80),
  bankAccount: z.string().trim().regex(/^\d{6,18}$/, "Account number is 6-18 digits").optional().or(z.literal("")),
  ifsc: z.string().trim().toUpperCase().refine(isValidIfsc, "Invalid IFSC").optional().or(z.literal("")),
  shiftId: z.string().max(64).optional().or(z.literal("")),
  leavePolicyId: z.string().max(64).optional().or(z.literal("")),
  salary: z.coerce.number().min(0).max(1e9).optional(),
});
export const employeeCreateSchema = employeeProfileSchema.extend({ code: z.string().trim().min(1).max(30), name: z.string().trim().min(2).max(120) });
export const selfProfileSchema = employeeProfileSchema.pick({ phone: true, personalEmail: true, address: true, emergencyContact: true });

export const exitSchema = z.object({ resignationDate: dateText, lastWorkingDay: dateText, reason: z.string().trim().min(3).max(500) }).refine((value) => value.lastWorkingDay >= value.resignationDate, "Last working day is before the resignation date");
export const checklistTemplateSchema = z.object({
  kind: z.enum(["ONBOARDING", "EXIT"]),
  name: z.string().trim().min(2).max(80),
  active: z.boolean().default(true),
  items: z.array(z.object({ title: z.string().trim().min(2).max(200), owner: z.enum(TASK_OWNERS).default("HR"), dueDays: z.coerce.number().int().min(-60).max(180).default(0) })).min(1).max(60),
});
export const taskUpdateSchema = z.object({ status: z.enum(["PENDING", "DONE", "NA"]), notes: z.string().trim().max(500).optional() });

export const leaveTypeSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z]{2,6}$/),
  name: z.string().trim().min(2).max(60),
  annualQuota: z.coerce.number().min(0).max(365).default(0),
  accrual: z.enum(["YEARLY", "MONTHLY", "NONE"]).default("YEARLY"),
  carryForwardMax: z.coerce.number().min(0).max(365).default(0),
  encashable: z.boolean().default(false),
  paid: z.boolean().default(true),
  allowHalfDay: z.boolean().default(true),
  allowNegative: z.boolean().default(false),
  countOffs: z.boolean().default(false),
  minNoticeDays: z.coerce.number().int().min(0).max(90).default(0),
});
export const leavePolicySchema = z.object({ name: z.string().trim().min(2).max(80), branchId: z.string().max(64).optional().or(z.literal("")), isDefault: z.boolean().default(false), active: z.boolean().default(true), weeklyOffs: z.array(z.number().int().min(0).max(6)).max(3).default([0]), types: z.array(leaveTypeSchema).min(1).max(20) });
export const leaveApplySchema = z
  .object({ employeeId: z.string().max(64).optional(), type: z.string().trim().toUpperCase().min(2).max(6), fromDate: dateText, toDate: dateText, halfDay: z.enum(["FIRST", "SECOND"]).optional(), reason: z.string().trim().max(1000).optional() })
  .refine((value) => value.toDate >= value.fromDate, "Leave must end on or after it starts")
  .refine((value) => !value.halfDay || value.fromDate === value.toDate, "A half day is a single date");
export const leaveAdjustSchema = z.object({ employeeId: z.string().min(1).max(64), year: z.coerce.number().int().min(2000).max(2100), type: z.string().trim().toUpperCase().min(2).max(6), opening: z.coerce.number().min(-365).max(365).optional(), adjusted: z.coerce.number().min(-365).max(365).optional(), note: z.string().trim().max(300).optional() });
export const holidaySchema = z.object({ date: dateText, name: z.string().trim().min(2).max(80), branchId: z.string().max(64).optional().or(z.literal("")), optional: z.boolean().default(false) });
export const shiftSchema = z.object({ code: z.string().trim().toUpperCase().min(1).max(10), name: z.string().trim().min(2).max(60), startTime: timeText, endTime: timeText, breakMinutes: z.coerce.number().int().min(0).max(240).default(60), graceMinutes: z.coerce.number().int().min(0).max(120).default(15), halfDayHours: z.coerce.number().min(1).max(12).default(4), fullDayHours: z.coerce.number().min(1).max(16).default(8), weeklyOffs: z.array(z.number().int().min(0).max(6)).max(3).default([0]), active: z.boolean().default(true) });
export const rosterSchema = z.object({ employeeIds: z.array(z.string().max(64)).min(1).max(500), fromDate: dateText, toDate: dateText, shiftId: z.string().max(64).optional(), off: z.boolean().default(false) }).refine((value) => value.toDate >= value.fromDate, "Range ends before it starts");
export const attendanceEntrySchema = z.object({ employeeId: z.string().min(1).max(64), day: dateText, checkIn: timeText.optional().or(z.literal("")), checkOut: timeText.optional().or(z.literal("")), notes: z.string().trim().max(300).optional() });
export const correctionSchema = z.object({ day: dateText, checkIn: timeText.optional().or(z.literal("")), checkOut: timeText.optional().or(z.literal("")), reason: z.string().trim().min(5).max(500) });
export const decisionSchema = z.object({ status: z.enum(["APPROVED", "REJECTED"]), note: z.string().trim().max(300).optional() });
export const punchSchema = z.object({ latitude: z.coerce.number().min(-90).max(90).optional(), longitude: z.coerce.number().min(-180).max(180).optional() });
export const rangeSchema = z.object({ fromDate: dateText, toDate: dateText }).refine((value) => value.toDate >= value.fromDate && Date.parse(value.toDate) - Date.parse(value.fromDate) <= 92 * 86_400_000, "Use a range of up to 3 months");

export const appraisalCycleSchema = z.object({ name: z.string().trim().min(2).max(80), startDate: dateText, endDate: dateText, selfDue: dateText.optional().or(z.literal("")), managerDue: dateText.optional().or(z.literal("")) });
export const goalSchema = z.object({ employeeId: z.string().max(64).optional(), cycleId: z.string().max(64).optional().or(z.literal("")), title: z.string().trim().min(3).max(200), description: z.string().trim().max(1000).optional(), weight: z.coerce.number().int().min(0).max(100).default(0), target: z.string().trim().max(200).optional(), progress: z.coerce.number().int().min(0).max(100).default(0), status: z.enum(["ACTIVE", "DONE", "DROPPED"]).default("ACTIVE") });
export const appraisalReviewSchema = z.object({ rating: z.coerce.number().min(1).max(5), comments: z.string().trim().max(3000).optional() });
