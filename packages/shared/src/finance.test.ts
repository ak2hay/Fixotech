import { describe, expect, it } from "vitest";
import { csvRecords, parseAmount, parseCsv, parseIndianDate } from "./csv";
import { DEFAULT_CHART, checkBalanced, compactLines, financialYearOf, fifoAgeing, fxGainOnReceipt, gstSplit, mapZohoAccountType, naturalBalance, profitOf, stateCodeOf, tallyGroupFor, tallyXml } from "./finance";

describe("csv", () => {
  it("parses quoted fields, escaped quotes and embedded newlines", () => {
    const rows = parseCsv('a,b,c\r\n"x, y","he said ""hi""","line1\nline2"\n\n1,2,3');
    expect(rows).toEqual([
      ["a", "b", "c"],
      ["x, y", 'he said "hi"', "line1\nline2"],
      ["1", "2", "3"],
    ]);
  });

  it("detects semicolon separators and normalises headers", () => {
    expect(csvRecords("\uFEFFAccount Name;Account Type\nHDFC;Bank")).toEqual([{ account_name: "HDFC", account_type: "Bank" }]);
  });

  it("reads Indian amounts", () => {
    expect(parseAmount("1,23,456.78")).toBe(123456.78);
    expect(parseAmount("(1,200.00)")).toBe(-1200);
    expect(parseAmount("500 Cr")).toBe(-500);
    expect(parseAmount("₹ 5,000 Dr")).toBe(5000);
    expect(parseAmount("")).toBe(0);
  });

  it("reads Indian dates", () => {
    expect(parseIndianDate("05/04/2026")?.toISOString()).toBe("2026-04-05T00:00:00.000Z");
    expect(parseIndianDate("5-Apr-26")?.toISOString()).toBe("2026-04-05T00:00:00.000Z");
    expect(parseIndianDate("2026-04-05")?.toISOString()).toBe("2026-04-05T00:00:00.000Z");
    expect(parseIndianDate("garbage")).toBeNull();
  });
});

describe("finance", () => {
  it("rejects unbalanced or malformed journals", () => {
    expect(checkBalanced([{ accountId: "a", debit: 100 }, { accountId: "b", credit: 100 }]).errors).toEqual([]);
    expect(checkBalanced([{ accountId: "a", debit: 100 }, { accountId: "b", credit: 99 }]).errors[0]).toMatch(/differ/);
    expect(checkBalanced([{ accountId: "a", debit: 100, credit: 100 }, { accountId: "b", credit: 0 }]).errors.length).toBeGreaterThan(1);
    expect(checkBalanced([{ accountId: "a", debit: 1 }]).errors[0]).toMatch(/two lines/);
  });

  it("compacts duplicate lines and drops zeros", () => {
    const lines = compactLines([
      { accountId: "sales", credit: 100 },
      { accountId: "sales", credit: 50 },
      { accountId: "tax", credit: 0 },
      { accountId: "ar", debit: 150, partyType: "CUSTOMER", partyId: "c1" },
    ]);
    expect(lines).toHaveLength(2);
    expect(lines.find((line) => line.accountId === "sales")?.credit).toBe(150);
  });

  it("computes natural balances and profit", () => {
    expect(naturalBalance("ASSET", 100, 30)).toBe(70);
    expect(naturalBalance("LIABILITY", 100, 30)).toBe(-70);
    expect(profitOf([{ type: "INCOME", debit: 0, credit: 1000 }, { type: "EXPENSE", debit: 600, credit: 0 }, { type: "ASSET", debit: 5, credit: 0 }])).toEqual({ income: 1000, expense: 600, profit: 400 });
  });

  it("splits GST by place of supply", () => {
    expect(stateCodeOf("27AAACF1234A1Z5")).toBe("27");
    expect(stateCodeOf("bad")).toBeNull();
    expect(gstSplit(18.01, true)).toEqual({ cgst: 9.01, sgst: 9, igst: 0 });
    expect(gstSplit(18, false)).toEqual({ cgst: 0, sgst: 0, igst: 18 });
  });

  it("computes FX gain on settlement", () => {
    expect(fxGainOnReceipt(1000, 83, 84.5)).toBe(1500);
    expect(fxGainOnReceipt(1000, 83, 82)).toBe(-1000);
  });

  it("ages receivables FIFO", () => {
    const asOf = new Date("2026-10-01T00:00:00Z");
    const result = fifoAgeing(
      [
        { date: "2026-01-01", debit: 1000, credit: 0 },
        { date: "2026-08-15", debit: 500, credit: 0 },
        { date: "2026-09-01", debit: 0, credit: 600 },
      ],
      asOf,
    );
    expect(result.outstanding).toBe(900);
    expect(result.buckets.d180).toBe(400);
    expect(result.buckets.d30).toBe(500);
  });

  it("treats overpayment as an advance", () => {
    const result = fifoAgeing([{ date: "2026-01-01", debit: 0, credit: 300 }, { date: "2026-02-01", debit: 100, credit: 0 }], new Date("2026-03-01"));
    expect(result.advance).toBe(200);
    expect(result.outstanding).toBe(-200);
  });

  it("knows the Indian financial year", () => {
    expect(financialYearOf(new Date("2026-03-31T10:00:00Z")).label).toBe("2025-26");
    expect(financialYearOf(new Date("2026-04-01T00:00:00Z")).label).toBe("2026-27");
  });

  it("maps Zoho account types and Tally groups", () => {
    expect(mapZohoAccountType("Bank")).toEqual({ type: "ASSET", subtype: "BANK" });
    expect(mapZohoAccountType("Other Current Liability").type).toBe("LIABILITY");
    expect(mapZohoAccountType("Cost Of Goods Sold")).toEqual({ type: "EXPENSE", subtype: "COGS" });
    expect(tallyGroupFor({ type: "ASSET", subtype: "RECEIVABLE" })).toBe("Sundry Debtors");
    expect(tallyGroupFor({ type: "INCOME" })).toBe("Indirect Incomes");
  });

  it("renders Tally XML with debits negative and escaped names", () => {
    const xml = tallyXml("A & B", [{ name: "Sales <Dom>", group: "Sales Accounts" }], [{ type: "Sales", number: "INV-1", date: new Date("2026-04-05"), lines: [{ ledger: "Debtor", debit: 118, credit: 0 }, { ledger: "Sales <Dom>", debit: 0, credit: 118 }] }]);
    expect(xml).toContain("A &amp; B");
    expect(xml).toContain("Sales &lt;Dom&gt;");
    expect(xml).toContain("<AMOUNT>-118.00</AMOUNT>");
    expect(xml).toContain("<DATE>20260405</DATE>");
  });

  it("ships a consistent default chart", () => {
    const codes = new Set(DEFAULT_CHART.map((account) => account.code));
    expect(codes.size).toBe(DEFAULT_CHART.length);
    const keys = DEFAULT_CHART.flatMap((account) => (account.systemKey ? [account.systemKey] : []));
    expect(new Set(keys).size).toBe(keys.length);
    for (const account of DEFAULT_CHART) if (account.parent) expect(codes.has(account.parent)).toBe(true);
    for (const key of ["AR", "AP", "SALES", "COGS", "INVENTORY", "GRNI", "CGST_OUT", "IGST_IN", "BANK", "SALARY_PAYABLE", "FX_GAIN_LOSS", "RETAINED_EARNINGS", "OPENING_EQUITY"]) expect(keys).toContain(key);
  });
});
