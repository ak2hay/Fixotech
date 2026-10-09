import { z } from "zod";

export * from "./crm";
export * from "./csv";
export * from "./finance";
export * from "./gst";
export * from "./banking";
export * from "./hr";
export * from "./payroll";

export const ACTIONS = [
  "view",
  "create",
  "edit",
  "delete",
  "approve",
  "export",
  "download",
  "share",
  "assign",
  "override",
] as const;

export const RESOURCES = [
  "organization",
  "users",
  "roles",
  "customers",
  "leads",
  "projects",
  "products",
  "documents",
  "rfqs",
  "quotations",
  "sales_orders",
  "engineering",
  "boq",
  "vendors",
  "purchases",
  "inventory",
  "warehouses",
  "production",
  "quality",
  "ncr",
  "dispatch",
  "sites",
  "service",
  "invoices",
  "payments",
  "expenses",
  "hr",
  "reports",
  "content",
  "approvals",
  "audit",
  "notifications",
  "accounting",
  "banking",
  "payroll",
] as const;

export type Resource = (typeof RESOURCES)[number];
export type Action = (typeof ACTIONS)[number];

export function permissionKey(resource: Resource, action: Action) {
  return `${resource}.${action}`;
}

export const ALL_PERMISSIONS = RESOURCES.flatMap((resource) =>
  ACTIONS.map((action) => permissionKey(resource, action)),
);

export const CUSTOMER_TYPES = [
  "END_CUSTOMER",
  "CONTRACTOR",
  "MEP_CONTRACTOR",
  "CONSULTANT",
  "PMC",
  "ARCHITECT",
  "DEVELOPER",
  "DISTRIBUTOR",
  "DEALER",
  "OEM",
  "GOVERNMENT",
  "EXPORT",
] as const;

export const LEAD_SOURCES = [
  "WEBSITE",
  "LINKEDIN",
  "EXHIBITION",
  "REFERRAL",
  "DISTRIBUTOR",
  "CONSULTANT",
  "GOOGLE",
  "EMAIL",
  "PHONE",
  "WHATSAPP",
  "EXISTING_CUSTOMER",
  "CAD_DOWNLOAD",
] as const;

export const LEAD_STATUSES = [
  "NEW",
  "QUALIFIED",
  "OPPORTUNITY",
  "PROJECT_IDENTIFIED",
  "RFQ",
  "TECHNICAL_EVALUATION",
  "QUOTATION",
  "NEGOTIATION",
  "WON",
  "LOST",
] as const;

export const PROJECT_STAGES = [
  "IDENTIFIED",
  "RFQ",
  "ENGINEERING",
  "QUOTED",
  "NEGOTIATION",
  "WON",
  "EXECUTION",
  "CLOSED",
  "LOST",
] as const;

export const RFQ_STATUSES = [
  "DRAFT",
  "RECEIVED",
  "UNDER_REVIEW",
  "ENGINEERING_REQUIRED",
  "PRICING",
  "APPROVAL_PENDING",
  "QUOTED",
  "NEGOTIATION",
  "WON",
  "LOST",
  "CANCELLED",
] as const;

export const QUOTE_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "UNDER_REVIEW",
  "APPROVED",
  "REJECTED",
  "SENT",
  "ACCEPTED",
  "NEGOTIATION",
  "CANCELLED",
  "COMPLETED",
] as const;

export const ORDER_STATUSES = [
  "DRAFT",
  "CREDIT_HOLD",
  "CONFIRMED",
  "PARTIAL",
  "BACKORDERED",
  "DISPATCHED",
  "CLOSED",
  "CANCELLED",
] as const;

export const ENGINEERING_STATUSES = [
  "NEW",
  "UNDER_REVIEW",
  "CALCULATION",
  "DRAWING",
  "CLIENT_APPROVAL",
  "APPROVED",
  "REJECTED",
] as const;

export const TXN_TYPES = [
  "OPENING",
  "PURCHASE",
  "PRODUCTION_RECEIPT",
  "SALES",
  "TRANSFER",
  "ADJUSTMENT",
  "SCRAP",
  "RETURN",
  "CONSUMPTION",
] as const;

export const DOC_CATEGORIES = [
  "DRAWING",
  "CAD",
  "BIM",
  "DATASHEET",
  "CERTIFICATE",
  "CALCULATION",
  "SUBMITTAL",
  "BOQ",
  "CONTRACT",
  "QC",
  "INVOICE",
  "QUOTATION",
  "PO",
  "MARKETING",
  "SPECIFICATION",
  "INSTALLATION",
  "OTHER",
] as const;

export const EXPENSE_CATEGORIES = [
  "TRAVEL",
  "FUEL",
  "HOTEL",
  "FOOD",
  "CLIENT_MEETING",
  "SITE",
  "PURCHASE",
  "OTHER",
] as const;

export const TICKET_PRIORITIES = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;

export const DEFAULT_SLA_HOURS: Record<(typeof TICKET_PRIORITIES)[number], number> = {
  CRITICAL: 4,
  HIGH: 8,
  MEDIUM: 24,
  LOW: 48,
};

export const ISSUE_STATUSES = [
  "OPEN",
  "ASSIGNED",
  "INVESTIGATING",
  "ACTION_REQUIRED",
  "RESOLVED",
  "VERIFIED",
  "CLOSED",
] as const;

export const PROJECT_MILESTONES = [
  { key: "LEAD", label: "Lead", at: 0 },
  { key: "RFQ", label: "RFQ", at: 0.08 },
  { key: "ENGINEERING", label: "Engineering", at: 0.2 },
  { key: "QUOTATION", label: "Quotation", at: 0.32 },
  { key: "ORDER", label: "Order", at: 0.42 },
  { key: "PRODUCTION", label: "Production", at: 0.6 },
  { key: "DISPATCH", label: "Dispatch", at: 0.78 },
  { key: "SITE", label: "Site", at: 1 },
] as const;

/** Number of milestones a project at this stage has completed. */
export const STAGE_MILESTONES_DONE: Record<string, number> = {
  IDENTIFIED: 1,
  RFQ: 2,
  ENGINEERING: 2,
  QUOTED: 4,
  NEGOTIATION: 4,
  WON: 5,
  EXECUTION: 6,
  CLOSED: 8,
  LOST: 0,
};

export const PROJECT_HEALTH = ["ON_TRACK", "AT_RISK", "DELAYED"] as const;
export type ProjectHealth = (typeof PROJECT_HEALTH)[number];

export function projectHealth(input: { override?: string | null; stage: string; startDate?: Date | string | null; expectedCompletion?: Date | string | null; progress: number; openIssues?: number; now?: Date }): ProjectHealth | null {
  if (input.override && (PROJECT_HEALTH as readonly string[]).includes(input.override)) return input.override as ProjectHealth;
  if (input.stage === "CLOSED" || input.stage === "LOST") return null;
  const now = input.now || new Date();
  const end = input.expectedCompletion ? new Date(input.expectedCompletion) : null;
  if (end && end.getTime() < now.getTime() && input.progress < 100) return "DELAYED";
  const start = input.startDate ? new Date(input.startDate) : null;
  if (start && end && end > start) {
    const elapsed = ((now.getTime() - start.getTime()) / (end.getTime() - start.getTime())) * 100;
    if (elapsed - input.progress > 25) return "AT_RISK";
  }
  if ((input.openIssues || 0) >= 3) return "AT_RISK";
  return "ON_TRACK";
}

export const RFQ_STEPS = [
  { key: "RECEIVED", label: "Received" },
  { key: "ENGINEERING", label: "Engineering Review" },
  { key: "BOQ", label: "BOQ" },
  { key: "PRICING", label: "Pricing" },
  { key: "APPROVAL", label: "Approval" },
  { key: "QUOTED", label: "Quoted" },
  { key: "NEGOTIATION", label: "Negotiation" },
  { key: "WON", label: "Won" },
] as const;

/** Index of the current RFQ step, or -1 when the RFQ is closed without a win. */
export function rfqStepIndex(status: string, hasBoq = false) {
  switch (status) {
    case "DRAFT":
    case "RECEIVED":
      return 0;
    case "UNDER_REVIEW":
    case "ENGINEERING_REQUIRED":
      return hasBoq ? 2 : 1;
    case "PRICING":
      return 3;
    case "APPROVAL_PENDING":
      return 4;
    case "QUOTED":
      return 5;
    case "NEGOTIATION":
      return 6;
    case "WON":
      return 8;
    default:
      return -1;
  }
}

export const RFQ_PRIORITIES = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;

export const money = z.coerce.number().nonnegative().max(1e12);
export const qty = z.coerce.number().positive().max(1e9);
const text = (max = 200) => z.string().trim().max(max);
const id = z.string().min(1).max(64);
const dateText = z.string().max(40).refine((value) => !Number.isNaN(new Date(value).getTime()), "Invalid date");
const nullableDate = dateText.nullable();

export const loginSchema = z.object({
  email: z.string().email().max(254),
  password: z.string().min(1).max(128),
});

export const passwordSchema = z
  .string()
  .min(10)
  .max(128)
  .regex(/[a-z]/, "Include a lowercase letter")
  .regex(/[A-Z]/, "Include an uppercase letter")
  .regex(/[0-9]/, "Include a number");

export const userCreateSchema = z
  .object({
    email: z.string().email().max(254),
    name: text(120).pipe(z.string().min(2)),
    password: passwordSchema,
    phone: text(30).optional(),
    kind: z.enum(["STAFF", "EXTERNAL"]).default("STAFF"),
    roleKeys: z.array(text(60)).min(1).max(20),
    customerId: id.optional(),
    branchId: id.optional(),
    departmentId: id.optional(),
    jobTitle: text(120).optional(),
  })
  .strict();

export const customerSchema = z.object({
  name: z.string().trim().min(2).max(200),
  type: z.enum(CUSTOMER_TYPES),
  gstin: z.string().max(20).optional(),
  email: z.string().email().max(254).optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  website: z.string().max(300).optional(),
  creditLimit: money.default(0),
  paymentTerms: z.string().max(200).optional(),
  priceList: z.enum(["STANDARD", "CUSTOMER", "DEALER", "EXPORT"]).default("STANDARD"),
  notes: z.string().max(5000).optional(),
});

export const leadSchema = z.object({
  source: z.enum(LEAD_SOURCES),
  contactName: z.string().trim().min(2).max(120),
  companyName: z.string().trim().min(2).max(200),
  email: z.string().email().max(254).optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  application: z.string().max(500).optional(),
  message: z.string().max(5000).optional(),
  estimatedValue: money.optional(),
  customerId: z.string().max(64).optional(),
  ownerId: z.string().max(64).optional(),
});

export const projectSchema = z.object({
  name: z.string().trim().min(2).max(200),
  location: z.string().max(300).optional(),
  customerId: z.string().min(1).max(64),
  developerId: z.string().max(64).optional(),
  consultantId: z.string().max(64).optional(),
  pmcId: z.string().max(64).optional(),
  contractorId: z.string().max(64).optional(),
  mepContractorId: z.string().max(64).optional(),
  projectValue: money.optional(),
  fixotecValue: money.optional(),
  startDate: z.string().max(40).optional(),
  expectedCompletion: z.string().max(40).optional(),
  stage: z.enum(PROJECT_STAGES).optional(),
  probability: z.coerce.number().min(0).max(100).optional(),
  ownerId: z.string().max(64).optional(),
  notes: z.string().max(5000).optional(),
  coverImageKey: z.string().max(300).regex(/^[\w][\w./-]*$/).refine((value) => !value.includes(".."), "Invalid media key").optional(),
});

export const lineSchema = z.object({
  variantId: id.optional(),
  description: text(500).pipe(z.string().min(1)),
  qty: qty,
  unit: text(20).default("NOS"),
  specification: text(2000).optional(),
  rate: money.optional(),
  discountPct: z.coerce.number().min(0).max(100).optional(),
});

export const rfqSchema = z.object({
  customerId: z.string().optional(),
  projectId: z.string().optional(),
  leadId: z.string().optional(),
  application: z.string().optional(),
  notes: z.string().optional(),
  assigneeId: z.string().optional(),
  dueDate: z.string().optional(),
  priority: z.enum(RFQ_PRIORITIES).optional(),
  items: z.array(lineSchema).min(1).max(500),
});

export const enquirySchema = z.object({
  name: text(120).pipe(z.string().min(2)),
  company: text(200).pipe(z.string().min(2)),
  email: z.string().email().max(254),
  phone: text(30).optional(),
  project: text(200).optional(),
  application: text(200).optional(),
  message: text(5000).optional(),
  items: z.array(lineSchema).max(200).optional(),
  /** Honeypot: real users never fill this hidden field. */
  website: z.string().max(200).optional(),
  captchaToken: z.string().max(4096).optional(),
});

export const configureSchema = z.object({
  installing: z.enum(["PIPE", "CABLE_TRAY", "DUCT", "EQUIPMENT", "AHU", "ODU"]),
  pipeSizeMm: z.coerce.number().optional(),
  application: z.string().optional(),
  installation: z.string().optional(),
  environment: z.string().optional(),
});

export const productSchema = z.object({
  name: z.string().min(2),
  sku: z.string().min(2),
  slug: z.string().min(2),
  familyId: z.string().optional(),
  categoryId: z.string().optional(),
  productType: z.enum(["FINISHED", "RAW", "ACCESSORY"]).default("FINISHED"),
  description: z.string().optional(),
  technicalDescription: z.string().optional(),
  applications: z.array(z.string()).default([]),
  material: z.string().optional(),
  coating: z.string().optional(),
  finish: z.string().optional(),
  hsn: z.string().optional(),
  gstRate: z.coerce.number().min(0).max(100).default(18),
  manufacturingMethod: z.string().optional(),
  leadTimeDays: z.coerce.number().int().min(0).default(14),
  moq: qty.default(1),
  packSize: z.string().optional(),
  supplyMode: z.enum(["MAKE", "BUY"]).default("MAKE"),
  purchaseCost: money.default(0),
  manufacturingCost: money.default(0),
  standardPrice: money.default(0),
  weightKg: z.coerce.number().optional(),
  loadCapacity: z.string().optional(),
  thread: z.string().optional(),
  pipeSize: z.string().optional(),
  lengthLabel: z.string().optional(),
  revision: z.string().default("A"),
  published: z.boolean().default(false),
  metaTitle: z.string().optional(),
  metaDescription: z.string().optional(),
});

export const variantSchema = z.object({
  articleNumber: z.string().min(2),
  sku: z.string().min(2),
  name: z.string().min(2),
  attributes: z.record(z.string()).default({}),
  barcode: z.string().optional(),
  purchaseCost: money,
  manufacturingCost: money,
  standardPrice: money,
  customerPrice: money.optional(),
  dealerPrice: money.optional(),
  exportPrice: money.optional(),
  safetyStock: z.coerce.number().min(0).default(0),
  reorderLevel: z.coerce.number().min(0).default(0),
});

export const vendorSchema = z.object({
  name: z.string().trim().min(2).max(200),
  gstin: z.string().max(20).optional(),
  email: z.string().email().max(254).optional().or(z.literal("")),
  phone: z.string().max(30).optional(),
  paymentTerms: z.string().max(200).optional(),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).default(14),
  qualityRating: z.coerce.number().min(0).max(5).default(0),
  deliveryScore: z.coerce.number().min(0).max(99.99).default(0),
  bankName: z.string().max(120).optional(),
  bankAccount: z.string().max(40).optional(),
  ifsc: z.string().max(20).optional(),
  categories: z.array(z.string().max(60)).max(50).default([]),
  pan: z.string().trim().toUpperCase().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "Invalid PAN").optional().or(z.literal("")),
  tdsSection: z.string().max(10).optional().or(z.literal("")),
});

export const engineeringSchema = z.object({
  projectId: z.string().max(64).optional(),
  rfqId: z.string().max(64).optional(),
  customerId: z.string().max(64).optional(),
  application: z.string().max(500).optional(),
  requiredSystem: z.string().max(500).optional(),
  load: z.string().max(200).optional(),
  dimensions: z.string().max(200).optional(),
  material: z.string().max(200).optional(),
  installationCondition: z.string().max(1000).optional(),
  standard: z.string().max(200).optional(),
  engineerId: z.string().max(64).optional(),
  dueDate: z.string().max(40).optional(),
  notes: z.string().max(5000).optional(),
});

export const expenseSchema = z.object({
  employeeId: id.optional(),
  category: z.enum(EXPENSE_CATEGORIES),
  amount: z.coerce.number().positive().max(1e9),
  description: text(2000).optional(),
  spentOn: dateText.optional(),
});

export const ticketSchema = z.object({
  customerId: id.optional(),
  projectId: id.optional(),
  priority: z.enum(TICKET_PRIORITIES).default("MEDIUM"),
  subject: text(200).pipe(z.string().min(3)),
  description: text(5000).optional(),
});

export const inventoryPostSchema = z.object({
  type: z.enum(TXN_TYPES),
  warehouseId: z.string(),
  binId: z.string(),
  variantId: z.string(),
  batchId: z.string().optional(),
  qty: z.coerce.number().refine((value) => value !== 0 && Math.abs(value) <= 1e9, "Quantity must be non-zero"),
  unitCost: money.optional(),
  referenceType: text(60).optional(),
  referenceId: text(64).optional(),
  notes: text(1000).optional(),
});

export const APPROVAL_OPS = ["gte", "gt", "lt", "lte", "eq"] as const;

export const approvalRuleSchema = z.object({
  name: text(120).pipe(z.string().min(2)),
  entityType: z.enum(["QUOTATION", "PURCHASE", "ENGINEERING"]),
  condition: z.object({
    all: z.array(z.object({ field: text(60), op: z.enum(APPROVAL_OPS), value: z.coerce.number() })).min(1).max(10),
  }),
  approverRole: text(60).pipe(z.string().min(2)),
  priority: z.coerce.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
});

/*
 * Write schemas. Every handler must map a parsed object to Prisma explicitly; never pass a request body through.
 * Schemas used by generic ERP forms strip unknown keys (zod default) so UI-only fields are dropped,
 * which also drops Prisma relation writes such as `users: { create: ... }`. Admin/auth payloads use .strict().
 */

export const customerUpdateSchema = customerSchema
  .extend({ active: z.boolean().optional() })
  .partial();

export const contactSchema = z
  .object({
    name: text(120).pipe(z.string().min(2)),
    email: z.string().email().max(254).optional().or(z.literal("")),
    phone: text(30).optional(),
    title: text(120).optional(),
    primary: z.boolean().optional(),
  });

export const addressSchema = z
  .object({
    label: text(60).pipe(z.string().min(1)),
    line1: text(300).pipe(z.string().min(1)),
    line2: text(300).optional(),
    city: text(100).pipe(z.string().min(1)),
    state: text(100).optional(),
    postalCode: text(20).optional(),
    country: text(80).optional(),
    gstin: text(20).optional(),
  });

export const leadUpdateSchema = z.object({
  status: z.enum(LEAD_STATUSES).optional(),
  ownerId: id.optional(),
  note: text(2000).optional(),
  lostReason: z.enum(["PRICE", "LEAD_TIME", "COMPETITOR", "SPEC_CHANGED", "PROJECT_ON_HOLD", "NO_RESPONSE", "NOT_QUALIFIED", "MERGED", "OTHER"]).optional(),
  estimatedValue: money.optional(),
  nextFollowUpAt: dateText.nullable().optional(),
  region: text(60).optional(),
  segment: text(60).optional(),
  customFields: z.record(z.unknown()).optional(),
});

export const projectUpdateSchema = projectSchema
  .extend({
    startDate: nullableDate.optional(),
    expectedCompletion: nullableDate.optional(),
    health: z.enum(PROJECT_HEALTH).nullable().optional(),
  })
  .partial();

export const milestoneUpdateSchema = z
  .object({
    status: z.enum(["PENDING", "IN_PROGRESS", "DONE", "BLOCKED"]).optional(),
    plannedDate: nullableDate.optional(),
    actualDate: nullableDate.optional(),
  });

export const taxonomySchema = z.object({ name: text(120).pipe(z.string().min(2)), slug: z.string().regex(/^[a-z0-9-]{2,120}$/) });

export const productUpdateSchema = productSchema
  .omit({ applications: true, gstRate: true, leadTimeDays: true, moq: true, productType: true, supplyMode: true, purchaseCost: true, manufacturingCost: true, standardPrice: true, revision: true, published: true })
  .extend({
    applications: z.array(text(200)).max(100),
    gstRate: z.coerce.number().min(0).max(100),
    leadTimeDays: z.coerce.number().int().min(0).max(3650),
    moq: qty,
    productType: z.enum(["FINISHED", "RAW", "ACCESSORY"]),
    supplyMode: z.enum(["MAKE", "BUY"]),
    purchaseCost: money,
    manufacturingCost: money,
    standardPrice: money,
    revision: text(10),
    published: z.boolean(),
    familyId: id.nullable(),
    categoryId: id.nullable(),
    heroImageKey: text(300).nullable(),
    imageKeys: z.array(text(300)).max(50),
    features: z.array(text(300)).max(100),
    segments: z.array(text(60)).max(30),
    sectors: z.array(text(60)).max(30),
    sortOrder: z.coerce.number().int().min(0).max(100_000),
  })
  .partial();

export const rfqUpdateSchema = z
  .object({
    status: z.enum(RFQ_STATUSES).optional(),
    assigneeId: id.optional(),
    notes: text(5000).optional(),
    priority: z.enum(RFQ_PRIORITIES).optional(),
    dueDate: nullableDate.optional(),
  });

export const quoteFromRfqSchema = z.object({
  discountPct: z.coerce.number().min(0).max(100).optional(),
  freight: money.optional(),
  paymentTerms: text(300).optional(),
  deliveryTerms: text(300).optional(),
  validDays: z.coerce.number().int().min(1).max(365).optional(),
});

export const salesOrderCreateSchema = z
  .object({
    quotationId: id.optional(),
    customerId: id.optional(),
    projectId: id.optional(),
    lines: z
      .array(
        z.object({
          quotationItemId: id.optional(),
          variantId: id.optional(),
          description: text(500).optional().default(""),
          qty: qty,
          unitPrice: money.optional(),
        }),
      )
      .max(500)
      .optional()
      .default([]),
  });

export const engineeringUpdateSchema = engineeringSchema
  .extend({
    status: z.enum(ENGINEERING_STATUSES).optional(),
    dueDate: nullableDate.optional(),
  })
  .partial();

export const warehouseSchema = z.object({
  code: text(30).pipe(z.string().min(1)),
  name: text(120).pipe(z.string().min(2)),
  plantId: id.optional(),
  address: text(500).optional(),
});

export const workCenterSchema = z.object({ code: text(30).pipe(z.string().min(1)), name: text(120).pipe(z.string().min(2)), plantId: id.optional() });

export const machineSchema = z.object({
  code: text(30).pipe(z.string().min(1)),
  name: text(120).pipe(z.string().min(2)),
  workCenterId: id.optional(),
  capacityPerDay: z.coerce.number().min(0).max(24).optional(),
});

export const NCR_STATUSES = ["OPEN", "INVESTIGATING", "ACTION_REQUIRED", "CLOSED"] as const;

export const ncrUpdateSchema = z.object({
  status: z.enum(NCR_STATUSES).optional(),
  rootCause: text(5000).optional(),
  correctiveAction: text(5000).optional(),
  preventiveAction: text(5000).optional(),
  ownerId: id.optional(),
  deadline: nullableDate.optional(),
});

export const requisitionSchema = z.object({
  neededBy: dateText.optional(),
  notes: text(2000).optional(),
  items: z.array(z.object({ variantId: id.optional(), description: text(500).pipe(z.string().min(1)), qty })).min(1).max(500),
});

export const vendorQuoteSchema = z.object({
  vendorId: id,
  amount: z.coerce.number().positive().max(1e12),
  leadTimeDays: z.coerce.number().int().min(0).max(3650).optional(),
  notes: text(2000).optional(),
  items: z.array(z.object({ variantId: id.optional(), description: text(500), qty, rate: money })).max(500).default([]),
});

export const purchaseOrderSchema = z.object({
  vendorId: id,
  requisitionId: id.optional(),
  expectedOn: dateText.optional(),
  items: z
    .array(z.object({ variantId: id.optional(), description: text(500).pipe(z.string().min(1)), qty, rate: money, taxRate: z.coerce.number().min(0).max(100).optional() }))
    .min(1)
    .max(500),
});

export const goodsReceiptSchema = z.object({
  purchaseOrderId: id,
  warehouseId: id,
  items: z.array(z.object({ purchaseOrderItemId: id, qty, batchCode: text(60).optional() })).min(1).max(500),
});

export const binSchema = z.object({ code: text(30).pipe(z.string().min(1)), zone: z.enum(["RAW", "WIP", "FG", "REJECTED", "QC_HOLD", "SCRAP"]), barcode: text(60).optional() });

export const transferSchema = z
  .object({ variantId: id, qty, fromWarehouseId: id, fromBinId: id, toWarehouseId: id, toBinId: id, notes: text(500).optional() })
  .refine((value) => value.fromBinId !== value.toBinId, "Source and destination bins must differ");

export const dispatchSchema = z.object({
  salesOrderId: id,
  warehouseId: id,
  items: z.array(z.object({ salesOrderItemId: id, qty })).min(1).max(500),
});

export const pickSchema = z.object({ items: z.array(z.object({ id, pickedQty: z.coerce.number().min(0).max(1e9) })).min(1).max(500) });

export const shipSchema = z.object({ transporter: text(120).optional(), transporterGstin: text(15).optional(), lrNumber: text(60).optional(), ewayBill: text(60).optional(), vehicleNo: text(30).optional(), distanceKm: z.coerce.number().int().min(0).max(4000).optional() });

export const deliverSchema = z.object({ proofNote: text(2000).optional() });

export const bomSchema = z.object({
  variantId: id,
  revision: text(10).optional(),
  yieldPct: z.coerce.number().gt(0).max(100).optional(),
  labourMinutes: z.coerce.number().min(0).max(1e6).optional(),
  machineMinutes: z.coerce.number().min(0).max(1e6).optional(),
  overheadCost: money.optional(),
  items: z
    .array(
      z.object({
        componentVariantId: id,
        qty,
        scrapPct: z.coerce.number().min(0).max(100).optional(),
        unit: text(10).optional(),
        alternateGroup: text(30).optional(),
        isAlternate: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(500),
});

export const productionOrderSchema = z.object({
  variantId: id,
  qty,
  machineId: id.optional(),
  warehouseId: id.optional(),
  plannedStart: dateText.optional(),
  plannedEnd: dateText.optional(),
  salesOrderId: id.optional(),
});

export const jobPauseSchema = z.object({ downtimeMinutes: z.coerce.number().int().min(0).max(10_000).optional() });
export const jobIssueSchema = z.object({ note: text(2000).pipe(z.string().min(2)) });
export const jobCompleteSchema = z.object({ completedQty: z.coerce.number().min(0).max(1e9) });

export const qcDecisionSchema = z.object({
  decision: z.enum(["ACCEPTED", "REJECTED", "REWORK"]),
  parameters: z.array(z.object({ name: text(100), result: text(500) })).max(100).optional(),
  notes: text(5000).optional(),
});

const boqLineSchema = z.object({ description: text(500).pipe(z.string().min(1)), qty, unit: text(10).optional(), rate: money.optional(), variantId: id.optional() });

export const boqSchema = z.object({
  title: text(200).pipe(z.string().min(2)),
  projectId: id.optional(),
  rfqId: id.optional(),
  items: z.array(boqLineSchema).max(2000).optional(),
});

export const boqImportSchema = z.object({ title: text(200).optional(), projectId: id.optional() });

export const submittalSchema = z.object({
  projectId: id,
  title: text(200).pipe(z.string().min(2)),
  documentIds: z.array(id).max(100).optional(),
  variantIds: z.array(id).max(200).optional(),
});

export const siteIssueSchema = z.object({
  projectId: id,
  title: text(200).pipe(z.string().min(2)),
  description: text(5000).optional(),
  shortage: z.boolean().optional(),
  assigneeId: id.optional(),
});

export const siteIssueUpdateSchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  assigneeId: id.optional(),
  description: text(5000).optional(),
});

export const siteVisitSchema = z.object({
  projectId: id,
  latitude: z.coerce.number().min(-90).max(90).optional(),
  longitude: z.coerce.number().min(-180).max(180).optional(),
  notes: text(2000).optional(),
});

export const siteReportSchema = z.object({
  projectId: id,
  visitId: id.optional(),
  installationNotes: text(5000).optional(),
  labourHours: z.coerce.number().min(0).max(10_000).optional(),
  clientSignatureName: text(120).optional(),
  consumption: z.array(z.object({ variantId: id.optional(), description: text(500).pipe(z.string().min(1)), qty })).max(200).optional(),
});

export const ticketUpdateSchema = z.object({
  status: z.enum(ISSUE_STATUSES).optional(),
  assigneeId: id.optional(),
  priority: z.enum(TICKET_PRIORITIES).optional(),
});

export const commentSchema = z.object({ body: text(5000).pipe(z.string().min(1)) });

export const employeeSchema = z.object({
  code: text(30).pipe(z.string().min(1)),
  name: text(120).pipe(z.string().min(2)),
  departmentId: id.optional(),
  branchId: id.optional(),
  managerId: id.optional(),
  userId: id.optional(),
  joiningDate: dateText.optional(),
  salary: money.optional(),
});

export const attendanceSchema = z.object({ employeeId: id, day: dateText, checkIn: dateText.optional(), checkOut: dateText.optional() });

export const leaveSchema = z
  .object({ employeeId: id, type: text(30).pipe(z.string().min(1)), fromDate: dateText, toDate: dateText, reason: text(2000).optional() })
  .refine((value) => new Date(value.toDate) >= new Date(value.fromDate), "Leave must end on or after it starts");

export const assetSchema = z.object({
  code: text(30).pipe(z.string().min(1)),
  name: text(120).pipe(z.string().min(2)),
  assignedEmployeeId: id.optional(),
});

export const paymentSchema = z.object({
  direction: z.enum(["IN", "OUT"]),
  amount: z.coerce.number().positive().max(1e12),
  invoiceId: id.optional(),
  vendorBillId: id.optional(),
  customerId: id.optional(),
  method: text(30).optional(),
  reference: text(120).optional(),
  paidAt: dateText.optional(),
  currency: z.string().length(3).optional(),
  exchangeRate: z.coerce.number().positive().max(100000).optional(),
  accountId: id.optional(),
  // `amount` is what the payment settles; TDS withheld and bank charges come out of the cash leg.
  tdsAmount: z.coerce.number().min(0).max(1e12).optional(),
  tdsSection: z.string().max(10).optional(),
  bankCharges: z.coerce.number().min(0).max(1e9).optional(),
});

export const vendorBillSchema = z.object({
  vendorId: id,
  purchaseOrderId: id.optional(),
  goodsReceiptId: id.optional(),
  total: z.coerce.number().positive().max(1e12),
  subtotal: z.coerce.number().min(0).max(1e12).optional(),
  tax: z.coerce.number().min(0).max(1e12).optional(),
  vendorInvoiceNo: text(60).optional(),
  billDate: dateText.optional(),
  expenseAccountId: id.optional(),
  dueDate: dateText.optional(),
  igst: z.coerce.number().min(0).max(1e12).optional(),
  cgst: z.coerce.number().min(0).max(1e12).optional(),
  sgst: z.coerce.number().min(0).max(1e12).optional(),
  reverseCharge: z.boolean().optional(),
  itcEligible: z.boolean().optional(),
});

export const claimSchema = z.object({ schemeId: id, amount: z.coerce.number().positive().max(1e10), notes: text(2000).optional() });

export const cmsBlockSchema = z.object({
  title: text(200).optional(),
  subtitle: text(500).nullable().optional(),
  body: text(100_000).nullable().optional(),
  data: z.record(z.unknown()).nullable().optional(),
  published: z.boolean().optional(),
});

const slug = z.string().regex(/^[a-z0-9-]{1,120}$/, "Use lowercase letters, numbers and dashes");
const imageKey = z
  .string()
  .max(300)
  .regex(/^media\/[\w./-]+$/, "Image must be an uploaded media key")
  .refine((value) => !value.includes(".."), "Image must be an uploaded media key")
  .nullable();

export const solutionSchema = z.object({
  slug,
  name: text(200).pipe(z.string().min(2)),
  summary: text(2000),
  body: text(100_000),
  applications: z.array(text(200)).max(100).optional(),
  features: z.array(text(300)).max(100).optional(),
  imageKey: imageKey.optional(),
  heroImageKey: imageKey.optional(),
  metaTitle: text(200).nullable().optional(),
  metaDescription: text(500).nullable().optional(),
  published: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(100_000).optional(),
});

export const industrySchema = solutionSchema.omit({ applications: true }).extend({ group: z.enum(["BUILDINGS", "INDUSTRIES"]).optional() });

export const caseStudySchema = z.object({
  slug,
  title: text(200).pipe(z.string().min(2)),
  location: text(200).nullable().optional(),
  sector: text(120).nullable().optional(),
  summary: text(2000),
  body: text(100_000),
  year: z.coerce.number().int().min(1900).max(2200).nullable().optional(),
  published: z.boolean().optional(),
});

export const roleUpdateSchema = z.object({ permissionKeys: z.array(text(80)).max(1000) }).strict();

export const userUpdateSchema = z
  .object({
    name: text(120).pipe(z.string().min(2)).optional(),
    phone: text(30).optional(),
    active: z.boolean().optional(),
    roleKeys: z.array(text(60)).min(1).max(20).optional(),
    jobTitle: text(120).optional(),
    branchId: id.nullable().optional(),
    departmentId: id.nullable().optional(),
    customerId: id.nullable().optional(),
    password: passwordSchema.optional(),
  })
  .strict();

const orgCode = text(30).pipe(z.string().min(1).regex(/^[A-Za-z0-9_.-]+$/, "Use letters, digits, dot, dash or underscore"));
const orgName = text(200).pipe(z.string().min(2));

export const ORG_SCHEMAS = {
  branches: z.object({ code: orgCode, name: orgName, region: text(30).default("WEST"), state: z.string().trim().toUpperCase().regex(/^[A-Z]{2}$/, "Use the 2-letter state code").optional().or(z.literal("")), address: text(500).optional() }).strict(),
  offices: z.object({ branchId: id, name: orgName, address: text(500).optional() }).strict(),
  plants: z.object({ branchId: id, code: orgCode, name: orgName, address: text(500).optional() }).strict(),
  departments: z.object({ code: orgCode, name: orgName, parentId: id.optional() }).strict(),
  "cost-centers": z.object({ code: orgCode, name: orgName, departmentId: id.optional() }).strict(),
  "profit-centers": z.object({ code: orgCode, name: orgName }).strict(),
  "financial-years": z
    .object({ label: text(20).pipe(z.string().min(4)), startDate: dateText, endDate: dateText, active: z.boolean().default(false) })
    .strict()
    .refine((value) => new Date(value.endDate) > new Date(value.startDate), "The year must end after it starts"),
  currencies: z.object({ code: z.string().regex(/^[A-Z]{3}$/), name: orgName, symbol: text(5).pipe(z.string().min(1)), rateToInr: z.coerce.number().positive().max(1e6).default(1) }).strict(),
  units: z.object({ code: orgCode, name: orgName }).strict(),
  "legal-entities": z
    .object({
      code: orgCode,
      name: orgName,
      gstin: z.string().regex(/^[0-9A-Z]{15}$/, "GSTIN is 15 characters").optional(),
      pan: z.string().regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, "PAN format is AAAAA9999A").optional(),
      address: text(500).optional(),
    })
    .strict(),
  "bank-accounts": z
    .object({ legalEntityId: id, bankName: text(120).pipe(z.string().min(2)), accountNo: z.string().regex(/^[0-9A-Za-z]{6,34}$/), ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/).optional(), currency: z.string().regex(/^[A-Z]{3}$/).default("INR") })
    .strict(),
} as const;

export type OrgCollection = keyof typeof ORG_SCHEMAS;

export const SETTING_SCHEMAS = {
  sla: z.object({ CRITICAL: z.number().int().min(1).max(720), HIGH: z.number().int().min(1).max(720), MEDIUM: z.number().int().min(1).max(720), LOW: z.number().int().min(1).max(720) }).strict(),
  company: z.record(z.string().max(60), z.union([z.string().max(2000), z.number(), z.boolean(), z.null()])).refine((value) => Object.keys(value).length <= 50, "Too many fields"),
  /** buyerAuthority: PO total a buyer may auto-approve when no approval rule matches; 0 sends every PO to approval. */
  procurement: z.object({ buyerAuthority: z.number().min(0).max(1_000_000_000) }).strict(),
} as const;

export const mfaCodeSchema = z.object({ code: z.string().regex(/^\d{6}$|^[A-Z0-9]{4}-[A-Z0-9]{4}$/) }).strict();

/* ---------- Status transitions. Terminal states cannot be left; some states can only be reached from specific predecessors. ---------- */

type TransitionRules = { terminal: readonly string[]; requires?: Record<string, readonly string[]> };

export const TRANSITIONS: Record<string, TransitionRules> = {
  lead: { terminal: ["WON", "LOST"] },
  rfq: { terminal: ["WON", "LOST", "CANCELLED"], requires: { WON: ["QUOTED", "NEGOTIATION"], QUOTED: ["PRICING", "APPROVAL_PENDING", "NEGOTIATION"] } },
  project: { terminal: ["CLOSED"], requires: { EXECUTION: ["WON"], CLOSED: ["EXECUTION", "WON", "LOST"] } },
  issue: { terminal: ["CLOSED"], requires: { VERIFIED: ["RESOLVED"] } },
  ncr: { terminal: ["CLOSED"] },
  engineering: { terminal: ["APPROVED", "REJECTED"] },
};

export function transitionAllowed(kind: keyof typeof TRANSITIONS | string, from: string, to: string) {
  if (from === to) return true;
  const rules = TRANSITIONS[kind];
  if (!rules) return true;
  if (rules.terminal.includes(from)) return false;
  const required = rules.requires?.[to];
  return !required || required.includes(from);
}

export const SAFE_URL = /^(https?:\/\/|\/(?!\/)|mailto:|tel:)/i;
export const safeUrl = z.string().max(2000).regex(SAFE_URL, "Only http(s), mailto, tel or relative links are allowed");

export type PriceList = "STANDARD" | "CUSTOMER" | "DEALER" | "EXPORT";

export type PriceSource = {
  standardPrice: unknown;
  customerPrice?: unknown;
  dealerPrice?: unknown;
  exportPrice?: unknown;
  purchaseCost?: unknown;
  manufacturingCost?: unknown;
};

export function num(value: unknown) {
  if (value === null || value === undefined || value === "") return 0;
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function resolveSellPrice(source: PriceSource, list: PriceList) {
  if (list === "DEALER" && source.dealerPrice != null) return num(source.dealerPrice);
  if (list === "EXPORT" && source.exportPrice != null) return num(source.exportPrice);
  if (list === "CUSTOMER" && source.customerPrice != null) return num(source.customerPrice);
  return num(source.standardPrice);
}

export function stripCosts<T extends Record<string, unknown>>(row: T): T {
  const hidden = ["purchaseCost", "manufacturingCost", "unitCost", "marginPct", "avgCost", "salary"];
  const copy = { ...row };
  for (const key of hidden) delete copy[key];
  return copy;
}

export function lineAmount(qtyValue: number, rate: number, discountPct = 0, taxRate = 0) {
  const net = qtyValue * rate * (1 - discountPct / 100);
  const tax = net * (taxRate / 100);
  return { net, tax, total: net + tax };
}

export function matchesCondition(condition: unknown, context: Record<string, number | string>) {
  if (!condition || typeof condition !== "object") return false;
  const rule = condition as { all?: { field: string; op: string; value: number }[] };
  if (!rule.all?.length) return false;
  return rule.all.every((clause) => {
    const left = num(context[clause.field] as number);
    const right = num(clause.value);
    if (clause.op === "gte") return left >= right;
    if (clause.op === "gt") return left > right;
    if (clause.op === "lt") return left < right;
    if (clause.op === "lte") return left <= right;
    if (clause.op === "eq") return left === right;
    return false;
  });
}

export function availabilityBand(onHand: number, safety: number, supplyMode: string) {
  if (onHand <= 0) return supplyMode === "MAKE" ? "MADE_TO_ORDER" : "OUT_OF_STOCK";
  if (safety > 0 && onHand < safety) return "LIMITED";
  return "AVAILABLE";
}

export const ROLE_PRESETS: Record<string, { name: string; kind: "STAFF" | "EXTERNAL"; permissions: string[] | "*" }> = {
  super_admin: { name: "Super Admin", kind: "STAFF", permissions: "*" },
  managing_director: { name: "Managing Director", kind: "STAFF", permissions: "*" },
  ceo: { name: "CEO", kind: "STAFF", permissions: "*" },
  finance_head: {
    name: "Finance Head",
    kind: "STAFF",
    permissions: [
      "organization.view",
      "customers.view",
      "customers.approve",
      "customers.override",
      "invoices.view",
      "invoices.create",
      "invoices.edit",
      "invoices.approve",
      "invoices.export",
      "payments.view",
      "payments.create",
      "payments.approve",
      "payments.export",
      "expenses.view",
      "expenses.approve",
      "expenses.export",
      "reports.view",
      "reports.export",
      "hr.view",
      "hr.view_salary",
      "purchases.view",
      "purchases.approve",
      "audit.view",
      "notifications.view",
      "documents.view",
      "documents.download",
      "approvals.view",
      "approvals.approve",
      "vendors.view",
      "accounting.view",
      "accounting.create",
      "accounting.edit",
      "accounting.approve",
      "accounting.export",
      "accounting.override",
      "banking.view",
      "banking.create",
      "banking.edit",
      "banking.approve",
      "banking.export",
      "payroll.view",
      "payroll.approve",
      "payroll.export",
    ],
  },
  sales_head: {
    name: "Sales Head",
    kind: "STAFF",
    permissions: [
      "customers.view",
      "customers.create",
      "customers.edit",
      "customers.approve",
      "leads.view",
      "leads.create",
      "leads.edit",
      "leads.assign",
      "projects.view",
      "projects.create",
      "projects.edit",
      "projects.assign",
      "rfqs.view",
      "rfqs.create",
      "rfqs.edit",
      "rfqs.assign",
      "quotations.view",
      "quotations.create",
      "quotations.edit",
      "quotations.approve",
      "quotations.export",
      "quotations.download",
      "sales_orders.view",
      "sales_orders.create",
      "sales_orders.edit",
      "sales_orders.approve",
      "products.view",
      "products.view_cost",
      "documents.view",
      "documents.download",
      "documents.share",
      "reports.view",
      "engineering.view",
      "boq.view",
      "boq.create",
      "notifications.view",
      "approvals.view",
      "approvals.approve",
    ],
  },
  sales_manager: {
    name: "Sales Manager",
    kind: "STAFF",
    permissions: [
      "customers.view",
      "customers.create",
      "customers.edit",
      "leads.view",
      "leads.create",
      "leads.edit",
      "leads.assign",
      "projects.view",
      "projects.create",
      "projects.edit",
      "rfqs.view",
      "rfqs.create",
      "rfqs.edit",
      "rfqs.assign",
      "quotations.view",
      "quotations.create",
      "quotations.edit",
      "quotations.approve",
      "quotations.download",
      "sales_orders.view",
      "sales_orders.create",
      "products.view",
      "documents.view",
      "documents.download",
      "boq.view",
      "notifications.view",
      "approvals.view",
      "approvals.approve",
    ],
  },
  sales_executive: {
    name: "Sales Executive",
    kind: "STAFF",
    permissions: [
      "customers.view",
      "customers.create",
      "leads.view",
      "leads.create",
      "leads.edit",
      "projects.view",
      "projects.create",
      "rfqs.view",
      "rfqs.create",
      "quotations.view",
      "quotations.create",
      "quotations.edit",
      "sales_orders.view",
      "products.view",
      "documents.view",
      "documents.download",
      "boq.view",
      "notifications.view",
    ],
  },
  specification_manager: {
    name: "Specification Manager",
    kind: "STAFF",
    permissions: ["products.view", "products.edit", "documents.view", "documents.create", "documents.download", "content.view", "content.edit", "engineering.view"],
  },
  engineering_head: {
    name: "Engineering Head",
    kind: "STAFF",
    permissions: [
      "engineering.view",
      "engineering.create",
      "engineering.edit",
      "engineering.approve",
      "engineering.assign",
      "boq.view",
      "boq.create",
      "boq.edit",
      "documents.view",
      "documents.create",
      "documents.edit",
      "documents.download",
      "documents.approve",
      "products.view",
      "projects.view",
      "rfqs.view",
      "approvals.view",
      "approvals.approve",
      "notifications.view",
    ],
  },
  design_engineer: {
    name: "Design Engineer",
    kind: "STAFF",
    permissions: ["engineering.view", "engineering.create", "engineering.edit", "boq.view", "boq.create", "documents.view", "documents.create", "documents.download", "products.view", "projects.view", "rfqs.view", "notifications.view"],
  },
  bim_engineer: {
    name: "BIM Engineer",
    kind: "STAFF",
    permissions: ["engineering.view", "engineering.edit", "documents.view", "documents.create", "documents.download", "products.view", "projects.view"],
  },
  project_manager: {
    name: "Project Manager",
    kind: "STAFF",
    permissions: ["projects.view", "projects.edit", "projects.assign", "sites.view", "sites.create", "sites.edit", "sites.assign", "documents.view", "documents.download", "boq.view", "sales_orders.view", "dispatch.view", "service.view", "reports.view", "notifications.view"],
  },
  site_engineer: {
    name: "Site Engineer",
    kind: "STAFF",
    permissions: ["sites.view", "sites.create", "sites.edit", "projects.view", "documents.view", "documents.download", "boq.view", "notifications.view"],
  },
  procurement_manager: {
    name: "Procurement Manager",
    kind: "STAFF",
    permissions: ["vendors.view", "vendors.create", "vendors.edit", "purchases.view", "purchases.create", "purchases.edit", "purchases.approve", "inventory.view", "documents.view", "documents.download", "approvals.view", "approvals.approve", "reports.view", "notifications.view"],
  },
  purchase_executive: {
    name: "Purchase Executive",
    kind: "STAFF",
    permissions: ["vendors.view", "vendors.create", "purchases.view", "purchases.create", "purchases.edit", "inventory.view", "documents.view", "notifications.view"],
  },
  production_manager: {
    name: "Production Manager",
    kind: "STAFF",
    permissions: ["production.view", "production.create", "production.edit", "production.approve", "inventory.view", "quality.view", "products.view", "products.view_cost", "reports.view", "notifications.view"],
  },
  production_supervisor: {
    name: "Production Supervisor",
    kind: "STAFF",
    permissions: ["production.view", "production.edit", "quality.view", "quality.create", "inventory.view", "notifications.view"],
  },
  qc_manager: {
    name: "QC Manager",
    kind: "STAFF",
    permissions: ["quality.view", "quality.create", "quality.edit", "quality.approve", "ncr.view", "ncr.create", "ncr.edit", "ncr.approve", "inventory.view", "documents.view", "documents.create", "notifications.view"],
  },
  warehouse_manager: {
    name: "Warehouse Manager",
    kind: "STAFF",
    permissions: ["warehouses.view", "warehouses.create", "warehouses.edit", "inventory.view", "inventory.create", "inventory.edit", "inventory.override", "dispatch.view", "dispatch.create", "dispatch.edit", "notifications.view"],
  },
  storekeeper: {
    name: "Storekeeper",
    kind: "STAFF",
    permissions: ["warehouses.view", "inventory.view", "inventory.create", "dispatch.view", "dispatch.edit", "notifications.view"],
  },
  dispatch_manager: {
    name: "Dispatch Manager",
    kind: "STAFF",
    permissions: ["dispatch.view", "dispatch.create", "dispatch.edit", "dispatch.approve", "inventory.view", "sales_orders.view", "warehouses.view", "notifications.view"],
  },
  hr: {
    name: "HR",
    kind: "STAFF",
    permissions: ["hr.view", "hr.create", "hr.edit", "hr.approve", "hr.view_salary", "users.view", "expenses.view", "documents.view", "documents.create", "notifications.view", "payroll.view", "payroll.create", "payroll.edit", "payroll.export"],
  },
  accounts: {
    name: "Accounts",
    kind: "STAFF",
    permissions: ["invoices.view", "invoices.create", "invoices.edit", "invoices.export", "payments.view", "payments.create", "expenses.view", "expenses.edit", "customers.view", "vendors.view", "reports.view", "notifications.view", "accounting.view", "accounting.create", "accounting.edit", "accounting.export", "banking.view", "banking.create", "banking.edit", "banking.export"],
  },
  service_engineer: {
    name: "Service Engineer",
    kind: "STAFF",
    permissions: ["service.view", "service.create", "service.edit", "projects.view", "documents.view", "documents.download", "notifications.view"],
  },
  customer: {
    name: "Customer",
    kind: "EXTERNAL",
    permissions: [
      "projects.view",
      "rfqs.view",
      "rfqs.create",
      "quotations.view",
      "quotations.download",
      "quotations.approve",
      "sales_orders.view",
      "dispatch.view",
      "invoices.view",
      "invoices.download",
      "documents.view",
      "documents.download",
      "service.view",
      "service.create",
    ],
  },
  dealer: {
    name: "Dealer",
    kind: "EXTERNAL",
    permissions: ["products.view", "sales_orders.view", "sales_orders.create", "invoices.view", "invoices.download", "documents.view", "documents.download"],
  },
  distributor: {
    name: "Distributor",
    kind: "EXTERNAL",
    permissions: ["products.view", "sales_orders.view", "sales_orders.create", "invoices.view", "invoices.download", "documents.view", "documents.download", "payments.view"],
  },
  contractor: {
    name: "Contractor",
    kind: "EXTERNAL",
    permissions: ["projects.view", "rfqs.view", "rfqs.create", "quotations.view", "quotations.download", "sales_orders.view", "documents.view", "documents.download", "sites.view"],
  },
  consultant: {
    name: "Consultant",
    kind: "EXTERNAL",
    permissions: ["products.view", "documents.view", "documents.download", "projects.view", "engineering.view", "engineering.create", "boq.view"],
  },
};

export function permissionsForRole(key: string) {
  const preset = ROLE_PRESETS[key];
  if (!preset) return [];
  if (preset.permissions === "*") return [...ALL_PERMISSIONS, "products.view_cost", "hr.view_salary"];
  return preset.permissions;
}
