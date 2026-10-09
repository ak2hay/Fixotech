"use client";

import { DataTable, PaginationBar } from "@fixotec/ui";
import { CheckCircle2, ClipboardList, FileSearch, FileText } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateText, DotTabs, KpiCard, KpiGrid, ListPage, PrimaryButton, QueryError, SearchBox, StageBadge, TableCard, ToolbarCard, shareOf, useCount } from "../../../components/common";
import { useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Rfq = { id: string; number: string; status: string; application?: string | null; createdAt: string; dueDate?: string | null; project?: { name: string } | null; items?: unknown[]; _count?: { items: number } };

const TABS = [
  { key: "", label: "All RFQs" },
  { key: "RECEIVED", label: "Received", dot: "bg-blue-500" },
  { key: "UNDER_REVIEW", label: "In review", dot: "bg-amber-500" },
  { key: "QUOTED", label: "Quoted", dot: "bg-violet-500" },
  { key: "WON", label: "Ordered", dot: "bg-emerald-500" },
];

export default function PortalRfqsPage() {
  const router = useRouter();
  const { session } = useSession();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useApi<Paged<Rfq>>(`/rfqs?page=${page}&pageSize=20${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { keepPrevious: true });
  const total = useCount("/rfqs");
  const review = useCount("/rfqs?status=UNDER_REVIEW");
  const quoted = useCount("/rfqs?status=QUOTED");
  const won = useCount("/rfqs?status=WON");

  return (
    <ListPage
      title="Requests for Quotation"
      description="Your enquiries to Fixotec and where each one stands."
      actions={allowed(session, "rfqs.create") ? <PrimaryButton href="/rfqs/new">New RFQ</PrimaryButton> : null}
    >
      <KpiGrid>
        <KpiCard label="Total RFQs" value={total.count} icon={<ClipboardList />} tone="blue" footer="All enquiries sent" loading={total.loading} />
        <KpiCard label="In Review" value={review.count} icon={<FileSearch />} tone="amber" footer={shareOf(review.count, total.count)} loading={review.loading} />
        <KpiCard label="Quoted" value={quoted.count} icon={<FileText />} tone="violet" footer={shareOf(quoted.count, total.count)} loading={quoted.loading} />
        <KpiCard label="Ordered" value={won.count} icon={<CheckCircle2 />} tone="green" footer={shareOf(won.count, total.count)} loading={won.loading} />
      </KpiGrid>
      <ToolbarCard tabs={<DotTabs items={TABS} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />}>
        <SearchBox value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search RFQs..." />
      </ToolbarCard>
      <QueryError error={error} />
      <TableCard>
        <DataTable
          rows={data?.items || []}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => router.push(`/rfqs/${row.id}`)}
          empty={<p className="px-4 py-12 text-center text-sm text-muted">No RFQs yet. Send us your first requirement.</p>}
          columns={[
            { key: "number", header: "RFQ", render: (row) => <span className="font-semibold text-fg">{row.number}</span> },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || "—"}</span> },
            { key: "application", header: "Application", render: (row) => row.application || "—" },
            { key: "items", header: "Lines", align: "right", render: (row) => row._count?.items ?? row.items?.length ?? "—" },
            { key: "createdAt", header: "Sent", render: (row) => <DateText value={row.createdAt} /> },
            { key: "status", header: "Status", render: (row) => <StageBadge status={row.status} /> },
          ]}
        />
      </TableCard>
      {data && data.total > data.pageSize ? <PaginationBar page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
    </ListPage>
  );
}
