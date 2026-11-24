import { describe, expect, it } from "vitest";
import {
  MULTIPART_PART_BYTES,
  PORTAL_VERSION_STATUSES,
  checkinError,
  checkoutError,
  folderName,
  jsonSize,
  multipartPlan,
  releasedVersionSome,
  releasedVersions,
  uploadLockError,
} from "./files";
import { toPlain } from "./services";

describe("portal version visibility", () => {
  it("hides drafts from portal listings", () => {
    expect(releasedVersions(true)).toEqual({ status: { in: [...PORTAL_VERSION_STATUSES] } });
    expect(releasedVersionSome(true)).toEqual({ some: { status: { in: [...PORTAL_VERSION_STATUSES] } } });
    expect(releasedVersions(false)).toBeUndefined();
    expect(releasedVersionSome(false)).toBeUndefined();
  });
});

describe("multipart plan", () => {
  it("splits a 2 GB file into 16 MB parts", () => {
    const twoGb = 2 * 1024 * 1024 * 1024;
    const plan = multipartPlan(twoGb);
    expect(plan.partSize).toBe(MULTIPART_PART_BYTES);
    expect(plan.partCount).toBe(128);
  });

  it("rejects an empty file", () => {
    expect(() => multipartPlan(0)).toThrow("Choose a file");
  });
});

describe("check-out rules", () => {
  it("lets the owner upload and check in, and blocks everyone else", () => {
    const free = { checkedOutById: null };
    const locked = { checkedOutById: "user-a" };
    expect(checkoutError(free, "user-a")).toBeNull();
    expect(checkoutError(locked, "user-a")).toBeNull();
    expect(checkoutError(locked, "user-b")).toBe("This file is already checked out");
    expect(uploadLockError(locked, "user-a")).toBeNull();
    expect(uploadLockError(locked, "user-b")).toBe("This file is checked out by another user");
    expect(checkinError(free, "user-a", false)).toBe("This file is not checked out");
    expect(checkinError(locked, "user-a", false)).toBeNull();
    expect(checkinError(locked, "user-b", false)).toBe("Only the person who checked this file out can check it in");
    expect(checkinError(locked, "user-b", true)).toBeNull();
  });
});

describe("folder names", () => {
  it("accepts a normal name and rejects paths", () => {
    expect(folderName("  Architectural  ")).toBe("Architectural");
    expect(() => folderName("a/b")).toThrow(/slashes/);
    expect(() => folderName("..")).toThrow(/slashes/);
  });
});

describe("size serialization", () => {
  it("keeps safe integers as numbers and larger values as strings", () => {
    expect(jsonSize(250 * 1024 * 1024)).toBe(262144000);
    expect(jsonSize(2n ** 53n + 5n)).toBe((2n ** 53n + 5n).toString());
  });

  it("toPlain converts bigint so JSON responses do not throw", () => {
    const plain = toPlain({ sizeBytes: 2n * 1024n * 1024n * 1024n, nested: { n: 10n } });
    expect(plain).toEqual({ sizeBytes: 2147483648, nested: { n: 10 } });
    expect(() => JSON.stringify(plain)).not.toThrow();
    const huge = toPlain({ sizeBytes: 2n ** 53n + 3n });
    expect(huge).toEqual({ sizeBytes: (2n ** 53n + 3n).toString() });
  });
});
