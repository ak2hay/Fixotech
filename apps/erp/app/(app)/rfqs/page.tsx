"use client";

import { RFQ_PRIORITIES, RFQ_STATUSES } from "@fixotec/shared";
import { Avatar, Badge, Button, Card, DataTable, FilterButton, Page, PageHeader, StatusPill, Tabs, TextInput, humanize, relativeTime } from "@fixotec/ui";
import { Plus, Search, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { DueText, QueryError, priorityTone } from "../../../components/common";
import { CreateRfq } from "../../../components/create-rfq";
import { useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type RfqRow = {
  id: string;
  number: string;
  status: string;
  priority: string;
  application?: string | null;
  dueDate?: string | null;
  createdAt: string;
  customer?: { name: string } | null;
  project?: { name: string; code: string } | null;
  assignee?: { name: string } | null;
  items: unknown[];
};

const QUEUES = [
  { key: "", label: "All RFQs" },
  { key: "mine", label: "Assigned to me" },
  { key: "today", label: "Due today" },
  { key: "overdue", label: "Overdue" },
];

export default function RfqsPage() {
  return (
    <Suspense>
      <Rfqs />
    </Suspense>
  );
}

function Rfqs() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useSession();
  const projectId = params.get("project") || "";
  const [queue, setQueue] = useState(params.get("due") || (params.get("mine") ? "mine" : ""));
  const [status, setStatus] = useState(params.get("status") || "");
  const [priority, setPriority] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);

  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (status) query.set("status", status);
  if (priority) query.set("priority", priority);
  if (q) query.set("q", q);
  if (projectId) query.set("projectId", projectId);
  if (queue === "mine") query.set("mine", "1");
  if (queue === "today" || queue === "overdue") query.set("due", queue);
  const { data, error, isLoading } = useApi<Paged<RfqRow>>(`/rfqs?${query}`, { keepPrevious: true });
  const project = useApi<{ name: string; code: string }>(projectId ? `/projects/${projectId}` : null);

  return (
    <Page>
      <PageHeader
        title="RFQs"
        description="Requests for quotation from customers, consultants and the sales team."
        actions={
          session && allowed(session, "rfqs.create") ? (
            <Button onClick={() => setCreating(true)}>
              <Plus /> New RFQ
            </Button>
          ) : null
        }
      />
      <Card>
        <div className="px-4 pt-2">
          <Tabs items={QUEUES} value={queue} onChange={(key) => { setQueue(key); setPage(1); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search number, application, customer..." value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} className="w-72" />
          <FilterButton label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={RFQ_STATUSES.map((value) => ({ value, label: humanize(value) }))} />
          <FilterButton label="Priority" value={priority} onChange={(value) => { setPriority(value); setPage(1); }} options={RFQ_PRIORITIES.map((value) => ({ value, label: humanize(value) }))} />
          {projectId ? (
            <Badge tone="info" className="gap-1">
              Project: {project.data?.code || "..."}
              <button type="button" aria-label="Clear project filter" onClick={() => router.push("/rfqs")}><X className="h-3 w-3" /></button>
            </Badge>
          ) : null}
        </div>
        <QueryError error={error} />
        <DataTable
          rows={data?.items || []}
          loading={isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/rfqs/${row.id}`)}
          pagination={{ page, pageSize: data?.pageSize || 25, total: data?.total || 0, onPage: setPage }}
          empty="No RFQs match these filters."
          columns={[
            { key: "number", header: "RFQ", sortValue: (row) => row.number, render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "customer", header: "Customer", sortValue: (row) => row.customer?.name || "", render: (row) => row.customer?.name || "—" },
            { key: "project", header: "Project", render: (row) => (row.project ? <span className="text-muted">{row.project.name}</span> : "—") },
            { key: "application", header: "Application", render: (row) => <span className="line-clamp-1 text-muted">{row.application || "—"}</span> },
            { key: "lines", header: "Lines", align: "right", render: (row) => row.items.length },
            { key: "priority", header: "Priority", sortValue: (row) => RFQ_PRIORITIES.indexOf(row.priority as never), render: (row) => <Badge tone={priorityTone(row.priority)}>{humanize(row.priority)}</Badge> },
            { key: "status", header: "Status", sortValue: (row) => row.status, render: (row) => <StatusPill status={row.status} /> },
            { key: "due", header: "Due", sortValue: (row) => row.dueDate || "", render: (row) => <DueText value={row.dueDate} /> },
            { key: "assignee", header: "Owner", render: (row) => (row.assignee ? <Avatar name={row.assignee.name} size="sm" /> : <span className="text-subtle">Unassigned</span>) },
            { key: "createdAt", header: "Received", sortValue: (row) => row.createdAt, render: (row) => <span className="whitespace-nowrap text-muted">{relativeTime(row.createdAt)}</span> },
          ]}
        />
      </Card>
      <CreateRfq open={creating} onOpenChange={setCreating} projectId={projectId} onCreated={(id) => router.push(`/rfqs/${id}`)} />
    </Page>
  );
}
