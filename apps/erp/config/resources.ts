import { CUSTOMER_TYPES, EXPENSE_CATEGORIES, ISSUE_STATUSES, LEAD_SOURCES, LEAD_STATUSES, LOST_REASONS, TICKET_PRIORITIES } from "@fixotec/shared";

type Row = Record<string, unknown>;

export type Option = { value: string; label: string };

export type FieldDef = {
  key: string;
  label: string;
  type?: "text" | "number" | "email" | "date" | "textarea" | "select" | "checkbox" | "list" | "password";
  options?: readonly string[] | Option[];
  /** Load select options from an API list. */
  optionsFrom?: { path: string; label: (row: Row) => string };
  required?: boolean;
  hint?: string;
  defaultValue?: string;
  wide?: boolean;
};

export type ColumnDef = {
  key: string;
  header: string;
  /** Dotted path into the row; defaults to `key`. */
  get?: string;
  kind?: "strong" | "mono" | "money" | "date" | "relative" | "status" | "count" | "bool" | "humanize" | "avatar" | "download";
  align?: "left" | "right";
};

export type ActionDef = {
  key: string;
  label: string;
  path: (row: Row) => string;
  method?: "POST" | "PATCH";
  permission: string;
  when?: (row: Row) => boolean;
  /** Ask for these values in a modal before sending. */
  fields?: FieldDef[];
  body?: (row: Row) => Row;
  variant?: "default" | "outline" | "danger";
};

export type ResourceDef = {
  title: string;
  description: string;
  path: string;
  permission: string;
  columns: ColumnDef[];
  /** Field used for the record heading. */
  titleKey: string;
  subtitleKey?: string;
  statusKey?: string;
  statuses?: readonly string[];
  create?: { permission: string; label?: string; fields: FieldDef[]; path?: string; transform?: (body: Row) => Row };
  /** GET endpoint for a single record; without one the list is searched. */
  detailPath?: (id: string) => string;
  actions?: ActionDef[];
  upload?: { category: string };
  /** Keys never shown on the detail page. */
  hidden?: string[];
  /** Shows the CRM activity panel (and the 360 view for customers) on the detail page. */
  crm?: "lead" | "customer";
};

const statusField = (options: readonly string[]): FieldDef => ({ key: "status", label: "Status", type: "select", options, required: true });
const projectOptions = { path: "/projects?pageSize=100", label: (row: Row) => `${row.code} · ${row.name}` };
const customerOptions = { path: "/customers?pageSize=100", label: (row: Row) => String(row.name) };
const cashAccountOptions = { path: "/accounting/accounts?kind=cash", label: (row: Row) => `${row.code} · ${row.name}` };

export const RESOURCES: Record<string, ResourceDef> = {
  customers: {
    title: "Customers",
    description: "Accounts, credit limits and price lists for contractors, consultants and distributors.",
    path: "/customers",
    permission: "customers.view",
    titleKey: "name",
    subtitleKey: "code",
    detailPath: (id) => `/customers/${id}`,
    crm: "customer",
    hidden: ["customFields", "mergedIntoId", "rfqs", "quotations", "salesOrders", "invoices", "tickets", "clientProjects"],
    actions: [
      { key: "merge", label: "Merge into…", permission: "customers.override", variant: "outline", path: (row) => `/customers/${row.id}/merge`, fields: [{ key: "intoId", label: "Keep this customer", type: "select", required: true, optionsFrom: { path: "/customers?pageSize=100", label: (row: Row) => `${row.code} · ${row.name}` }, hint: "Everything on this record moves to the one you keep; this record is deactivated." }] },
    ],
    columns: [
      { key: "code", header: "Code", kind: "mono" },
      { key: "name", header: "Name", kind: "strong" },
      { key: "type", header: "Type", kind: "humanize" },
      { key: "priceList", header: "Price list", kind: "humanize" },
      { key: "projects", header: "Projects", get: "_count.clientProjects", align: "right" },
      { key: "orders", header: "Orders", get: "_count.salesOrders", align: "right" },
      { key: "creditLimit", header: "Credit limit", kind: "money", align: "right" },
      { key: "paymentTerms", header: "Terms" },
    ],
    create: {
      permission: "customers.create",
      label: "New customer",
      fields: [
        { key: "name", label: "Name", required: true, wide: true },
        { key: "type", label: "Type", type: "select", options: CUSTOMER_TYPES, required: true, defaultValue: "END_CUSTOMER" },
        { key: "priceList", label: "Price list", type: "select", options: ["STANDARD", "CUSTOMER", "DEALER", "EXPORT"], defaultValue: "STANDARD" },
        { key: "email", label: "Email", type: "email" },
        { key: "phone", label: "Phone" },
        { key: "gstin", label: "GSTIN" },
        { key: "website", label: "Website" },
        { key: "creditLimit", label: "Credit limit (INR)", type: "number" },
        { key: "paymentTerms", label: "Payment terms", defaultValue: "30 days" },
      ],
    },
  },
  leads: {
    title: "Leads",
    description: "Enquiries from the website, exhibitions, referrals and the field team.",
    path: "/leads",
    permission: "leads.view",
    titleKey: "companyName",
    subtitleKey: "number",
    statusKey: "status",
    statuses: LEAD_STATUSES,
    detailPath: (id) => `/leads/${id}`,
    crm: "lead",
    hidden: ["customFields", "mergedIntoId", "ownerId", "customerId", "projectId"],
    columns: [
      { key: "number", header: "Lead", kind: "strong" },
      { key: "companyName", header: "Company" },
      { key: "contactName", header: "Contact" },
      { key: "source", header: "Source", kind: "humanize" },
      { key: "score", header: "Score", align: "right" },
      { key: "estimatedValue", header: "Value", kind: "money", align: "right" },
      { key: "owner", header: "Owner", get: "owner.name", kind: "avatar" },
      { key: "status", header: "Status", kind: "status" },
      { key: "nextFollowUpAt", header: "Follow-up", kind: "date" },
      { key: "createdAt", header: "Received", kind: "relative" },
    ],
    create: {
      permission: "leads.create",
      label: "New lead",
      fields: [
        { key: "companyName", label: "Company", required: true },
        { key: "contactName", label: "Contact", required: true },
        { key: "source", label: "Source", type: "select", options: LEAD_SOURCES, required: true, defaultValue: "PHONE" },
        { key: "estimatedValue", label: "Estimated value (INR)", type: "number" },
        { key: "email", label: "Email", type: "email" },
        { key: "phone", label: "Phone" },
        { key: "application", label: "Application", wide: true },
        { key: "message", label: "Notes", type: "textarea", wide: true },
      ],
    },
    actions: [
      {
        key: "status",
        label: "Update",
        method: "PATCH",
        path: (row) => `/leads/${row.id}`,
        permission: "leads.edit",
        when: (row) => !["WON", "LOST"].includes(String(row.status)),
        fields: [
          statusField(LEAD_STATUSES),
          { key: "lostReason", label: "Lost reason (when lost)", type: "select", options: LOST_REASONS.filter((reason) => reason !== "MERGED") },
          { key: "estimatedValue", label: "Estimated value (INR)", type: "number" },
          { key: "region", label: "Region" },
          { key: "segment", label: "Segment" },
          { key: "note", label: "Note", type: "textarea" },
        ],
      },
      { key: "assign", label: "Reassign", method: "PATCH", variant: "outline", path: (row) => `/leads/${row.id}`, permission: "leads.assign", fields: [{ key: "ownerId", label: "Owner", type: "select", required: true, optionsFrom: { path: "/crm/owners", label: (row: Row) => String(row.name) } }] },
      { key: "merge", label: "Merge into…", variant: "outline", path: (row) => `/leads/${row.id}/merge`, permission: "leads.assign", when: (row) => !row.mergedIntoId, fields: [{ key: "intoId", label: "Keep this lead", type: "select", required: true, optionsFrom: { path: "/leads?pageSize=100", label: (row: Row) => `${row.number} · ${row.companyName}` } }] },
    ],
  },
  vendors: {
    title: "Vendors",
    description: "Suppliers of raw material, fasteners and traded items with quality and delivery scores.",
    path: "/vendors",
    permission: "vendors.view",
    titleKey: "name",
    subtitleKey: "code",
    columns: [
      { key: "code", header: "Code", kind: "mono" },
      { key: "name", header: "Name", kind: "strong" },
      { key: "gstin", header: "GSTIN", kind: "mono" },
      { key: "leadTimeDays", header: "Lead time (d)", align: "right" },
      { key: "qualityRating", header: "Quality /5", align: "right" },
      { key: "deliveryScore", header: "On-time %", align: "right" },
      { key: "paymentTerms", header: "Terms" },
    ],
    create: {
      permission: "vendors.create",
      label: "New vendor",
      fields: [
        { key: "name", label: "Name", required: true, wide: true },
        { key: "gstin", label: "GSTIN" },
        { key: "paymentTerms", label: "Payment terms" },
        { key: "email", label: "Email", type: "email" },
        { key: "phone", label: "Phone" },
        { key: "leadTimeDays", label: "Lead time (days)", type: "number", defaultValue: "14" },
        { key: "categories", label: "Categories", type: "list", hint: "Comma separated" },
        { key: "pan", label: "PAN", hint: "Taken from the GSTIN when blank" },
        { key: "tdsSection", label: "TDS section", type: "select", options: ["", "194C", "194J-P", "194J-T", "194H", "194I-PM", "194I-LB", "194Q", "194A"] },
      ],
    },
    actions: [
      {
        key: "tax",
        label: "Tax profile",
        permission: "vendors.edit",
        path: (row) => `/vendors/${row.id}/tax`,
        method: "PATCH",
        body: (row) => ({ pan: row.pan || "", tdsSection: row.tdsSection || "" }),
        fields: [
          { key: "pan", label: "PAN" },
          { key: "tdsSection", label: "TDS section", type: "select", options: ["", "194C", "194J-P", "194J-T", "194H", "194I-PM", "194I-LB", "194Q", "194A"] },
          { key: "lowerDeductionRate", label: "Lower deduction rate (%)", type: "number", hint: "Only with a section 197 certificate" },
        ],
      },
    ],
  },
  warehouses: {
    title: "Warehouses",
    description: "Stores and their bins across plants.",
    path: "/warehouses",
    permission: "warehouses.view",
    titleKey: "name",
    subtitleKey: "code",
    columns: [
      { key: "code", header: "Code", kind: "mono" },
      { key: "name", header: "Name", kind: "strong" },
      { key: "plant", header: "Plant", get: "plant.name" },
      { key: "bins", header: "Bins", kind: "count", align: "right" },
      { key: "address", header: "Address" },
    ],
    create: {
      permission: "warehouses.create",
      label: "New warehouse",
      fields: [
        { key: "code", label: "Code", required: true },
        { key: "name", label: "Name", required: true },
        { key: "address", label: "Address", type: "textarea", wide: true },
      ],
    },
  },
  documents: {
    title: "Documents",
    description: "Every controlled document with revisions and portal sharing.",
    path: "/documents",
    permission: "documents.view",
    titleKey: "title",
    subtitleKey: "category",
    columns: [
      { key: "title", header: "Title", kind: "strong" },
      { key: "category", header: "Category", kind: "humanize" },
      { key: "entityType", header: "Linked to", kind: "humanize" },
      { key: "versions", header: "Revisions", kind: "count", align: "right" },
      { key: "updatedAt", header: "Updated", kind: "relative" },
      { key: "download", header: "", kind: "download", align: "right" },
    ],
    upload: { category: "OTHER" },
    hidden: ["storageKey"],
  },
  dispatch: {
    title: "Dispatch",
    description: "Picking, shipping and proof of delivery for sales orders.",
    path: "/dispatch",
    permission: "dispatch.view",
    titleKey: "number",
    statusKey: "status",
    statuses: ["PLANNED", "PICKING", "SHIPPED", "DELIVERED"],
    columns: [
      { key: "number", header: "Dispatch", kind: "strong" },
      { key: "order", header: "Sales order", get: "salesOrder.number", kind: "mono" },
      { key: "customer", header: "Customer", get: "salesOrder.customer.name" },
      { key: "warehouse", header: "From", get: "warehouse.name" },
      { key: "transporter", header: "Transporter" },
      { key: "lrNumber", header: "LR no." },
      { key: "status", header: "Status", kind: "status" },
      { key: "shippedAt", header: "Shipped", kind: "date" },
      { key: "deliveredAt", header: "Delivered", kind: "date" },
    ],
    actions: [
      {
        key: "pick",
        label: "Mark picked",
        permission: "dispatch.edit",
        path: (row) => `/dispatch/${row.id}/pick`,
        when: (row) => row.status === "PICK_LIST" || row.status === "PICKING",
        body: (row) => ({ items: ((row.items as Row[]) || []).map((item) => ({ id: item.id, pickedQty: Number(item.qty) })) }),
        variant: "outline",
      },
      {
        key: "ship",
        label: "Ship",
        permission: "dispatch.approve",
        path: (row) => `/dispatch/${row.id}/ship`,
        when: (row) => row.status === "PICKING",
        fields: [
          { key: "transporter", label: "Transporter" },
          { key: "lrNumber", label: "LR number" },
          { key: "ewayBill", label: "E-way bill" },
          { key: "vehicleNo", label: "Vehicle no." },
        ],
      },
      { key: "deliver", label: "Record delivery", permission: "dispatch.edit", path: (row) => `/dispatch/${row.id}/deliver`, when: (row) => row.status === "SHIPPED", fields: [{ key: "proofNote", label: "Proof of delivery note", type: "textarea", wide: true }] },
      { key: "invoice", label: "Raise invoice", permission: "invoices.create", path: (row) => `/invoices/from-dispatch/${row.id}`, when: (row) => row.status === "SHIPPED" || row.status === "DELIVERED", variant: "outline" },
    ],
  },
  production: {
    title: "Production",
    description: "Production orders released to the plant.",
    path: "/production",
    permission: "production.view",
    titleKey: "number",
    statusKey: "status",
    statuses: ["PLANNED", "RELEASED", "IN_PROGRESS", "QC", "COMPLETED", "CANCELLED"],
    columns: [
      { key: "number", header: "Order", kind: "strong" },
      { key: "machine", header: "Machine", get: "machine.name" },
      { key: "qty", header: "Qty", align: "right" },
      { key: "completedQty", header: "Completed", align: "right" },
      { key: "jobCards", header: "Job cards", kind: "count", align: "right" },
      { key: "status", header: "Status", kind: "status" },
      { key: "plannedStart", header: "Planned start", kind: "date" },
    ],
  },
  quality: {
    title: "Quality",
    description: "Incoming and in-process inspections.",
    path: "/quality",
    permission: "quality.view",
    titleKey: "number",
    subtitleKey: "stage",
    statusKey: "status",
    statuses: ["PENDING", "ACCEPTED", "REJECTED", "REWORK"],
    columns: [
      { key: "number", header: "Inspection", kind: "strong" },
      { key: "stage", header: "Stage", kind: "humanize" },
      { key: "grn", header: "GRN", get: "goodsReceipt.number", kind: "mono" },
      { key: "production", header: "Production", get: "productionOrder.number", kind: "mono" },
      { key: "batch", header: "Batch", get: "batch.code", kind: "mono" },
      { key: "status", header: "Status", kind: "status" },
      { key: "createdAt", header: "Raised", kind: "relative" },
    ],
    actions: [
      { key: "decide", label: "Record decision", permission: "quality.approve", path: (row) => `/quality/${row.id}/decide`, when: (row) => row.status === "PENDING", fields: [{ key: "decision", label: "Decision", type: "select", options: ["ACCEPTED", "REJECTED", "REWORK"], required: true }, { key: "notes", label: "Notes", type: "textarea", wide: true }] },
    ],
  },
  ncr: {
    title: "Non-conformance",
    description: "NCRs with root cause and corrective and preventive actions.",
    path: "/ncr",
    permission: "ncr.view",
    titleKey: "number",
    subtitleKey: "issue",
    statusKey: "status",
    statuses: ["OPEN", "INVESTIGATING", "ACTION_REQUIRED", "CLOSED"],
    columns: [
      { key: "number", header: "NCR", kind: "strong" },
      { key: "issue", header: "Issue" },
      { key: "vendor", header: "Vendor", get: "vendor.name" },
      { key: "status", header: "Status", kind: "status" },
      { key: "deadline", header: "Deadline", kind: "date" },
      { key: "createdAt", header: "Raised", kind: "relative" },
    ],
    actions: [
      {
        key: "update",
        label: "Update CAPA",
        method: "PATCH",
        permission: "ncr.edit",
        path: (row) => `/ncr/${row.id}`,
        fields: [
          statusField(["OPEN", "INVESTIGATING", "ACTION_REQUIRED", "CLOSED"]),
          { key: "deadline", label: "Deadline", type: "date" },
          { key: "rootCause", label: "Root cause", type: "textarea", wide: true },
          { key: "correctiveAction", label: "Corrective action", type: "textarea", wide: true },
          { key: "preventiveAction", label: "Preventive action", type: "textarea", wide: true },
        ],
      },
    ],
  },
  sites: {
    title: "Site execution",
    description: "Issues, shortages and snags raised from project sites.",
    path: "/sites/issues",
    permission: "sites.view",
    titleKey: "title",
    subtitleKey: "number",
    statusKey: "status",
    statuses: ISSUE_STATUSES,
    columns: [
      { key: "number", header: "Issue", kind: "strong" },
      { key: "title", header: "Title" },
      { key: "project", header: "Project", get: "project.name" },
      { key: "shortage", header: "Shortage", kind: "bool" },
      { key: "assignee", header: "Owner", get: "assignee.name", kind: "avatar" },
      { key: "status", header: "Status", kind: "status" },
      { key: "createdAt", header: "Raised", kind: "relative" },
    ],
    create: {
      permission: "sites.create",
      label: "Raise issue",
      fields: [
        { key: "projectId", label: "Project", type: "select", optionsFrom: projectOptions, required: true, wide: true },
        { key: "title", label: "Title", required: true, wide: true },
        { key: "description", label: "Description", type: "textarea", wide: true },
        { key: "shortage", label: "Material shortage", type: "checkbox" },
      ],
    },
    actions: [{ key: "status", label: "Update status", method: "PATCH", path: (row) => `/sites/issues/${row.id}`, permission: "sites.edit", fields: [statusField(ISSUE_STATUSES), { key: "description", label: "Description", type: "textarea", wide: true }] }],
  },
  service: {
    title: "Service",
    description: "Customer service tickets with SLA tracking.",
    path: "/service/tickets",
    permission: "service.view",
    titleKey: "subject",
    subtitleKey: "number",
    statusKey: "status",
    statuses: ISSUE_STATUSES,
    columns: [
      { key: "number", header: "Ticket", kind: "strong" },
      { key: "subject", header: "Subject" },
      { key: "customer", header: "Customer", get: "customer.name" },
      { key: "priority", header: "Priority", kind: "status" },
      { key: "assignee", header: "Owner", get: "assignee.name", kind: "avatar" },
      { key: "status", header: "Status", kind: "status" },
      { key: "dueAt", header: "SLA due", kind: "date" },
    ],
    create: {
      permission: "service.create",
      label: "New ticket",
      fields: [
        { key: "subject", label: "Subject", required: true, wide: true },
        { key: "customerId", label: "Customer", type: "select", optionsFrom: customerOptions },
        { key: "priority", label: "Priority", type: "select", options: TICKET_PRIORITIES, defaultValue: "MEDIUM" },
        { key: "description", label: "Description", type: "textarea", wide: true },
      ],
    },
    actions: [{ key: "status", label: "Update ticket", method: "PATCH", path: (row) => `/service/tickets/${row.id}`, permission: "service.edit", fields: [statusField(ISSUE_STATUSES), { key: "priority", label: "Priority", type: "select", options: TICKET_PRIORITIES }] }],
    hidden: ["comments"],
  },
  invoices: {
    title: "Invoices",
    description: "Tax invoices raised from dispatches, with payments received.",
    path: "/invoices",
    permission: "invoices.view",
    titleKey: "number",
    statusKey: "status",
    statuses: ["DRAFT", "ISSUED", "PARTIAL", "PAID", "OVERDUE", "CANCELLED"],
    columns: [
      { key: "number", header: "Invoice", kind: "strong" },
      { key: "customer", header: "Customer", get: "customer.name" },
      { key: "total", header: "Total", kind: "money", align: "right" },
      { key: "payments", header: "Payments", kind: "count", align: "right" },
      { key: "status", header: "Status", kind: "status" },
      { key: "dueDate", header: "Due", kind: "date" },
      { key: "createdAt", header: "Issued", kind: "date" },
    ],
    actions: [
      {
        key: "receive",
        label: "Record receipt",
        permission: "payments.create",
        path: () => "/payments",
        when: (row) => ["ISSUED", "PARTIAL", "OVERDUE"].includes(String(row.status)),
        body: (row) => ({ direction: "IN", invoiceId: row.id }),
        fields: [
          { key: "amount", label: "Amount settled (INR)", type: "number", required: true, hint: "Include any TDS the customer deducted." },
          { key: "paidAt", label: "Received on", type: "date" },
          { key: "method", label: "Method", type: "select", options: ["NEFT", "RTGS", "IMPS", "UPI", "CHEQUE", "CASH", "CARD"], defaultValue: "NEFT" },
          { key: "accountId", label: "Deposited to", type: "select", optionsFrom: cashAccountOptions },
          { key: "tdsAmount", label: "TDS deducted", type: "number" },
          { key: "bankCharges", label: "Bank charges", type: "number" },
          { key: "reference", label: "UTR / cheque no.", wide: true },
        ],
      },
      {
        key: "paylink",
        label: "Payment link",
        permission: "invoices.edit",
        variant: "outline",
        path: (row) => `/invoices/${row.id}/payment-link`,
        when: (row) => ["ISSUED", "PARTIAL", "OVERDUE"].includes(String(row.status)),
        fields: [
          { key: "amount", label: "Amount (blank = full balance)", type: "number" },
          { key: "expireDays", label: "Valid for (days)", type: "number", defaultValue: "30" },
        ],
      },
    ],
  },
  expenses: {
    title: "Expenses",
    description: "Employee expense claims through manager and finance approval.",
    path: "/expenses",
    permission: "expenses.view",
    titleKey: "number",
    subtitleKey: "category",
    statusKey: "status",
    statuses: ["MANAGER", "FINANCE", "PAID", "REJECTED"],
    columns: [
      { key: "number", header: "Claim", kind: "strong" },
      { key: "employee", header: "Employee", get: "employee.name" },
      { key: "category", header: "Category", kind: "humanize" },
      { key: "amount", header: "Amount", kind: "money", align: "right" },
      { key: "status", header: "Stage", kind: "status" },
      { key: "spentOn", header: "Spent on", kind: "date" },
    ],
    create: {
      permission: "expenses.create",
      label: "New claim",
      fields: [
        { key: "category", label: "Category", type: "select", options: EXPENSE_CATEGORIES, required: true, defaultValue: "TRAVEL" },
        { key: "amount", label: "Amount (INR)", type: "number", required: true },
        { key: "spentOn", label: "Spent on", type: "date" },
        { key: "description", label: "Description", type: "textarea", wide: true },
      ],
    },
    actions: [
      { key: "approve", label: "Approve", permission: "expenses.approve", path: (row) => `/expenses/${row.id}/advance`, when: (row) => row.status === "MANAGER" || row.status === "FINANCE", body: () => ({ decision: "FORWARD" }) },
      { key: "reject", label: "Reject", permission: "expenses.approve", path: (row) => `/expenses/${row.id}/advance`, when: (row) => row.status === "MANAGER" || row.status === "FINANCE", body: () => ({ decision: "REJECTED" }), variant: "danger" },
    ],
  },
  users: {
    title: "Users",
    description: "Staff and portal accounts with their roles.",
    path: "/users",
    permission: "users.view",
    titleKey: "name",
    subtitleKey: "email",
    columns: [
      { key: "name", header: "Name", kind: "strong" },
      { key: "email", header: "Email" },
      { key: "kind", header: "Type", kind: "humanize" },
      { key: "jobTitle", header: "Job title" },
      { key: "roles", header: "Roles", kind: "count", align: "right" },
      { key: "mfaEnabled", header: "MFA", kind: "bool" },
      { key: "active", header: "Active", kind: "bool" },
      { key: "lastLoginAt", header: "Last login", kind: "relative" },
    ],
    create: {
      permission: "users.create",
      label: "Invite user",
      fields: [
        { key: "name", label: "Name", required: true },
        { key: "email", label: "Email", type: "email", required: true },
        { key: "password", label: "Temporary password", type: "password", required: true, hint: "10+ characters with upper, lower case and a number" },
        { key: "kind", label: "Type", type: "select", options: ["STAFF", "EXTERNAL"], defaultValue: "STAFF" },
        { key: "roleKeys", label: "Roles", type: "list", required: true, hint: "Comma separated role keys, e.g. sales_executive" },
        { key: "customerId", label: "Customer (portal users)", type: "select", optionsFrom: customerOptions },
        { key: "jobTitle", label: "Job title" },
        { key: "phone", label: "Phone" },
      ],
    },
    actions: [
      { key: "deactivate", label: "Deactivate", method: "PATCH", permission: "users.edit", path: (row) => `/users/${row.id}`, when: (row) => row.active === true, body: () => ({ active: false }), variant: "danger" },
      { key: "activate", label: "Reactivate", method: "PATCH", permission: "users.edit", path: (row) => `/users/${row.id}`, when: (row) => row.active === false, body: () => ({ active: true }) },
    ],
    hidden: ["passwordHash", "mfaSecret"],
  },
  audit: {
    title: "Audit log",
    description: "Every create, update, override and sign-in, with before and after values.",
    path: "/audit",
    permission: "audit.view",
    titleKey: "action",
    subtitleKey: "entityType",
    columns: [
      { key: "createdAt", header: "When", kind: "relative" },
      { key: "action", header: "Action", kind: "strong" },
      { key: "entityType", header: "Entity", kind: "humanize" },
      { key: "entityId", header: "Record", kind: "mono" },
      { key: "actorId", header: "Actor", kind: "mono" },
      { key: "ip", header: "IP", kind: "mono" },
    ],
  },
};
