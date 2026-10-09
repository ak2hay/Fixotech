import { describe, expect, it } from "vitest";
import { bundleEntryNames } from "./documents";
import { CAD_KINDS, DOCUMENT_KINDS, MB, inspectHead, inspectName } from "./uploads";

const OLE = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0, 0, 0, 0]);
const binary = (bytes: number[]) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(64, 0)]);

describe("CAD/BIM upload inspection", () => {
  it("accepts Revit projects, families and templates by their OLE signature", async () => {
    for (const name of ["model.rvt", "hanger.rfa", "office.rte", "generic.rft"]) {
      await expect(inspectHead(OLE, name, 200 * MB, DOCUMENT_KINDS, 250 * MB)).resolves.toMatchObject({ kind: "rvt" });
    }
  });

  it("rejects a renamed file whose content is not Revit", async () => {
    await expect(inspectHead(Buffer.from("%PDF-1.7 hello"), "fake.rfa", 1000, DOCUMENT_KINDS, 25 * MB)).rejects.toThrow("does not match");
  });

  it("checks SketchUp and DWF signatures", async () => {
    await expect(inspectHead(binary([0xff, 0xfe, 0xff, 0x0e]), "bracket.skp", 1000, CAD_KINDS, 25 * MB)).resolves.toMatchObject({ kind: "skp" });
    await expect(inspectHead(Buffer.from("(DWF V06.00)PK"), "sheet.dwf", 1000, CAD_KINDS, 25 * MB)).resolves.toMatchObject({ kind: "dwf" });
    await expect(inspectHead(binary([1, 2, 3, 4]), "bracket.skp", 1000, CAD_KINDS, 25 * MB)).rejects.toThrow("does not match");
  });

  it("accepts Navisworks only when the bytes are not some other recognisable type", async () => {
    await expect(inspectHead(binary([0x4e, 0x57, 0x44, 0x01, 0x07]), "coordination.nwd", 1000, CAD_KINDS, 25 * MB)).resolves.toMatchObject({ kind: "nwd" });
    await expect(inspectHead(Buffer.from("%PDF-1.7\n%\xe2\xe3\n1 0 obj"), "coordination.nwd", 1000, CAD_KINDS, 25 * MB)).rejects.toThrow("does not match");
    await expect(inspectHead(Buffer.from("just some text"), "coordination.nwc", 1000, CAD_KINDS, 25 * MB)).rejects.toThrow("does not match");
  });

  it("accepts text CAD formats and refuses markup inside them", async () => {
    await expect(inspectHead(Buffer.from("ISO-10303-21;\nHEADER;"), "tray.ifc", 1000, DOCUMENT_KINDS, 25 * MB)).resolves.toMatchObject({ kind: "ifc" });
    await expect(inspectHead(Buffer.from("S      1\nG      1"), "part.igs", 1000, DOCUMENT_KINDS, 25 * MB)).resolves.toMatchObject({ kind: "iges" });
    await expect(inspectHead(Buffer.from("<script>alert(1)</script>"), "tray.ifc", 1000, DOCUMENT_KINDS, 25 * MB)).rejects.toThrow("does not match");
  });

  it("enforces the size limit before any bytes are uploaded", () => {
    expect(() => inspectName("big.rvt", 300 * MB, DOCUMENT_KINDS, 250 * MB)).toThrow("larger than 250 MB");
    expect(() => inspectName("tool.exe", 1000, DOCUMENT_KINDS, 250 * MB)).toThrow("not accepted");
    expect(inspectName("../../etc/model.rfa", 1000, DOCUMENT_KINDS, 250 * MB)).toMatchObject({ fileName: "model.rfa", kind: "rvt" });
  });
});

describe("zip bundle entry names", () => {
  it("groups by category and de-duplicates clashing names", () => {
    expect(
      bundleEntryNames([
        { category: "BIM", fileName: "hanger.rfa" },
        { category: "BIM", fileName: "hanger.rfa" },
        { category: "CAD", fileName: "hanger.rfa" },
        { category: "BIM", fileName: "README" },
        { category: "BIM", fileName: "README" },
      ]),
    ).toEqual(["BIM/hanger.rfa", "BIM/hanger (2).rfa", "CAD/hanger.rfa", "BIM/README", "BIM/README (2)"]);
  });
});
