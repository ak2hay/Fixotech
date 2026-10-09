"use client";

import { Badge, Button, Card, DataTable, DetailHeader, ErrorNote, Page, StatusPill, compactMoney, formatDate, money, number } from "@fixotec/ui";
import { Building2, CalendarDays, ClipboardList } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { PageSkeleton, QueryError } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { useAction, useApi } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Boq = {
  id: string;
  number: string;
  title: string;
  source: string;
  status: string;
  createdAt: string;
  project?: { id: string; name: string; code: string } | null;
  rfq?: { id: string; number: string } | null;
  items: Array<{ id: string; lineNo: number; description: string; qty: number | string; unit: string; rate: number | string; amount: number | string; variant?: { articleNumber: string; name: string } | null }>;
};

export default function BoqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const boq = useApi<Boq>(`/boq/${id}`);
  const action = useAction<unknown, { id: string }>(["/boq", "/rfqs"]);

  if (boq.isLoading) return <PageSkeleton />;
  if (boq.error || !boq.data) return <Page><QueryError error={boq.error} /></Page>;
  const data = boq.data;
  const total = data.items.reduce((sum, item) => sum + Number(item.amount), 0);
  const matched = data.items.filter((item) => item.variant).length;

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "BOQ", href: "/boq" }, { label: data.number }]}
        title={data.title}
        code={data.number}
        pills={
          <>
            <StatusPill status={data.status} />
            <Badge tone={matched === data.items.length ? "good" : "warn"}>{matched}/{data.items.length} matched</Badge>
          </>
        }
        meta={[
          ...(data.project ? [{ icon: <Building2 />, label: <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.name}</Link> }] : []),
          ...(data.rfq ? [{ label: <Link href={`/rfqs/${data.rfq.id}`} className="hover:text-accent">Converted to {data.rfq.number}</Link> }] : []),
          { icon: <CalendarDays />, label: `${data.source} · ${formatDate(data.createdAt)}` },
        ]}
        value={{ label: "BOQ value", amount: compactMoney(total) }}
        actions={
          !data.rfq && allowed(session, "rfqs.create") && data.items.length ? (
            <Button
              loading={action.isPending}
              onClick={async () => {
                const rfq = await action.mutateAsync({ path: `/boq/${id}/rfq` });
                router.push(`/rfqs/${rfq.id}`);
              }}
            >
              <ClipboardList /> Convert to RFQ
            </Button>
          ) : null
        }
      />
      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      <Card>
        <DataTable
          rows={data.items}
          rowKey={(row) => row.id}
          empty="No lines. PDF BOQs need their lines entered manually."
          columns={[
            { key: "lineNo", header: "#", render: (row) => <span className="text-muted">{row.lineNo}</span> },
            { key: "description", header: "Description", render: (row) => <div><p className="font-medium">{row.description}</p>{row.variant ? <p className="font-mono text-2xs text-success">{row.variant.articleNumber}</p> : <p className="text-2xs text-warning">Not matched</p>}</div> },
            { key: "qty", header: "Qty", align: "right", render: (row) => <span className="tabular">{number(row.qty, 3)} {row.unit}</span> },
            { key: "rate", header: "Rate", align: "right", render: (row) => money(row.rate) },
            { key: "amount", header: "Amount", align: "right", render: (row) => <span className="font-semibold">{money(row.amount)}</span> },
          ]}
        />
      </Card>
    </Page>
  );
}
