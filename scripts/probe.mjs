const API = process.env.API_PUBLIC_URL || "http://localhost:4001";
const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!234";

async function call(path, token, method = "GET", body) {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${path} ${response.status} ${text.slice(0, 240)}`);
  return data;
}

async function login(email) {
  const data = await call("/api/v1/auth/login", null, "POST", { email, password });
  return data.accessToken;
}

const admin = await login("admin@demo.fixotec.test");
const paths = [
  "/api/v1/organization",
  "/api/v1/roles",
  "/api/v1/documents",
  "/api/v1/customers",
  "/api/v1/leads",
  "/api/v1/projects",
  "/api/v1/products",
  "/api/v1/rfqs",
  "/api/v1/engineering",
  "/api/v1/boq",
  "/api/v1/vendors",
  "/api/v1/purchases/orders",
  "/api/v1/warehouses",
  "/api/v1/inventory/balances",
  "/api/v1/dispatch",
  "/api/v1/bom",
  "/api/v1/production",
  "/api/v1/production/board",
  "/api/v1/quality",
  "/api/v1/ncr",
  "/api/v1/sites/issues",
  "/api/v1/service/tickets",
  "/api/v1/invoices",
  "/api/v1/expenses",
  "/api/v1/finance/payables",
  "/api/v1/hr/employees",
  "/api/v1/reports/executive",
  "/api/v1/reports/queues",
  "/api/v1/reports/sales",
  "/api/v1/reports/inventory",
  "/api/v1/reports/projects",
  "/api/v1/reports/forecast",
  "/api/v1/public/home",
  "/api/v1/public/solutions",
  "/api/v1/public/products",
  "/api/v1/public/search?q=41x41",
];
for (const path of paths) {
  const data = await call(path, path.includes("/public/") ? null : admin);
  const size = Array.isArray(data) ? data.length : data?.items?.length ?? Object.keys(data || {}).length;
  console.log("ok", path, size);
}

const distributor = await login("distributor@westline.example");
const availability = await call("/api/v1/inventory/availability", distributor);
const leaked = JSON.stringify(availability).includes("unitCost") || JSON.stringify(availability).includes("qty");
if (leaked) throw new Error("distributor availability leaked stock quantity or cost");
console.log("ok distributor availability", availability.items?.length ?? availability.length);

const consultant = await login("consultant@northstar.example");
const engineering = await call("/api/v1/engineering", consultant);
console.log("ok consultant engineering", engineering.items?.length ?? engineering.length);

const sales = await login("sales@demo.fixotec.test");
const denied = await fetch(`${API}/api/v1/hr/employees`, { headers: { Authorization: `Bearer ${sales}` } });
if (denied.status !== 403) throw new Error(`sales HR status ${denied.status}`);
console.log("ok sales blocked from HR");

const sync = await call("/api/v1/finance/sync", admin, "POST", { entityType: "INVOICE", entityId: "missing" });
console.log("ok accounting sync", sync.status || sync.target || "done");
console.log("Probe passed");
