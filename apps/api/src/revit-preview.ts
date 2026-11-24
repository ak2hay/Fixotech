import * as CFB from "cfb";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const IEND = Buffer.from("IEND");

export type RevitFileInfo = {
  png: Buffer | null;
  revitYear: string | null;
  revitBuild: string | null;
};

function asBuffer(value: Buffer | Uint8Array | number[] | undefined | null) {
  if (!value) return Buffer.alloc(0);
  if (Buffer.isBuffer(value)) return value;
  return Buffer.from(value);
}

/** Pulls the PNG that follows any OLE/Revit header in a stream, from the PNG signature through IEND+CRC. */
export function extractPngFromBytes(bytes: Buffer | Uint8Array | number[]) {
  const buf = asBuffer(bytes);
  const start = buf.indexOf(PNG_SIGNATURE);
  if (start < 0) return null;
  const iendAt = buf.indexOf(IEND, start + PNG_SIGNATURE.length);
  if (iendAt < 0) return null;
  const end = iendAt + 4 + 4;
  if (end > buf.length) return null;
  return Buffer.from(buf.subarray(start, end));
}

function decodeWideText(bytes: Buffer) {
  if (bytes.length >= 2 && bytes[1] === 0) return bytes.toString("utf16le");
  if (bytes.length >= 2 && bytes[0] === 0) return bytes.swap16().toString("utf16le");
  return bytes.toString("utf8");
}

/** Reads the Revit year and build string from a BasicFileInfo stream (UTF-16 text). */
export function parseBasicFileInfo(bytes: Buffer | Uint8Array | number[]) {
  const text = decodeWideText(asBuffer(bytes)).replace(/\u0000/g, " ");
  const build = text.match(/Revit Build:\s*([^\r\n]+)/i)?.[1]?.trim() || null;
  const year =
    text.match(/Autodesk Revit(?:\s+(?:MEP|Architecture|Structure))?\s+(\d{4})/i)?.[1] ||
    text.match(/Format:\s*(\d{4})/i)?.[1] ||
    build?.match(/\b(20\d{2})\b/)?.[1] ||
    text.match(/\b(20[0-3]\d)\b/)?.[1] ||
    null;
  return { revitYear: year, revitBuild: build };
}

function streamContent(cfb: CFB.CFB$Container, name: string) {
  const lower = name.toLowerCase();
  const entry = cfb.FileIndex.find((item) => (item.name || "").toLowerCase() === lower || (item.name || "").toLowerCase().endsWith(lower));
  if (!entry || entry.content == null) return null;
  return asBuffer(entry.content as number[] | Uint8Array);
}

/**
 * Reads a Revit OLE compound file (.rfa/.rvt) and returns the embedded preview PNG
 * plus the year/build from BasicFileInfo, when present.
 */
export function extractRevitPreview(file: Buffer): RevitFileInfo {
  let png: Buffer | null = null;
  let revitYear: string | null = null;
  let revitBuild: string | null = null;
  try {
    const cfb = CFB.read(file, { type: "buffer" });
    const preview = streamContent(cfb, "RevitPreview4.0") || streamContent(cfb, "RevitPreview");
    png = preview ? extractPngFromBytes(preview) : null;
    const info = streamContent(cfb, "BasicFileInfo");
    if (info?.length) ({ revitYear, revitBuild } = parseBasicFileInfo(info));
  } catch {
    // Fall through to a whole-file PNG scan when the compound-file directory cannot be read.
  }
  if (!png) png = extractPngFromBytes(file);
  if (!revitYear && !revitBuild) {
    const parsed = parseBasicFileInfo(file);
    revitYear = parsed.revitYear;
    revitBuild = parsed.revitBuild;
  }
  return { png, revitYear, revitBuild };
}

export function isRevitFamilyFile(fileName?: string | null) {
  return /\.(rfa|rvt|rte|rft)$/i.test(fileName || "");
}

export function isIfcFile(fileName?: string | null) {
  return /\.ifc$/i.test(fileName || "");
}

export function isLibraryModelFile(fileName?: string | null) {
  return isRevitFamilyFile(fileName) || isIfcFile(fileName);
}

export function thumbnailStorageKey(storageKey: string, version: number) {
  const clean = storageKey.replace(/\.preview\.v\d+\.png$/i, "");
  return `${clean}.preview.v${version}.png`;
}

export const PREVIEW_EXTRACT_MAX_BYTES = 80 * 1024 * 1024;
