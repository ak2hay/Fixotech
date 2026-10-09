"use client";

import { DataTable, PaginationBar, money } from "@fixotec/ui";
import { CheckCircle2, PackageCheck, ShoppingCart, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { DateText, DotTabs, KpiCard, KpiGrid, ListPage, PrimaryButton, QueryError, SearchBox, StageBadge, TableCard, ToolbarCard, shareOf, useCount } from "../../../components/common";
import { useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Order = { id: string; number: string; status: string; total: number | string; createdAt: string; project?: { name: string } | null; quotation?: { number: string } | null; dispatches?: Array<{ status: string }> };

const TABS = [
  { key: "", label: "All Orders" },
  { key: "CONFIRMED", label: "Confirmed", dot: "bg-blue-500" },
  { key: "PARTIAL", label: "Partially shipped", dot: "bg-amber-500" },
  { key: "DISPATCHED", label: "Dispatched", dot: "bg-violet-500" },
  { key: "CLOSED", label: "Closed", dot: "bg-emerald-500" },
];

export default function PortalOrdersPage() {
  const router = useRouter();
  const { session, role } = useSession();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useApi<Paged<Order>>(`/sales-orders?page=${page}&pageSize=20${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`, { keepPrevious: true });
  const total = useCount("/sales-orders");
  const confirmed = useCount("/sales-orders?status=CONFIRMED");
  const dispatched = useCount("/sales-orders?status=DISPATCHED");
  const closed = useCount("/sales-orders?status=CLOSED");

  return (
    <ListPage
      title="Orders"
      description="Confirmed orders and their fulfilment."
      actions={role === "distributor" && allowed(session, "sales_orders.create") ? <PrimaryButton href="/orders/new">New Order</PrimaryButton> : null}
    >
      <KpiGrid>
        <KpiCard label="Total Orders" value={total.count} icon={<ShoppingCart />} tone="blue" footer="All orders placed" loading={total.loading} />
        <KpiCard label="Confirmed" value={confirmed.count} icon={<PackageCheck />} tone="amber" footer={shareOf(confirmed.count, total.count)} loading={confirmed.loading} />
        <KpiCard label="Dispatched" value={dispatched.count} icon={<Truck />} tone="violet" footer={shareOf(dispatched.count, total.count)} loading={dispatched.loading} />
        <KpiCard label="Closed" value={closed.count} icon={<CheckCircle2 />} tone="green" footer={shareOf(closed.count, total.count)} loading={closed.loading} />
      </KpiGrid>
      <ToolbarCard tabs={<DotTabs items={TABS} value={status} onChange={(value) => { setStatus(value); setPage(1); }} />}>
        <SearchBox value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search orders..." />
      </ToolbarCard>
      <QueryError error={error} />
      <TableCard>
        <DataTable
          rows={data?.items || []}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => router.push(`/orders/${row.id}`)}
          empty={<p className="px-4 py-12 text-center text-sm text-muted">No orders yet.</p>}
          columns={[
            { key: "number", header: "Order", render: (row) => <div><p className="font-semibold text-fg">{row.number}</p>{row.quotation ? <p className="text-xs text-muted">From {row.quotation.number}</p> : null}</div> },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || "—"}</span> },
            { key: "createdAt", header: "Placed", render: (row) => <DateText value={row.createdAt} /> },
            { key: "dispatches", header: "Shipments", align: "right", render: (row) => row.dispatches?.length ?? 0 },
            { key: "status", header: "Status", render: (row) => <StageBadge status={row.status} /> },
            { key: "total", header: "Value", align: "right", render: (row) => <span className="font-semibold">{money(row.total)}</span> },
          ]}
        />
      </TableCard>
      {data && data.total > data.pageSize ? <PaginationBar page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
    </ListPage>
  );
}
