import { describe, expect, it } from "vitest";
import { ageBucket, assignmentMatches, duplicateKeys, groupDuplicates, normalizePhone, renderTemplate, roundRobin, scoreLead, validateCustomFields, weightedValue } from "./crm";

describe("lead scoring", () => {
  const rules = [
    { field: "source", op: "eq", value: "CAD_DOWNLOAD", points: 25 },
    { field: "estimatedValue", op: "gte", value: 1_000_000, points: 40 },
    { field: "email", op: "present", points: 10 },
    { field: "application", op: "contains", value: "metro", points: 30 },
    { field: "email", op: "contains", value: "gmail.com", points: -15 },
  ];

  it("adds the points of matching rules and clamps to 0-100", () => {
    expect(scoreLead({ source: "CAD_DOWNLOAD", estimatedValue: 2_500_000, email: "a@lt.com" }, rules)).toBe(75);
    expect(scoreLead({ source: "CAD_DOWNLOAD", estimatedValue: 2_500_000, email: "a@lt.com", application: "Metro viaduct" }, rules)).toBe(100);
    expect(scoreLead({ email: "x@gmail.com" }, rules)).toBe(0);
  });

  it("ignores absent values for comparison rules", () => {
    expect(scoreLead({ estimatedValue: null }, [{ field: "estimatedValue", op: "lte", value: 10, points: 5 }])).toBe(0);
    expect(scoreLead({}, [{ field: "phone", op: "absent", points: 5 }])).toBe(5);
  });
});

describe("pipeline forecast", () => {
  it("weights value by stage probability", () => {
    expect(weightedValue("QUOTATION", 100_000)).toBe(60_000);
    expect(weightedValue("LOST", 100_000)).toBe(0);
    expect(weightedValue("UNKNOWN", 100_000)).toBe(0);
  });
});

describe("assignment", () => {
  it("matches every clause case-insensitively", () => {
    const condition = { all: [{ field: "region", equals: "west" }, { field: "source", in: ["WEBSITE", "CAD_DOWNLOAD"] }] };
    expect(assignmentMatches(condition, { region: "West", source: "CAD_DOWNLOAD" })).toBe(true);
    expect(assignmentMatches(condition, { region: "North", source: "WEBSITE" })).toBe(false);
    expect(assignmentMatches({ all: [] }, {})).toBe(true);
  });

  it("rotates through users", () => {
    const users = ["a", "b", "c"];
    expect([0, 1, 2, 3, 4].map((cursor) => roundRobin(users, cursor)?.userId)).toEqual(["a", "b", "c", "a", "b"]);
    expect(roundRobin([], 0)).toBeNull();
  });
});

describe("duplicates", () => {
  it("normalises Indian phone formats", () => {
    expect(normalizePhone("+91 98765-43210")).toBe("9876543210");
    expect(normalizePhone("098765 43210")).toBe("9876543210");
    expect(normalizePhone("123")).toBeNull();
  });

  it("groups records transitively across email, phone and GSTIN", () => {
    const rows = [
      { id: "1", email: "Ops@ACME.in", phone: "" },
      { id: "2", email: "ops@acme.in", phone: "+91 98765 43210" },
      { id: "3", email: "other@x.com", phone: "9876543210" },
      { id: "4", email: "solo@y.com", phone: "1111122222" },
    ];
    const groups = groupDuplicates(rows, duplicateKeys);
    expect(groups).toHaveLength(1);
    expect(groups[0].records.map((row) => row.id).sort()).toEqual(["1", "2", "3"]);
    expect(groups[0].matchedOn).toEqual(["email", "phone"]);
  });
});

describe("templates and custom fields", () => {
  it("renders nested placeholders and blanks unknown ones", () => {
    expect(renderTemplate("Hi {{ customer.name }}, re {{quotation.number}}{{missing.x}}", { customer: { name: "L&T" }, quotation: { number: "QT-0201" } })).toBe("Hi L&T, re QT-0201");
  });

  it("validates typed custom fields", () => {
    const defs = [
      { key: "siteArea", label: "Site area", type: "NUMBER", options: [], required: true },
      { key: "zone", label: "Seismic zone", type: "SELECT", options: ["II", "III", "IV", "V"], required: false },
    ];
    expect(validateCustomFields(defs, { siteArea: "1200", zone: "IV" })).toEqual({ errors: [], values: { siteArea: 1200, zone: "IV" } });
    expect(validateCustomFields(defs, { zone: "VI", extra: 1 }).errors).toEqual(["Unknown field extra", "Site area is required", "Seismic zone must be one of II, III, IV, V"]);
  });

  it("buckets ages", () => {
    expect([0, 7, 8, 30, 31, 90, 91].map(ageBucket)).toEqual(["0-7", "0-7", "8-30", "8-30", "31-90", "31-90", "90+"]);
  });
});
