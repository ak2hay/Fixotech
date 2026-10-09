import { BadRequestException } from "@nestjs/common";
import { fromBuffer } from "file-type";
import { open } from "fs/promises";
import path from "path";
import { safeFileName } from "./services";

export type Upload = { originalname: string; mimetype: string; buffer: Buffer; size: number };
/** Multer disk-storage upload: the bytes stay in a temp file instead of memory. */
export type DiskUpload = { originalname: string; mimetype: string; path: string; size: number };

export const MB = 1024 * 1024;
/** Bytes read from the start of a file to identify it; enough for every signature and the text check. */
export const HEAD_BYTES = 64 * 1024;

/** Multer limits for every upload route: one file, bounded size, few form fields. */
export function uploadLimits(maxBytes: number) {
  return { limits: { fileSize: maxBytes, files: 1, fields: 20, fieldSize: 64 * 1024, parts: 25 } };
}

/**
 * `text`: plain-text format, must contain no NUL bytes or markup.
 * `opaque`: proprietary binary without a published signature; accepted only when it is not recognisable as any other type.
 */
type Kind = { mime: string; ext: string[]; text?: boolean; opaque?: boolean };

/** Binary formats are identified by their signature; plain-text CAD/BIM formats by extension plus a text check. */
const KINDS: Record<string, Kind> = {
  pdf: { mime: "application/pdf", ext: ["pdf"] },
  png: { mime: "image/png", ext: ["png"] },
  jpg: { mime: "image/jpeg", ext: ["jpg", "jpeg"] },
  webp: { mime: "image/webp", ext: ["webp"] },
  gif: { mime: "image/gif", ext: ["gif"] },
  avif: { mime: "image/avif", ext: ["avif"] },
  zip: { mime: "application/zip", ext: ["zip"] },
  xlsx: { mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", ext: ["xlsx"] },
  docx: { mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", ext: ["docx"] },
  dwg: { mime: "image/vnd.dwg", ext: ["dwg"] },
  rvt: { mime: "application/octet-stream", ext: ["rvt", "rfa", "rte", "rft"] },
  skp: { mime: "application/vnd.sketchup.skp", ext: ["skp"] },
  dwf: { mime: "model/vnd.dwf", ext: ["dwf"] },
  dwfx: { mime: "model/vnd.dwfx+xps", ext: ["dwfx"] },
  nwd: { mime: "application/octet-stream", ext: ["nwd", "nwc"], opaque: true },
  csv: { mime: "text/csv", ext: ["csv"], text: true },
  txt: { mime: "text/plain", ext: ["txt"], text: true },
  dxf: { mime: "image/vnd.dxf", ext: ["dxf"], text: true },
  ifc: { mime: "application/x-step", ext: ["ifc", "step", "stp"], text: true },
  iges: { mime: "model/iges", ext: ["igs", "iges"], text: true },
  sat: { mime: "application/octet-stream", ext: ["sat"], text: true },
};

export const DOCUMENT_KINDS = ["pdf", "png", "jpg", "webp", "gif", "zip", "xlsx", "docx", "dwg", "rvt", "skp", "dwf", "dwfx", "nwd", "csv", "txt", "dxf", "ifc", "iges", "sat"];
export const IMAGE_KINDS = ["png", "jpg", "webp", "gif", "avif"];
/** Formats accepted on the large-file path (CAD/BIM models and their packaging). */
export const CAD_KINDS = ["dwg", "rvt", "skp", "dwf", "dwfx", "nwd", "dxf", "ifc", "iges", "sat", "zip", "pdf"];
export const CAD_CATEGORIES = ["CAD", "BIM", "DRAWING"];

/** OOXML and DWFx files may be detected as their ZIP container. */
const DETECTED_ALIASES: Record<string, string[]> = {
  xlsx: ["xlsx", "zip"],
  docx: ["docx", "zip"],
  dwfx: ["zip"],
};

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** Signatures checked directly: AutoCAD DWG ("AC10xx"), Revit (OLE compound file), SketchUp, DWF. */
const SIGNATURES: Record<string, (buffer: Buffer) => boolean> = {
  dwg: (buffer) => buffer.subarray(0, 4).toString("latin1") === "AC10",
  rvt: (buffer) => buffer.subarray(0, 8).equals(OLE),
  skp: (buffer) => buffer.subarray(0, 4).equals(Buffer.from([0xff, 0xfe, 0xff, 0x0e])),
  dwf: (buffer) => buffer.subarray(0, 6).toString("latin1") === "(DWF V",
};

function looksLikeText(buffer: Buffer) {
  const sample = buffer.subarray(0, Math.min(buffer.length, HEAD_BYTES));
  if (sample.includes(0)) return false;
  const head = sample.toString("utf8", 0, Math.min(sample.length, 2048)).toLowerCase();
  return !/<\s*(script|html|svg|iframe|object|embed)\b/.test(head);
}

export function allowedExtensions(allowed: string[]) {
  return allowed.flatMap((key) => KINDS[key].ext);
}

/** Checks the name and size before any bytes arrive (presigned uploads). */
export function inspectName(originalName: string, size: number, allowed: string[], maxBytes: number) {
  if (!Number.isFinite(size) || size <= 0) throw new BadRequestException("Choose a file");
  if (size > maxBytes) throw new BadRequestException(`File is larger than ${Math.round(maxBytes / MB)} MB`);
  const fileName = safeFileName(originalName);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const kindKey = allowed.find((key) => KINDS[key].ext.includes(ext));
  if (!kindKey) throw new BadRequestException(`This file type is not accepted. Allowed: ${allowedExtensions(allowed).join(", ")}`);
  return { fileName, ext, kind: kindKey, mimeType: KINDS[kindKey].mime };
}

/**
 * Validates a file from its first bytes (the whole buffer for small uploads, the head for streamed ones)
 * and returns the trusted MIME type and a safe file name. The client's declared Content-Type is ignored.
 */
export async function inspectHead(head: Buffer, originalName: string, size: number, allowed: string[], maxBytes: number) {
  if (!head.length) throw new BadRequestException("Choose a file");
  const named = inspectName(originalName, size, allowed, maxBytes);
  const kind = KINDS[named.kind];
  const detected = await fromBuffer(head);
  if (SIGNATURES[named.kind]) {
    if (!SIGNATURES[named.kind](head)) throw new BadRequestException("File content does not match its extension");
  } else if (kind.text) {
    if (detected || !looksLikeText(head)) throw new BadRequestException("File content does not match its extension");
  } else if (kind.opaque) {
    if (detected || head.subarray(0, 8).equals(OLE) || looksLikeText(head)) throw new BadRequestException("File content does not match its extension");
  } else {
    const accepted = DETECTED_ALIASES[named.kind] || kind.ext;
    if (!detected || !(accepted.includes(detected.ext) || detected.mime === kind.mime)) throw new BadRequestException("File content does not match its extension");
  }
  return named;
}

export async function inspectUpload(file: Upload | undefined, allowed: string[], maxBytes: number) {
  if (!file?.buffer?.length) throw new BadRequestException("Choose a file");
  if (file.size > maxBytes || file.buffer.length > maxBytes) throw new BadRequestException(`File is larger than ${Math.round(maxBytes / MB)} MB`);
  return inspectHead(file.buffer, file.originalname, file.size, allowed, maxBytes);
}

export async function readHead(filePath: string, bytes = HEAD_BYTES) {
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(bytes);
    const { bytesRead } = await handle.read(buffer, 0, bytes, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

export async function inspectDiskUpload(file: DiskUpload | undefined, allowed: string[], maxBytes: number) {
  if (!file?.path || !file.size) throw new BadRequestException("Choose a file");
  return inspectHead(await readHead(file.path), file.originalname, file.size, allowed, maxBytes);
}
