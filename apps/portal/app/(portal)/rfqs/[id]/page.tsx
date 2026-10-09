"use client";

import { ActivityFeed, Card, CardBody, CardHeader, DataTable, DetailHeader, EmptyState, KeyValueList, Notice, Page, StatusPill, Stepper, Tabs, compactMoney, formatDate, humanize, money, number, type Step } from "@fixotec/ui";
import { CalendarDays, FileText, FolderKanban, UserRound } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { DateText, DocumentTile, PageSkeleton, QueryError, toActivity, type ActivityRow, type DocumentSummary } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { useApi } from "../../../../lib/query";

type Overview = {
  rfq: {
    id: string;
    number: string;
    status: string;
    priority: string;
    application?: string | null;
    notes?: string | null;
    dueDate?: string | null;
    createdAt: string;
    project?: { id: string; name: string; code: string } | null;
    assignee?: { name: string } | null;
    items: Array<{ id: string; description: string; qty: number | string; unit: string; specification?: string | null; variant?: { articleNumber: string } | null }>;
    quotations: Array<{ id: string; number: string; status: string; total: number | string; createdAt: string; validUntil?: string | null }>;
  };
  steps: Array<{ key: string; label: string }>;
  step: number;
  documents: DocumentSummary[];
};

export default function PortalRfqPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState("items");
  const overview = useApi<Overview>(`/rfqs/${id}/overview`);
  const activity = useApi<{ items: ActivityRow[] }>(tab === "activity" ? `/activity?entityType=rfq&entityId=${id}&limit=40` : null);

  if (overview.isLoading) return <PageSkeleton />;
  if (overview.error || !overview.data) return <Page><QueryError error={overview.error} /></Page>;
  const { rfq, steps, step, documents } = overview.data;
  const stepperSteps: Step[] = steps.map((item, index) => ({
    key: item.key,
    label: item.label,
    state: rfq.status === "LOST" && index === steps.length - 1 ? "blocked" : index < step ? "done" : index === step ? (step === steps.length - 1 && rfq.status === "WON" ? "done" : "current") : "upcoming",
  }));
  const latestQuote = rfq.quotations.find((quote) => ["SENT", "APPROVED", "ACCEPTED", "NEGOTIATION"].includes(quote.status));

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "RFQs", href: "/rfqs" }, { label: rfq.number }]}
        title={rfq.application || rfq.project?.name || "Request for quotation"}
        code={rfq.number}
        pills={<StatusPill status={rfq.status} />}
        meta={[
          ...(rfq.project ? [{ icon: <FolderKanban />, label: <Link href={`/projects/${rfq.project.id}`} className="hover:text-accent">{rfq.project.name}</Link> }] : []),
          { icon: <CalendarDays />, label: `Sent ${formatDate(rfq.createdAt)}` },
          ...(rfq.assignee ? [{ icon: <UserRound />, label: `Handled by ${rfq.assignee.name}` }] : []),
        ]}
        value={latestQuote ? { label: "Quoted value", amount: compactMoney(latestQuote.total) } : undefined}
      >
        <div className="overflow-x-auto pb-4 pt-2">
          <div className="min-w-[600px]">
            <Stepper steps={stepperSteps} current={step} />
          </div>
        </div>
        <Tabs
          items={[
            { key: "items", label: "Requested items", count: rfq.items.length },
            { key: "quotations", label: "Quotations", count: rfq.quotations.length },
            { key: "documents", label: "Documents", count: documents.length },
            { key: "activity", label: "Activity" },
          ]}
          value={tab}
          onChange={setTab}
        />
      </DetailHeader>

      {latestQuote ? (
        <Notice tone="good">
          Quotation {latestQuote.number} is ready.{" "}
          <Link href={`/quotations/${latestQuote.id}`} className="font-medium underline">Review it</Link>
        </Notice>
      ) : null}

      {tab === "items" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <Card>
            <DataTable
              rows={rfq.items}
              rowKey={(row) => row.id}
              columns={[
                { key: "description", header: "Item", render: (row) => <div><p className="font-medium">{row.description}</p>{row.specification ? <p className="text-xs text-muted">{row.specification}</p> : null}{row.variant ? <p className="font-mono text-2xs text-muted">{row.variant.articleNumber}</p> : null}</div> },
                { key: "qty", header: "Qty", align: "right", render: (row) => <span className="tabular">{number(row.qty, 3)} {row.unit}</span> },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Details" />
            <CardBody>
              <KeyValueList
                items={[
                  { label: "Priority", value: humanize(rfq.priority) },
                  { label: "Needed by", value: formatDate(rfq.dueDate) || "—" },
                  { label: "Application", value: rfq.application || "—" },
                  { label: "Notes", value: rfq.notes || "—" },
                ]}
              />
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "quotations" ? (
        <Card>
          <DataTable
            rows={rfq.quotations}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/quotations/${row.id}`)}
            empty={<p className="px-4 py-8 text-center text-sm text-muted">Our team is preparing your quotation.</p>}
            columns={[
              { key: "number", header: "Quotation", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "validUntil", header: "Valid until", render: (row) => <DateText value={row.validUntil} /> },
              { key: "total", header: "Total", align: "right", render: (row) => money(row.total) },
            ]}
          />
        </Card>
      ) : null}

      {tab === "documents" ? (
        documents.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {documents.map((doc) => (
              <DocumentTile key={doc.id} doc={doc} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<FileText />} title="No documents" description="Files shared on this RFQ will appear here." />
        )
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
