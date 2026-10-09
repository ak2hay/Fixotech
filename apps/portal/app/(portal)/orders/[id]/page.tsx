"use client";

import { Card, CardBody, CardHeader, DataTable, DetailHeader, KeyValueList, Page, ProgressBar, StatusPill, Tabs, compactMoney, formatDate, money, number } from "@fixotec/ui";
import { CalendarDays, FolderKanban } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DateText, PageSkeleton, QueryError } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { useApi } from "../../../../lib/query";

type Order = {
  id: string;
  number: string;
  status: string;
  total: number | string;
  subtotal: number | string;
  tax: number | string;
  createdAt: string;
  project?: { id: string; name: string; code: string } | null;
  quotation?: { id: string; number: string } | null;
  items: Array<{ id: string; description: string; qty: number | string; unitPrice: number | string; fulfilledQty: number | string; variant?: { articleNumber: string } | null }>;
  dispatches: Array<{ id: string; number: string; status: string; transporter?: string | null; lrNumber?: string | null; shippedAt?: string | null; deliveredAt?: string | null }>;
  invoices: Array<{ id: string; number: string; status: string; total: number | string; issueDate: string; dueDate?: string | null }>;
};

export default function PortalOrderPage() {
  const { id } = useParams<{ id: string }>();
  const [tab, setTab] = useState("lines");
  const order = useApi<Order>(`/sales-orders/${id}`);

  if (order.isLoading) return <PageSkeleton />;
  if (order.error || !order.data) return <Page><QueryError error={order.error} /></Page>;
  const data = order.data;
  const ordered = data.items.reduce((sum, item) => sum + Number(item.qty), 0);
  const shipped = data.items.reduce((sum, item) => sum + Number(item.fulfilledQty || 0), 0);
  const fulfilment = ordered ? Math.min(100, (shipped / ordered) * 100) : 0;

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "Orders", href: "/orders" }, { label: data.number }]}
        title={data.project?.name || "Sales order"}
        code={data.number}
        pills={<StatusPill status={data.status} />}
        meta={[
          ...(data.project ? [{ icon: <FolderKanban />, label: <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.code}</Link> }] : []),
          ...(data.quotation ? [{ label: <Link href={`/quotations/${data.quotation.id}`} className="hover:text-accent">From {data.quotation.number}</Link> }] : []),
          { icon: <CalendarDays />, label: `Placed ${formatDate(data.createdAt)}` },
        ]}
        value={{ label: "Order value", amount: compactMoney(data.total) }}
      >
        <div className="max-w-md pb-4">
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted">Shipped</span>
            <span className="font-semibold tabular">{Math.round(fulfilment)}%</span>
          </div>
          <ProgressBar value={fulfilment} tone="good" />
        </div>
        <Tabs
          items={[
            { key: "lines", label: "Lines", count: data.items.length },
            { key: "dispatch", label: "Shipments", count: data.dispatches.length },
            { key: "invoices", label: "Invoices", count: data.invoices.length },
          ]}
          value={tab}
          onChange={setTab}
        />
      </DetailHeader>

      {tab === "lines" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <Card>
            <DataTable
              rows={data.items}
              rowKey={(row) => row.id}
              columns={[
                { key: "description", header: "Item", render: (row) => <div><p className="font-medium">{row.description}</p>{row.variant ? <p className="font-mono text-2xs text-muted">{row.variant.articleNumber}</p> : null}</div> },
                { key: "qty", header: "Ordered", align: "right", render: (row) => <span className="tabular">{number(row.qty, 3)}</span> },
                { key: "fulfilledQty", header: "Shipped", align: "right", render: (row) => <span className="tabular">{number(row.fulfilledQty, 3)}</span> },
                { key: "unitPrice", header: "Rate", align: "right", render: (row) => money(row.unitPrice) },
                { key: "amount", header: "Amount", align: "right", render: (row) => <span className="font-semibold">{money(Number(row.qty) * Number(row.unitPrice))}</span> },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Summary" />
            <CardBody>
              <KeyValueList
                items={[
                  { label: "Subtotal", value: <span className="tabular">{money(data.subtotal)}</span> },
                  { label: "GST", value: <span className="tabular">{money(data.tax)}</span> },
                  { label: "Total", value: <span className="text-base font-semibold tabular">{money(data.total)}</span> },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "dispatch" ? (
        <Card>
          <DataTable
            rows={data.dispatches}
            rowKey={(row) => row.id}
            empty={<p className="px-4 py-8 text-center text-sm text-muted">Nothing shipped yet.</p>}
            columns={[
              { key: "number", header: "Dispatch", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "transporter", header: "Transporter", render: (row) => [row.transporter, row.lrNumber].filter(Boolean).join(" · ") || "—" },
              { key: "shippedAt", header: "Shipped", render: (row) => <DateText value={row.shippedAt} /> },
              { key: "deliveredAt", header: "Delivered", render: (row) => <DateText value={row.deliveredAt} /> },
            ]}
          />
        </Card>
      ) : null}

      {tab === "invoices" ? (
        <Card>
          <DataTable
            rows={data.invoices}
            rowKey={(row) => row.id}
            empty={<p className="px-4 py-8 text-center text-sm text-muted">No invoices yet.</p>}
            columns={[
              { key: "number", header: "Invoice", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "issueDate", header: "Issued", render: (row) => <DateText value={row.issueDate} /> },
              { key: "dueDate", header: "Due", render: (row) => <DateText value={row.dueDate} /> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "total", header: "Total", align: "right", render: (row) => money(row.total) },
            ]}
          />
        </Card>
      ) : null}
    </Page>
  );
}
