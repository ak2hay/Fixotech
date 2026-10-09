import { describe, expect, it } from "vitest";
import { autoMatch, bulkPaymentFile, extractUtr, parseBankAmount, parseBankDate, parseMt940, parsePdfStatement, parseStatementTable, payoutMode, ruleFor, scoreMatch, validatePayout } from "./banking";
import { parseCsv } from "./csv";

const iso = (date: Date | null | undefined) => date?.toISOString().slice(0, 10);

describe("bank dates and amounts", () => {
  it("reads day-first dates in the usual Indian formats", () => {
    expect(iso(parseBankDate("05/09/26"))).toBe("2026-09-05");
    expect(iso(parseBankDate("05-09-2026"))).toBe("2026-09-05");
    expect(iso(parseBankDate("5 Sep 2026"))).toBe("2026-09-05");
    expect(iso(parseBankDate("05-Sep-26"))).toBe("2026-09-05");
    expect(iso(parseBankDate("2026-09-05"))).toBe("2026-09-05");
    expect(parseBankDate("31/02/2026")).toBeNull();
    expect(parseBankDate("Opening balance")).toBeNull();
  });

  it("reads Indian digit grouping and Dr/Cr suffixes", () => {
    expect(parseBankAmount("1,23,456.78")).toBe(123456.78);
    expect(parseBankAmount("500.00 Dr")).toBe(-500);
    expect(parseBankAmount("(250.50)")).toBe(-250.5);
    expect(parseBankAmount("")).toBeNull();
  });
});

describe("statement parsers", () => {
  it("parses an HDFC-style CSV with banner rows and wrapped narration", () => {
    const csv = [
      "HDFC BANK Ltd.,,,,,,",
      "Account No :50200012345678,,,,,,",
      ",,,,,,",
      "Date,Narration,Chq./Ref.No.,Value Dt,Withdrawal Amt.,Deposit Amt.,Closing Balance",
      "01/09/26,NEFT CR-ICIC0000123-ACME INFRA PVT LTD-INV-0042,ICICN52026090112345,01/09/26,,\"1,18,000.00\",\"2,18,000.00\"",
      "02/09/26,CHQ PAID-000123-STEEL TRADERS,000123,02/09/26,\"50,000.00\",,\"1,68,000.00\"",
      ",SALARY ADVANCE,,,,,",
      "03/09/26,SMS CHGS FOR AUG,,03/09/26,17.70,,\"1,67,982.30\"",
      "Statement Summary,,,,,,",
    ].join("\n");
    const parsed = parseStatementTable(parseCsv(csv));
    expect(parsed.bank).toBe("HDFC");
    expect(parsed.accountNo).toBe("50200012345678");
    expect(parsed.lines).toHaveLength(3);
    expect(parsed.lines[0]).toMatchObject({ credit: 118000, debit: 0, balance: 218000, reference: "ICICN52026090112345" });
    expect(parsed.lines[1].description).toContain("SALARY ADVANCE");
    expect(parsed.openingBalance).toBe(100000);
    expect(parsed.closingBalance).toBe(167982.3);
    expect(parsed.warnings).toEqual([]);
  });

  it("handles a single amount column with a Cr/Dr indicator (ICICI style)", () => {
    const rows = [
      ["S No.", "Value Date", "Transaction Date", "Cheque Number", "Transaction Remarks", "Amount", "Cr/Dr", "Balance"],
      ["1", "04/09/2026", "04/09/2026", "", "UPI/625312345678/PAYMENT", "1500.00", "DR", "98500.00"],
      ["2", "05/09/2026", "05/09/2026", "", "RTGS-HDFCR52026090500012-ACME", "250000.00", "CR", "348500.00"],
    ];
    const parsed = parseStatementTable(rows);
    expect(parsed.lines.map((line) => [line.debit, line.credit])).toEqual([[1500, 0], [0, 250000]]);
  });

  it("parses MT940", () => {
    const text = [":20:STMT2609", ":25:HDFC0000001/50200012345678", ":28C:1/1", ":60F:C260901INR100000,00", ":61:2609010901C118000,00NTRFNONREF//ICICN520260901", ":86:NEFT CR ACME INFRA INV-0042", ":61:2609020902D50000,00NCHK000123", ":86:CHQ PAID STEEL TRADERS", ":62F:C260902INR168000,00"].join("\n");
    const parsed = parseMt940(text);
    expect(parsed.accountNo).toBe("50200012345678");
    expect(parsed.openingBalance).toBe(100000);
    expect(parsed.closingBalance).toBe(168000);
    expect(parsed.lines).toHaveLength(2);
    expect(parsed.lines[0]).toMatchObject({ credit: 118000, balance: 218000, description: "NEFT CR ACME INFRA INV-0042", reference: "ICICN520260901" });
    expect(parsed.lines[1]).toMatchObject({ debit: 50000, balance: 168000, reference: "000123" });
  });

  it("infers debit or credit in PDF text from the running balance", () => {
    const text = ["STATE BANK OF INDIA", "Opening Balance 1,00,000.00", "01/09/2026 01/09/2026 BY TRANSFER-NEFT ACME 1,18,000.00 2,18,000.00", "ACME INFRA PVT LTD", "02/09/2026 02/09/2026 TO CHQ 000123 50,000.00 1,68,000.00", "Page 1 of 2"].join("\n");
    const parsed = parsePdfStatement(text);
    expect(parsed.bank).toBe("SBI");
    expect(parsed.lines.map((line) => [line.debit, line.credit])).toEqual([[0, 118000], [50000, 0]]);
    expect(parsed.lines[0].description).toContain("ACME INFRA");
    expect(parsed.warnings).toEqual([]);
  });
});

describe("matching", () => {
  it("pulls UTRs out of narrations", () => {
    expect(extractUtr("NEFT CR-ICICN52026090112345-ACME")).toBe("ICICN52026090112345");
    expect(extractUtr("UPI/625312345678/PAYMENT")).toBe("625312345678");
    expect(extractUtr("CASH DEPOSIT")).toBeNull();
  });

  it("scores amount, reference, document number and party", () => {
    const line = { id: "l1", date: new Date("2026-09-01"), amount: 118000, description: "NEFT CR-ICIC0000123-ACME INFRA PVT LTD-INV-0042", reference: "ICICN52026090112345" };
    expect(scoreMatch(line, { id: "p1", date: new Date("2026-09-01"), amount: 118000, reference: "ICICN52026090112345", partyName: "Acme Infra Pvt Ltd" })).toBe(100);
    expect(scoreMatch(line, { id: "p2", date: new Date("2026-09-01"), amount: 118500 })).toBe(0);
    expect(scoreMatch(line, { id: "p3", date: new Date("2026-08-30"), amount: 118000, documentNumbers: ["INV-0042"] })).toBe(74);
    expect(scoreMatch(line, { id: "p4", date: new Date("2026-09-01"), amount: -118000 })).toBe(0);
  });

  it("assigns one-to-one and leaves ties as suggestions", () => {
    const lines = [
      { id: "a", date: new Date("2026-09-01"), amount: 5000, description: "NEFT ACME" },
      { id: "b", date: new Date("2026-09-01"), amount: 5000, description: "NEFT BETA" },
    ];
    const result = autoMatch(lines, [
      { id: "x", date: new Date("2026-09-01"), amount: 5000, partyName: "Acme Corp" },
      { id: "y", date: new Date("2026-09-01"), amount: 5000, partyName: "Beta Steel" },
    ]);
    expect(result.matched.map((pair) => `${pair.lineId}${pair.candidateId}`).sort()).toEqual(["ax", "by"]);
    const tie = autoMatch([lines[0]], [{ id: "x", date: new Date("2026-09-01"), amount: 5000 }, { id: "y", date: new Date("2026-09-01"), amount: 5000 }]);
    expect(tie.matched).toHaveLength(0);
    expect(tie.suggested).toHaveLength(1);
  });

  it("applies the first matching rule by priority and direction", () => {
    const rules = [
      { id: "fees", contains: "CHGS|CHARGES", direction: "OUT", priority: 50 },
      { id: "rzp", contains: "RAZORPAY", direction: "IN", priority: 10 },
    ];
    expect(ruleFor({ description: "SMS CHGS", debit: 17.7, credit: 0 }, rules)?.id).toBe("fees");
    expect(ruleFor({ description: "RAZORPAY SOFTWARE SETTLEMENT", debit: 0, credit: 9800 }, rules)?.id).toBe("rzp");
    expect(ruleFor({ description: "RAZORPAY REFUND", debit: 500, credit: 0 }, rules)).toBeNull();
  });
});

describe("bulk payment files", () => {
  const items = [
    { payeeName: "Steel Traders, Pune", accountNo: "123456789012", ifsc: "SBIN0001234", amount: 50000, reference: "PR-0001 BILL-77" },
    { payeeName: "Big Supplier", accountNo: "998877665544", ifsc: "HDFC0000001", amount: 250000, reference: "PR-0001 BILL-78" },
  ];

  it("picks NEFT, RTGS or internal transfer", () => {
    expect(payoutMode({ amount: 50000, ifsc: "SBIN0001234" }, "HDFC0000001")).toBe("NEFT");
    expect(payoutMode({ amount: 250000, ifsc: "SBIN0001234" }, "HDFC0000001")).toBe("RTGS");
    expect(payoutMode({ amount: 250000, ifsc: "HDFC0009999" }, "HDFC0000001")).toBe("IFT");
  });

  it("validates beneficiaries", () => {
    expect(validatePayout(items[0])).toEqual([]);
    expect(validatePayout({ ...items[0], ifsc: "SBIN1234" })).toContain("invalid IFSC");
  });

  it("writes the HDFC and ICICI layouts", () => {
    const hdfc = bulkPaymentFile("HDFC", { accountNo: "50200012345678", ifsc: "HDFC0000001" }, items, new Date("2026-09-10"), "PR-0001");
    const rows = hdfc.content.trim().split("\r\n").map((row) => row.split(","));
    expect(rows[0][0]).toBe("N");
    expect(rows[0][4]).toBe("Steel Traders Pune");
    expect(rows[1][0]).toBe("I");
    expect(rows[0][22]).toBe("10/09/2026");
    const icici = bulkPaymentFile("ICICI", { accountNo: "000405001234" }, items, new Date("2026-09-10"), "PR-0001");
    expect(icici.content.split("\r\n")[2].split(",").slice(0, 5)).toEqual(["000405001234", "998877665544", "Big Supplier", "250000.00", "RTG"]);
  });
});
