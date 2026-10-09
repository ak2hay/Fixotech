import { describe, expect, it } from "vitest";
import { parseBankDate } from "./banking";
import { accruedLeave, carryForward, evaluateDay, isValidAadhaar, isValidPan, leaveBalance, leaveDays, localInstant, maskAadhaar, maskPan, parseBiometric, parseClock, spansToDays, verhoeffCheckDigit } from "./hr";

describe("identity numbers", () => {
  it("validates Aadhaar with the Verhoeff checksum", () => {
    const body = "23412341234";
    const valid = `${body}${verhoeffCheckDigit(body)}`;
    expect(isValidAadhaar(valid)).toBe(true);
    expect(isValidAadhaar(`${body}${(verhoeffCheckDigit(body) + 1) % 10}`)).toBe(false);
    expect(isValidAadhaar("123456789012")).toBe(false);
    expect(maskAadhaar(valid)).toBe(`XXXX XXXX ${valid.slice(-4)}`);
  });

  it("validates and masks PAN", () => {
    expect(isValidPan("ABCDE1234F")).toBe(true);
    expect(isValidPan("ABCD1234F")).toBe(false);
    expect(maskPan("ABCDE1234F")).toBe("ABXXX1234F");
  });
});

describe("leave", () => {
  const holidays = new Set(["2026-10-02"]);

  it("counts working days, skipping Sundays and holidays", () => {
    expect(leaveDays("2026-09-28", "2026-10-04", { holidays })).toBe(5);
    expect(leaveDays("2026-09-28", "2026-10-04", { holidays, weeklyOffs: [0, 6] })).toBe(4);
    expect(leaveDays("2026-09-28", "2026-10-04", { holidays, countOffs: true })).toBe(7);
    expect(leaveDays("2026-09-28", "2026-09-28", { halfDay: true })).toBe(0.5);
  });

  it("accrues monthly and yearly entitlements with joining pro-ration", () => {
    const earned = { annualQuota: 18, accrual: "MONTHLY" };
    expect(accruedLeave(earned, 2026, new Date("2026-03-10"))).toBe(4.5);
    expect(accruedLeave(earned, 2026, new Date("2026-12-31"))).toBe(18);
    expect(accruedLeave(earned, 2026, new Date("2026-03-10"), new Date("2026-02-20"))).toBe(1.5);
    expect(accruedLeave({ annualQuota: 12, accrual: "YEARLY" }, 2026, new Date("2026-01-05"))).toBe(12);
    expect(accruedLeave({ annualQuota: 12, accrual: "YEARLY" }, 2026, new Date("2026-08-05"), new Date("2026-07-01"))).toBe(6);
    expect(accruedLeave({ annualQuota: 12, accrual: "YEARLY" }, 2025, new Date("2026-08-05"), new Date("2026-07-01"))).toBe(0);
  });

  it("computes balance and carry-forward", () => {
    expect(leaveBalance({ opening: 5, accrued: 9, adjusted: 1, used: 4, pending: 2 })).toEqual({ balance: 11, available: 9 });
    expect(carryForward(11, 8)).toBe(8);
    expect(carryForward(-2, 8)).toBe(0);
  });
});

describe("attendance", () => {
  const shift = { startTime: "09:30", endTime: "18:30", breakMinutes: 60, graceMinutes: 15, halfDayHours: 4, fullDayHours: 8 };

  it("reads clock times", () => {
    expect(parseClock("9:05 PM")).toEqual([21, 5]);
    expect(parseClock("0905")).toEqual([9, 5]);
    expect(parseClock("1899-12-30T09:05:00.000Z")).toEqual([9, 5]);
    expect(parseClock("25:00")).toBeNull();
  });

  it("evaluates a day against the shift", () => {
    const day = "2026-09-07";
    expect(evaluateDay({ day, shift, checkIn: localInstant(day, "09:40"), checkOut: localInstant(day, "19:30") })).toEqual({ status: "PRESENT", workedMinutes: 530, lateMinutes: 0, overtimeMinutes: 50 });
    expect(evaluateDay({ day, shift, checkIn: localInstant(day, "10:00"), checkOut: localInstant(day, "15:00") })).toMatchObject({ status: "HALF_DAY", lateMinutes: 30 });
    expect(evaluateDay({ day, shift, checkIn: localInstant(day, "10:00") }).status).toBe("MISS_PUNCH");
    expect(evaluateDay({ day, shift, leave: "FULL" }).status).toBe("LEAVE");
    expect(evaluateDay({ day, shift, holiday: true }).status).toBe("HOLIDAY");
    expect(evaluateDay({ day, shift }).status).toBe("ABSENT");
    expect(evaluateDay({ day, shift, weeklyOff: true, checkIn: localInstant(day, "10:00"), checkOut: localInstant(day, "14:00") })).toMatchObject({ status: "PRESENT", overtimeMinutes: 240 });
  });

  it("parses punch logs and daily in/out exports", () => {
    const punches = parseBiometric(
      [
        ["Device report"],
        ["Emp Code", "Punch Time"],
        ["E001", "07/09/2026 09:31:10"],
        ["E001", "07/09/2026 13:02:00"],
        ["E001", "07/09/2026 18:45:00"],
        ["E002", "07/09/2026 10:05"],
      ],
      parseBankDate,
    );
    const e1 = punches.days.find((row) => row.code === "E001")!;
    expect(e1.day).toBe("2026-09-07");
    expect(e1.checkIn?.toISOString()).toBe(localInstant("2026-09-07", "09:31").toISOString());
    expect(e1.checkOut?.toISOString()).toBe(localInstant("2026-09-07", "18:45").toISOString());
    expect(punches.days.find((row) => row.code === "E002")?.checkOut).toBeNull();
    const daily = parseBiometric([["EmpID", "Date", "In Time", "Out Time"], ["E003", "2026-09-07", "09:15", "18:00"]], parseBankDate);
    expect(daily.days[0]).toMatchObject({ code: "E003", day: "2026-09-07" });
    expect(daily.days[0].checkOut?.toISOString()).toBe(localInstant("2026-09-07", "18:00").toISOString());
  });

  it("collapses activity spans into first-in / last-out per local day", () => {
    const days = spansToDays([
      { employeeId: "a", start: localInstant("2026-09-07", "08:00"), end: localInstant("2026-09-07", "12:00") },
      { employeeId: "a", start: localInstant("2026-09-07", "13:00"), end: localInstant("2026-09-07", "17:30") },
      { employeeId: "a", start: localInstant("2026-09-08", "08:00"), end: null },
    ]);
    expect(days).toHaveLength(2);
    expect(days[0].checkOut?.toISOString()).toBe(localInstant("2026-09-07", "17:30").toISOString());
  });
});
