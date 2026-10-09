import { describe, expect, it } from "vitest";
import { buildGstr1, computeTax, ewbValidity, hsnSummary, isValidGstin, normalizeDocNumber, panFromGstin, quarterRange, reconcile2b, setOffItc, stateCodeFromName, tdsRateFor } from "./gst";

describe("gst", () => {
  it("validates GSTIN check digits", () => {
    expect(isValidGstin("27AAPFU0939F1ZV")).toBe(true);
    expect(isValidGstin("27AAPFU0939F1ZX")).toBe(false);
    expect(isValidGstin("99AAPFU0939F1ZV")).toBe(false);
    expect(panFromGstin("27AAPFU0939F1ZV")).toBe("AAPFU0939F");
  });

  it("maps state names", () => {
    expect(stateCodeFromName("Maharashtra")).toBe("27");
    expect(stateCodeFromName("New Delhi")).toBe("07");
    expect(stateCodeFromName("TN")).toBe("33");
    expect(stateCodeFromName("29")).toBe("29");
    expect(stateCodeFromName("Atlantis")).toBeNull();
  });

  it("splits tax by place of supply", () => {
    const intra = computeTax([{ amount: 1000, taxRate: 18 }, { amount: 333.33, taxRate: 5 }], { supplierState: "27", placeOfSupply: "27", supplyType: "B2B" });
    expect(intra).toMatchObject({ subtotal: 1333.33, tax: 196.67, igst: 0, interState: false });
    expect(Math.round((intra.cgst + intra.sgst) * 100) / 100).toBe(196.67);
    const inter = computeTax([{ amount: 1000, taxRate: 18 }], { supplierState: "27", placeOfSupply: "29", supplyType: "B2B" });
    expect(inter).toMatchObject({ igst: 180, cgst: 0, interState: true });
    expect(computeTax([{ amount: 1000, taxRate: 18 }], { supplierState: "27", placeOfSupply: "96", supplyType: "EXPWOP" }).tax).toBe(0);
    expect(computeTax([{ amount: 1000, taxRate: 18, exempt: true }], { supplierState: "27", placeOfSupply: "27", supplyType: "B2C" }).tax).toBe(0);
  });

  it("summarises HSN with credit notes netted", () => {
    const rows = hsnSummary([
      { hsn: "7318 15", taxRate: 18, qty: 10, amount: 1000, igst: 0, cgst: 90, sgst: 90 },
      { hsn: "731815", taxRate: 18, qty: 2, amount: 200, igst: 0, cgst: 18, sgst: 18, sign: -1 },
    ]);
    expect(rows).toEqual([{ hsn: "731815", uqc: "NOS", rate: 18, qty: 8, taxable: 800, igst: 0, cgst: 72, sgst: 72, cess: 0 }]);
  });

  it("builds GSTR-1 sections", () => {
    const date = new Date("2026-09-10T00:00:00Z");
    const { json, counts } = buildGstr1(
      "27AAPFU0939F1ZV",
      "2026-09",
      [
        { kind: "INVOICE", number: "INV-1", date, counterpartyGstin: "29AAACB1234C1Z5", placeOfSupply: "29", supplyType: "B2B", total: 1180, lines: [{ amount: 1000, taxRate: 18, igst: 180, cgst: 0, sgst: 0, hsn: "7318" }] },
        { kind: "INVOICE", number: "INV-2", date, placeOfSupply: "27", supplyType: "B2C", total: 590, lines: [{ amount: 500, taxRate: 18, igst: 0, cgst: 45, sgst: 45, hsn: "7318" }] },
        { kind: "INVOICE", number: "INV-3", date, placeOfSupply: "29", supplyType: "B2C", total: 236000, lines: [{ amount: 200000, taxRate: 18, igst: 36000, cgst: 0, sgst: 0, hsn: "7318" }] },
        { kind: "INVOICE", number: "INV-4", date, placeOfSupply: "96", supplyType: "EXPWOP", total: 5000, lines: [{ amount: 5000, taxRate: 18, igst: 0, cgst: 0, sgst: 0, hsn: "7318" }] },
        { kind: "CREDIT_NOTE", number: "CN-1", date, counterpartyGstin: "29AAACB1234C1Z5", placeOfSupply: "29", supplyType: "B2B", total: 118, lines: [{ amount: 100, taxRate: 18, igst: 18, cgst: 0, sgst: 0, hsn: "7318" }] },
      ],
      "27",
    );
    expect(json.fp).toBe("092026");
    expect(counts).toMatchObject({ b2b: 1, b2cs: 1, b2cl: 1, exp: 1, cdnr: 1 });
    expect(json.b2b[0].ctin).toBe("29AAACB1234C1Z5");
    expect(json.b2cs[0]).toMatchObject({ sply_ty: "INTRA", pos: "27", rt: 18, txval: 500 });
    expect(json.exp[0].exp_typ).toBe("WOPAY");
    expect(json.hsn.hsn_b2b[0]).toMatchObject({ hsn_sc: "7318", txval: 900, iamt: 162 });
  });

  it("sets off ITC in the statutory order", () => {
    const result = setOffItc({ igst: 100, cgst: 50, sgst: 50 }, { igst: 120, cgst: 10, sgst: 60 });
    expect(result.utilised).toMatchObject({ igstToIgst: 100, igstToCgst: 20, cgstToCgst: 10, sgstToSgst: 50 });
    expect(result.cash).toEqual({ igst: 0, cgst: 20, sgst: 0 });
    expect(result.carryForward).toEqual({ igst: 0, cgst: 0, sgst: 10 });
  });

  it("reconciles GSTR-2B against bills", () => {
    const date = new Date("2026-09-05T00:00:00Z");
    const { results, missingIn2b } = reconcile2b(
      [
        { id: "e1", supplierGstin: "27AAACX1111A1Z1", invoiceNo: "INV/001", invoiceDate: date, taxable: 1000, igst: 0, cgst: 90, sgst: 90 },
        { id: "e2", supplierGstin: "27AAACX1111A1Z1", invoiceNo: "INV/002", invoiceDate: date, taxable: 500, igst: 0, cgst: 45, sgst: 45 },
        { id: "e3", supplierGstin: "29AAACY2222B1Z2", invoiceNo: "77", invoiceDate: date, taxable: 100, igst: 18, cgst: 0, sgst: 0 },
        { id: "e4", supplierGstin: "29AAACZ3333C1Z3", invoiceNo: "X1", invoiceDate: date, taxable: 100, igst: 18, cgst: 0, sgst: 0 },
      ],
      [
        { id: "b1", gstin: "27aaacx1111a1z1", invoiceNo: "inv-1", date, taxable: 1000, igst: 0, cgst: 90, sgst: 90 },
        { id: "b2", gstin: "27AAACX1111A1Z1", invoiceNo: "INV002", date, taxable: 450, igst: 0, cgst: 40.5, sgst: 40.5 },
        { id: "b3", gstin: "29AAACY2222B1Z2", invoiceNo: "SUP-77", date, taxable: 100, igst: 18, cgst: 0, sgst: 0 },
        { id: "b4", gstin: "24AAACW4444D1Z4", invoiceNo: "Q9", date, taxable: 10, igst: 1.8, cgst: 0, sgst: 0 },
      ],
    );
    const byEntry = Object.fromEntries(results.map((row) => [row.entryId, row]));
    expect(byEntry.e1).toMatchObject({ billId: "b1", status: "MATCHED" });
    expect(byEntry.e2.status).toBe("MISMATCH");
    expect(byEntry.e2.differences.join()).toContain("taxable");
    expect(byEntry.e3).toMatchObject({ billId: "b3", status: "PROBABLE" });
    expect(byEntry.e4.status).toBe("MISSING_IN_BOOKS");
    expect(missingIn2b).toEqual(["b4"]);
    expect(normalizeDocNumber("inv/0001")).toBe("INV1");
    expect(normalizeDocNumber("0042-A0")).toBe("42A0");
  });

  it("picks TDS rates by section and PAN holder", () => {
    expect(tdsRateFor("194C", "ABCPE1234F")).toBe(1);
    expect(tdsRateFor("194C", "ABCCE1234F")).toBe(2);
    expect(tdsRateFor("194J-P", null)).toBe(20);
    expect(tdsRateFor("UNKNOWN", "ABCPE1234F")).toBe(0);
  });

  it("knows quarters and e-way bill validity", () => {
    expect(quarterRange("2026-Q1")?.start.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(quarterRange("2026-Q4")?.end.toISOString()).toBe("2027-03-31T23:59:59.999Z");
    expect(ewbValidity(new Date("2026-09-10T06:00:00Z"), 450).toISOString()).toBe("2026-09-13T18:29:59.000Z");
  });
});
