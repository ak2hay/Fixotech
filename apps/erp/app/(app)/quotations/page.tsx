"use client";

import { QUOTE_STATUSES } from "@fixotec/shared";
import { Card, DataTable, FilterButton, Page, PageHeader, StatusPill, Tabs, TextInput, humanize, money, percent, relativeTime } from "@fixotec/ui";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { DateText, QueryError } from "../../../components/common";
import { useApi, type Paged } from "../../../lib/query";

type QuoteRow = {
  id: string;
  number: string;
  status: string;
  total: number | string;
  discountPct: number | string;
  marginPct?: number | string;
  validUntil?: string | null;
  createdAt: string;
  customer?: { name: string } | null;
  project?: { name: string } | null;
  rfq?: { number: string } | null;
  items: unknown[];
};

const QUEUES = [
  { key: "", label: "All" },
  { key: "DRAFT", label: "Draft" },
  { key: "UNDER_REVIEW", label: "In approval" },
  { key: "APPROVED", label: "Approved" },
  { key: "SENT", label: "Sent" },
  { key: "ACCEPTED", label: "Accepted" },
];

export default function QuotationsPage() {
  return (
    <Suspense>
      <Quotations />
    </Suspense>
  );
}

function Quotations() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  if (params.get("project")) query.set("projectId", params.get("project")!);
  const { data, error, isLoading } = useApi<Paged<QuoteRow>>(`/quotations?${query}`, { keepPrevious: true });
  const showMargin = (data?.items || []).some((row) => row.marginPct !== undefined);

  return (
    <Page>
      <PageHeader title="Quotations" description="Priced offers generated from RFQs, with approval and customer acceptance." />
      <Card>
        <div className="px-4 pt-2">
          <Tabs items={QUEUES} value={QUEUES.some((item) => item.key === status) ? status : ""} onChange={(key) => { setStatus(key); setPage(1); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search number, customer, project..." value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} className="w-72" />
          <FilterButton label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={QUOTE_STATUSES.map((value) => ({ value, label: humanize(value) }))} />
        </div>
        <QueryError error={error} />
        <DataTable
          rows={data?.items || []}
          loading={isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/quotations/${row.id}`)}
          pagination={{ page, pageSize: data?.pageSize || 25, total: data?.total || 0, onPage: setPage }}
          empty="No quotations match these filters."
          columns={[
            { key: "number", header: "Quotation", sortValue: (row) => row.number, render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "customer", header: "Customer", sortValue: (row) => row.customer?.name || "", render: (row) => row.customer?.name || "—" },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || "—"}</span> },
            { key: "rfq", header: "RFQ", render: (row) => <span className="font-mono text-xs text-muted">{row.rfq?.number || "—"}</span> },
            { key: "discount", header: "Discount", align: "right", render: (row) => `${Number(row.discountPct)}%` },
            ...(showMargin ? [{ key: "margin", header: "Margin", align: "right" as const, sortValue: (row: QuoteRow) => Number(row.marginPct || 0), render: (row: QuoteRow) => percent(row.marginPct, 1) }] : []),
            { key: "total", header: "Total", align: "right", sortValue: (row) => Number(row.total), render: (row) => <span className="font-semibold">{money(row.total)}</span> },
            { key: "status", header: "Status", sortValue: (row) => row.status, render: (row) => <StatusPill status={row.status} /> },
            { key: "validUntil", header: "Valid until", sortValue: (row) => row.validUntil || "", render: (row) => <DateText value={row.validUntil} /> },
            { key: "createdAt", header: "Created", sortValue: (row) => row.createdAt, render: (row) => <span className="whitespace-nowrap text-muted">{relativeTime(row.createdAt)}</span> },
          ]}
        />
      </Card>
    </Page>
  );
}
