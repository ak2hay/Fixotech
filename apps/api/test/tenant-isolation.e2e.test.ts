import { beforeAll, describe, expect, it } from "vitest";
import { call, itemsOf, keysIn, login } from "./helpers";

const COST_KEYS = ["purchaseCost", "manufacturingCost", "unitCost", "marginPct", "avgCost"];
const PRICE_LIST_KEYS = ["dealerPrice", "exportPrice", "customerPrice"];
const INTERNAL_QUOTE_STATUSES = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "REJECTED"];

let admin: string;
let customer: string;
let distributor: string;
let me: { user: { customerId?: string | null; customer?: { id?: string } | null } };

beforeAll(async () => {
  [admin, customer, distributor] = await Promise.all([login("admin"), login("customer"), login("distributor")]);
  me = (await call("/auth/me", { token: customer })).body;
});

function customerIdOf() {
  return me.user.customerId || me.user.customer?.id;
}

describe("authentication", () => {
  it("rejects anonymous calls to private endpoints", async () => {
    for (const path of ["/customers", "/quotations", "/sales-orders", "/documents", "/reports/dashboard"]) {
      expect((await call(path)).status, path).toBe(401);
    }
  });

  it("rejects a forged token", async () => {
    const forged = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ4Iiwic2lkIjoieCJ9.c2lnbmF0dXJl";
    expect((await call("/auth/me", { token: forged })).status).toBe(401);
  });

  it("never returns secrets from /auth/me", async () => {
    const keys = keysIn((await call("/auth/me", { token: customer })).body);
    for (const key of ["passwordHash", "mfaSecret", "mfaRecoveryCodes"]) expect(keys.has(key), key).toBe(false);
  });
});

describe("portal records are limited to the user's own account", () => {
  it("lists only the customer's own sent quotations", async () => {
    const quotes = itemsOf<{ customerId: string; status: string }>((await call("/quotations?pageSize=100", { token: customer })).body);
    for (const quote of quotes) {
      expect(quote.customerId).toBe(customerIdOf());
      expect(INTERNAL_QUOTE_STATUSES).not.toContain(quote.status);
    }
  });

  it("returns 404 for another customer's quotation, order, RFQ and project", async () => {
    const ownId = customerIdOf();
    const [quotes, orders, rfqs, projects] = await Promise.all([
      call("/quotations?pageSize=100", { token: admin }),
      call("/sales-orders?pageSize=100", { token: admin }),
      call("/rfqs?pageSize=100", { token: admin }),
      call("/projects?pageSize=100", { token: admin }),
    ]);
    const foreign = <T extends { customerId?: string | null }>(rows: T[]) => rows.find((row) => row.customerId && row.customerId !== ownId);
    const checks: Array<[string, { id: string } | undefined]> = [
      ["/quotations/", foreign(itemsOf(quotes.body))],
      ["/sales-orders/", foreign(itemsOf(orders.body))],
      ["/rfqs/", foreign(itemsOf(rfqs.body))],
    ];
    const ownProjects = new Set(itemsOf<{ id: string }>((await call("/projects?pageSize=100", { token: customer })).body).map((row) => row.id));
    const otherProject = itemsOf<{ id: string }>(projects.body).find((row) => !ownProjects.has(row.id));
    checks.push(["/projects/", otherProject]);
    let checked = 0;
    for (const [path, row] of checks) {
      if (!row) continue;
      checked += 1;
      const result = await call(`${path}${row.id}`, { token: customer });
      expect(result.status, `${path}${row.id}`).toBe(404);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it("cannot open another customer's account record", async () => {
    const all = itemsOf<{ id: string }>((await call("/customers?pageSize=100", { token: admin })).body);
    const other = all.find((row) => row.id !== customerIdOf());
    if (other) expect([403, 404]).toContain((await call(`/customers/${other.id}`, { token: customer })).status);
  });

  it("does not show internal quotation steps or comments in the activity feed", async () => {
    const items = itemsOf<{ entityType: string; status: string | null; kind: string }>((await call("/activity?limit=100", { token: customer })).body);
    for (const item of items) {
      expect(item.kind).not.toBe("comment");
      if (item.entityType === "quotation" && item.status) expect(INTERNAL_QUOTE_STATUSES).not.toContain(item.status);
    }
  });
});

describe("prices and costs", () => {
  it("keeps the internal catalogue away from customers", async () => {
    const result = await call("/products?pageSize=5", { token: customer });
    if (result.status === 200) {
      const keys = keysIn(result.body);
      for (const key of [...COST_KEYS, ...PRICE_LIST_KEYS, "standardPrice"]) expect(keys.has(key), key).toBe(false);
    } else {
      expect(result.status).toBe(403);
    }
  });

  it("hides costs and other price lists from distributors", async () => {
    const products = itemsOf<{ id: string }>((await call("/products?pageSize=5", { token: distributor })).body);
    expect(products.length).toBeGreaterThan(0);
    const detail = await call(`/products/${products[0].id}`, { token: distributor });
    const keys = keysIn(detail.body);
    for (const key of [...COST_KEYS, ...PRICE_LIST_KEYS, "standardPrice"]) expect(keys.has(key), key).toBe(false);
    expect(keys.has("sellPrice")).toBe(true);
  });

  it("hides costs and margins on the customer's quotations", async () => {
    const quotes = itemsOf<{ id: string }>((await call("/quotations", { token: customer })).body);
    for (const quote of quotes.slice(0, 3)) {
      const keys = keysIn((await call(`/quotations/${quote.id}`, { token: customer })).body);
      for (const key of [...COST_KEYS, ...PRICE_LIST_KEYS]) expect(keys.has(key), key).toBe(false);
    }
  });

  it("exposes only the standard list price on the public site", async () => {
    const list = await call<Array<{ slug: string }>>("/public/products");
    expect(list.status).toBe(200);
    const slug = itemsOf<{ slug: string }>(list.body)[0]?.slug;
    if (!slug) return;
    const keys = keysIn((await call(`/public/products/${slug}`)).body);
    for (const key of [...COST_KEYS, ...PRICE_LIST_KEYS, "safetyStock", "reorderLevel"]) expect(keys.has(key), key).toBe(false);
  });
});

describe("internal-only endpoints", () => {
  it("keeps vendor payables away from distributors", async () => {
    expect((await call("/finance/payables", { token: distributor })).status).toBe(403);
  });

  it("only returns the distributor's incoming payments", async () => {
    const payments = itemsOf<{ direction: string }>((await call("/payments", { token: distributor })).body);
    for (const payment of payments) expect(payment.direction).toBe("IN");
  });

  it("keeps the operations assistant internal", async () => {
    expect((await call("/assistant/query", { method: "POST", token: customer, body: { question: "Which RFQs are pending?" } })).status).toBe(403);
  });

  it("blocks portal users from staff administration", async () => {
    for (const path of ["/users", "/roles", "/audit"]) {
      expect([403, 404]).toContain((await call(path, { token: customer })).status);
    }
  });
});

describe("documents", () => {
  it("lists only documents shared with the portal role, without internal drafts", async () => {
    const docs = itemsOf<{ audiences: string[]; versions: Array<{ status: string }> }>((await call("/documents", { token: customer })).body);
    for (const doc of docs) {
      expect(doc.audiences).toContain("CUSTOMER");
      for (const version of doc.versions) expect(["APPROVED", "CLIENT_REVIEW"]).toContain(version.status);
    }
  });

  it("refuses to download a document outside the customer's scope", async () => {
    const all = itemsOf<{ id: string; audiences: string[] }>((await call("/documents", { token: admin })).body);
    const visible = new Set(itemsOf<{ id: string }>((await call("/documents", { token: customer })).body).map((row) => row.id));
    const hidden = all.find((doc) => !visible.has(doc.id));
    if (hidden) expect([403, 404]).toContain((await call(`/documents/${hidden.id}/download`, { token: customer })).status);
  });
});
