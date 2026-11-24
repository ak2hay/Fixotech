# 16. Staff BIM portal

The Fixotec BIM portal is a **staff-only** Next.js app (`apps/bim`, production `https://bim.rkyves.com`) where employees manage the **Revit Library**. It uses the same accounts, MFA and `documents.*` permissions as the ERP. Customer accounts are sent back to the partner portal.

It is a library on top of the existing `Document` / `DocumentVersion` records, not a second file database. Product categories and product lines shown in the library come from the live Fixotec catalog (the same structure used on the public website and in the ERP), so a family can be linked to an existing product.

## Who can sign in

- Only users with `kind = STAFF`.
- The library requires `documents.view`. Every staff member can see every family, including drafts (drafts are labelled and hidden from the dashboard default until **Show drafts** is on).
- Upload, new versions, folders and Public/Draft status changes require `documents.create` (the uploader or an admin can also change status).
- Force check-in still requires `documents.approve` or an elevated role. Approval and client-review workflows stay in the ERP; the BIM portal itself only uses **Public** and **Draft**.

Typical roles: BIM Engineer, Design Engineer, Engineering Head, and Super Admin / MD / CEO.

## Dashboard and Revit Library

1. Sign in to the **Dashboard** (`/`). It lists every Revit family across folders as large preview tiles (2–4 columns). Use search (name, folder or notes) and filters for folder, Public/Draft, catalog category, uploader and sort. **Show drafts** includes Draft families; the default is Public only.
2. Open **Revit Library** (`/library`) to browse folders, add a folder, or upload into the current folder. The existing **Revit Families** folder is kept; company folders such as Reliance, Micron, STT and Veritus are created as top-level library folders. Folder names must be unique under the same parent (case-insensitive, trimmed).
3. Both screens have a **Tiles / List** toggle. Tiles is the default. The choice is remembered in the browser (and can be set with `?view=tiles` or `?view=list`).
4. **Upload file** accepts the same types as the ERP document library, including `.rvt`, `.rfa`, `.ifc`, `.dwg` and `.nwd`. You can optionally link the family to an existing Fixotec product.

## Family detail

The family page shows a breadcrumb (Home > category > product line or folder > family name), a large preview on the left (the embedded Revit thumbnail, or a 3D IFC viewer when an IFC is attached), and a details card on the right: uploader, format, file size, Revit version when it can be read from the file, current version, Public/Draft status and updated date. **Download RFA** (or the matching format) downloads the current file. Version history lists every revision with download and **Upload new version**. Related families in the same folder appear in a **More in this folder** strip.

## Versions and status

| Version status | Meaning in the BIM portal |
|---|---|
| DRAFT | Visible to all staff, labelled Draft, hidden from the dashboard unless **Show drafts** is on |
| PUBLIC | Visible to all staff and listed on the dashboard by default |

- Upload a new version to create v2, v3, and so on. Any version can be downloaded; the latest is shown by default.
- Public and Draft do not use the ERP approval or client-review flow. Portal listings still only show `APPROVED` and `CLIENT_REVIEW` revisions, so a BIM **PUBLIC** family is not automatically published to the partner portal.
- An approved revision in the ERP still cannot be changed there; upload a new version instead.

## Previews

On upload (and on first thumbnail request if needed), the API extracts the embedded Revit preview (`RevitPreview4.0`) from `.rfa` / `.rvt` files and stores a PNG next to the file. If a file has no thumbnail, a placeholder is shown. Native Revit files still cannot be opened as a 3D model in the browser; attach an `.ifc` to use the IFC viewer (`web-ifc` and `three`). Autodesk APS / Forge is not part of this portal.

## Check-out

Check-out is an exclusive edit lock on the document (not a Revit worksharing or Autodesk lock). It is managed from the ERP document library when needed.

- Only one person can have a file checked out.
- While it is checked out, only that person can upload a new version.
- They check it back in when they are finished.
- Engineering Head and elevated roles can **force check-in**. All of these actions are written to the audit log.

## Large files and storage

Uploads over 24 MB, and every CAD/BIM/drawing file, use a presigned upload to S3-compatible storage (Cloudflare R2 in production). Files over 64 MB use a **multipart / resumable** presigned upload so they never pass through Vercel or the API VM. The size cap is `CAD_MAX_MB` (default 250, up to 2048). Set it to 2048 if you need models up to about 2 GB.

Until R2 is configured (`STORAGE_DRIVER=s3`), the API falls back to the streamed `/documents/large` route on local disk, which is not suitable for very large Revit files.

## Related ERP and portal screens

The ERP **CAD / BIM** screen (`/cad`) and the partner portal library stay available. Portal listings only show `APPROVED` and `CLIENT_REVIEW` revisions; draft and BIM Public files are not listed there automatically.
