"use client";

import { Card, DataTable, MiniStat, StatusPill, Tabs } from "@fixotec/ui";
import { CheckCircle2, PackageOpen, Truck } from "lucide-react";
import { useState } from "react";
import { DateText, ListPage, QueryError, SearchBox, matches } from "../../../components/common";
import { rowsOf } from "../../../lib/api";
import { useApi } from "../../../lib/query";

type Dispatch = { id: string; number: string; status: string; transporter?: string | null; lrNumber?: string | null; vehicleNo?: string | null; shippedAt?: string | null; deliveredAt?: string | null; createdAt: string; salesOrder?: { number: string } | null; items: unknown[] };

const TABS = [
  { key: "", label: "All" },
  { key: "transit", label: "In transit" },
  { key: "delivered", label: "Delivered" },
  { key: "preparing", label: "Preparing" },
];

export default function DeliveriesPage() {
  const [tab, setTab] = useState("");
  const [q, setQ] = useState("");
  const { data, error, isLoading } = useApi<unknown>("/dispatch");
  const all = rowsOf<Dispatch>(data);
  const stateOf = (row: Dispatch) => (row.deliveredAt ? "delivered" : row.shippedAt ? "transit" : "preparing");
  const rows = all.filter((row) => (!tab || stateOf(row) === tab) && matches(row, q));

  return (
    <ListPage title="Deliveries" description="Shipments against your orders, with transporter and LR details.">
      <section className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Preparing" value={all.filter((row) => stateOf(row) === "preparing").length} icon={<PackageOpen />} tone="info" />
        <MiniStat label="In transit" value={all.filter((row) => stateOf(row) === "transit").length} icon={<Truck />} tone="warn" />
        <MiniStat label="Delivered" value={all.filter((row) => stateOf(row) === "delivered").length} icon={<CheckCircle2 />} tone="good" />
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="pill" items={TABS} value={tab} onChange={setTab} />
        <SearchBox value={q} onChange={setQ} placeholder="Search dispatch, order, LR..." />
      </div>
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No shipments yet.</p>}
          columns={[
            { key: "number", header: "Dispatch", render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "order", header: "Order", render: (row) => <span className="text-muted">{row.salesOrder?.number || "—"}</span> },
            { key: "items", header: "Lines", align: "right", render: (row) => row.items.length },
            { key: "transporter", header: "Transporter", render: (row) => <div><p>{row.transporter || "—"}</p>{row.lrNumber || row.vehicleNo ? <p className="text-xs text-muted">{[row.lrNumber && `LR ${row.lrNumber}`, row.vehicleNo].filter(Boolean).join(" · ")}</p> : null}</div> },
            { key: "shippedAt", header: "Shipped", render: (row) => <DateText value={row.shippedAt} /> },
            { key: "deliveredAt", header: "Delivered", render: (row) => <DateText value={row.deliveredAt} /> },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
          ]}
        />
      </Card>
    </ListPage>
  );
}
