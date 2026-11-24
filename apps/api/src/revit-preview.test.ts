import { describe, expect, it } from "vitest";
import * as CFB from "cfb";
import { extractPngFromBytes, extractRevitPreview, isLibraryModelFile, parseBasicFileInfo, thumbnailStorageKey } from "./revit-preview";

/** 1x1 transparent PNG. */
const PNG = Buffer.from(
  "89504E470D0A1A0A0000000D49484452000000010000000108060000001F15C4890000000A49444154789C63000100000500010D0A2DB40000000049454E44AE426082",
  "hex",
);

function compoundFile(streams: Record<string, Buffer>) {
  const cfb = CFB.utils.cfb_new();
  for (const [name, content] of Object.entries(streams)) {
    CFB.utils.cfb_add(cfb, name, content);
  }
  return Buffer.from(CFB.write(cfb, { type: "buffer" }) as Buffer);
}

describe("Revit preview extraction", () => {
  it("extracts a PNG that follows a short header, through IEND", () => {
    const stream = Buffer.concat([Buffer.from("PREVIEW"), PNG, Buffer.from("junk")]);
    const out = extractPngFromBytes(stream);
    expect(out?.equals(PNG)).toBe(true);
  });

  it("returns null when no PNG is present", () => {
    expect(extractPngFromBytes(Buffer.from("no image here"))).toBeNull();
  });

  it("reads RevitPreview4.0 and BasicFileInfo from a compound file", () => {
    const headered = Buffer.concat([Buffer.alloc(16, 7), PNG]);
    const info = Buffer.from("Autodesk Revit 2017\0Revit Build: 20170718_1515(x64)\0", "utf16le");
    const file = compoundFile({ "RevitPreview4.0": headered, BasicFileInfo: info });
    const result = extractRevitPreview(file);
    expect(result.png?.equals(PNG)).toBe(true);
    expect(result.revitYear).toBe("2017");
    expect(result.revitBuild).toMatch(/20170718/);
  });

  it("falls back to a whole-file PNG scan", () => {
    const result = extractRevitPreview(Buffer.concat([Buffer.from("xxxx"), PNG]));
    expect(result.png?.equals(PNG)).toBe(true);
  });

  it("parses a year from BasicFileInfo text", () => {
    expect(parseBasicFileInfo(Buffer.from("Format: 2021\nRevit Build: 20210321_1515", "utf16le")).revitYear).toBe("2021");
  });

  it("recognizes library model extensions", () => {
    expect(isLibraryModelFile("FX-V-H41-62_Multi.rfa")).toBe(true);
    expect(isLibraryModelFile("model.IFC")).toBe(true);
    expect(isLibraryModelFile("notes.pdf")).toBe(false);
    expect(thumbnailStorageKey("docs/a.rfa", 2)).toBe("docs/a.rfa.preview.v2.png");
  });
});
