"use client";

import { Button, Card, Page, StatusPill, humanize, relativeTime } from "@fixotec/ui";
import { Box, Download, Plus } from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { QueryError, fileSize } from "../../../../components/common";
import { FamilyThumb } from "../../../../components/family-thumb";
import { formatOf, latestOf, type FamilyDoc, type FamilyVersion } from "../../../../components/family-views";
import { IfcViewer } from "../../../../components/ifc-viewer";
import { UploadDocument } from "../../../../components/upload-document";
import { api, download, downloadDirect } from "../../../../lib/api";
import { useApi } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Product = { id: string; name: string; sku: string; slug?: string; category?: { id: string; name: string } | null; family?: { name: string } | null };
type Doc = FamilyDoc & {
  entityType?: string | null;
  entityId?: string | null;
  folder?: { id: string; name: string; parentId?: string | null } | null;
  createdBy?: { id: string; name: string } | null;
};

const ELEVATED = new Set(["super_admin", "managing_director", "ceo"]);

function isIfc(fileName?: string) {
  return (fileName || "").toLowerCase().endsWith(".ifc");
}

export default function FamilyDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const id = params.id;
  const doc = useApi<Doc>(id ? `/documents/${id}` : null);
  const related = useApi<{ items: FamilyDoc[] }>(doc.data?.folderId ? `/documents?kind=library&folderId=${doc.data.folderId}` : "/documents?kind=library");
  const productId = doc.data?.entityType === "product" ? doc.data.entityId : null;
  const product = useApi<Product>(productId ? `/products/${productId}` : null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<"image" | "ifc">("image");
  const file = doc.data;
  const latest = file ? latestOf(file) : undefined;
  const ifc = file?.versions.find((version) => isIfc(version.fileName));
  const downloadable = file?.versions.find((version) => !isIfc(version.fileName)) || latest;
  const canCreate = allowed(session, "documents.create");
  const canToggle = Boolean(
    file &&
      (file.createdById === session?.user.id ||
        latest?.createdById === session?.user.id ||
        session?.roleKeys.some((role) => ELEVATED.has(role))),
  );

  const crumbs = useMemo(() => {
    const items: Array<{ href: string; label: string }> = [
      { href: "/", label: "Home" },
    ];
    if (product.data?.category?.name) items.push({ href: "/? ", label: product.data.category.name });
    else if (file?.category) items.push({ href: "/library", label: humanize(file.category) });
    if (product.data?.name) items.push({ href: `/files/${id}`, label: product.data.name });
    else if (file?.folder?.name) items.push({ href: `/library`, label: file.folder.name });
    if (file?.title) items.push({ href: `/files/${id}`, label: file.title });
    return items;
  }, [file, product.data, id]);

  async function run(path: string, body?: unknown) {
    setError("");
    try {
      await api(path, { method: "POST", body: body ? JSON.stringify(body) : "{}" });
      await doc.refetch();
    } catch (failure) {
      setError((failure as Error).message);
    }
  }

  function downloadVersion(version: FamilyVersion) {
    const path = `/documents/${id}/download?version=${version.version}`;
    if (Number(version.sizeBytes || 0) > 20e6) downloadDirect(path);
    else void download(path, version.fileName);
  }

  const more = (related.data?.items || []).filter((row) => row.id !== id).slice(0, 8);

  return (
    <Page>
      <nav className="text-sm text-muted" aria-label="Breadcrumb">
        {crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`}>
            {index > 0 ? <span className="mx-1.5">›</span> : null}
            {index === crumbs.length - 1 ? (
              <span className="text-ink">{crumb.label}</span>
            ) : (
              <Link href={crumb.href.trim() === "/?" ? "/" : crumb.href} className="hover:text-accent">{crumb.label}</Link>
            )}
          </span>
        ))}
      </nav>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{file?.title || "Family"}</h1>
      <QueryError error={doc.error || error} />
      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_22rem]">
        <div className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-line bg-[#eef1f5]">
            <div className="flex gap-1 border-b border-line bg-white px-3 py-2">
              <Button size="sm" variant={preview === "image" ? undefined : "ghost"} onClick={() => setPreview("image")}>Preview</Button>
              {ifc ? <Button size="sm" variant={preview === "ifc" ? undefined : "ghost"} onClick={() => setPreview("ifc")}><Box /> 3D</Button> : null}
            </div>
            {preview === "ifc" && ifc ? (
              <div className="h-[28rem] bg-[#eef1f5] p-2">
                <IfcViewer documentId={id} version={String(ifc.version)} />
              </div>
            ) : (
              <FamilyThumb documentId={id} version={latest?.version} alt={file?.title || "Preview"} size="hero" className="max-h-[28rem] w-full object-contain p-6" />
            )}
          </div>
          <Card>
            <div className="flex items-center justify-between border-b border-line px-4 py-3">
              <h2 className="text-sm font-semibold">Version history</h2>
              {canCreate ? <Button size="sm" onClick={() => setUploading(true)}><Plus /> Upload new version</Button> : null}
            </div>
            <ul className="divide-y divide-line">
              {(file?.versions || []).map((version) => (
                <li key={version.version} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">v{version.version} · {version.fileName}</p>
                    <p className="text-xs text-muted">
                      {fileSize(version.sizeBytes || 0)}
                      {version.createdAt ? ` · ${relativeTime(version.createdAt)}` : ""}
                      {version.notes ? ` · ${version.notes}` : ""}
                    </p>
                  </div>
                  <StatusPill status={version.status} />
                  {isIfc(version.fileName) ? <Button size="sm" variant="outline" onClick={() => setPreview("ifc")}>3D</Button> : null}
                  <Button size="icon-sm" variant="ghost" aria-label={`Download v${version.version}`} onClick={() => downloadVersion(version)}><Download /></Button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
        <div className="space-y-4">
          <Card>
            <dl className="divide-y divide-line text-sm">
              <Info label="Uploaded by" value={file?.createdBy?.name || "—"} />
              <Info label="Format" value={downloadable ? formatOf(downloadable.fileName) : "—"} />
              <Info label="File size" value={downloadable ? fileSize(downloadable.sizeBytes || 0) : "—"} />
              <Info label="Revit version" value={latest?.sourceInfo?.revitYear ? `Revit ${latest.sourceInfo.revitYear}` : "—"} />
              <Info label="Current version" value={latest ? `v${latest.version}` : "—"} />
              <div className="flex items-center justify-between px-4 py-3">
                <dt className="text-muted">Status</dt>
                <dd className="flex items-center gap-2">
                  {latest ? <StatusPill status={latest.status} /> : "—"}
                  {canToggle && latest && (latest.status === "DRAFT" || latest.status === "PUBLIC") ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => void run(`/documents/${id}/versions/${latest.version}/status`, { status: latest.status === "PUBLIC" ? "DRAFT" : "PUBLIC" })}
                    >
                      Mark as {latest.status === "PUBLIC" ? "Draft" : "Public"}
                    </Button>
                  ) : null}
                </dd>
              </div>
              <Info label="Updated" value={file ? relativeTime(file.updatedAt) : "—"} />
              {product.data ? (
                <div className="px-4 py-3">
                  <dt className="text-muted">Fixotec product</dt>
                  <dd className="mt-1 font-medium">{product.data.sku} · {product.data.name}</dd>
                  {product.data.category?.name ? <p className="text-xs text-muted">{product.data.category.name}{product.data.family?.name ? ` · ${product.data.family.name}` : ""}</p> : null}
                </div>
              ) : null}
            </dl>
            {downloadable ? (
              <div className="p-4">
                <Button className="w-full" onClick={() => downloadVersion(downloadable)}>
                  <Download /> Download {formatOf(downloadable.fileName)}
                </Button>
              </div>
            ) : null}
          </Card>
          {more.length ? (
            <Card>
              <div className="border-b border-line px-4 py-3">
                <h2 className="text-sm font-semibold">More in this folder</h2>
              </div>
              <ul className="divide-y divide-line">
                {more.map((row) => (
                  <li key={row.id}>
                    <button type="button" className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-canvas" onClick={() => router.push(`/files/${row.id}`)}>
                      <FamilyThumb documentId={row.id} alt={row.title} size="row" className="h-12 w-16 shrink-0 rounded object-contain bg-[#eef1f5]" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{row.title}</span>
                        <span className="text-xs text-muted">{latestOf(row) ? `v${latestOf(row)!.version}` : ""}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
      <UploadDocument open={uploading} onOpenChange={setUploading} documentId={id} folderId={file?.folderId || undefined} entityType={file?.entityType || undefined} entityId={file?.entityId || undefined} />
    </Page>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3">
      <dt className="text-muted">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}
