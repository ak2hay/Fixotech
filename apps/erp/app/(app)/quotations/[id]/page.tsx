"use client";

import { ActivityFeed, Button, Card, CardBody, CardHeader, DataTable, DetailHeader, ErrorNote, KeyValueList, Modal, Notice, Page, StatusPill, Stepper, Tabs, compactMoney, formatDate, money, number, percent, type Step } from "@fixotec/ui";
import { Building2, CalendarDays, Download, FolderKanban, PackageCheck, Send, ShieldCheck } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { DateText, PageSkeleton, QueryError, toActivity, type ActivityRow } from "../../../../components/common";
import { CrmPanel } from "../../../../components/crm";
import { Link } from "../../../../components/link";
import { download } from "../../../../lib/api";
import { useAction, useApi } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Quote = {
  id: string;
  number: string;
  status: string;
  validUntil?: string | null;
  paymentTerms?: string | null;
  deliveryTerms?: string | null;
  currency: string;
  discountPct: number | string;
  freight: number | string;
  subtotal: number | string;
  tax: number | string;
  total: number | string;
  marginPct?: number | string;
  customerAcceptedAt?: string | null;
  createdAt: string;
  customer: { id: string; name: string; code: string };
  project?: { id: string; name: string; code: string } | null;
  rfq?: { id: string; number: string } | null;
  items: Array<{ id: string; description: string; qty: number | string; unit: string; basePrice: number | string; unitCost?: number | string; discountPct: number | string; taxRate: number | string; variant?: { articleNumber: string } | null }>;
  salesOrders: Array<{ id: string; number: string; status: string; total: number | string; createdAt: string }>;
};

const FLOW = [
  { key: "DRAFT", label: "Draft" },
  { key: "UNDER_REVIEW", label: "Approval" },
  { key: "APPROVED", label: "Approved" },
  { key: "SENT", label: "Sent to customer" },
  { key: "ACCEPTED", label: "Accepted" },
  { key: "ORDERED", label: "Order placed" },
];

export default function QuotationDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [tab, setTab] = useState("lines");
  const [confirmOrder, setConfirmOrder] = useState(false);
  const quote = useApi<Quote>(`/quotations/${id}`);
  const activity = useApi<{ items: ActivityRow[] }>(`/activity?entityType=quotation&entityId=${id}&limit=40`);
  const action = useAction<Record<string, unknown>, { id: string }>(["/quotations", "/activity", "/approvals", "/sales-orders", "/reports"]);

  if (quote.isLoading) return <PageSkeleton />;
  if (quote.error || !quote.data) return <Page><QueryError error={quote.error} /></Page>;
  const data = quote.data;
  const can = (permission: string) => allowed(session, permission);
  const seesCost = data.marginPct !== undefined;

  const position = data.salesOrders.length ? 5 : data.status === "ACCEPTED" ? 4 : data.status === "SENT" || data.status === "NEGOTIATION" ? 3 : data.status === "APPROVED" ? 2 : data.status === "UNDER_REVIEW" || data.status === "SUBMITTED" ? 1 : 0;
  const steps: Step[] = FLOW.map((item, index) => ({
    key: item.key,
    label: item.label,
    state: data.status === "REJECTED" && index === 1 ? "blocked" : data.status === "CANCELLED" && index === position ? "blocked" : index < position || (index === 5 && position === 5) ? "done" : index === position ? "current" : "upcoming",
  }));

  const canSubmit = can("quotations.edit") && ["DRAFT", "REJECTED", "NEGOTIATION"].includes(data.status);
  const canSend = can("quotations.edit") && data.status === "APPROVED";
  const canOrder = can("sales_orders.create") && ["APPROVED", "ACCEPTED", "SENT"].includes(data.status) && !data.salesOrders.length;
  const discount = Number(data.subtotal) * (Number(data.discountPct) / 100);

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "Quotations", href: "/quotations" }, { label: data.number }]}
        title={data.project?.name || data.customer.name}
        code={data.number}
        pills={<StatusPill status={data.status} />}
        meta={[
          { icon: <Building2 />, label: <Link href={`/customers/${data.customer.id}`} className="hover:text-accent">{data.customer.name}</Link> },
          ...(data.project ? [{ icon: <FolderKanban />, label: <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.code}</Link> }] : []),
          ...(data.rfq ? [{ label: <Link href={`/rfqs/${data.rfq.id}`} className="hover:text-accent">From {data.rfq.number}</Link> }] : []),
          { icon: <CalendarDays />, label: `Valid until ${formatDate(data.validUntil) || "—"}` },
        ]}
        value={{ label: "Quotation total", amount: compactMoney(data.total) }}
        actions={
          <>
            {can("quotations.download") ? (
              <Button variant="outline" onClick={() => download(`/quotations/${id}/pdf`, `${data.number}.pdf`)}>
                <Download /> PDF
              </Button>
            ) : null}
            {canSubmit ? (
              <Button variant="outline" loading={action.isPending} onClick={() => action.mutate({ path: `/quotations/${id}/submit` })}>
                <ShieldCheck /> Submit for approval
              </Button>
            ) : null}
            {canSend ? (
              <Button variant="outline" loading={action.isPending} onClick={() => action.mutate({ path: `/quotations/${id}/send` })}>
                <Send /> Send to customer
              </Button>
            ) : null}
            {canOrder ? (
              <Button onClick={() => setConfirmOrder(true)}>
                <PackageCheck /> Create sales order
              </Button>
            ) : null}
          </>
        }
      >
        <div className="overflow-x-auto pb-4 pt-2">
          <div className="min-w-[600px]">
            <Stepper steps={steps} current={position} />
          </div>
        </div>
        <Tabs items={[{ key: "lines", label: "Line items", count: data.items.length }, { key: "orders", label: "Sales orders", count: data.salesOrders.length }, { key: "activity", label: "Activity" }]} value={tab} onChange={setTab} />
      </DetailHeader>

      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      {data.status === "REJECTED" ? <Notice tone="bad">This quotation was rejected in approval. Revise the pricing and submit again.</Notice> : null}
      {data.customerAcceptedAt ? <Notice tone="good">Customer accepted on {formatDate(data.customerAcceptedAt)}.</Notice> : null}

      {tab === "lines" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card>
            <DataTable
              rows={data.items}
              rowKey={(row) => row.id}
              columns={[
                { key: "description", header: "Item", render: (row) => <div><p className="font-medium">{row.description}</p>{row.variant ? <p className="font-mono text-2xs text-muted">{row.variant.articleNumber}</p> : null}</div> },
                { key: "qty", header: "Qty", align: "right", render: (row) => <span className="tabular">{number(row.qty, 3)} {row.unit}</span> },
                { key: "basePrice", header: "Rate", align: "right", render: (row) => money(row.basePrice) },
                ...(seesCost ? [{ key: "unitCost", header: "Cost", align: "right" as const, render: (row: Quote["items"][number]) => <span className="text-muted">{money(row.unitCost)}</span> }] : []),
                { key: "taxRate", header: "GST", align: "right", render: (row) => `${Number(row.taxRate)}%` },
                { key: "amount", header: "Amount", align: "right", render: (row) => <span className="font-semibold">{money(Number(row.qty) * Number(row.basePrice) * (1 - Number(data.discountPct) / 100))}</span> },
              ]}
            />
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Summary" />
              <CardBody>
                <KeyValueList
                  items={[
                    { label: "Subtotal", value: <span className="tabular">{money(data.subtotal)}</span> },
                    { label: `Discount (${Number(data.discountPct)}%)`, value: <span className="tabular text-danger">- {money(discount)}</span> },
                    { label: "Freight", value: <span className="tabular">{money(data.freight)}</span> },
                    { label: "GST", value: <span className="tabular">{money(data.tax)}</span> },
                    { label: "Total", value: <span className="text-base font-semibold tabular">{money(data.total)}</span> },
                    ...(seesCost ? [{ label: "Margin", value: <span className={Number(data.marginPct) < 15 ? "text-danger" : "text-success"}>{percent(data.marginPct, 1)}</span> }] : []),
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Terms" />
              <CardBody>
                <KeyValueList
                  items={[
                    { label: "Payment", value: data.paymentTerms || "—" },
                    { label: "Delivery", value: data.deliveryTerms || "—" },
                    { label: "Currency", value: data.currency },
                    { label: "Created", value: formatDate(data.createdAt) },
                  ]}
                />
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "orders" ? (
        <Card>
          <DataTable
            rows={data.salesOrders}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/sales-orders/${row.id}`)}
            empty="No sales order yet."
            columns={[
              { key: "number", header: "Order", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "total", header: "Total", align: "right", render: (row) => money(row.total) },
              { key: "createdAt", header: "Created", render: (row) => <DateText value={row.createdAt} /> },
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

      <Modal
        open={confirmOrder}
        onOpenChange={setConfirmOrder}
        title="Create sales order"
        description="All quotation lines are ordered at the quoted price. Credit and stock checks run on creation."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmOrder(false)}>Cancel</Button>
            <Button
              loading={action.isPending}
              onClick={async () => {
                const order = await action.mutateAsync({ path: "/sales-orders", body: { quotationId: id, lines: [] } });
                setConfirmOrder(false);
                router.push(`/sales-orders/${order.id}`);
              }}
            >
              Create order
            </Button>
          </>
        }
      >
        <KeyValueList items={[{ label: "Customer", value: data.customer.name }, { label: "Lines", value: data.items.length }, { label: "Order value", value: money(data.total) }]} />
        {action.error ? <ErrorNote className="mt-3">{action.error.message}</ErrorNote> : null}
      </Modal>
      <CrmPanel entityType="quotation" entityId={id} />
    </Page>
  );
}
