import { BadRequestException } from "@nestjs/common";

/** Revisions a portal user may see; drafts and internal reviews stay inside Fixotec. */
export const PORTAL_VERSION_STATUSES = ["APPROVED", "CLIENT_REVIEW"] as const;

/** Prisma `versions` filter so portal listings never include draft-only documents. */
export function releasedVersions(external: boolean) {
  return external ? { status: { in: [...PORTAL_VERSION_STATUSES] } } : undefined;
}

export function releasedVersionSome(external: boolean) {
  const where = releasedVersions(external);
  return where ? { some: where } : undefined;
}

export const MB = 1024 * 1024;
/** Part size for S3/R2 multipart uploads (16 MB keeps a 2 GB file under 128 parts). */
export const MULTIPART_PART_BYTES = 16 * MB;
/** Above this size, presign prefers multipart when object storage is enabled. */
export const MULTIPART_THRESHOLD_BYTES = 64 * MB;

export function multipartPlan(size: number, partSize = MULTIPART_PART_BYTES) {
  if (!Number.isFinite(size) || size <= 0) throw new BadRequestException("Choose a file");
  const partCount = Math.ceil(size / partSize);
  if (partCount < 1 || partCount > 10_000) throw new BadRequestException("File is too large to upload in parts");
  return { partSize, partCount };
}

export function asByteSize(value: bigint | number | string) {
  return typeof value === "bigint" ? value : BigInt(value);
}

export function jsonSize(value: bigint | number | string | null | undefined): number | string {
  if (value == null) return 0;
  const n = asByteSize(value);
  return n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : n.toString();
}

export type CheckoutState = { checkedOutById: string | null; checkedOutAt?: Date | null };

export function uploadLockError(state: CheckoutState, userId: string) {
  if (state.checkedOutById && state.checkedOutById !== userId) {
    return "This file is checked out by another user";
  }
  return null;
}

export function checkoutError(state: CheckoutState, userId: string) {
  if (state.checkedOutById && state.checkedOutById !== userId) {
    return "This file is already checked out";
  }
  return null;
}

export function checkinError(state: CheckoutState, userId: string, force: boolean) {
  if (!state.checkedOutById) return "This file is not checked out";
  if (state.checkedOutById !== userId && !force) return "Only the person who checked this file out can check it in";
  return null;
}

const FOLDER_NAME = /^[^\\/]{1,80}$/;

export function folderName(value: string) {
  const name = value.trim();
  if (!FOLDER_NAME.test(name) || name === "." || name === "..") {
    throw new BadRequestException("Enter a folder name of up to 80 characters, without slashes");
  }
  return name;
}

export function normalizedFolderName(name: string) {
  return name.trim().toLowerCase();
}

export const BIM_VERSION_STATUSES = ["DRAFT", "PUBLIC"] as const;

export function isBimLibraryStatus(status: string) {
  return status === "DRAFT" || status === "PUBLIC";
}
