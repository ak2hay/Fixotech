"use client";

import { ORDER_STATUSES } from "@fixotec/shared";
import { Card, DataTable, FilterButton, Page, PageHeader, StatusPill, Tabs, TextInput, humanize, money, relativeTime } from "@fixotec/ui";
import { Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { QueryError } from "../../../components/common";
import { useApi, type Paged } from "../../../lib/query";

type OrderRow = {
  id: string;
  number: string;
  status: string;
  total: number | string;
  createdAt: string;
  customer?: { name: string } | null;
  project?: { name: string } | null;
  quotation?: { number: string } | null;
  items: unknown[];
  dispatches: Array<{ id: string; status: string }>;
};

const QUEUES = [
  { key: "", label: "All" },
  { key: "CREDIT_HOLD", label: "Credit hold" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "BACKORDERED", label: "Backordered" },
  { key: "PARTIAL", label: "Partially shipped" },
  { key: "DISPATCHED", label: "Dispatched" },
];

export default function SalesOrdersPage() {
  return (
    <Suspense>
      <SalesOrders />
    </Suspense>
  );
}

function SalesOrders() {
  const router = useRouter();
  const params = useSearchParams();
  const [status, setStatus] = useState(params.get("status") || "");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const query = new URLSearchParams({ page: String(page), pageSize: "25" });
  if (status) query.set("status", status);
  if (q) query.set("q", q);
  const { data, error, isLoading } = useApi<Paged<OrderRow>>(`/sales-orders?${query}`, { keepPrevious: true });

  return (
    <Page>
      <PageHeader title="Sales orders" description="Confirmed orders from quotations and distributor portal orders." />
      <Card>
        <div className="px-4 pt-2">
          <Tabs items={QUEUES} value={QUEUES.some((item) => item.key === status) ? status : ""} onChange={(key) => { setStatus(key); setPage(1); }} />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search order, customer, project..." value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} className="w-72" />
          <FilterButton label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={ORDER_STATUSES.map((value) => ({ value, label: humanize(value) }))} />
        </div>
        <QueryError error={error} />
        <DataTable
          rows={data?.items || []}
          loading={isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/sales-orders/${row.id}`)}
          pagination={{ page, pageSize: data?.pageSize || 25, total: data?.total || 0, onPage: setPage }}
          empty="No orders match these filters."
          columns={[
            { key: "number", header: "Order", sortValue: (row) => row.number, render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "customer", header: "Customer", sortValue: (row) => row.customer?.name || "", render: (row) => row.customer?.name || "—" },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || "—"}</span> },
            { key: "quotation", header: "Quotation", render: (row) => <span className="font-mono text-xs text-muted">{row.quotation?.number || "Portal"}</span> },
            { key: "lines", header: "Lines", align: "right", render: (row) => row.items.length },
            { key: "dispatches", header: "Dispatches", align: "right", render: (row) => row.dispatches.length },
            { key: "total", header: "Total", align: "right", sortValue: (row) => Number(row.total), render: (row) => <span className="font-semibold">{money(row.total)}</span> },
            { key: "status", header: "Status", sortValue: (row) => row.status, render: (row) => <StatusPill status={row.status} /> },
            { key: "createdAt", header: "Placed", sortValue: (row) => row.createdAt, render: (row) => <span className="whitespace-nowrap text-muted">{relativeTime(row.createdAt)}</span> },
          ]}
        />
      </Card>
    </Page>
  );
}
