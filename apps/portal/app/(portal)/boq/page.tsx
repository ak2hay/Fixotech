"use client";

import { Card, DataTable, StatusPill } from "@fixotec/ui";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateText, ListPage, QueryError, SearchBox, matches } from "../../../components/common";
import { useApi } from "../../../lib/query";

type Boq = { id: string; number: string; title: string; status: string; source: string; createdAt: string; project?: { name: string; code: string } | null; items: Array<{ variantId?: string | null }> };

export default function BoqListPage() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const { data, error, isLoading } = useApi<Boq[]>("/boq");
  const rows = (data || []).filter((row) => matches(row, q));

  return (
    <ListPage title="Bills of quantities" description="BOQs on your projects, matched to Fixotec articles.">
      <div className="flex justify-end">
        <SearchBox value={q} onChange={setQ} placeholder="Search BOQs..." />
      </div>
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => router.push(`/boq/${row.id}`)}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No BOQs on your projects yet.</p>}
          columns={[
            { key: "number", header: "BOQ", render: (row) => <div><p className="font-medium">{row.number}</p><p className="text-xs text-muted">{row.title}</p></div> },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || "—"}</span> },
            { key: "items", header: "Lines", align: "right", render: (row) => row.items.length },
            { key: "matched", header: "Matched", align: "right", render: (row) => `${row.items.filter((item) => item.variantId).length}/${row.items.length}` },
            { key: "createdAt", header: "Created", render: (row) => <DateText value={row.createdAt} /> },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
          ]}
        />
      </Card>
    </ListPage>
  );
}
