import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  ALL_PERMISSIONS,
  ROLE_PRESETS,
  permissionsForRole,
} from "../../shared/src/index";
import { hashPassword } from "../../shared/src/password";
import { importFixotec } from "./import-fixotec";
import { seedRedesign } from "./seed-redesign";

function loadEnv() {
  const file = path.resolve(__dirname, "../../../.env");
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx < 0) continue;
    const key = trimmed.slice(0, idx).trim().replace(/^\uFEFF/, "");
    const value = trimmed.slice(idx + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const prisma = new PrismaClient();
const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!234";
const STAFF_DOMAIN = "demo.fixotec.test";
const storageRoot = path.resolve(__dirname, "../../../storage");

function days(offset: number) {
  return new Date(Date.now() + offset * 86_400_000);
}

async function main() {
  const extra = ["products.view_cost", "hr.view_salary"];
  const keys = new Set<string>([...ALL_PERMISSIONS, ...extra]);
  for (const preset of Object.values(ROLE_PRESETS)) {
    if (preset.permissions !== "*") preset.permissions.forEach((key) => keys.add(key));
  }

  for (const key of keys) {
    const [resource, action] = key.split(".");
    await prisma.permission.upsert({
      where: { key },
      update: {},
      create: { key, resource, action },
    });
  }

  for (const [key, preset] of Object.entries(ROLE_PRESETS)) {
    const role = await prisma.role.upsert({
      where: { key },
      update: { name: preset.name, kind: preset.kind },
      create: { key, name: preset.name, kind: preset.kind, description: preset.name },
    });
    const granted = permissionsForRole(key);
    const perms = await prisma.permission.findMany({ where: { key: { in: granted } } });
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    if (perms.length) {
      await prisma.rolePermission.createMany({
        data: perms.map((permission) => ({ roleId: role.id, permissionId: permission.id })),
      });
    }
  }

  const sequences = [
    ["LEAD", "LD-"],
    ["PROJECT", "PRJ-"],
    ["RFQ", "RFQ-"],
    ["QUOTATION", "QT-"],
    ["SALES_ORDER", "SO-"],
    ["PURCHASE_REQUISITION", "PR-"],
    ["PURCHASE_ORDER", "PO-"],
    ["GRN", "GRN-"],
    ["PRODUCTION", "PRD-"],
    ["JOB", "JOB-"],
    ["DISPATCH", "DSP-"],
    ["NCR", "NCR-"],
    ["INVOICE", "INV-"],
    ["ENGINEERING", "ENQ-"],
    ["BOQ", "BOQ-"],
    ["TICKET", "TKT-"],
    ["EXPENSE", "EXP-"],
    ["PAYMENT", "PMT-"],
    ["QC", "QC-"],
    ["ISSUE", "ISS-"],
    ["SUBMITTAL", "SUB-"],
    ["VENDOR_BILL", "VB-"],
    ["CUSTOMER", "CUS-"],
    ["VENDOR", "VEN-"],
    ["JOURNAL", "JV-"],
    ["CREDIT_NOTE", "CN-"],
    ["DEBIT_NOTE", "DN-"],
    ["PAYMENT_RUN", "PR-"],
    ["PAYROLL", "PAY-"],
  ] as const;
  for (const [key, prefix] of sequences) {
    await prisma.numberSequence.upsert({
      where: { key },
      update: {},
      create: { key, prefix, next: 200, pad: 4 },
    });
  }

  // Invented company details must stay obviously fake so the demo never passes them off as Fixotec's real records.
  const entityData = {
    name: "Fixotec (Demo Entity)",
    gstin: "27AAAAA0000A1Z5",
    pan: "AAAAA0000A",
    address: "Demo address, Pune, Maharashtra",
  };
  const entity = await prisma.legalEntity.upsert({
    where: { code: "FIX-IN" },
    update: entityData,
    create: { code: "FIX-IN", ...entityData },
  });
  await prisma.taxRegistration.deleteMany({ where: { legalEntityId: entity.id } });
  await prisma.taxRegistration.createMany({
    data: [
      { legalEntityId: entity.id, type: "GST", number: entity.gstin || "" },
      { legalEntityId: entity.id, type: "PAN", number: entity.pan || "" },
    ],
  });
  await prisma.bankAccount.deleteMany({ where: { legalEntityId: entity.id } });
  await prisma.bankAccount.create({
    data: {
      legalEntityId: entity.id,
      bankName: "Demo Bank",
      accountNo: "000000000000",
      ifsc: "DEMO0000000",
      currency: "INR",
    },
  });

  const branchData = [
    { code: "PUN", name: "Pune HQ (Demo)", region: "WEST", address: "Demo address, Pune" },
    { code: "DEL", name: "Delhi (Demo)", region: "NORTH", address: "Demo address, New Delhi" },
    { code: "CHE", name: "Chennai (Demo)", region: "SOUTH", address: "Demo address, Chennai" },
    { code: "DXB", name: "Dubai (Demo)", region: "INTERNATIONAL", address: "Demo address, Dubai" },
  ];
  for (const branch of branchData) {
    await prisma.branch.upsert({ where: { code: branch.code }, update: branch, create: branch });
  }
  const pune = await prisma.branch.findUniqueOrThrow({ where: { code: "PUN" } });
  await prisma.office.deleteMany({ where: { branchId: pune.id, name: "Corporate Office" } });
  await prisma.office.create({ data: { branchId: pune.id, name: "Corporate Office", address: pune.address } });

  const plantData = { name: "Pune Manufacturing (Demo)", address: "Demo address, Pune" };
  const plant = await prisma.plant.upsert({
    where: { code: "PLT-PUN" },
    update: plantData,
    create: { code: "PLT-PUN", branchId: pune.id, ...plantData },
  });

  const departments = [
    ["CORP", "Corporate"],
    ["SALES", "Sales"],
    ["ENG", "Engineering"],
    ["MFG", "Manufacturing"],
    ["PROC", "Procurement"],
    ["WH", "Warehouse"],
    ["PRJ", "Projects"],
    ["FIN", "Finance"],
    ["HR", "HR"],
    ["SVC", "Service"],
  ] as const;
  for (const [code, name] of departments) {
    await prisma.department.upsert({ where: { code }, update: { name }, create: { code, name } });
  }
  const sales = await prisma.department.findUniqueOrThrow({ where: { code: "SALES" } });
  for (const [code, name] of [
    ["SALES-N", "North"],
    ["SALES-W", "West"],
    ["SALES-S", "South"],
    ["SALES-I", "International"],
  ] as const) {
    await prisma.department.upsert({
      where: { code },
      update: { name, parentId: sales.id },
      create: { code, name, parentId: sales.id },
    });
  }
  const engineering = await prisma.department.findUniqueOrThrow({ where: { code: "ENG" } });
  for (const [code, name] of [
    ["ENG-DES", "Design"],
    ["ENG-BIM", "BIM"],
    ["ENG-TEC", "Technical"],
  ] as const) {
    await prisma.department.upsert({
      where: { code },
      update: { name, parentId: engineering.id },
      create: { code, name, parentId: engineering.id },
    });
  }

  await prisma.costCenter.upsert({
    where: { code: "CC-SALES" },
    update: {},
    create: { code: "CC-SALES", name: "Sales", departmentId: sales.id },
  });
  await prisma.costCenter.upsert({
    where: { code: "CC-MFG" },
    update: {},
    create: { code: "CC-MFG", name: "Manufacturing" },
  });
  await prisma.profitCenter.upsert({
    where: { code: "PC-MEP" },
    update: {},
    create: { code: "PC-MEP", name: "MEP Support Systems" },
  });
  await prisma.financialYear.upsert({
    where: { label: "FY 2026-27" },
    update: { active: true },
    create: { label: "FY 2026-27", startDate: new Date("2026-04-01"), endDate: new Date("2027-03-31"), active: true },
  });
  for (const currency of [
    { code: "INR", name: "Indian Rupee", symbol: "₹", rateToInr: 1 },
    { code: "USD", name: "US Dollar", symbol: "$", rateToInr: 83 },
    { code: "EUR", name: "Euro", symbol: "€", rateToInr: 90 },
    { code: "AED", name: "UAE Dirham", symbol: "AED", rateToInr: 22.6 },
  ]) {
    await prisma.currency.upsert({ where: { code: currency.code }, update: currency, create: currency });
  }
  for (const unit of [
    ["NOS", "Numbers"],
    ["M", "Metre"],
    ["KG", "Kilogram"],
    ["SET", "Set"],
  ] as const) {
    await prisma.unitOfMeasure.upsert({ where: { code: unit[0] }, update: { name: unit[1] }, create: { code: unit[0], name: unit[1] } });
  }

  await prisma.businessSetting.upsert({
    where: { key: "sla" },
    update: { value: { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 48 } },
    create: { key: "sla", value: { CRITICAL: 4, HIGH: 8, MEDIUM: 24, LOW: 48 } },
  });
  await prisma.businessSetting.upsert({
    where: { key: "company" },
    update: {},
    create: {
      key: "company",
      value: { name: "Fixotec", legalName: entity.name, currency: "INR", gstRate: 18 },
    },
  });

  const rules = [
    {
      name: "Quotation discount under 10%",
      entityType: "QUOTATION",
      approverRole: "sales_manager",
      priority: 10,
      condition: { all: [{ field: "discountPct", op: "gte", value: 0 }, { field: "discountPct", op: "lt", value: 10 }] },
    },
    {
      name: "Quotation discount 10 to 20%",
      entityType: "QUOTATION",
      approverRole: "sales_head",
      priority: 20,
      condition: { all: [{ field: "discountPct", op: "gte", value: 10 }, { field: "discountPct", op: "lt", value: 20 }] },
    },
    {
      name: "Quotation discount above 20%",
      entityType: "QUOTATION",
      approverRole: "managing_director",
      priority: 30,
      condition: { all: [{ field: "discountPct", op: "gte", value: 20 }] },
    },
    {
      name: "Purchase above 5 lakh",
      entityType: "PURCHASE",
      approverRole: "procurement_manager",
      priority: 10,
      condition: { all: [{ field: "amount", op: "gt", value: 500000 }, { field: "amount", op: "lte", value: 2000000 }] },
    },
    {
      name: "Purchase above 20 lakh",
      entityType: "PURCHASE",
      approverRole: "managing_director",
      priority: 20,
      condition: { all: [{ field: "amount", op: "gt", value: 2000000 }] },
    },
    {
      name: "Engineering client submission",
      entityType: "ENGINEERING",
      approverRole: "engineering_head",
      priority: 10,
      condition: { all: [{ field: "clientSubmission", op: "eq", value: 1 }] },
    },
  ];
  await prisma.approvalRule.deleteMany({});
  await prisma.approvalRule.createMany({ data: rules });

  const warehouse = await prisma.warehouse.upsert({
    where: { code: "WH-PUN" },
    update: { name: "Pune Central Warehouse (Demo)", address: plant.address },
    create: { code: "WH-PUN", name: "Pune Central Warehouse (Demo)", plantId: plant.id, address: plant.address },
  });
  const zones = ["RAW", "WIP", "FG", "REJECTED", "QC_HOLD", "SCRAP"] as const;
  for (const zone of zones) {
    const code = zone;
    await prisma.warehouseBin.upsert({
      where: { warehouseId_code: { warehouseId: warehouse.id, code } },
      update: { zone },
      create: { warehouseId: warehouse.id, code, zone, barcode: `BIN-${code}` },
    });
  }

  const workCenter = await prisma.workCenter.upsert({
    where: { code: "WC-FAB" },
    update: {},
    create: { code: "WC-FAB", name: "Fabrication", plantId: plant.id },
  });
  for (const machine of [
    { code: "LASER-01", name: "Laser-01", capacityPerDay: 10 },
    { code: "PRESS-01", name: "Press-01", capacityPerDay: 8 },
    { code: "CNC-02", name: "CNC-02", capacityPerDay: 8 },
    { code: "LASER-02", name: "Laser-02", capacityPerDay: 10 },
  ]) {
    await prisma.machine.upsert({
      where: { code: machine.code },
      update: { ...machine, workCenterId: workCenter.id },
      create: { ...machine, workCenterId: workCenter.id, status: "IDLE" },
    });
  }

  async function user(email: string, name: string, roleKey: string, extraData: Record<string, string | null> = {}) {
    const role = await prisma.role.findUniqueOrThrow({ where: { key: roleKey } });
    const record = await prisma.user.upsert({
      where: { email },
      update: { name, passwordHash: hashPassword(password), active: true, ...extraData },
      create: {
        email,
        name,
        passwordHash: hashPassword(password),
        kind: role.kind,
        jobTitle: role.name,
        ...extraData,
      },
    });
    await prisma.userRole.deleteMany({ where: { userId: record.id } });
    await prisma.userRole.create({ data: { userId: record.id, roleId: role.id } });
    return record;
  }

  // Staff logins live on the reserved .test TLD so seeded mail can never reach a real inbox.
  const staff = (local: string) => `${local}@${STAFF_DOMAIN}`;
  for (const local of ["admin", "md", "saleshead", "sales", "engineer", "purchase", "warehouse", "production", "qc", "site", "finance", "hr"]) {
    const legacy = await prisma.user.findUnique({ where: { email: `${local}@fixotec.com` } });
    if (legacy && !(await prisma.user.findUnique({ where: { email: staff(local) } }))) {
      await prisma.user.update({ where: { id: legacy.id }, data: { email: staff(local) } });
    }
  }

  const admin = await user(staff("admin"), "Demo Admin", "super_admin", { branchId: pune.id });
  const md = await user(staff("md"), "Demo MD", "managing_director", { branchId: pune.id });
  await user(staff("saleshead"), "Demo Sales Head", "sales_head", { branchId: pune.id, departmentId: sales.id });
  const executive = await user(staff("sales"), "Demo Sales Executive", "sales_executive", { branchId: pune.id, departmentId: sales.id });
  const engineer = await user(staff("engineer"), "Demo Design Engineer", "design_engineer", { branchId: pune.id, departmentId: engineering.id });
  await user(staff("purchase"), "Demo Procurement Manager", "procurement_manager");
  await user(staff("warehouse"), "Demo Warehouse Manager", "warehouse_manager");
  await user(staff("production"), "Demo Production Manager", "production_manager");
  await user(staff("qc"), "Demo QC Manager", "qc_manager");
  const siteEngineer = await user(staff("site"), "Demo Site Engineer", "site_engineer");
  await user(staff("finance"), "Demo Finance Head", "finance_head");
  await user(staff("hr"), "Demo HR", "hr");

  await prisma.employee.upsert({
    where: { code: "EMP-001" },
    update: { name: executive.name },
    create: {
      code: "EMP-001",
      name: executive.name,
      userId: executive.id,
      departmentId: sales.id,
      branchId: pune.id,
      joiningDate: new Date("2022-06-01"),
      salary: 950000,
    },
  });
  await prisma.employee.upsert({
    where: { code: "EMP-002" },
    update: { name: siteEngineer.name },
    create: {
      code: "EMP-002",
      name: siteEngineer.name,
      userId: siteEngineer.id,
      departmentId: (await prisma.department.findUniqueOrThrow({ where: { code: "PRJ" } })).id,
      branchId: pune.id,
      joiningDate: new Date("2023-01-15"),
      salary: 820000,
    },
  });

  const family = await prisma.productFamily.upsert({
    where: { slug: "mounting" },
    update: {},
    create: { name: "Mounting Systems", slug: "mounting" },
  });
  const categories = [
    ["rails", "Mounting Rails"],
    ["clamps", "Pipe Clamps"],
    ["hangers", "Hangers"],
    ["connectors", "Connectors"],
    ["rods", "Threaded Rods"],
    ["anchors", "Anchors"],
  ] as const;
  const categoryIds: Record<string, string> = {};
  for (const [slug, name] of categories) {
    const row = await prisma.productCategory.upsert({ where: { slug }, update: { name }, create: { slug, name } });
    categoryIds[slug] = row.id;
  }

  async function ensureProduct(input: {
    sku: string;
    slug: string;
    name: string;
    category: string;
    applications: string[];
    material: string;
    coating: string;
    supplyMode: string;
    description: string;
    technical: string;
    load?: string;
    pipeSize?: string;
    hsn?: string;
    variants: Array<{
      article: string;
      sku: string;
      name: string;
      attributes: Record<string, string>;
      purchase: number;
      make: number;
      standard: number;
      dealer: number;
      safety: number;
      reorder: number;
    }>;
  }) {
    const product = await prisma.product.upsert({
      where: { sku: input.sku },
      update: {},
      create: {
        sku: input.sku,
        slug: `erp-${input.slug}`,
        name: input.name,
        familyId: family.id,
        categoryId: categoryIds[input.category],
        productType: input.supplyMode === "BUY" ? "RAW" : "FINISHED",
        description: input.description,
        technicalDescription: input.technical,
        applications: input.applications,
        material: input.material,
        coating: input.coating,
        finish: "Hot dip galvanized",
        hsn: input.hsn || "73089090",
        gstRate: 18,
        manufacturingMethod: input.supplyMode === "MAKE" ? "Roll formed and fabricated" : "Bought out",
        leadTimeDays: input.supplyMode === "MAKE" ? 10 : 21,
        moq: 1,
        supplyMode: input.supplyMode,
        purchaseCost: input.variants[0].purchase,
        manufacturingCost: input.variants[0].make,
        standardPrice: input.variants[0].standard,
        loadCapacity: input.load,
        pipeSize: input.pipeSize,
        revision: "C",
        published: false,
        metaTitle: `${input.name} | Fixotec`,
        metaDescription: input.description,
      },
    });
    for (const variant of input.variants) {
      await prisma.productVariant.upsert({
        where: { articleNumber: variant.article },
        update: {},
        create: {
          productId: product.id,
          articleNumber: variant.article,
          sku: variant.sku,
          name: variant.name,
          attributes: variant.attributes,
          barcode: variant.article.replace(/[^A-Z0-9]/gi, ""),
          purchaseCost: variant.purchase,
          manufacturingCost: variant.make,
          standardPrice: variant.standard,
          customerPrice: Math.round(variant.standard * 0.97),
          dealerPrice: variant.dealer,
          exportPrice: Math.round(variant.standard * 1.08),
          safetyStock: variant.safety,
          reorderLevel: variant.reorder,
        },
      });
    }
    return product;
  }

  await ensureProduct({
    sku: "FXR",
    slug: "fxr-mounting-rail",
    name: "FXR Mounting Rail",
    category: "rails",
    applications: ["HVAC", "Plumbing", "Electrical", "Fire Fighting", "Data Centers"],
    material: "DX51D / DD11",
    coating: "Galvanized / HDG",
    supplyMode: "MAKE",
    description: "Universal slotted rail for modular MEP support above the ceiling and in risers.",
    technical: "Roll-formed channel with continuous slot. Thickness and section selected from the imposed load and span.",
    load: "See engineering tables by span",
    variants: [
      { article: "FXR-4121-15", sku: "FXR-4121-15", name: "FXR 41×21 × 1.5 mm", attributes: { section: "41×21", thickness: "1.5mm" }, purchase: 280, make: 320, standard: 540, dealer: 470, safety: 200, reorder: 300 },
      { article: "FXR-4121-20", sku: "FXR-4121-20", name: "FXR 41×21 × 2.0 mm", attributes: { section: "41×21", thickness: "2.0mm" }, purchase: 340, make: 390, standard: 640, dealer: 560, safety: 150, reorder: 250 },
      { article: "FXR-4141-15", sku: "FXR-4141-15", name: "FXR 41×41 × 1.5 mm", attributes: { section: "41×41", thickness: "1.5mm" }, purchase: 420, make: 480, standard: 790, dealer: 690, safety: 180, reorder: 280 },
      { article: "FXR-4141-20", sku: "FXR-4141-20", name: "FXR 41×41 × 2.0 mm", attributes: { section: "41×41", thickness: "2.0mm" }, purchase: 510, make: 580, standard: 960, dealer: 840, safety: 220, reorder: 320 },
      { article: "FXR-4141-25", sku: "FXR-4141-25", name: "FXR 41×41 × 2.5 mm", attributes: { section: "41×41", thickness: "2.5mm" }, purchase: 640, make: 720, standard: 1180, dealer: 1020, safety: 80, reorder: 140 },
      { article: "FXR-4162-20", sku: "FXR-4162-20", name: "FXR 41×62 × 2.0 mm", attributes: { section: "41×62", thickness: "2.0mm" }, purchase: 760, make: 860, standard: 1420, dealer: 1240, safety: 40, reorder: 80 },
      { article: "FXR-4162-25", sku: "FXR-4162-25", name: "FXR 41×62 × 2.5 mm", attributes: { section: "41×62", thickness: "2.5mm" }, purchase: 890, make: 990, standard: 1640, dealer: 1440, safety: 30, reorder: 60 },
    ],
  });
  await ensureProduct({
    sku: "SRS",
    slug: "srs-heavy",
    name: "SRS Heavy Clamp",
    category: "clamps",
    applications: ["HVAC", "Plumbing", "Fire Fighting"],
    material: "Steel with EPDM lining",
    coating: "HDG",
    supplyMode: "MAKE",
    description: "Heavy pipe clamp for insulated and uninsulated services.",
    technical: "Two-piece clamp with EPDM isolation. Select by nominal pipe size.",
    pipeSize: "15 mm to 300 mm",
    load: "Up to 2.5 kN depending on rod",
    variants: [
      { article: "SRS-HVY-050", sku: "SRS-HVY-050", name: "SRS Heavy 50 mm", attributes: { pipe: "50mm" }, purchase: 90, make: 110, standard: 220, dealer: 180, safety: 100, reorder: 200 },
      { article: "SRS-HVY-100", sku: "SRS-HVY-100", name: "SRS Heavy 100 mm", attributes: { pipe: "100mm" }, purchase: 140, make: 170, standard: 340, dealer: 280, safety: 80, reorder: 150 },
      { article: "SRS-HVY-150", sku: "SRS-HVY-150", name: "SRS Heavy 150 mm", attributes: { pipe: "150mm" }, purchase: 210, make: 250, standard: 480, dealer: 410, safety: 40, reorder: 80 },
    ],
  });
  await ensureProduct({
    sku: "ROD",
    slug: "threaded-rod",
    name: "Threaded Rod",
    category: "rods",
    applications: ["HVAC", "Electrical", "Fire Fighting"],
    material: "Carbon steel",
    coating: "Zinc / HDG",
    supplyMode: "BUY",
    description: "Suspension rod for hangers and trapeze frames.",
    technical: "Metric thread. Cut to length on site or supplied in 1 m and 2 m sticks.",
    variants: [
      { article: "ROD-M10-1M", sku: "ROD-M10-1M", name: "Threaded rod M10 × 1 m", attributes: { thread: "M10", length: "1m" }, purchase: 48, make: 48, standard: 95, dealer: 78, safety: 200, reorder: 400 },
      { article: "ROD-M10-2M", sku: "ROD-M10-2M", name: "Threaded rod M10 × 2 m", attributes: { thread: "M10", length: "2m" }, purchase: 86, make: 86, standard: 160, dealer: 135, safety: 100, reorder: 200 },
    ],
  });
  await ensureProduct({
    sku: "CON",
    slug: "fxr-connector",
    name: "FXR Connector",
    category: "connectors",
    applications: ["HVAC", "Electrical", "Data Centers"],
    material: "Steel",
    coating: "HDG",
    supplyMode: "MAKE",
    description: "Angle and splice connector for FXR rail frames.",
    technical: "Matches the 41 mm slot. Use in pairs on back-to-back rails.",
    variants: [
      { article: "CON-4141", sku: "CON-4141", name: "FXR 90° connector", attributes: { fit: "41mm" }, purchase: 35, make: 42, standard: 90, dealer: 72, safety: 150, reorder: 250 },
    ],
  });
  await ensureProduct({
    sku: "ANC",
    slug: "anchor",
    name: "Wedge Anchor",
    category: "anchors",
    applications: ["High-Rise", "Industrial", "Data Centers"],
    material: "Carbon steel",
    coating: "Zinc",
    supplyMode: "BUY",
    description: "Mechanical anchor for concrete soffits.",
    technical: "Select embedment from the structural drawing. Not for cracked concrete unless specified.",
    variants: [
      { article: "ANC-M10", sku: "ANC-M10", name: "Wedge anchor M10", attributes: { thread: "M10" }, purchase: 22, make: 22, standard: 55, dealer: 42, safety: 300, reorder: 500 },
    ],
  });
  await ensureProduct({
    sku: "HNG",
    slug: "hanger",
    name: "Heavy Duty Hanger",
    category: "hangers",
    applications: ["HVAC", "Fire Fighting", "Industrial"],
    material: "Steel",
    coating: "HDG",
    supplyMode: "MAKE",
    description: "Hanger assembly for larger services and seismic layouts.",
    technical: "Clevis and rod seat. Confirm lateral restraint separately for seismic zones.",
    load: "Up to 5 kN",
    variants: [
      { article: "HNG-M10", sku: "HNG-M10", name: "Hanger M10", attributes: { thread: "M10" }, purchase: 70, make: 88, standard: 180, dealer: 150, safety: 60, reorder: 100 },
    ],
  });

  const rail = await prisma.productVariant.findUniqueOrThrow({ where: { articleNumber: "FXR-4141-20" } });
  const clamp = await prisma.productVariant.findUniqueOrThrow({ where: { articleNumber: "SRS-HVY-100" } });
  const rod = await prisma.productVariant.findUniqueOrThrow({ where: { articleNumber: "ROD-M10-1M" } });
  const connector = await prisma.productVariant.findUniqueOrThrow({ where: { articleNumber: "CON-4141" } });
  const steel = await prisma.productVariant.findUniqueOrThrow({ where: { articleNumber: "FXR-4121-20" } });

  const bom = await prisma.bom.upsert({
    where: { id: "seed-bom-fxr" },
    update: {},
    create: {
      id: "seed-bom-fxr",
      variantId: rail.id,
      revision: "C",
      yieldPct: 96,
      labourMinutes: 8,
      machineMinutes: 6,
      overheadCost: 40,
      items: {
        create: [
          { componentVariantId: steel.id, qty: 1.05, scrapPct: 4, unit: "M" },
          { componentVariantId: connector.id, qty: 0.1, scrapPct: 1, unit: "NOS", isAlternate: false },
        ],
      },
    },
  });
  void bom;

  const fg = await prisma.warehouseBin.findFirstOrThrow({ where: { warehouseId: warehouse.id, zone: "FG" } });
  const raw = await prisma.warehouseBin.findFirstOrThrow({ where: { warehouseId: warehouse.id, zone: "RAW" } });

  async function opening(variantId: string, binId: string, qty: number, cost: number) {
    const existing = await prisma.inventoryTransaction.findFirst({
      where: { variantId, type: "OPENING", referenceType: "SEED" },
    });
    if (existing) return;
    await prisma.inventoryBalance.upsert({
      where: { warehouseId_binId_variantId_batchKey: { warehouseId: warehouse.id, binId, variantId, batchKey: "_" } },
      update: { qty, avgCost: cost },
      create: { warehouseId: warehouse.id, binId, variantId, batchKey: "_", qty, avgCost: cost },
    });
    await prisma.inventoryTransaction.create({
      data: {
        type: "OPENING",
        warehouseId: warehouse.id,
        binId,
        variantId,
        qty,
        unitCost: cost,
        balanceAfter: qty,
        referenceType: "SEED",
        referenceId: "opening",
        actorId: admin.id,
      },
    });
  }
  await opening(rail.id, fg.id, 480, 580);
  await opening(clamp.id, fg.id, 40, 170);
  await opening(connector.id, fg.id, 900, 42);
  await opening(steel.id, raw.id, 1200, 340);

  const apex = await prisma.customer.upsert({
    where: { code: "CUS-APEX" },
    update: {},
    create: {
      code: "CUS-APEX",
      name: "Apex MEP Contractors",
      type: "MEP_CONTRACTOR",
      gstin: "27AAGCA1122B1Z8",
      email: "projects@apexmep.example",
      phone: "+91 20 4000 1100",
      creditLimit: 2500000,
      paymentTerms: "30 days from invoice",
      priceList: "CUSTOMER",
    },
  });
  const westline = await prisma.customer.upsert({
    where: { code: "CUS-WEST" },
    update: {},
    create: {
      code: "CUS-WEST",
      name: "Westline Building Systems",
      type: "DISTRIBUTOR",
      gstin: "27AABCW7788C1Z2",
      email: "orders@westline.example",
      phone: "+91 22 4000 2200",
      creditLimit: 4000000,
      paymentTerms: "45 days",
      priceList: "DEALER",
    },
  });
  const northstar = await prisma.customer.upsert({
    where: { code: "CUS-NORTH" },
    update: {},
    create: {
      code: "CUS-NORTH",
      name: "Northstar Consulting",
      type: "CONSULTANT",
      email: "spec@northstar.example",
      phone: "+91 11 4000 3300",
      creditLimit: 0,
      paymentTerms: "Advance",
      priceList: "STANDARD",
    },
  });
  await prisma.contact.deleteMany({ where: { customerId: { in: [apex.id, westline.id, northstar.id] } } });
  await prisma.contact.createMany({
    data: [
      { customerId: apex.id, name: "Aditi Rao", email: "aditi@apexmep.example", phone: "+91 98 0000 1111", title: "Project Director", primary: true },
      { customerId: westline.id, name: "Imran Sheikh", email: "imran@westline.example", title: "Purchase Head", primary: true },
      { customerId: northstar.id, name: "Devika Sen", email: "devika@northstar.example", title: "MEP Lead", primary: true },
    ],
  });
  await prisma.address.deleteMany({ where: { customerId: apex.id } });
  await prisma.address.create({
    data: { customerId: apex.id, label: "Site office", line1: "Plot 4, Magarpatta", city: "Pune", state: "Maharashtra", postalCode: "411028" },
  });

  await user("customer@apexmep.example", "Aditi Rao", "customer", { customerId: apex.id });
  await user("distributor@westline.example", "Imran Sheikh", "distributor", { customerId: westline.id });
  await user("consultant@northstar.example", "Devika Sen", "consultant", { customerId: northstar.id });

  const project = await prisma.project.upsert({
    where: { code: "PRJ-0100" },
    update: {},
    create: {
      code: "PRJ-0100",
      name: "ABC Data Center",
      location: "Hinjawadi, Pune",
      customerId: apex.id,
      consultantId: northstar.id,
      contractorId: apex.id,
      projectValue: 180000000,
      fixotecValue: 6400000,
      startDate: days(-40),
      expectedCompletion: days(-5),
      stage: "ENGINEERING",
      probability: 70,
      ownerId: executive.id,
      notes: "White space and plant-room supports. Seismic restraint on the roof gallery.",
    },
  });
  await prisma.project.upsert({
    where: { code: "PRJ-0101" },
    update: {},
    create: {
      code: "PRJ-0101",
      name: "Harbour Hospital Expansion",
      location: "Navi Mumbai",
      customerId: apex.id,
      consultantId: northstar.id,
      projectValue: 92000000,
      fixotecValue: 2100000,
      startDate: days(-10),
      expectedCompletion: days(80),
      stage: "QUOTED",
      probability: 45,
      ownerId: executive.id,
    },
  });
  await prisma.projectMember.deleteMany({ where: { projectId: project.id } });
  await prisma.projectMember.createMany({
    data: [
      { projectId: project.id, userId: executive.id, role: "Sales" },
      { projectId: project.id, userId: engineer.id, role: "Design" },
      { projectId: project.id, userId: siteEngineer.id, role: "Site" },
    ],
  });

  const lead = await prisma.lead.upsert({
    where: { number: "LD-0100" },
    update: {},
    create: {
      number: "LD-0100",
      source: "WEBSITE",
      status: "TECHNICAL_EVALUATION",
      contactName: "Aditi Rao",
      companyName: apex.name,
      email: apex.email,
      phone: apex.phone,
      application: "Data Centers",
      message: "Support system for chilled water and cable containment above the white space.",
      estimatedValue: 6400000,
      customerId: apex.id,
      projectId: project.id,
      ownerId: executive.id,
    },
  });

  const rfq = await prisma.rfq.upsert({
    where: { number: "RFQ-0100" },
    update: {},
    create: {
      number: "RFQ-0100",
      customerId: apex.id,
      projectId: project.id,
      leadId: lead.id,
      status: "PRICING",
      application: "Data Centers",
      assigneeId: executive.id,
      notes: "Customer asked for HDG rail and isolation clamps.",
      items: {
        create: [
          { variantId: rail.id, description: rail.name, qty: 250, unit: "M", specification: "HDG, 2.0 mm" },
          { variantId: clamp.id, description: clamp.name, qty: 500, unit: "NOS", specification: "100 mm pipe" },
          { variantId: rod.id, description: rod.name, qty: 800, unit: "NOS" },
        ],
      },
    },
  });

  const quote = await prisma.quotation.upsert({
    where: { number: "QT-0100" },
    update: {},
    create: {
      number: "QT-0100",
      customerId: apex.id,
      projectId: project.id,
      rfqId: rfq.id,
      status: "UNDER_REVIEW",
      validUntil: days(20),
      paymentTerms: apex.paymentTerms,
      deliveryTerms: "Ex-works Pune, 3 weeks",
      discountPct: 12,
      freight: 18000,
      subtotal: 480000,
      tax: 86400,
      total: 584400,
      marginPct: 28,
      items: {
        create: [
          { variantId: rail.id, description: rail.name, qty: 250, unit: "M", basePrice: 930, unitCost: 580, discountPct: 0, taxRate: 18 },
          { variantId: clamp.id, description: clamp.name, qty: 500, unit: "NOS", basePrice: 330, unitCost: 170, discountPct: 0, taxRate: 18 },
          { variantId: rod.id, description: rod.name, qty: 800, unit: "NOS", basePrice: 92, unitCost: 48, discountPct: 0, taxRate: 18 },
        ],
      },
    },
  });
  await prisma.approvalRequest.deleteMany({ where: { entityType: "QUOTATION", entityId: quote.id } });
  await prisma.approvalRequest.create({
    data: {
      entityType: "QUOTATION",
      entityId: quote.id,
      status: "PENDING",
      requesterId: executive.id,
      approverRole: "sales_head",
      snapshot: { discountPct: 12 },
    },
  });

  const order = await prisma.salesOrder.upsert({
    where: { number: "SO-0100" },
    update: {},
    create: {
      number: "SO-0100",
      customerId: westline.id,
      status: "CONFIRMED",
      subtotal: 168000,
      tax: 30240,
      total: 198240,
      creditExposure: 198240,
      creditLimit: 4000000,
      notes: "Distributor stocking order",
      items: {
        create: [
          { variantId: rail.id, description: rail.name, qty: 100, unitPrice: 840, unitCost: 580, taxRate: 18, backorderedQty: 0 },
          { variantId: connector.id, description: connector.name, qty: 400, unitPrice: 72, unitCost: 42, taxRate: 18 },
        ],
      },
    },
  });

  const vendor = await prisma.vendor.upsert({
    where: { code: "VEN-STEEL" },
    update: {},
    create: {
      code: "VEN-STEEL",
      name: "Deccan Coil Processors",
      gstin: "27AADCD4455E1Z9",
      email: "sales@deccancoil.example",
      phone: "+91 20 2555 0101",
      paymentTerms: "45 days",
      leadTimeDays: 12,
      qualityRating: 4.4,
      deliveryScore: 92,
      bankName: "SBI",
      bankAccount: "30111222333",
      ifsc: "SBIN0000456",
      categories: ["Steel", "Coating"],
    },
  });

  await prisma.purchaseOrder.upsert({
    where: { number: "PO-0100" },
    update: {},
    create: {
      number: "PO-0100",
      vendorId: vendor.id,
      status: "APPROVED",
      subtotal: 408000,
      tax: 73440,
      total: 481440,
      expectedOn: days(12),
      items: {
        create: [{ variantId: steel.id, description: steel.name, qty: 1200, rate: 340, taxRate: 18 }],
      },
    },
  });

  const laser = await prisma.machine.findUniqueOrThrow({ where: { code: "LASER-02" } });
  const production = await prisma.productionOrder.upsert({
    where: { number: "PRD-0100" },
    update: {},
    create: {
      number: "PRD-0100",
      variantId: rail.id,
      qty: 500,
      status: "RELEASED",
      salesOrderId: order.id,
      warehouseId: warehouse.id,
      machineId: laser.id,
      plannedStart: days(0),
      plannedEnd: days(2),
    },
  });
  await prisma.jobCard.upsert({
    where: { number: "JOB-0100" },
    update: {},
    create: {
      number: "JOB-0100",
      productionOrderId: production.id,
      machineId: laser.id,
      status: "QUEUED",
      requiredQty: 500,
    },
  });

  await prisma.engineeringRequest.upsert({
    where: { number: "ENQ-0100" },
    update: {},
    create: {
      number: "ENQ-0100",
      projectId: project.id,
      rfqId: rfq.id,
      customerId: apex.id,
      application: "Data Centers",
      requiredSystem: "Trapeze for 100 mm chilled water plus cable tray",
      load: "1.8 kN/m",
      dimensions: "Span 1.2 m, drop 600 mm",
      material: "HDG steel",
      installationCondition: "Indoor, above raised floor plenum",
      standard: "IS 800, project seismic note S2",
      engineerId: engineer.id,
      dueDate: days(4),
      status: "CALCULATION",
    },
  });

  await prisma.siteIssue.upsert({
    where: { number: "ISS-0100" },
    update: {},
    create: {
      number: "ISS-0100",
      projectId: project.id,
      status: "ACTION_REQUIRED",
      title: "Anchor clash with post-tension cable",
      description: "Grid C4 soffit anchor moved 150 mm. Drawing revision required before the next pour.",
      shortage: false,
      assigneeId: engineer.id,
    },
  });

  await prisma.serviceTicket.upsert({
    where: { number: "TKT-0100" },
    update: {},
    create: {
      number: "TKT-0100",
      customerId: apex.id,
      projectId: project.id,
      priority: "HIGH",
      status: "ASSIGNED",
      subject: "Clamp lining damaged in transit",
      description: "Two cartons of SRS Heavy 100 mm arrived with torn EPDM.",
      assigneeId: siteEngineer.id,
      slaHours: 8,
      dueAt: days(0),
    },
  });

  await prisma.distributorTarget.upsert({
    where: { id: "seed-target-west" },
    update: {},
    create: {
      id: "seed-target-west",
      customerId: westline.id,
      period: "FY2026-27",
      metric: "REVENUE",
      targetAmount: 12000000,
      achievedAmount: 198240,
    },
  });
  const scheme = await prisma.scheme.upsert({
    where: { id: "seed-scheme-q4" },
    update: {},
    create: {
      id: "seed-scheme-q4",
      name: "Rail volume Q4",
      description: "Additional 2% on FXR rail above 1,000 metres in the quarter.",
      validFrom: new Date("2026-10-01"),
      validTo: new Date("2026-12-31"),
    },
  });
  await prisma.schemeClaim.deleteMany({ where: { schemeId: scheme.id, customerId: westline.id } });
  await prisma.schemeClaim.create({
    data: { schemeId: scheme.id, customerId: westline.id, amount: 18000, status: "SUBMITTED", notes: "October rail lift" },
  });

  await prisma.caseStudy.upsert({
    where: { slug: "abc-data-center-pune" },
    update: {},
    create: {
      slug: "abc-data-center-pune",
      title: "ABC Data Center",
      location: "Pune",
      sector: "Data Centers",
      year: 2026,
      summary: "Modular overhead supports for chilled water and containment, issued with BIM and a controlled submittal.",
      body: "The support layout was built from the service loads and the ceiling void, then held under revision so the approved drawing stayed intact.",
    },
  });

  await prisma.cmsBlock.upsert({
    where: { key: "hero" },
    update: {},
    create: {
      key: "hero",
      title: "Engineered for what's above.",
      subtitle: "Precision-engineered modular support systems for modern MEP infrastructure.",
      body: "From specification to installation.",
    },
  });
  await prisma.cmsBlock.upsert({
    where: { key: "trust" },
    update: {},
    create: {
      key: "trust",
      title: "Engineering trust",
      data: ["German engineering influence", "Technical expertise", "Modular systems", "Quality controlled", "BIM ready"],
    },
  });

  await prisma.configuratorRule.deleteMany({});
  await prisma.configuratorRule.createMany({
    data: [
      { installing: "PIPE", application: "HVAC", installation: "CEILING", label: "Chilled-water trapeze", articles: ["FXR-4141-20", "SRS-HVY-100", "ROD-M10-1M", "CON-4141"], priority: 10 },
      { installing: "PIPE", minSizeMm: 80, maxSizeMm: 150, label: "Mid-size pipe support", articles: ["FXR-4141-20", "SRS-HVY-100", "ROD-M10-1M"], priority: 5 },
      { installing: "CABLE_TRAY", label: "Cable tray trapeze", articles: ["FXR-4141-20", "ROD-M10-1M", "CON-4141", "ANC-M10"], priority: 8 },
      { installing: "DUCT", label: "Duct hanger frame", articles: ["FXR-4162-20", "HNG-M10", "ROD-M10-2M", "ANC-M10"], priority: 8 },
      { installing: "AHU", label: "Equipment frame", articles: ["FXR-4162-25", "CON-4141", "ANC-M10"], priority: 6 },
      { installing: "ODU", label: "Outdoor unit frame", articles: ["FXR-4141-25", "CON-4141", "ANC-M10"], priority: 6 },
      { installing: "EQUIPMENT", label: "General equipment support", articles: ["FXR-4141-25", "HNG-M10", "ANC-M10"], priority: 4 },
    ],
  });

  mkdirSync(storageRoot, { recursive: true });
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  page.drawText("FIXOTEC", { x: 48, y: 780, size: 12, font: bold, color: rgb(0.15, 0.15, 0.15) });
  page.drawText("FXR 41×41 × 2.0 mm HDG", { x: 48, y: 740, size: 22, font: bold });
  page.drawText("Datasheet  |  Revision C", { x: 48, y: 710, size: 12, font });
  const lines = [
    "Section 41 × 41 mm",
    "Thickness 2.0 mm",
    "Material DX51D / DD11",
    "Finish hot dip galvanized",
    "Slot compatible with FXR connectors and hangers",
    "Use the project calculation for allowable span.",
  ];
  lines.forEach((line, index) => page.drawText(line, { x: 48, y: 660 - index * 22, size: 12, font }));
  const bytes = await pdf.save();
  const storageKey = "products/fxr-4141-20-datasheet.pdf";
  const full = path.join(storageRoot, storageKey);
  mkdirSync(path.dirname(full), { recursive: true });
  writeFileSync(full, bytes);

  const existingDoc = await prisma.document.findFirst({ where: { title: "FXR 41×41 × 2.0 mm datasheet" } });
  if (!existingDoc) {
    await prisma.document.create({
      data: {
        title: "FXR 41×41 × 2.0 mm datasheet",
        category: "DATASHEET",
        entityType: "product",
        entityId: rail.productId,
        audiences: ["CUSTOMER", "DISTRIBUTOR", "CONSULTANT"],
        createdById: engineer.id,
        versions: {
          create: {
            version: 1,
            status: "APPROVED",
            fileName: "FXR-4141-20-datasheet.pdf",
            mimeType: "application/pdf",
            sizeBytes: bytes.length,
            storageKey,
            createdById: engineer.id,
          },
        },
      },
    });
  }

  await prisma.notification.deleteMany({ where: { title: "Quotation QT-0100 needs approval" } });
  const salesHead = await prisma.user.findUniqueOrThrow({ where: { email: `saleshead@${STAFF_DOMAIN}` } });
  await prisma.notification.create({
    data: {
      userId: salesHead.id,
      title: "Quotation QT-0100 needs approval",
      body: "Discount 12% on ABC Data Center is waiting for Sales Head.",
      entityType: "quotation",
      entityId: quote.id,
    },
  });
  await prisma.notification.create({
    data: {
      userId: md.id,
      title: "Project ABC Data Center is past its expected completion",
      body: "Stage is still Engineering. One site issue is open.",
      entityType: "project",
      entityId: project.id,
    },
  });

  await seedRedesign(prisma, {
    storageRoot,
    days,
    customers: { apex: apex.id, westline: westline.id, northstar: northstar.id },
    users: { md: md.id, executive: executive.id, engineer: engineer.id, siteEngineer: siteEngineer.id },
    variants: { rail: rail.id, clamp: clamp.id, rod: rod.id, connector: connector.id },
    datasheetKey: storageKey,
  });

  await importFixotec(prisma, { root: path.resolve(__dirname, "../../..") });

  console.log(`Seeded Fixotec One. Password for demo users: ${password}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
