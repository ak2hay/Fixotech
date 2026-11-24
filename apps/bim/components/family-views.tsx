"use client";

import { StatusPill, humanize, relativeTime } from "@fixotec/ui";
import { LayoutGrid, List as ListIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { fileSize } from "./common";
import { FamilyThumb } from "./family-thumb";
import type { LibraryView } from "../lib/view-mode";

export type FamilyVersion = {
  version: number;
  status: string;
  fileName: string;
  sizeBytes?: number | string;
  mimeType?: string;
  notes?: string | null;
  createdAt?: string;
  createdById?: string | null;
  thumbnailKey?: string | null;
  sourceInfo?: { revitYear?: string | null; revitBuild?: string | null } | null;
};

export type FamilyDoc = {
  id: string;
  title: string;
  category: string;
  folderId?: string | null;
  folder?: { id: string; name: string; parentId?: string | null } | null;
  updatedAt: string;
  createdBy?: { id: string; name: string } | null;
  createdById?: string | null;
  versions: FamilyVersion[];
  product?: { id: string; name: string; sku: string; category?: { name: string } | null; family?: { name: string } | null } | null;
};

export function formatOf(fileName?: string) {
  const ext = (fileName || "").split(".").pop()?.toUpperCase() || "";
  return ext || "FILE";
}

export function latestOf(doc: FamilyDoc) {
  return [...(doc.versions || [])].sort((a, b) => b.version - a.version)[0];
}

export function ViewToggle({ view, onChange }: { view: LibraryView; onChange: (view: LibraryView) => void }) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5" role="group" aria-label="Library view">
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === "tiles" ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
        aria-pressed={view === "tiles"}
        onClick={() => onChange("tiles")}
      >
        <LayoutGrid className="h-4 w-4" /> Tiles
      </button>
      <button
        type="button"
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium ${view === "list" ? "bg-accent text-white" : "text-muted hover:text-ink"}`}
        aria-pressed={view === "list"}
        onClick={() => onChange("list")}
      >
        <ListIcon className="h-4 w-4" /> List
      </button>
    </div>
  );
}

export function FamilyTiles({ items }: { items: FamilyDoc[] }) {
  const router = useRouter();
  if (!items.length) return null;
  return (
    <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((doc) => {
        const latest = latestOf(doc);
        return (
          <button
            key={doc.id}
            type="button"
            onClick={() => router.push(`/files/${doc.id}`)}
            className="group overflow-hidden rounded-2xl border border-line bg-white text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
          >
            <FamilyThumb
              documentId={doc.id}
              version={latest?.version}
              alt={doc.title}
              size="tile"
              className="aspect-[4/3] w-full object-contain bg-[#eef1f5]"
            />
            <div className="space-y-1.5 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="line-clamp-2 text-base font-semibold leading-snug">{doc.title}</h3>
                {latest ? <StatusPill status={latest.status === "PUBLIC" ? "PUBLIC" : latest.status} /> : null}
              </div>
              <p className="text-sm text-muted">
                {[doc.folder?.name, doc.product?.name || (doc.product?.sku ? doc.product.sku : null), latest ? `v${latest.version}` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <p className="text-xs text-muted">
                {doc.createdBy?.name ? `${doc.createdBy.name} · ` : ""}
                {relativeTime(doc.updatedAt)}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

export function FamilyList({ items }: { items: FamilyDoc[] }) {
  const router = useRouter();
  return (
    <div className="overflow-x-auto rounded-2xl border border-line bg-white">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
          <tr>
            <th className="px-3 py-3 font-medium">Family</th>
            <th className="px-3 py-3 font-medium">Folder / category</th>
            <th className="px-3 py-3 font-medium">Version</th>
            <th className="px-3 py-3 font-medium">Status</th>
            <th className="px-3 py-3 font-medium">Size</th>
            <th className="px-3 py-3 font-medium">Revit</th>
            <th className="px-3 py-3 font-medium">Uploader</th>
            <th className="px-3 py-3 font-medium">Updated</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {items.map((doc) => {
            const latest = latestOf(doc);
            return (
              <tr key={doc.id} className="cursor-pointer hover:bg-canvas/80" onClick={() => router.push(`/files/${doc.id}`)}>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-3">
                    <FamilyThumb documentId={doc.id} version={latest?.version} alt={doc.title} size="row" className="h-12 w-16 shrink-0 rounded-md object-contain bg-[#eef1f5]" />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{doc.title}</p>
                      <p className="text-xs text-muted">{latest ? formatOf(latest.fileName) : doc.category}</p>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-muted">
                  {[doc.folder?.name, doc.product?.category?.name || humanize(doc.category)].filter(Boolean).join(" · ")}
                </td>
                <td className="px-3 py-2">{latest ? `v${latest.version}` : "—"}</td>
                <td className="px-3 py-2">{latest ? <StatusPill status={latest.status} /> : "—"}</td>
                <td className="px-3 py-2 text-muted">{latest ? fileSize(latest.sizeBytes || 0) : "—"}</td>
                <td className="px-3 py-2 text-muted">{latest?.sourceInfo?.revitYear || "—"}</td>
                <td className="px-3 py-2 text-muted">{doc.createdBy?.name || "—"}</td>
                <td className="px-3 py-2 text-muted">{relativeTime(doc.updatedAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function EmptyLibrary({ title, body, action }: { title: string; body: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line bg-white px-6 py-16 text-center">
      <p className="text-lg font-semibold">{title}</p>
      <p className="mx-auto mt-2 max-w-md text-sm text-muted">{body}</p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
