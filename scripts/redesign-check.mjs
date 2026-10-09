// Exercises the redesign endpoints for staff and each portal role.
const base = (process.env.API || "http://127.0.0.1:4001").replace(/\/$/, "") + "/api/v1";
const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe!234";

async function login(email) {
  const res = await fetch(`${base}/auth/login`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
  const body = await res.json();
  if (!body.accessToken) throw new Error(`login ${email}: ${JSON.stringify(body)}`);
  return body.accessToken;
}

async function get(token, path) {
  const res = await fetch(`${base}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  let body;
  try { body = JSON.parse(text); } catch { body = text; }
  return { status: res.status, body };
}

let failed = 0;
function check(label, ok, detail = "") {
  if (!ok) failed += 1;
  console.log(`${ok ? "ok  " : "FAIL"} ${label}${detail ? ` - ${detail}` : ""}`);
}

const COST = ["purchaseCost", "manufacturingCost", "unitCost", "marginPct"];
function hasCost(value) {
  if (Array.isArray(value)) return value.some(hasCost);
  if (value && typeof value === "object") return Object.entries(value).some(([key, item]) => COST.includes(key) || hasCost(item));
  return false;
}

const admin = await login("admin@demo.fixotec.test");
const dash = await get(admin, "/reports/dashboard");
check("dashboard", dash.status === 200 && dash.body.kpis && dash.body.funnel?.length === 6, `actions=${dash.body.actions?.length} activity=${dash.body.activity?.length}`);
const projects = await get(admin, "/projects?pageSize=50");
check("projects list derived fields", projects.status === 200 && projects.body.items.every((row) => typeof row.progress === "number" && "health" in row && "coverUrl" in row), `total=${projects.body.total}`);
const main = projects.body.items.find((row) => row.code === "PRJ-0100");
const overview = await get(admin, `/projects/${main.id}/overview`);
check("project overview", overview.status === 200 && overview.body.milestones.length === 8, `health=${overview.body.health?.status} docs=${overview.body.documents?.length}`);
const rfqs = await get(admin, "/rfqs");
const rfq = await get(admin, `/rfqs/${rfqs.body.items[0].id}/overview`);
check("rfq overview", rfq.status === 200 && typeof rfq.body.step === "number", `step=${rfq.body.step} due=${rfq.body.dueStatus}`);
const activity = await get(admin, `/activity?entityType=project&entityId=${main.id}`);
check("project activity", activity.status === 200 && activity.body.items.length > 0, `n=${activity.body.items.length}`);
const search = await get(admin, "/search?q=data");
check("search", search.status === 200 && search.body.items.length > 0, `n=${search.body.items.length}`);
const cad = await get(admin, "/cad");
check("cad", cad.status === 200 && cad.body.items.length > 0, JSON.stringify(cad.body.counts));
const subs = await get(admin, "/submittals");
check("submittals", subs.status === 200 && subs.body.items.length > 0);
const sub = await get(admin, `/submittals/${subs.body.items[0].id}`);
check("submittal detail", sub.status === 200 && sub.body.number);
const thumbDoc = overview.body.documents.find((doc) => doc.hasThumbnail);
if (thumbDoc) {
  const res = await fetch(`${base}/documents/${thumbDoc.id}/thumbnail`, { headers: { Authorization: `Bearer ${admin}` } });
  check("document thumbnail", res.status === 200 && (res.headers.get("content-type") || "").startsWith("image/"));
}
const cover = await fetch(`${base}${main.coverUrl}`);
check("project cover", cover.status === 200);

const customer = await login("customer@apexmep.example");
const summary = await get(customer, "/portal/summary");
check("portal summary", summary.status === 200 && summary.body.stats.activeProjects > 0, JSON.stringify(summary.body.stats));
const custProjects = await get(customer, "/projects");
check("customer projects scoped", custProjects.status === 200 && custProjects.body.items.length > 0 && !hasCost(custProjects.body));
const custOverview = await get(customer, `/projects/${main.id}/overview`);
check("customer project overview without cost", custOverview.status === 200 && !hasCost(custOverview.body));
const custRfq = await get(customer, `/rfqs/${rfqs.body.items[0].id}/overview`);
check("customer rfq overview without cost", custRfq.status === 200 && !hasCost(custRfq.body));
const custDash = await get(customer, "/reports/dashboard");
check("customer blocked from staff dashboard", custDash.status >= 400);
const custSearch = await get(customer, "/search?q=a");
check("customer search no customers group", custSearch.status === 200 && !custSearch.body.items.some((row) => row.type === "customer"));
const custActivity = await get(customer, "/activity");
check("customer activity has no audit rows", custActivity.status === 200 && custActivity.body.items.every((row) => row.kind !== "audit"));

const custQuotes = await get(customer, "/quotations?pageSize=100");
check("customer sees no internal draft quotations", custQuotes.status === 200 && custQuotes.body.items.every((row) => !["DRAFT", "SUBMITTED", "UNDER_REVIEW", "REJECTED"].includes(row.status)), `n=${custQuotes.body.items?.length}`);
const allProjects = projects.body.items.map((row) => row.id);
const ownProjects = new Set(custProjects.body.items.map((row) => row.id));
const custDocs = await get(customer, "/documents");
check("customer documents stay inside own projects", custDocs.status === 200 && custDocs.body.items.every((doc) => doc.entityType !== "project" || ownProjects.has(doc.entityId)), `n=${custDocs.body.items?.length}`);
const foreign = allProjects.find((id) => !ownProjects.has(id));
if (foreign) {
  const res = await fetch(`${base}/rfqs`, { method: "POST", headers: { Authorization: `Bearer ${customer}`, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: foreign, items: [{ description: "probe", qty: 1 }] }) });
  check("customer cannot raise an RFQ on another account's project", res.status === 400);
}
const staffTickets = await get(admin, "/service/tickets");
const custTicketIds = new Set(((await get(customer, "/service/tickets")).body || []).map((row) => row.id));
const foreignTicket = (staffTickets.body || []).find((row) => !custTicketIds.has(row.id));
if (foreignTicket) {
  const res = await fetch(`${base}/service/tickets/${foreignTicket.id}/comments`, { method: "POST", headers: { Authorization: `Bearer ${customer}`, "Content-Type": "application/json" }, body: JSON.stringify({ body: "probe" }) });
  check("customer cannot comment on another account's ticket", res.status === 400);
}

const distributor = await login("distributor@westline.example");
const distProducts = await get(distributor, "/products?pageSize=20");
const priceKeys = ["standardPrice", "customerPrice", "dealerPrice", "exportPrice"];
check("distributor sees only own sell price", distProducts.status === 200 && distProducts.body.items.every((product) => !("standardPrice" in product) && product.variants.every((variant) => "sellPrice" in variant && priceKeys.every((key) => !(key in variant)))));
const distSchemes = await get(distributor, "/distributor/schemes");
const distMe = await get(distributor, "/auth/me");
check("auth/me hides credentials", distMe.status === 200 && !("passwordHash" in distMe.body.user) && !("mfaSecret" in distMe.body.user));
check("distributor schemes list only own claims", distSchemes.status === 200 && distSchemes.body.every((scheme) => scheme.claims.every((claim) => claim.customerId === distMe.body.user.customerId)));
const distProjects = await get(distributor, "/projects");
check("distributor has no project access", distProjects.status === 403);
const distSummary = await get(distributor, "/portal/summary");
check("distributor summary", distSummary.status === 200 && distSummary.body.stats.activeProjects === 0);
const distActivity = await get(distributor, "/activity");
check("distributor activity only own", distActivity.status === 200 && distActivity.body.items.every((row) => row.entityType !== "project"));

const consultant = await login("consultant@northstar.example");
const consCad = await get(consultant, "/cad");
check("consultant cad", consCad.status === 200);
const consSubs = await get(consultant, "/submittals");
check("consultant submittals scoped", consSubs.status === 200);
const consRfq = await get(consultant, `/rfqs/${rfqs.body.items[0].id}/overview`);
check("consultant blocked from rfq overview", consRfq.status === 403);
const consProjects = new Set(((await get(consultant, "/projects?pageSize=100")).body.items || []).map((row) => row.id));
const consForeign = allProjects.find((id) => !consProjects.has(id));
if (consForeign) {
  const res = await fetch(`${base}/engineering`, { method: "POST", headers: { Authorization: `Bearer ${consultant}`, "Content-Type": "application/json" }, body: JSON.stringify({ projectId: consForeign, application: "probe" }) });
  check("consultant cannot open engineering on another project", res.status === 400);
}

console.log(failed ? `${failed} check(s) failed` : "all checks passed");
process.exit(failed ? 1 : 0);
