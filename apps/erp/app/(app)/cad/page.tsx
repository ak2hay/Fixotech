"use client";

import { Button, Card, DataTable, FilterButton, Page, PageHeader, Skeleton, StatusPill, Tabs, TextInput, cn, humanize, relativeTime } from "@fixotec/ui";
import { Box, Download, LayoutGrid, List, Plus, Search } from "lucide-react";
import { useState } from "react";
import { DocumentTile, QueryError, fileSize, type DocumentSummary } from "../../../components/common";
import { UploadDocument } from "../../../components/upload-document";
import { download } from "../../../lib/api";
import { useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type CadItem = DocumentSummary & { entityType?: string | null; entityId?: string | null; fileName?: string; updatedAt: string };

const CATEGORIES = [
  { key: "", label: "All files" },
  { key: "CAD", label: "CAD (DWG/DXF)" },
  { key: "BIM", label: "BIM models" },
  { key: "DRAWING", label: "Drawings" },
];

export default function CadPage() {
  const { session } = useSession();
  const [category, setCategory] = useState("");
  const [projectId, setProjectId] = useState("");
  const [q, setQ] = useState("");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [uploading, setUploading] = useState(false);
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (projectId) query.set("projectId", projectId);
  if (q) query.set("q", q);
  const { data, error, isLoading } = useApi<{ items: CadItem[]; counts: Record<string, number> }>(`/cad?${query}`, { keepPrevious: true });
  const projects = useApi<Paged<{ id: string; code: string; name: string }>>("/projects?pageSize=100");
  const counts = data?.counts || {};
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);
  const items = data?.items || [];

  return (
    <Page>
      <PageHeader
        title="CAD / BIM library"
        description="Drawings, CAD blocks and BIM families for products and projects."
        actions={allowed(session, "documents.create") ? <Button onClick={() => setUploading(true)}><Plus /> Upload file</Button> : null}
      />
      <Card>
        <div className="px-4 pt-2">
          <Tabs items={CATEGORIES.map((item) => ({ ...item, count: item.key ? counts[item.key] || 0 : total }))} value={category} onChange={setCategory} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search file titles..." value={q} onChange={(event) => setQ(event.target.value)} className="w-64" />
          <FilterButton label="Project" value={projectId} onChange={setProjectId} options={(projects.data?.items || []).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} />
          <div className="ml-auto inline-flex rounded-md border border-line p-0.5">
            <button type="button" aria-label="Grid view" className={cn("rounded p-1.5", view === "grid" ? "bg-sidebar text-white" : "text-muted hover:text-fg")} onClick={() => setView("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button type="button" aria-label="List view" className={cn("rounded p-1.5", view === "list" ? "bg-sidebar text-white" : "text-muted hover:text-fg")} onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>
        <QueryError error={error} />
        {view === "grid" ? (
          <div className="p-4">
            {isLoading ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">{Array.from({ length: 12 }).map((_, index) => <Skeleton key={index} className="h-44" />)}</div>
            ) : items.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-6">{items.map((doc) => <DocumentTile key={doc.id} doc={doc} />)}</div>
            ) : (
              <div className="flex flex-col items-center py-14 text-center">
                <Box className="mb-3 h-8 w-8 text-subtle" />
                <p className="font-medium">No files here yet</p>
                <p className="text-sm text-muted">Upload DWG, RFA, IFC or PDF drawings and link them to a product or project.</p>
              </div>
            )}
          </div>
        ) : (
          <DataTable
            rows={items}
            loading={isLoading}
            rowKey={(row) => row.id}
            empty="No files here yet."
            columns={[
              { key: "title", header: "File", sortValue: (row) => row.title, render: (row) => <div><p className="font-medium">{row.title}</p><p className="text-2xs text-muted">{row.fileName}</p></div> },
              { key: "category", header: "Type", render: (row) => humanize(row.category) },
              { key: "entity", header: "Linked to", render: (row) => <span className="text-muted">{row.entityName ? `${humanize(row.entityType || "")}: ${row.entityName}` : "—"}</span> },
              { key: "version", header: "Rev", align: "right", render: (row) => row.version },
              { key: "status", header: "Status", render: (row) => (row.status ? <StatusPill status={row.status} /> : "—") },
              { key: "size", header: "Size", align: "right", render: (row) => (row.sizeBytes ? fileSize(row.sizeBytes) : "—") },
              { key: "updatedAt", header: "Updated", sortValue: (row) => row.updatedAt, render: (row) => <span className="text-muted">{relativeTime(row.updatedAt)}</span> },
              { key: "download", header: "", align: "right", render: (row) => <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={() => download(`/documents/${row.id}/download`, row.fileName || row.title)}><Download /></Button> },
            ]}
          />
        )}
      </Card>
      <UploadDocument open={uploading} onOpenChange={setUploading} entityType={projectId ? "project" : undefined} entityId={projectId || undefined} defaultCategory={category || "CAD"} />
    </Page>
  );
}
