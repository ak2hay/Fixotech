const API = process.env.API_PUBLIC_URL || "http://localhost:4000";

async function call(path, options = {}, token) {
  const headers = { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) };
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${options.method || "GET"} ${path} ${response.status} ${text}`);
  return data;
}

const health = await call("/api/v1/health");
if (!health.ok) throw new Error("health failed");

const admin = await call("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "admin@demo.fixotec.test", password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe!234" }) });
const token = admin.accessToken;
const me = await call("/api/v1/auth/me", {}, token);
if (!me.permissions.includes("products.view_cost")) throw new Error("admin missing cost permission");

const customers = await call("/api/v1/customers", {}, token);
if (!customers.items.length) throw new Error("no customers");
const quote = (await call("/api/v1/quotations", {}, token)).items.find((item) => item.number === "QT-0100");
if (!quote) throw new Error("seed quotation missing");
const approval = (await call("/api/v1/approvals", {}, token)).items.find((item) => item.entityId === quote.id && item.status === "PENDING");
if (approval) {
  await call(`/api/v1/approvals/${approval.id}/decide`, { method: "POST", body: JSON.stringify({ decision: "APPROVED", note: "Smoke approval" }) }, token);
} else if (!["APPROVED", "ACCEPTED", "SENT"].includes(quote.status)) {
  throw new Error("quotation is not ready to order");
}
const order = await call("/api/v1/sales-orders", { method: "POST", body: JSON.stringify({ quotationId: quote.id, lines: [] }) }, token);
if (!order.number) throw new Error("order not created");

const executive = await call("/api/v1/reports/executive", {}, token);
if (typeof executive.revenue !== "number") throw new Error("executive report missing");
if (typeof executive.grossMarginPct !== "number") throw new Error("admin should see gross margin");
const assistant = await call("/api/v1/assistant/query", { method: "POST", body: JSON.stringify({ question: "Which products are below safety stock?" }) }, token);
if (!assistant.answer) throw new Error("assistant empty");

const customer = await call("/api/v1/auth/login", { method: "POST", body: JSON.stringify({ email: "customer@apexmep.example", password: process.env.SEED_ADMIN_PASSWORD || "ChangeMe!234" }) });
const visible = (await call("/api/v1/quotations", {}, customer.accessToken)).items;
for (const shown of visible.slice(0, 3)) {
  const detail = await call(`/api/v1/quotations/${shown.id}`, {}, customer.accessToken);
  if ("marginPct" in detail || (detail.items || []).some((item) => "unitCost" in item)) throw new Error("customer can see margin");
}

const enquiry = await call("/api/v1/public/enquiries", { method: "POST", body: JSON.stringify({ name: "Smoke Tester", company: "Apex MEP Contractors", email: "smoke@apexmep.example", project: "Smoke Hall", application: "HVAC", message: "Website intake from the smoke test" }) });
if (!enquiry.ok || !enquiry.reference) throw new Error("website intake failed");

const configured = await call("/api/v1/public/configure", { method: "POST", body: JSON.stringify({ installing: "PIPE", pipeSizeMm: 100, application: "HVAC", installation: "CEILING" }) });
if (!configured.products?.length) throw new Error("configurator empty");

console.log("Smoke passed", { order: order.number, status: order.status, assistant: assistant.intent, system: configured.label });
