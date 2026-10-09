"use client";

import { ActivityFeed, Button, Card, CardBody, CardHeader, DataTable, DetailHeader, ErrorNote, KeyValueList, Notice, Page, ProgressBar, StatusPill, Tabs, compactMoney, formatDate, money, number } from "@fixotec/ui";
import { Building2, CalendarDays, FolderKanban, Unlock } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { DateText, PageSkeleton, QueryError, toActivity, type ActivityRow } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { useAction, useApi } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Order = {
  id: string;
  number: string;
  status: string;
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  creditExposure: number | string;
  creditLimit: number | string;
  notes?: string | null;
  createdAt: string;
  customer: { id: string; name: string };
  project?: { id: string; name: string; code: string } | null;
  quotation?: { id: string; number: string } | null;
  items: Array<{ id: string; description: string; qty: number | string; fulfilledQty: number | string; backorderedQty: number | string; unitPrice: number | string; taxRate: number | string; variant?: { articleNumber: string } | null }>;
  dispatches: Array<{ id: string; number: string; status: string; transporter?: string | null; lrNumber?: string | null; shippedAt?: string | null; deliveredAt?: string | null }>;
  invoices: Array<{ id: string; number: string; status: string; total: number | string; dueDate?: string | null }>;
  productionOrders: Array<{ id: string; number: string; status: string; qty: number | string; completedQty: number | string }>;
};

export default function SalesOrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const [tab, setTab] = useState("lines");
  const order = useApi<Order>(`/sales-orders/${id}`);
  const activity = useApi<{ items: ActivityRow[] }>(tab === "activity" ? `/activity?entityType=sales_order&entityId=${id}&limit=40` : null);
  const action = useAction(["/sales-orders", "/activity", "/reports"]);

  if (order.isLoading) return <PageSkeleton />;
  if (order.error || !order.data) return <Page><QueryError error={order.error} /></Page>;
  const data = order.data;
  const ordered = data.items.reduce((sum, item) => sum + Number(item.qty), 0);
  const fulfilled = data.items.reduce((sum, item) => sum + Number(item.fulfilledQty), 0);
  const fulfilment = ordered ? Math.round((fulfilled / ordered) * 100) : 0;

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "Sales orders", href: "/sales-orders" }, { label: data.number }]}
        title={data.project?.name || data.customer.name}
        code={data.number}
        pills={<StatusPill status={data.status} />}
        meta={[
          { icon: <Building2 />, label: <Link href={`/customers/${data.customer.id}`} className="hover:text-accent">{data.customer.name}</Link> },
          ...(data.project ? [{ icon: <FolderKanban />, label: <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.code}</Link> }] : []),
          ...(data.quotation ? [{ label: <Link href={`/quotations/${data.quotation.id}`} className="hover:text-accent">From {data.quotation.number}</Link> }] : []),
          { icon: <CalendarDays />, label: `Placed ${formatDate(data.createdAt)}` },
        ]}
        value={{ label: "Order value", amount: compactMoney(data.total) }}
        actions={
          data.status === "CREDIT_HOLD" && allowed(session, "customers.override") ? (
            <Button loading={action.isPending} onClick={() => action.mutate({ path: `/sales-orders/${id}/release-credit` })}>
              <Unlock /> Release credit hold
            </Button>
          ) : null
        }
      >
        <Tabs
          items={[
            { key: "lines", label: "Lines", count: data.items.length },
            { key: "production", label: "Production", count: data.productionOrders.length },
            { key: "dispatch", label: "Dispatch", count: data.dispatches.length },
            { key: "invoices", label: "Invoices", count: data.invoices.length },
            { key: "activity", label: "Activity" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </DetailHeader>

      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      {data.status === "CREDIT_HOLD" ? <Notice tone="warn">Order is on credit hold: exposure {money(data.creditExposure)} against a limit of {money(data.creditLimit)}.</Notice> : null}

      {tab === "lines" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_300px]">
          <Card>
            <DataTable
              rows={data.items}
              rowKey={(row) => row.id}
              columns={[
                { key: "description", header: "Item", render: (row) => <div><p className="font-medium">{row.description}</p>{row.variant ? <p className="font-mono text-2xs text-muted">{row.variant.articleNumber}</p> : null}</div> },
                { key: "qty", header: "Ordered", align: "right", render: (row) => <span className="tabular">{number(row.qty, 3)}</span> },
                { key: "fulfilled", header: "Shipped", align: "right", render: (row) => <span className="tabular">{number(row.fulfilledQty, 3)}</span> },
                { key: "backordered", header: "Backordered", align: "right", render: (row) => <span className={Number(row.backorderedQty) ? "text-warning tabular" : "tabular text-subtle"}>{number(row.backorderedQty, 3)}</span> },
                { key: "unitPrice", header: "Rate", align: "right", render: (row) => money(row.unitPrice) },
                { key: "amount", header: "Amount", align: "right", render: (row) => <span className="font-semibold">{money(Number(row.qty) * Number(row.unitPrice))}</span> },
              ]}
            />
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Fulfilment" />
              <CardBody className="space-y-3">
                <ProgressBar value={fulfilment} showLabel tone={fulfilment === 100 ? "good" : "accent"} />
                <KeyValueList
                  items={[
                    { label: "Subtotal", value: <span className="tabular">{money(data.subtotal)}</span> },
                    { label: "GST", value: <span className="tabular">{money(data.tax)}</span> },
                    { label: "Total", value: <span className="font-semibold tabular">{money(data.total)}</span> },
                    { label: "Credit exposure", value: <span className="tabular">{money(data.creditExposure)}</span> },
                  ]}
                />
                {data.notes ? <p className="rounded-md bg-canvas p-3 text-sm text-muted">{data.notes}</p> : null}
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "production" ? (
        <Card>
          <DataTable
            rows={data.productionOrders}
            rowKey={(row) => row.id}
            empty="No production orders."
            columns={[
              { key: "number", header: "Production order", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "progress", header: "Progress", render: (row) => <ProgressBar value={Number(row.qty) ? (Number(row.completedQty) / Number(row.qty)) * 100 : 0} showLabel className="w-40" /> },
              { key: "qty", header: "Qty", align: "right", render: (row) => `${number(row.completedQty)} / ${number(row.qty)}` },
            ]}
          />
        </Card>
      ) : null}

      {tab === "dispatch" ? (
        <Card>
          <DataTable
            rows={data.dispatches}
            rowKey={(row) => row.id}
            empty="Nothing dispatched yet."
            columns={[
              { key: "number", header: "Dispatch", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "transporter", header: "Transporter", render: (row) => row.transporter || "—" },
              { key: "lrNumber", header: "LR no.", render: (row) => row.lrNumber || "—" },
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
            empty="Not invoiced yet."
            columns={[
              { key: "number", header: "Invoice", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "total", header: "Total", align: "right", render: (row) => money(row.total) },
              { key: "dueDate", header: "Due", render: (row) => <DateText value={row.dueDate} /> },
            ]}
          />
        </Card>
      ) : null}

      {tab === "activity" ? (
        <Card>
          <CardBody className="pt-4">
            <ActivityFeed items={toActivity(activity.data?.items)} LinkComponent={Link} />
          </CardBody>
        </Card>
      ) : null}
    </Page>
  );
}
