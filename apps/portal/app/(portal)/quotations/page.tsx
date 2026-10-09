"use client";

import { DataTable, PaginationBar, money } from "@fixotec/ui";
import { CheckCircle2, FileText, Handshake, Inbox } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateText, DotTabs, KpiCard, KpiGrid, ListPage, QueryError, SearchBox, StageBadge, TableCard, ToolbarCard, shareOf, useCount } from "../../../components/common";
import { useApi, type Paged } from "../../../lib/query";

type Quote = { id: string; number: string; status: string; total: number | string; createdAt: string; validUntil?: string | null; project?: { name: string } | null; rfq?: { number: string } | null };

const TABS = [
  { key: "", label: "All Quotations" },
  { key: "SENT", label: "Awaiting you", dot: "bg-blue-500" },
  { key: "NEGOTIATION", label: "In negotiation", dot: "bg-amber-500" },
  { key: "ACCEPTED", label: "Accepted", dot: "bg-emerald-500" },
];

export default function PortalQuotationsPage() {
  const router = useRouter();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useApi<Paged<Quote>>(`/quotations?page=${page}&pageSize=20${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { keepPrevious: true });
  const total = useCount("/quotations");
  const sent = useCount("/quotations?status=SENT");
  const negotiation = useCount("/quotations?status=NEGOTIATION");
  const accepted = useCount("/quotations?status=ACCEPTED");

  return (
    <ListPage title="Quotations" description="Priced offers from Fixotec. Open one to review the lines and accept.">
      <KpiGrid>
        <KpiCard label="Total Quotations" value={total.count} icon={<FileText />} tone="blue" footer="All offers received" loading={total.loading} />
        <KpiCard label="Awaiting You" value={sent.count} icon={<Inbox />} tone="amber" footer={shareOf(sent.count, total.count)} loading={sent.loading} />
        <KpiCard label="In Negotiation" value={negotiation.count} icon={<Handshake />} tone="violet" footer={shareOf(negotiation.count, total.count)} loading={negotiation.loading} />
        <KpiCard label="Accepted" value={accepted.count} icon={<CheckCircle2 />} tone="green" footer={shareOf(accepted.count, total.count)} loading={accepted.loading} />
      </KpiGrid>
      <ToolbarCard tabs={<DotTabs items={TABS} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />}>
        <SearchBox value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search quotations..." />
      </ToolbarCard>
      <QueryError error={error} />
      <TableCard>
        <DataTable
          rows={data?.items || []}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => router.push(`/quotations/${row.id}`)}
          empty={<p className="px-4 py-12 text-center text-sm text-muted">No quotations yet.</p>}
          columns={[
            { key: "number", header: "Quotation", render: (row) => <div><p className="font-semibold text-fg">{row.number}</p>{row.rfq ? <p className="text-xs text-muted">For {row.rfq.number}</p> : null}</div> },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || "—"}</span> },
            { key: "createdAt", header: "Issued", render: (row) => <DateText value={row.createdAt} /> },
            { key: "validUntil", header: "Valid until", render: (row) => <DateText value={row.validUntil} /> },
            { key: "status", header: "Status", render: (row) => <StageBadge status={row.status} /> },
            { key: "total", header: "Total", align: "right", render: (row) => <span className="font-semibold">{money(row.total)}</span> },
          ]}
        />
      </TableCard>
      {data && data.total > data.pageSize ? <PaginationBar page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
    </ListPage>
  );
}
