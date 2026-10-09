import { z } from "zod";

export const ACTIVITY_TYPES = ["CALL", "MEETING", "TASK", "EMAIL", "NOTE", "WHATSAPP"] as const;
export const ACTIVITY_STATUSES = ["OPEN", "DONE", "CANCELLED"] as const;
export const ACTIVITY_ENTITIES = ["lead", "customer", "project", "quotation", "rfq"] as const;
export const LOST_REASONS = ["PRICE", "LEAD_TIME", "COMPETITOR", "SPEC_CHANGED", "PROJECT_ON_HOLD", "NO_RESPONSE", "NOT_QUALIFIED", "MERGED", "OTHER"] as const;
export const CUSTOM_FIELD_ENTITIES = ["LEAD", "CUSTOMER", "PROJECT"] as const;
export const CUSTOM_FIELD_TYPES = ["TEXT", "NUMBER", "DATE", "SELECT", "BOOLEAN"] as const;
export const SCORE_OPS = ["eq", "neq", "gte", "lte", "contains", "present", "absent"] as const;
export const SCORE_FIELDS = ["source", "estimatedValue", "application", "email", "phone", "companyName", "region", "segment", "customerId", "projectId"] as const;

/** Win probability per lead stage, used for the weighted pipeline forecast. */
export const LEAD_STAGE_PROBABILITY: Record<string, number> = {
  NEW: 5,
  QUALIFIED: 10,
  OPPORTUNITY: 20,
  PROJECT_IDENTIFIED: 30,
  RFQ: 40,
  TECHNICAL_EVALUATION: 50,
  QUOTATION: 60,
  NEGOTIATION: 75,
  WON: 100,
  LOST: 0,
};

export function weightedValue(status: string, value: unknown) {
  const amount = Number(value) || 0;
  return Math.round(amount * (LEAD_STAGE_PROBABILITY[status] ?? 0)) / 100;
}

export type ScoreRule = { field: string; op: (typeof SCORE_OPS)[number] | string; value?: string | number | null; points: number };

function ruleMatches(rule: ScoreRule, record: Record<string, unknown>) {
  const raw = record[rule.field];
  const present = raw !== null && raw !== undefined && raw !== "";
  if (rule.op === "present") return present;
  if (rule.op === "absent") return !present;
  if (!present) return false;
  const text = String(raw).toLowerCase();
  const target = String(rule.value ?? "").toLowerCase();
  switch (rule.op) {
    case "eq":
      return text === target;
    case "neq":
      return text !== target;
    case "contains":
      return target !== "" && text.includes(target);
    case "gte":
      return Number(raw) >= Number(rule.value);
    case "lte":
      return Number(raw) <= Number(rule.value);
    default:
      return false;
  }
}

/** Sum of the points of every matching rule, clamped to 0-100. */
export function scoreLead(record: Record<string, unknown>, rules: ScoreRule[]) {
  const total = rules.reduce((sum, rule) => (ruleMatches(rule, record) ? sum + rule.points : sum), 0);
  return Math.max(0, Math.min(100, Math.round(total)));
}

/** Assignment rules: every clause must match (case-insensitive equality, or `in` a list). */
export type AssignmentCondition = { all?: Array<{ field: string; equals?: string; in?: string[] }> };

export function assignmentMatches(condition: unknown, record: Record<string, unknown>) {
  const clauses = (condition as AssignmentCondition | null)?.all || [];
  return clauses.every((clause) => {
    const value = String(record[clause.field] ?? "").toLowerCase();
    if (clause.in) return clause.in.map((item) => item.toLowerCase()).includes(value);
    return value === String(clause.equals ?? "").toLowerCase();
  });
}

/** Round robin over the rule's users; returns the chosen user and the cursor to store. */
export function roundRobin(userIds: string[], cursor: number) {
  if (!userIds.length) return null;
  const index = ((cursor % userIds.length) + userIds.length) % userIds.length;
  return { userId: userIds[index], cursor: index + 1 };
}

export function normalizeEmail(value?: string | null) {
  const email = (value || "").trim().toLowerCase();
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : null;
}

/** Indian numbers compare on their last 10 digits so +91, 0 and spaces do not hide duplicates. */
export function normalizePhone(value?: string | null) {
  const digits = (value || "").replace(/\D/g, "");
  return digits.length >= 8 ? digits.slice(-10) : null;
}

export function normalizeGstin(value?: string | null) {
  const gstin = (value || "").replace(/\s/g, "").toUpperCase();
  return /^[0-9]{2}[A-Z0-9]{13}$/.test(gstin) ? gstin : null;
}

export function duplicateKeys(record: { email?: string | null; phone?: string | null; gstin?: string | null }) {
  const keys: string[] = [];
  const email = normalizeEmail(record.email);
  const phone = normalizePhone(record.phone);
  const gstin = normalizeGstin(record.gstin);
  if (email) keys.push(`email:${email}`);
  if (phone) keys.push(`phone:${phone}`);
  if (gstin) keys.push(`gstin:${gstin}`);
  return keys;
}

/** Groups records that share any key (transitively), e.g. same email on A and B, same phone on B and C. */
export function groupDuplicates<T extends { id: string }>(rows: T[], keysOf: (row: T) => string[]) {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    let root = id;
    while (parent.get(root) !== root) root = parent.get(root)!;
    parent.set(id, root);
    return root;
  };
  const owner = new Map<string, string>();
  const reasons = new Map<string, Set<string>>();
  for (const row of rows) parent.set(row.id, row.id);
  for (const row of rows) {
    for (const key of keysOf(row)) {
      const other = owner.get(key);
      if (!other) {
        owner.set(key, row.id);
        continue;
      }
      const a = find(row.id);
      const b = find(other);
      if (a !== b) parent.set(a, b);
      const root = find(row.id);
      reasons.set(root, new Set([...(reasons.get(root) || []), ...(reasons.get(a) || []), key.split(":")[0]]));
    }
  }
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const root = find(row.id);
    groups.set(root, [...(groups.get(root) || []), row]);
  }
  return [...groups.entries()]
    .filter(([, members]) => members.length > 1)
    .map(([root, members]) => ({ matchedOn: [...(reasons.get(root) || [])].sort(), records: members }));
}

export function ageBucket(days: number) {
  if (days <= 7) return "0-7";
  if (days <= 30) return "8-30";
  if (days <= 90) return "31-90";
  return "90+";
}

/** `{{customer.name}}`-style placeholders; unknown paths render empty. Plain-text output. */
export function renderTemplate(template: string, values: Record<string, unknown>) {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_match, path: string) => {
    const value = path.split(".").reduce<unknown>((current, key) => (current && typeof current === "object" ? (current as Record<string, unknown>)[key] : undefined), values);
    return value === null || value === undefined ? "" : String(value);
  });
}

type FieldDef = { key: string; label: string; type: string; options: string[]; required: boolean };

/** Validates a custom-field payload against the active definitions; unknown keys are rejected. */
export function validateCustomFields(defs: FieldDef[], values: Record<string, unknown>) {
  const errors: string[] = [];
  const clean: Record<string, string | number | boolean | null> = {};
  const known = new Map(defs.map((def) => [def.key, def]));
  for (const key of Object.keys(values)) if (!known.has(key)) errors.push(`Unknown field ${key}`);
  for (const def of defs) {
    const raw = values[def.key];
    const empty = raw === undefined || raw === null || raw === "";
    if (empty) {
      if (def.required) errors.push(`${def.label} is required`);
      else if (def.key in values) clean[def.key] = null;
      continue;
    }
    if (def.type === "NUMBER") {
      const value = Number(raw);
      if (!Number.isFinite(value)) errors.push(`${def.label} must be a number`);
      else clean[def.key] = value;
    } else if (def.type === "BOOLEAN") {
      clean[def.key] = raw === true || raw === "true";
    } else if (def.type === "DATE") {
      if (Number.isNaN(Date.parse(String(raw)))) errors.push(`${def.label} must be a date`);
      else clean[def.key] = String(raw).slice(0, 10);
    } else if (def.type === "SELECT") {
      if (!def.options.includes(String(raw))) errors.push(`${def.label} must be one of ${def.options.join(", ")}`);
      else clean[def.key] = String(raw);
    } else {
      clean[def.key] = String(raw).slice(0, 2000);
    }
  }
  return { errors, values: clean };
}

const id = z.string().trim().min(1).max(64);
const text = (max: number) => z.string().trim().max(max);
const isoDate = z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  subject: text(200).pipe(z.string().min(1)),
  body: text(20_000).optional(),
  entityType: z.enum(ACTIVITY_ENTITIES),
  entityId: id,
  dueAt: isoDate.optional(),
  ownerId: id.optional(),
  contactEmail: z.string().email().max(254).optional(),
  contactPhone: text(30).optional(),
  status: z.enum(ACTIVITY_STATUSES).optional(),
});

export const activityUpdateSchema = z
  .object({
    subject: text(200).pipe(z.string().min(1)).optional(),
    body: text(20_000).optional(),
    dueAt: isoDate.nullable().optional(),
    ownerId: id.optional(),
    status: z.enum(ACTIVITY_STATUSES).optional(),
  })
  .strict();

export const customFieldDefSchema = z.object({
  entity: z.enum(CUSTOM_FIELD_ENTITIES),
  key: z.string().regex(/^[a-z][a-zA-Z0-9_]{1,39}$/, "Use a camelCase key like siteArea"),
  label: text(80).pipe(z.string().min(2)),
  type: z.enum(CUSTOM_FIELD_TYPES),
  options: z.array(text(80)).max(50).default([]),
  required: z.boolean().default(false),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});

export const scoringRuleSchema = z.object({
  name: text(120).pipe(z.string().min(2)),
  field: z.enum(SCORE_FIELDS),
  op: z.enum(SCORE_OPS),
  value: text(200).optional(),
  points: z.coerce.number().int().min(-100).max(100),
  active: z.boolean().default(true),
});

export const assignmentRuleSchema = z.object({
  name: text(120).pipe(z.string().min(2)),
  priority: z.coerce.number().int().min(0).max(10_000).default(100),
  condition: z.object({ all: z.array(z.object({ field: z.enum(SCORE_FIELDS), equals: text(200).optional(), in: z.array(text(200)).max(50).optional() })).max(10).default([]) }),
  userIds: z.array(id).min(1).max(50),
  active: z.boolean().default(true),
});

export const emailTemplateSchema = z.object({
  key: z.string().regex(/^[a-z0-9_-]{2,60}$/),
  name: text(120).pipe(z.string().min(2)),
  subject: text(300).pipe(z.string().min(1)),
  body: text(20_000).pipe(z.string().min(1)),
  active: z.boolean().default(true),
});

export const sequenceSchema = z.object({
  name: text(120).pipe(z.string().min(2)),
  entityType: z.enum(["quotation", "lead"]).default("quotation"),
  steps: z.array(z.object({ dayOffset: z.coerce.number().int().min(0).max(365), templateKey: z.string().regex(/^[a-z0-9_-]{2,60}$/) })).min(1).max(20),
  autoEnroll: z.boolean().default(false),
  active: z.boolean().default(true),
});

export const sendEmailSchema = z.object({
  entityType: z.enum(ACTIVITY_ENTITIES),
  entityId: id,
  to: z.string().email().max(254),
  subject: text(300).pipe(z.string().min(1)).optional(),
  body: text(50_000).optional(),
  templateKey: z.string().regex(/^[a-z0-9_-]{2,60}$/).optional(),
});

export const whatsappSendSchema = z.object({
  entityType: z.enum(ACTIVITY_ENTITIES),
  entityId: id,
  to: z.string().regex(/^\+?[0-9 ()-]{8,20}$/),
  body: text(4096).pipe(z.string().min(1)),
});

export const inboundEmailSchema = z.object({
  from: z.string().max(400),
  to: z.union([z.string().max(2000), z.array(z.string().max(400)).max(50)]).optional(),
  subject: text(500).default(""),
  text: z.string().max(200_000).default(""),
  messageId: text(500).optional(),
});

export const mergeSchema = z.object({ intoId: id }).strict();
export const enrollSchema = z.object({ sequenceId: id, entityType: z.enum(["quotation", "lead"]), entityId: id, email: z.string().email().max(254) }).strict();
