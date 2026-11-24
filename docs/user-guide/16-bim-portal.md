# 16. Staff BIM portal

The Fixotec BIM portal is a **staff-only** Next.js app (`apps/bim`, later `https://bim.rkyves.com`) where employees manage Revit, IFC and CAD files. It uses the same accounts, MFA and `documents.*` permissions as the ERP. Customer accounts are sent back to the partner portal.

It is a library on top of the existing `Document` / `DocumentVersion` records, not a second file database.

## Who can sign in

- Only users with `kind = STAFF`.
- The library requires `documents.view`.
- Upload, new versions, folders and check-out require `documents.create`.
- Approving a revision (and force check-in) requires `documents.approve` (or an elevated role). You still cannot approve a revision you uploaded.
- Share links require `documents.share`.

Typical roles: BIM Engineer, Design Engineer, Engineering Head, and Super Admin / MD / CEO.

## Library

1. Sign in, then pick a **project** (or leave it empty for unassigned library files).
2. Use **folders** to organise models. "Unfiled" shows files with no folder.
3. **Search** filters by file title.
4. **Upload file** accepts the same types as the ERP document library, including `.rvt`, `.rfa`, `.ifc`, `.dwg` and `.nwd`.
5. Open a row to see revision history, check-out, share links and (when an IFC exists) the 3D preview.

## Versions, approval and sharing

Rules are the same as in the ERP document library:

| Version status | Meaning |
|---|---|
| DRAFT | Just uploaded |
| INTERNAL_REVIEW | Fixotec is checking it |
| CLIENT_REVIEW | Visible in the partner portal |
| APPROVED | Frozen; visible in the portal (and on the website if PUBLIC) |

- An approved revision cannot be changed. Upload a new version.
- You cannot approve a revision you uploaded.
- Share links last 1–30 days (default 7) and can be revoked. Only approved or client-review revisions can be shared.

## Check-out

Check-out is an exclusive edit lock on the document (not a Revit worksharing or Autodesk lock).

- Only one person can have a file checked out.
- While it is checked out, only that person can upload a new version.
- They check it back in when they are finished.
- Engineering Head and elevated roles can **force check-in**. All of these actions are written to the audit log.

## 3D preview

Native Revit (`.rvt`, `.rfa`) **cannot** be opened in the browser. To preview a model:

1. Export an IFC from Revit.
2. Upload the `.ifc` as a **new version** of the same document, or as a sibling file in the same folder.
3. Open **3D preview** on that IFC revision.

The viewer uses `web-ifc` and `three` in the browser. Autodesk APS / Forge is not part of this portal.

## Large files and storage

Uploads over 24 MB, and every CAD/BIM/drawing file, use a presigned upload to S3-compatible storage (Cloudflare R2 in production). Files over 64 MB use a **multipart / resumable** presigned upload so they never pass through Vercel or the API VM. The size cap is `CAD_MAX_MB` (default 250, up to 2048). Set it to 2048 if you need models up to about 2 GB.

Until R2 is configured (`STORAGE_DRIVER=s3`), the API falls back to the streamed `/documents/large` route on local disk, which is not suitable for very large Revit files.

## Related ERP and portal screens

The ERP **CAD / BIM** screen (`/cad`) and the partner portal library stay available. Portal listings only show `APPROVED` and `CLIENT_REVIEW` revisions; draft files are not listed.
