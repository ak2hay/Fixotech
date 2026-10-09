"use client";

import { Badge, Card, DataTable, DetailHeader, MiniStat, Page, StatusPill, formatDate, number } from "@fixotec/ui";
import { CalendarDays, CheckCircle2, FolderKanban, ListChecks, ListX } from "lucide-react";
import { useParams } from "next/navigation";
import { PageSkeleton, QueryError } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { useApi } from "../../../../lib/query";

type Boq = {
  id: string;
  number: string;
  title: string;
  status: string;
  source: string;
  createdAt: string;
  project?: { id: string; name: string; code: string } | null;
  items: Array<{ id: string; lineNo: number; description: string; qty: number | string; unit?: string | null; variant?: { articleNumber: string; name: string } | null }>;
};

export default function PortalBoqPage() {
  const { id } = useParams<{ id: string }>();
  const boq = useApi<Boq>(`/boq/${id}`);
  if (boq.isLoading) return <PageSkeleton />;
  if (boq.error || !boq.data) return <Page><QueryError error={boq.error} /></Page>;
  const data = boq.data;
  const matched = data.items.filter((item) => item.variant).length;

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "BOQ", href: "/boq" }, { label: data.number }]}
        title={data.title}
        code={data.number}
        pills={<StatusPill status={data.status} />}
        meta={[
          ...(data.project ? [{ icon: <FolderKanban />, label: <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.name}</Link> }] : []),
          { icon: <CalendarDays />, label: formatDate(data.createdAt) },
        ]}
      />
      <section className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Lines" value={data.items.length} icon={<ListChecks />} tone="accent" />
        <MiniStat label="Matched to articles" value={matched} icon={<CheckCircle2 />} tone="good" />
        <MiniStat label="Needs review" value={data.items.length - matched} icon={<ListX />} tone={data.items.length - matched ? "warn" : "good"} />
      </section>
      <Card>
        <DataTable
          rows={data.items}
          rowKey={(row) => row.id}
          columns={[
            { key: "lineNo", header: "#", render: (row) => <span className="text-muted tabular">{row.lineNo}</span> },
            { key: "description", header: "Description", render: (row) => <span className="font-medium">{row.description}</span> },
            { key: "qty", header: "Qty", align: "right", render: (row) => <span className="tabular">{number(row.qty, 3)} {row.unit || ""}</span> },
            { key: "variant", header: "Fixotec article", render: (row) => (row.variant ? <div><p className="font-mono text-xs">{row.variant.articleNumber}</p><p className="text-xs text-muted">{row.variant.name}</p></div> : <Badge tone="warn">Unmatched</Badge>) },
          ]}
        />
      </Card>
    </Page>
  );
}
