"use client";

import { Button, Card, DataTable, Tabs, humanize } from "@fixotec/ui";
import { Download } from "lucide-react";
import { useState } from "react";
import { DateText, ListPage, QueryError, SearchBox, fileSize } from "../../../components/common";
import { download } from "../../../lib/api";
import { useApi } from "../../../lib/query";
import { useSession } from "../../../lib/session";

type Doc = { id: string; title: string; category: string; updatedAt: string; versions: Array<{ version: number; sizeBytes?: number; status?: string; fileName?: string }> };

export default function DocumentsPage() {
  const { role } = useSession();
  const marketing = role === "distributor";
  const [category, setCategory] = useState(marketing ? "MARKETING" : "");
  const [q, setQ] = useState("");
  const { data, error, isLoading } = useApi<{ items: Doc[] }>(`/documents?${category ? `category=${category}&` : ""}${q ? `q=${encodeURIComponent(q)}` : ""}`, { keepPrevious: true });
  const all = useApi<{ items: Doc[] }>("/documents");
  const categories = Array.from(new Set((all.data?.items || []).map((doc) => doc.category))).sort();

  return (
    <ListPage title={marketing ? "Marketing material" : "Documents"} description={marketing ? "Brochures, catalogues and campaign assets to share with your customers." : "Drawings, certificates and other files Fixotec has shared with you."}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="pill" items={[{ key: "", label: "All" }, ...categories.map((item) => ({ key: item, label: humanize(item) }))]} value={category} onChange={setCategory} />
        <SearchBox value={q} onChange={setQ} placeholder="Search documents..." />
      </div>
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={data?.items || []}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No documents here yet.</p>}
          columns={[
            { key: "title", header: "Document", render: (row) => <span className="font-medium">{row.title}</span> },
            { key: "category", header: "Type", render: (row) => <span className="text-muted">{humanize(row.category)}</span> },
            { key: "version", header: "Rev", align: "right", render: (row) => row.versions[0]?.version ?? "—" },
            { key: "size", header: "Size", align: "right", render: (row) => (row.versions[0]?.sizeBytes ? fileSize(row.versions[0].sizeBytes) : "—") },
            { key: "updatedAt", header: "Updated", render: (row) => <DateText value={row.updatedAt} /> },
            { key: "download", header: "", align: "right", render: (row) => <Button variant="ghost" size="icon-sm" aria-label="Download" onClick={() => download(`/documents/${row.id}/download`, row.versions[0]?.fileName || row.title)}><Download /></Button> },
          ]}
        />
      </Card>
    </ListPage>
  );
}
