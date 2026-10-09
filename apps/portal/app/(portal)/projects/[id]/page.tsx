"use client";

import { ActivityFeed, Avatar, Button, Card, CardBody, CardHeader, DataTable, DetailHeader, EmptyState, KeyValueList, Page, ProgressBar, StatusPill, Stepper, Tabs, compactMoney, formatDate, money, type Step } from "@fixotec/ui";
import { Building2, CalendarDays, FileText, MapPin, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { DateText, DocumentTile, HealthPill, PageSkeleton, QueryError, toActivity, type ActivityRow, type DocumentSummary } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { mediaUrl } from "../../../../lib/api";
import { useApi, type Paged } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Milestone = { key: string; label: string; status: string; plannedDate: string | null; actualDate: string | null };
type Overview = {
  project: { id: string; code: string; name: string; location?: string | null; stage: string; fixotecValue?: number | null; startDate?: string | null; expectedCompletion?: string | null; coverUrl: string | null; customer: { id: string; name: string } };
  health: { status: string | null; progress: number; timeline: string; daysLeft: number | null; openIssues: number; nextMilestone: { label: string; plannedDate: string | null } | null };
  milestones: Milestone[];
  contacts: Array<{ role: string; name: string; email?: string | null; phone?: string | null; organisation: string }>;
  documents: DocumentSummary[];
  counts: Record<string, number>;
};
type Row = { id: string; number: string; status: string; total?: number | string; createdAt: string; dueDate?: string | null; application?: string | null };

export default function PortalProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [tab, setTab] = useState("overview");
  const overview = useApi<Overview>(`/projects/${id}/overview`);
  const canRfq = allowed(session, "rfqs.view");
  const canQuote = allowed(session, "quotations.view");
  const canOrder = allowed(session, "sales_orders.view");
  const rfqs = useApi<Paged<Row>>(tab === "rfqs" && canRfq ? `/rfqs?projectId=${id}&pageSize=50` : null);
  const quotes = useApi<Paged<Row>>(tab === "quotations" && canQuote ? `/quotations?projectId=${id}&pageSize=50` : null);
  const orders = useApi<Paged<Row>>(tab === "orders" && canOrder ? `/sales-orders?projectId=${id}&pageSize=50` : null);
  const activity = useApi<{ items: ActivityRow[] }>(tab === "overview" || tab === "activity" ? `/activity?entityType=project&entityId=${id}&limit=30` : null);

  if (overview.isLoading) return <PageSkeleton />;
  if (overview.error || !overview.data) return <Page><QueryError error={overview.error} /></Page>;
  const { project, health, milestones, contacts, documents, counts } = overview.data;
  const steps: Step[] = milestones.map((item) => ({ key: item.key, label: item.label, caption: formatDate(item.actualDate || item.plannedDate, "short") || "—", state: item.status === "DONE" ? "done" : item.status === "IN_PROGRESS" ? "current" : item.status === "BLOCKED" ? "blocked" : "upcoming" }));
  const current = Math.max(0, milestones.findIndex((item) => item.status !== "DONE"));

  const tabs = [
    { key: "overview", label: "Overview" },
    ...(canRfq ? [{ key: "rfqs", label: "RFQs", count: counts.rfqs }] : []),
    ...(canQuote ? [{ key: "quotations", label: "Quotations", count: counts.quotations }] : []),
    ...(canOrder ? [{ key: "orders", label: "Orders", count: counts.salesOrders }] : []),
    { key: "documents", label: "Documents", count: counts.documents },
    { key: "activity", label: "Activity" },
  ];

  const recordTable = (rows: Row[] | undefined, loading: boolean, base: string, empty: string) => (
    <Card>
      <DataTable
        rows={rows || []}
        rowKey={(row) => row.id}
        loading={loading}
        onRowClick={(row) => router.push(`${base}/${row.id}`)}
        empty={<p className="px-4 py-8 text-center text-sm text-muted">{empty}</p>}
        columns={[
          { key: "number", header: "Number", render: (row) => <span className="font-medium">{row.number}</span> },
          { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
          { key: "createdAt", header: "Created", render: (row) => <DateText value={row.createdAt} /> },
          { key: "total", header: "Value", align: "right", render: (row) => (row.total !== undefined ? money(row.total) : "—") },
        ]}
      />
    </Card>
  );

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.code }]}
        title={project.name}
        code={project.code}
        pills={<HealthPill health={health.status} />}
        image={mediaUrl(project.coverUrl)}
        meta={[
          { icon: <Building2 />, label: project.customer.name },
          ...(project.location ? [{ icon: <MapPin />, label: project.location }] : []),
          { icon: <CalendarDays />, label: `${formatDate(project.startDate) || "—"} - ${formatDate(project.expectedCompletion) || "—"}` },
        ]}
        value={project.fixotecValue ? { label: "Fixotec scope", amount: compactMoney(project.fixotecValue) } : undefined}
        actions={
          <>
            {allowed(session, "rfqs.create") ? (
              <Button variant="outline" onClick={() => router.push(`/rfqs/new?project=${project.id}`)}>
                <Plus /> Request quotation
              </Button>
            ) : null}
            <Button onClick={() => setTab("documents")}>
              <FileText /> Documents
            </Button>
          </>
        }
      >
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </DetailHeader>

      {tab === "overview" ? (
        <>
          {steps.length ? (
            <Card>
              <CardHeader title="Milestones" />
              <CardBody className="overflow-x-auto">
                <div className="min-w-[640px]">
                  <Stepper steps={steps} current={current} />
                </div>
              </CardBody>
            </Card>
          ) : null}
          <div className="grid gap-4 xl:grid-cols-[300px_1fr_320px]">
            <Card>
              <CardHeader title="Project health" />
              <CardBody>
                <div className="mb-3 space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Overall progress</span>
                    <span className="font-semibold tabular">{health.progress}%</span>
                  </div>
                  <ProgressBar value={health.progress} tone="good" />
                </div>
                <KeyValueList
                  items={[
                    { label: "Timeline", value: <span className={health.daysLeft !== null && health.daysLeft < 0 ? "text-danger" : "text-success"}>{health.timeline}</span> },
                    { label: "Open site issues", value: <span className={health.openIssues ? "text-danger" : ""}>{health.openIssues}</span> },
                    { label: "Next milestone", value: health.nextMilestone ? <span>{health.nextMilestone.label}<span className="block text-xs font-normal text-muted">{formatDate(health.nextMilestone.plannedDate)}</span></span> : "Complete" },
                  ]}
                />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Recent activity" />
              <CardBody>
                <ActivityFeed items={toActivity(activity.data?.items)} compact LinkComponent={Link} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Key contacts" />
              <CardBody className="space-y-3">
                {contacts.length ? (
                  contacts.map((contact) => (
                    <div key={`${contact.role}-${contact.name}`} className="flex items-center gap-3">
                      <Avatar name={contact.name} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{contact.name}</p>
                        <p className="truncate text-xs text-muted">{contact.role} · {contact.organisation}</p>
                        {contact.email ? <a href={`mailto:${contact.email}`} className="truncate text-xs text-accent hover:underline">{contact.email}</a> : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted">No contacts yet.</p>
                )}
              </CardBody>
            </Card>
          </div>
        </>
      ) : null}

      {tab === "rfqs" ? recordTable(rfqs.data?.items, rfqs.isLoading, "/rfqs", "No RFQs for this project.") : null}
      {tab === "quotations" ? recordTable(quotes.data?.items, quotes.isLoading, "/quotations", "No quotations yet.") : null}
      {tab === "orders" ? recordTable(orders.data?.items, orders.isLoading, "/orders", "No orders yet.") : null}

      {tab === "documents" ? (
        documents.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {documents.map((doc) => (
              <DocumentTile key={doc.id} doc={doc} />
            ))}
          </div>
        ) : (
          <EmptyState icon={<FileText />} title="No documents shared yet" description="Drawings, submittals and certificates will appear here." />
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
