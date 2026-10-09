"use client";

import { ENGINEERING_STATUSES } from "@fixotec/shared";
import { Avatar, Card, DataTable, Page, PageHeader, StatusPill, Tabs, TextInput, humanize, relativeTime } from "@fixotec/ui";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DueText, QueryError } from "../../../components/common";
import { useApi } from "../../../lib/query";

type EngineeringRow = {
  id: string;
  number: string;
  status: string;
  application?: string | null;
  requiredSystem?: string | null;
  revision: string;
  dueDate?: string | null;
  createdAt: string;
  project?: { name: string; code: string } | null;
  customer?: { name: string } | null;
  engineer?: { name: string } | null;
};

export default function EngineeringPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const { data, error, isLoading } = useApi<{ items: EngineeringRow[]; counts: Record<string, number> }>("/engineering");
  const counts = data?.counts || {};
  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return (data?.items || []).filter((row) => (!status || row.status === status) && (!term || [row.number, row.application, row.requiredSystem, row.project?.name, row.customer?.name].some((value) => value?.toLowerCase().includes(term))));
  }, [data, status, q]);

  return (
    <Page>
      <PageHeader title="Engineering" description="Design reviews, load calculations and drawings requested from RFQs and projects." />
      <Card>
        <div className="px-4 pt-2">
          <Tabs value={status} onChange={setStatus} items={[{ key: "", label: "All", count: data?.items.length }, ...ENGINEERING_STATUSES.map((key) => ({ key, label: humanize(key), count: counts[key] || 0 }))]} />
        </div>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search requests..." value={q} onChange={(event) => setQ(event.target.value)} className="w-72" />
        </div>
        <QueryError error={error} />
        <DataTable
          rows={rows}
          loading={isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/engineering/${row.id}`)}
          empty="No engineering requests."
          columns={[
            { key: "number", header: "Request", sortValue: (row) => row.number, render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "application", header: "Application", render: (row) => <span className="line-clamp-1">{row.application || "—"}</span> },
            { key: "system", header: "System", render: (row) => <span className="text-muted">{row.requiredSystem || "—"}</span> },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || row.customer?.name || "—"}</span> },
            { key: "revision", header: "Rev", render: (row) => row.revision },
            { key: "engineer", header: "Engineer", render: (row) => (row.engineer ? <Avatar name={row.engineer.name} size="sm" /> : <span className="text-subtle">Unassigned</span>) },
            { key: "status", header: "Status", sortValue: (row) => row.status, render: (row) => <StatusPill status={row.status} /> },
            { key: "due", header: "Due", sortValue: (row) => row.dueDate || "", render: (row) => <DueText value={row.dueDate} /> },
            { key: "createdAt", header: "Raised", sortValue: (row) => row.createdAt, render: (row) => <span className="text-muted">{relativeTime(row.createdAt)}</span> },
          ]}
        />
      </Card>
    </Page>
  );
}
