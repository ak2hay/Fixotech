import { describe, expect, it } from "vitest";
import {
  customerUpdateSchema,
  enquirySchema,
  inventoryPostSchema,
  lineSchema,
  loginSchema,
  matchesCondition,
  passwordSchema,
  productUpdateSchema,
  projectHealth,
  projectUpdateSchema,
  quoteFromRfqSchema,
  resolveSellPrice,
  roleUpdateSchema,
  safeUrl,
  salesOrderCreateSchema,
  userUpdateSchema,
} from "./index";
import { dummyVerify, hashPassword, needsRehash, verifyPassword } from "./password";

describe("password hashing", () => {
  it("round-trips and rejects wrong passwords", () => {
    const hash = hashPassword("Correct-Horse-9");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(verifyPassword("Correct-Horse-9", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
    expect(needsRehash(hash)).toBe(false);
  });

  it("still verifies legacy salt:hash values and flags them for rehash", async () => {
    const { randomBytes, scryptSync } = await import("crypto");
    const salt = randomBytes(16).toString("hex");
    const legacy = `${salt}:${scryptSync("Legacy-Pass-1", salt, 64).toString("hex")}`;
    expect(verifyPassword("Legacy-Pass-1", legacy)).toBe(true);
    expect(needsRehash(legacy)).toBe(true);
  });

  it("rejects malformed hashes and absurd parameters", () => {
    expect(verifyPassword("x", "garbage")).toBe(false);
    expect(verifyPassword("x", "scrypt$99999999$8$1$aa$bb")).toBe(false);
    expect(dummyVerify("anything")).toBe(false);
  });
});

describe("input limits", () => {
  it("caps login and password length", () => {
    expect(loginSchema.safeParse({ email: "a@b.co", password: "x".repeat(129) }).success).toBe(false);
    expect(passwordSchema.safeParse("Aa1" + "x".repeat(200)).success).toBe(false);
    expect(passwordSchema.safeParse("GoodPassw0rd").success).toBe(true);
  });

  it("bounds enquiry payloads", () => {
    const base = { name: "Asha", company: "Acme", email: "a@acme.com" };
    expect(enquirySchema.safeParse(base).success).toBe(true);
    expect(enquirySchema.safeParse({ ...base, message: "x".repeat(5001) }).success).toBe(false);
    expect(enquirySchema.safeParse({ ...base, items: Array.from({ length: 201 }, () => ({ description: "a", qty: 1 })) }).success).toBe(false);
  });

  it("rejects negative or zero quantities", () => {
    expect(lineSchema.safeParse({ description: "a", qty: -1 }).success).toBe(false);
    expect(lineSchema.safeParse({ description: "a", qty: 0 }).success).toBe(false);
    expect(salesOrderCreateSchema.safeParse({ lines: [{ variantId: "v", qty: -5 }] }).success).toBe(false);
    expect(inventoryPostSchema.safeParse({ type: "ADJUSTMENT", warehouseId: "w", binId: "b", variantId: "v", qty: 0 }).success).toBe(false);
  });

  it("bounds discounts", () => {
    expect(quoteFromRfqSchema.safeParse({ discountPct: 150 }).success).toBe(false);
    expect(quoteFromRfqSchema.safeParse({ discountPct: 10, freight: 500 }).success).toBe(true);
  });
});

describe("mass assignment protection", () => {
  it("drops Prisma relation writes from update payloads", () => {
    const parsed = customerUpdateSchema.parse({ name: "Acme", users: { create: { email: "x@y.z", roles: { create: {} } } } });
    expect(parsed).toEqual({ name: "Acme" });
    const project = projectUpdateSchema.parse({ name: "Tower", owner: { update: { roles: {} } }, code: "HACK" });
    expect(project).toEqual({ name: "Tower" });
    const product = productUpdateSchema.parse({ name: "Clamp", variants: { updateMany: { where: {}, data: { purchaseCost: 0 } } } });
    expect(product).toEqual({ name: "Clamp" });
  });

  it("rejects unknown keys on admin payloads", () => {
    expect(roleUpdateSchema.safeParse({ permissionKeys: [], extra: 1 }).success).toBe(false);
    expect(userUpdateSchema.safeParse({ passwordHash: "salt:hash" }).success).toBe(false);
  });
});

describe("business helpers", () => {
  it("evaluates approval conditions", () => {
    const rule = { all: [{ field: "discountPct", op: "gt", value: 10 }] };
    expect(matchesCondition(rule, { discountPct: 12 })).toBe(true);
    expect(matchesCondition(rule, { discountPct: 5 })).toBe(false);
    expect(matchesCondition({}, { discountPct: 50 })).toBe(false);
  });

  it("resolves price lists with fallback", () => {
    const source = { standardPrice: 100, dealerPrice: 80 };
    expect(resolveSellPrice(source, "DEALER")).toBe(80);
    expect(resolveSellPrice(source, "EXPORT")).toBe(100);
  });

  it("computes project health", () => {
    const now = new Date("2026-06-01");
    expect(projectHealth({ stage: "EXECUTION", expectedCompletion: "2026-01-01", progress: 50, now })).toBe("DELAYED");
    expect(projectHealth({ stage: "CLOSED", progress: 100, now })).toBeNull();
    expect(projectHealth({ stage: "EXECUTION", progress: 50, openIssues: 3, now })).toBe("AT_RISK");
  });

  it("only allows safe link schemes", () => {
    expect(safeUrl.safeParse("javascript:alert(1)").success).toBe(false);
    expect(safeUrl.safeParse("//evil.example").success).toBe(false);
    expect(safeUrl.safeParse("https://fixotec.com").success).toBe(true);
    expect(safeUrl.safeParse("/products").success).toBe(true);
  });
});
