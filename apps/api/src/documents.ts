import { BadRequestException } from "@nestjs/common";
import archiver from "archiver";
import type { Response } from "express";
import { PrismaService } from "./prisma.service";
import { StorageService, Tx, contentDisposition } from "./services";

export type DownloadChannel = "ERP" | "PORTAL" | "PUBLIC" | "SHARE" | "BUNDLE";

/** Bundles are capped so one request cannot stream the whole library. */
const BUNDLE_MAX_FILES = 200;
const BUNDLE_MAX_BYTES = 2 * 1024 * 1024 * 1024;

/** Streams a stored file as a download with a locked-down CSP so it can never run script on the API origin. */
export async function streamFile(res: Response, storage: StorageService, file: { storageKey: string; mimeType: string; fileName: string }, disposition: "attachment" | "inline" = "attachment", sandbox = true) {
  const { body, size } = await storage.stream(file.storageKey);
  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Disposition", contentDisposition(file.fileName, disposition));
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (sandbox) res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
  if (size) res.setHeader("Content-Length", String(size));
  await new Promise<void>((resolve, reject) => {
    body.on("error", reject);
    res.on("close", resolve);
    body.pipe(res);
  });
}

export function recordDownload(db: PrismaService | Tx, input: { documentId: string; version: number; channel: DownloadChannel; userId?: string | null; leadId?: string | null; ip?: string | null }) {
  return db.documentDownload
    .create({ data: { documentId: input.documentId, version: input.version, channel: input.channel, userId: input.userId || undefined, leadId: input.leadId || undefined, ip: input.ip || undefined } })
    .catch(() => undefined);
}

type BundleFile = { documentId: string; version: number; category: string; fileName: string; storageKey: string; sizeBytes: number };

/** Unique entry names inside the zip: CATEGORY/file.ext, with a counter when two files share a name. */
export function bundleEntryNames(files: Array<{ category: string; fileName: string }>) {
  const seen = new Map<string, number>();
  return files.map((file) => {
    const base = `${file.category}/${file.fileName}`;
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    if (!count) return base;
    const dot = file.fileName.lastIndexOf(".");
    const stem = dot > 0 ? file.fileName.slice(0, dot) : file.fileName;
    const ext = dot > 0 ? file.fileName.slice(dot) : "";
    return `${file.category}/${stem} (${count + 1})${ext}`;
  });
}

/** Streams a zip of the given files (stored, not recompressed: CAD formats are already compressed). */
export async function streamBundle(res: Response, storage: StorageService, files: BundleFile[], zipName: string) {
  if (!files.length) throw new BadRequestException("There are no files to bundle");
  if (files.length > BUNDLE_MAX_FILES) throw new BadRequestException(`A bundle can hold at most ${BUNDLE_MAX_FILES} files`);
  if (files.reduce((sum, file) => sum + file.sizeBytes, 0) > BUNDLE_MAX_BYTES) throw new BadRequestException("These files are too large to bundle; download them one by one");
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", contentDisposition(zipName, "attachment"));
  res.setHeader("X-Content-Type-Options", "nosniff");
  const archive = archiver("zip", { store: true });
  const names = bundleEntryNames(files);
  const done = new Promise<void>((resolve, reject) => {
    archive.on("error", reject);
    res.on("close", resolve);
  });
  archive.pipe(res);
  // One source stream open at a time: the next object is fetched only after the previous entry is written.
  for (const [index, file] of files.entries()) {
    const { body } = await storage.stream(file.storageKey);
    const written = new Promise<void>((resolve, reject) => {
      archive.once("entry", () => resolve());
      body.once("error", reject);
    });
    archive.append(body, { name: names[index] });
    await written;
  }
  await archive.finalize();
  await done;
}
