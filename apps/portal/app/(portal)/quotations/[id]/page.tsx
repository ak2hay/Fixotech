"use client";

import { Button, Card, CardBody, CardHeader, DataTable, DetailHeader, ErrorNote, KeyValueList, Modal, Notice, Page, StatusPill, compactMoney, formatDate, money, number } from "@fixotec/ui";
import { CalendarDays, CheckCircle2, Download, FolderKanban } from "lucide-react";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PageSkeleton, QueryError } from "../../../../components/common";
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
  customerAcceptedAt?: string | null;
  createdAt: string;
  project?: { id: string; name: string; code: string } | null;
  rfq?: { id: string; number: string } | null;
  items: Array<{ id: string; description: string; qty: number | string; unit: string; basePrice: number | string; taxRate: number | string; variant?: { articleNumber: string } | null }>;
  salesOrders: Array<{ id: string; number: string; status: string }>;
};

export default function PortalQuotationPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useSession();
  const [confirm, setConfirm] = useState(false);
  const quote = useApi<Quote>(`/quotations/${id}`);
  const action = useAction(["/quotations", "/portal", "/activity", "/rfqs"]);

  if (quote.isLoading) return <PageSkeleton />;
  if (quote.error || !quote.data) return <Page><QueryError error={quote.error} /></Page>;
  const data = quote.data;
  const canAccept = allowed(session, "quotations.approve") && ["SENT", "NEGOTIATION"].includes(data.status) && !(data.validUntil && new Date(data.validUntil) < new Date());
  const expired = data.validUntil ? new Date(data.validUntil) < new Date() : false;
  const discount = Number(data.subtotal) * (Number(data.discountPct) / 100);

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "Quotations", href: "/quotations" }, { label: data.number }]}
        title={data.project?.name || "Quotation"}
        code={data.number}
        pills={<StatusPill status={data.status} />}
        meta={[
          ...(data.project ? [{ icon: <FolderKanban />, label: <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.code}</Link> }] : []),
          ...(data.rfq ? [{ label: <Link href={`/rfqs/${data.rfq.id}`} className="hover:text-accent">For {data.rfq.number}</Link> }] : []),
          { icon: <CalendarDays />, label: `Valid until ${formatDate(data.validUntil) || "—"}` },
        ]}
        value={{ label: "Quotation total", amount: compactMoney(data.total) }}
        actions={
          <>
            {allowed(session, "quotations.download") ? (
              <Button variant="outline" onClick={() => download(`/quotations/${id}/pdf`, `${data.number}.pdf`)}>
                <Download /> PDF
              </Button>
            ) : null}
            {canAccept ? (
              <Button onClick={() => setConfirm(true)} disabled={expired}>
                <CheckCircle2 /> Accept quotation
              </Button>
            ) : null}
          </>
        }
      />

      {data.customerAcceptedAt ? <Notice tone="good">You accepted this quotation on {formatDate(data.customerAcceptedAt)}. Our team will confirm the order shortly.</Notice> : null}
      {canAccept && expired ? <Notice tone="warn">This quotation has expired. Ask your Fixotec contact for a revised offer.</Notice> : null}
      {data.salesOrders.length ? (
        <Notice tone="info">
          Ordered as{" "}
          {data.salesOrders.map((order) => (
            <Link key={order.id} href={`/orders/${order.id}`} className="font-medium underline">{order.number}</Link>
          ))}
          .
        </Notice>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card>
          <DataTable
            rows={data.items}
            rowKey={(row) => row.id}
            columns={[
              { key: "description", header: "Item", render: (row) => <div><p className="font-medium">{row.description}</p>{row.variant ? <p className="font-mono text-2xs text-muted">{row.variant.articleNumber}</p> : null}</div> },
              { key: "qty", header: "Qty", align: "right", render: (row) => <span className="tabular">{number(row.qty, 3)} {row.unit}</span> },
              { key: "basePrice", header: "Rate", align: "right", render: (row) => money(row.basePrice) },
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
                  ...(Number(data.discountPct) ? [{ label: `Discount (${Number(data.discountPct)}%)`, value: <span className="tabular text-success">- {money(discount)}</span> }] : []),
                  { label: "Freight", value: <span className="tabular">{money(data.freight)}</span> },
                  { label: "GST", value: <span className="tabular">{money(data.tax)}</span> },
                  { label: "Total", value: <span className="text-base font-semibold tabular">{money(data.total)}</span> },
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
                  { label: "Issued", value: formatDate(data.createdAt) },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      </div>

      <Modal
        open={confirm}
        onOpenChange={setConfirm}
        title="Accept this quotation?"
        description="Fixotec will be notified and will raise the sales order at the quoted prices."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirm(false)}>Cancel</Button>
            <Button
              loading={action.isPending}
              onClick={async () => {
                if (await action.submit({ path: `/quotations/${id}/accept` })) setConfirm(false);
              }}
            >
              Accept
            </Button>
          </>
        }
      >
        <KeyValueList items={[{ label: "Quotation", value: data.number }, { label: "Lines", value: data.items.length }, { label: "Total", value: money(data.total) }]} />
        {action.error ? <ErrorNote className="mt-3">{action.error.message}</ErrorNote> : null}
      </Modal>
    </Page>
  );
}
