"use client";

import { Button, Page, PageHeader, Select, TextInput } from "@fixotec/ui";
import { Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { QueryError } from "../../components/common";
import { EmptyLibrary, FamilyList, FamilyTiles, ViewToggle, type FamilyDoc } from "../../components/family-views";
import { useApi } from "../../lib/query";
import { useLibraryView } from "../../lib/view-mode";

type FolderRow = { id: string; name: string; parentId: string | null };
type ProductRow = { id: string; name: string; sku: string; category?: { id: string; name: string } | null; family?: { name: string } | null };

export default function DashboardPage() {
  const { view, setView } = useLibraryView();
  const [q, setQ] = useState("");
  const [folderId, setFolderId] = useState("");
  const [status, setStatus] = useState<"PUBLIC" | "DRAFT" | "">("");
  const [showDrafts, setShowDrafts] = useState(false);
  const [categoryId, setCategoryId] = useState("");
  const [uploaderId, setUploaderId] = useState("");
  const [sort, setSort] = useState("updatedAt");
  const folders = useApi<{ items: FolderRow[] }>("/documents/folders");
  const products = useApi<{ items: ProductRow[] }>("/products?pageSize=100");
  const params = new URLSearchParams({ kind: "library" });
  if (q) params.set("q", q);
  if (folderId) params.set("folderId", folderId);
  const effectiveStatus = status || (showDrafts ? "" : "PUBLIC");
  if (effectiveStatus) params.set("status", effectiveStatus);
  if (uploaderId) params.set("createdById", uploaderId);
  if (sort) params.set("sort", sort);
  const docs = useApi<{ items: FamilyDoc[] }>(`/documents?${params}`, { keepPrevious: true });

  const items = useMemo(() => {
    const rows = docs.data?.items || [];
    if (!categoryId) return rows;
    return rows.filter((row) => row.product?.category && (row.product as { category?: { id?: string } }).category?.id === categoryId);
  }, [docs.data, categoryId]);

  const uploaders = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of docs.data?.items || []) {
      if (row.createdBy?.id) map.set(row.createdBy.id, row.createdBy.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [docs.data]);

  const categories = useMemo(() => {
    const map = new Map<string, string>();
    for (const product of products.data?.items || []) {
      if (product.category?.id) map.set(product.category.id, product.category.name);
    }
    return [...map.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [products.data]);

  return (
    <Page>
      <PageHeader
        title="Revit Library"
        description="Every Revit family across folders, with previews, versions, and Fixotec product links."
        actions={<ViewToggle view={view} onChange={setView} />}
      />
      <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
        <label className="flex items-center gap-3 rounded-xl border border-line bg-canvas px-3 py-2">
          <Search className="h-5 w-5 shrink-0 text-muted" />
          <TextInput
            value={q}
            onChange={(event) => setQ(event.target.value)}
            placeholder="Search by name, folder, or notes"
            className="border-0 bg-transparent shadow-none focus-visible:ring-0"
          />
        </label>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SlidersHorizontal className="mb-2 hidden h-4 w-4 text-muted sm:block" />
          <label className="grid gap-1 text-xs font-medium text-muted">
            Folder
            <Select value={folderId} onChange={(event) => setFolderId(event.target.value)} className="min-w-40">
              <option value="">All folders</option>
              {(folders.data?.items || []).map((folder) => (
                <option key={folder.id} value={folder.id}>{folder.name}</option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted">
            Status
            <Select
              value={status}
              onChange={(event) => {
                const next = event.target.value as "" | "PUBLIC" | "DRAFT";
                setStatus(next);
                if (next === "DRAFT") setShowDrafts(true);
              }}
              className="min-w-36"
            >
              <option value="">{showDrafts ? "Public and Draft" : "Public (default)"}</option>
              <option value="PUBLIC">Public</option>
              <option value="DRAFT">Draft</option>
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted">
            Category
            <Select value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className="min-w-40">
              <option value="">All categories</option>
              {categories.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted">
            Uploader
            <Select value={uploaderId} onChange={(event) => setUploaderId(event.target.value)} className="min-w-40">
              <option value="">Anyone</option>
              {uploaders.map(([id, name]) => (
                <option key={id} value={id}>{name}</option>
              ))}
            </Select>
          </label>
          <label className="grid gap-1 text-xs font-medium text-muted">
            Sort
            <Select value={sort} onChange={(event) => setSort(event.target.value)} className="min-w-36">
              <option value="updatedAt">Last updated</option>
              <option value="title">Name</option>
              <option value="createdAt">Date uploaded</option>
            </Select>
          </label>
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showDrafts}
              onChange={(event) => {
                setShowDrafts(event.target.checked);
                if (!event.target.checked && status === "DRAFT") setStatus("");
              }}
            />
            Show drafts
          </label>
        </div>
      </div>
      <QueryError error={docs.error} />
      {!docs.data && !docs.error ? <p className="text-sm text-muted">Loading families…</p> : null}
      {docs.data && items.length === 0 ? (
        <EmptyLibrary
          title={showDrafts || status === "DRAFT" ? "No families match these filters" : "No public families yet"}
          body={showDrafts ? "Try a different search or folder." : "Turn on Show drafts to see work in progress, or open the Revit Library to upload a family."}
          action={!showDrafts ? <Button variant="outline" onClick={() => setShowDrafts(true)}>Show drafts</Button> : undefined}
        />
      ) : null}
      {view === "tiles" ? <FamilyTiles items={items} /> : <FamilyList items={items} />}
    </Page>
  );
}
