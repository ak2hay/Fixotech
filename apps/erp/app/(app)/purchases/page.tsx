"use client";

import { Card, DataTable, MiniStat, Page, PageHeader, StatusPill, Tabs, compactMoney, money, relativeTime } from "@fixotec/ui";
import { ClipboardList, PackageCheck, ShoppingBag } from "lucide-react";
import { useState } from "react";
import { DateText, QueryError } from "../../../components/common";
import { useApi } from "../../../lib/query";

type Requisition = { id: string; number: string; status: string; neededBy?: string | null; notes?: string | null; createdAt: string; items: unknown[]; quotes: Array<{ id: string; vendor?: { name: string } | null }>; orders: unknown[] };
type PurchaseOrder = { id: string; number: string; status: string; total: number | string; expectedOn?: string | null; createdAt: string; vendor: { name: string }; items: unknown[]; receipts: unknown[] };

export default function PurchasesPage() {
  const [tab, setTab] = useState("orders");
  const requisitions = useApi<Requisition[]>("/purchases/requisitions");
  const orders = useApi<PurchaseOrder[]>("/purchases/orders");
  const open = (orders.data || []).filter((row) => ["APPROVED", "SUBMITTED", "PARTIAL"].includes(row.status));

  return (
    <Page>
      <PageHeader title="Purchases" description="Requisitions, vendor quotes, purchase orders and goods receipts." />
      <div className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Open requisitions" value={(requisitions.data || []).filter((row) => !["CLOSED", "CANCELLED", "ORDERED"].includes(row.status)).length} icon={<ClipboardList />} tone="info" />
        <MiniStat label="Open purchase orders" value={open.length} icon={<ShoppingBag />} tone="accent" />
        <MiniStat label="Open PO value" value={compactMoney(open.reduce((sum, row) => sum + Number(row.total), 0))} icon={<PackageCheck />} tone="warn" />
      </div>
      <Card>
        <div className="px-4 pt-2">
          <Tabs value={tab} onChange={setTab} items={[{ key: "orders", label: "Purchase orders", count: orders.data?.length }, { key: "requisitions", label: "Requisitions", count: requisitions.data?.length }]} />
        </div>
        <QueryError error={orders.error || requisitions.error} />
        {tab === "orders" ? (
          <DataTable
            rows={orders.data || []}
            loading={orders.isLoading}
            rowKey={(row) => row.id}
            empty="No purchase orders."
            columns={[
              { key: "number", header: "PO", sortValue: (row) => row.number, render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "vendor", header: "Vendor", sortValue: (row) => row.vendor.name, render: (row) => row.vendor.name },
              { key: "lines", header: "Lines", align: "right", render: (row) => row.items.length },
              { key: "receipts", header: "GRNs", align: "right", render: (row) => row.receipts.length },
              { key: "total", header: "Total", align: "right", sortValue: (row) => Number(row.total), render: (row) => <span className="font-semibold">{money(row.total)}</span> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "expectedOn", header: "Expected", render: (row) => <DateText value={row.expectedOn} /> },
              { key: "createdAt", header: "Raised", sortValue: (row) => row.createdAt, render: (row) => <span className="text-muted">{relativeTime(row.createdAt)}</span> },
            ]}
          />
        ) : (
          <DataTable
            rows={requisitions.data || []}
            loading={requisitions.isLoading}
            rowKey={(row) => row.id}
            empty="No requisitions."
            columns={[
              { key: "number", header: "Requisition", sortValue: (row) => row.number, render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "lines", header: "Lines", align: "right", render: (row) => row.items.length },
              { key: "quotes", header: "Vendor quotes", render: (row) => <span className="text-muted">{row.quotes.length ? row.quotes.map((quote) => quote.vendor?.name).filter(Boolean).join(", ") : "None yet"}</span> },
              { key: "orders", header: "POs", align: "right", render: (row) => row.orders.length },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "neededBy", header: "Needed by", render: (row) => <DateText value={row.neededBy} /> },
              { key: "createdAt", header: "Raised", sortValue: (row) => row.createdAt, render: (row) => <span className="text-muted">{relativeTime(row.createdAt)}</span> },
            ]}
          />
        )}
      </Card>
    </Page>
  );
}
