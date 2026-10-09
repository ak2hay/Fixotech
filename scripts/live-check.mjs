const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!234";
const sites = {
  web: "https://fixotec-web.vercel.app",
  portal: "https://fixotec-portal.vercel.app",
  erp: "https://fixotec-erp.vercel.app",
};

async function json(url, options = {}) {
  const response = await fetch(url, { ...options, headers: { "Content-Type": "application/json", ...(options.headers || {}) } });
  const text = await response.text();
  if (!response.ok) throw new Error(`${url} ${response.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

for (const [name, base] of Object.entries(sites)) {
  const health = await json(`${base}/api/v1/health`);
  console.log(name, "proxy health", health.ok);
}

const admin = await json(`${sites.erp}/api/v1/auth/login`, { method: "POST", body: JSON.stringify({ email: "admin@demo.fixotec.test", password }) });
const customers = await json(`${sites.erp}/api/v1/customers`, { headers: { Authorization: `Bearer ${admin.accessToken}` } });
console.log("erp admin login, customers", customers.items.length);

const customer = await json(`${sites.portal}/api/v1/auth/login`, { method: "POST", body: JSON.stringify({ email: "customer@apexmep.example", password }) });
const quotes = await json(`${sites.portal}/api/v1/quotations`, { headers: { Authorization: `Bearer ${customer.accessToken}` } });
if (JSON.stringify(quotes).includes("unitCost") || JSON.stringify(quotes).includes("marginPct")) throw new Error("customer sees cost");
console.log("portal customer login, quotations", quotes.items.length);

const page = await fetch(`${sites.web}/products`).then((response) => response.text());
console.log("website products page shows FXR", page.includes("FXR"));
