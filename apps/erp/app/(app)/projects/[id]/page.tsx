"use client";

import { ActivityFeed, Avatar, Button, Card, CardBody, CardHeader, DataTable, DetailHeader, EmptyState, Field, KeyValueList, Modal, Page, ProgressBar, Select, StatusPill, Stepper, Tabs, TextInput, compactMoney, formatDate, humanize, money, percent, type Step, ErrorNote } from "@fixotec/ui";
import { PROJECT_STAGES } from "@fixotec/shared";
import { Building2, CalendarDays, ClipboardList, FileText, MapPin, Pencil, Plus } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { DateText, DocumentTile, HealthPill, PageSkeleton, QueryError, toActivity, type ActivityRow, type DocumentSummary } from "../../../../components/common";
import { CrmPanel } from "../../../../components/crm";
import { Link } from "../../../../components/link";
import { UploadDocument } from "../../../../components/upload-document";
import { mediaUrl } from "../../../../lib/api";
import { useAction, useApi } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type Milestone = { key: string; label: string; status: string; plannedDate: string | null; actualDate: string | null };
type Overview = {
  project: { id: string; code: string; name: string; location?: string | null; stage: string; fixotecValue?: number | null; projectValue?: number | null; startDate?: string | null; expectedCompletion?: string | null; probability: number; notes?: string | null; coverUrl: string | null; customer: { id: string; name: string }; owner?: { name: string } | null };
  health: { status: string | null; progress: number; timeline: string; daysLeft: number | null; budgetUsed: number; billed: number; openIssues: number; pendingApprovals: number; nextMilestone: { label: string; plannedDate: string | null } | null };
  milestones: Milestone[];
  contacts: Array<{ role: string; name: string; email?: string | null; phone?: string | null; organisation: string }>;
  parties: Array<{ role: string; name: string }>;
  documents: DocumentSummary[];
  counts: Record<string, number>;
};
type Row = Record<string, unknown> & { id: string };
type ProjectFull = { rfqs: Row[]; quotations: Row[]; salesOrders: Array<Row & { dispatches: Row[]; invoices: Row[]; productionOrders: Row[] }>; boqs: Row[]; engineering: Row[]; siteIssues: Row[]; tickets: Row[]; submittals: Row[] };

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [tab, setTab] = useState("overview");
  const [editing, setEditing] = useState(false);
  const overview = useApi<Overview>(`/projects/${id}/overview`);
  const full = useApi<ProjectFull>(`/projects/${id}`);
  const activity = useApi<{ items: ActivityRow[] }>(tab === "overview" || tab === "activity" ? `/activity?entityType=project&entityId=${id}&limit=40` : null);

  if (overview.isLoading) return <PageSkeleton />;
  if (overview.error || !overview.data) return <Page><QueryError error={overview.error} /></Page>;
  const { project, health, milestones, contacts, parties, documents, counts } = overview.data;
  const data = full.data;
  const orders = data?.salesOrders || [];
  const dispatches = orders.flatMap((order) => order.dispatches.map((item) => ({ ...item, order: order.number })));
  const invoices = orders.flatMap((order) => order.invoices.map((item) => ({ ...item, order: order.number })));
  const production = orders.flatMap((order) => order.productionOrders.map((item) => ({ ...item, order: order.number })));
  const canEdit = session ? allowed(session, "projects.edit") : false;

  const doneCount = milestones.filter((item) => item.status === "DONE").length;
  const steps: Step[] = milestones.map((item) => ({ key: item.key, label: item.label, caption: formatDate(item.actualDate || item.plannedDate, "short") || "—", state: item.status === "DONE" ? "done" : item.status === "IN_PROGRESS" ? "current" : item.status === "BLOCKED" ? "blocked" : "upcoming" }));

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "rfqs", label: "RFQs", count: counts.rfqs },
    { key: "boq", label: "BOQ", count: counts.boqs },
    { key: "engineering", label: "Engineering", count: counts.engineering },
    { key: "quotations", label: "Quotation", count: counts.quotations },
    { key: "orders", label: "Orders", count: counts.salesOrders },
    { key: "production", label: "Production", count: counts.production },
    { key: "dispatch", label: "Dispatch", count: counts.dispatch },
    { key: "site", label: "Site", count: counts.siteIssues },
    { key: "documents", label: "Documents", count: counts.documents },
    { key: "finance", label: "Finance", count: counts.invoices },
    { key: "activity", label: "Activity" },
  ];

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
        value={{ label: "Project value", amount: compactMoney(project.fixotecValue) }}
        actions={
          <>
            {canEdit ? (
              <Button variant="outline" onClick={() => setEditing(true)}>
                <Pencil /> Edit
              </Button>
            ) : null}
            <Button variant="outline" onClick={() => router.push(`/rfqs?project=${project.id}`)}>
              <ClipboardList /> RFQs
            </Button>
            <Button onClick={() => setTab("documents")}>
              <FileText /> Documents
            </Button>
          </>
        }
      >
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </DetailHeader>

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[300px_1fr]">
          <Card>
            <CardHeader title="Project health" />
            <CardBody className="space-y-1">
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
                  { label: "Budget used", value: <span className="tabular">{percent(health.budgetUsed, 0)}</span> },
                  { label: "Open issues", value: <span className={health.openIssues ? "text-danger" : ""}>{health.openIssues}</span> },
                  { label: "Pending approvals", value: health.pendingApprovals },
                  { label: "Next milestone", value: health.nextMilestone ? <span>{health.nextMilestone.label}<span className="block text-xs font-normal text-muted">{formatDate(health.nextMilestone.plannedDate)}</span></span> : "Complete" },
                  { label: "Probability", value: `${project.probability}%` },
                ]}
              />
            </CardBody>
          </Card>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Project timeline" description={`${doneCount} of ${milestones.length} milestones complete`} />
              <CardBody className="overflow-x-auto pb-5 pt-3">
                <div className="min-w-[640px]">
                  <Stepper steps={steps} current={doneCount} />
                </div>
              </CardBody>
            </Card>
            <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
              <Card>
                <CardHeader title="Key contacts" />
                <CardBody className="space-y-3">
                  {contacts.map((contact, index) => (
                    <div key={`${contact.name}-${index}`} className="flex items-center gap-3">
                      <Avatar name={contact.name} size="md" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{contact.name}</p>
                        <p className="truncate text-xs text-muted">{contact.role} · {contact.organisation}</p>
                      </div>
                      {contact.email ? <a href={`mailto:${contact.email}`} className="text-xs text-accent hover:underline">Email</a> : null}
                    </div>
                  ))}
                  <div className="border-t border-line pt-3">
                    {parties.map((party) => (
                      <div key={party.role} className="flex justify-between py-1 text-xs">
                        <span className="text-muted">{party.role}</span>
                        <span className="font-medium">{party.name}</span>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
              <Card>
                <CardHeader title="Project documents" action={<button type="button" className="font-medium text-accent hover:underline" onClick={() => setTab("documents")}>View all</button>} />
                <CardBody>
                  {documents.length ? (
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                      {documents.slice(0, 4).map((doc) => <DocumentTile key={doc.id} doc={doc} />)}
                    </div>
                  ) : (
                    <EmptyState icon={<FileText />} title="No documents yet" />
                  )}
                </CardBody>
              </Card>
            </div>
            <Card>
              <CardHeader title="Recent activity" />
              <CardBody>
                <ActivityFeed items={toActivity(activity.data?.items.slice(0, 8))} LinkComponent={Link} />
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "rfqs" ? <TableCard rows={data?.rfqs} onOpen={(row) => router.push(`/rfqs/${row.id}`)} columns={[col("number", "RFQ"), col("application", "Application"), statusCol(), countCol("items", "Lines"), dateCol("createdAt", "Created")]} /> : null}
      {tab === "boq" ? <TableCard rows={data?.boqs} columns={[col("number", "BOQ"), col("title", "Title"), col("source", "Source"), statusCol(), countCol("items", "Lines")]} /> : null}
      {tab === "engineering" ? <TableCard rows={data?.engineering} onOpen={(row) => router.push(`/engineering/${row.id}`)} columns={[col("number", "Request"), col("application", "Application"), col("requiredSystem", "System"), { key: "engineer", header: "Engineer", render: (row) => String((row.engineer as { name?: string })?.name || "—") }, statusCol(), dateCol("dueDate", "Due")]} /> : null}
      {tab === "quotations" ? <TableCard rows={data?.quotations} onOpen={(row) => router.push(`/quotations/${row.id}`)} columns={[col("number", "Quotation"), statusCol(), moneyCol("total", "Total"), dateCol("validUntil", "Valid until")]} /> : null}
      {tab === "orders" ? <TableCard rows={orders} onOpen={(row) => router.push(`/sales-orders/${row.id}`)} columns={[col("number", "Order"), statusCol(), moneyCol("total", "Total"), countCol("items", "Lines"), dateCol("createdAt", "Created")]} /> : null}
      {tab === "production" ? <TableCard rows={production} columns={[col("number", "Production order"), col("order", "Sales order"), statusCol(), col("qty", "Qty"), col("completedQty", "Completed")]} /> : null}
      {tab === "dispatch" ? <TableCard rows={dispatches} columns={[col("number", "Dispatch"), col("order", "Sales order"), statusCol(), col("transporter", "Transporter"), col("lrNumber", "LR no."), dateCol("shippedAt", "Shipped"), dateCol("deliveredAt", "Delivered")]} /> : null}
      {tab === "site" ? <TableCard rows={data?.siteIssues} columns={[col("number", "Issue"), col("title", "Title"), statusCol(), { key: "shortage", header: "Shortage", render: (row) => (row.shortage ? "Yes" : "No") }, dateCol("createdAt", "Raised")]} /> : null}
      {tab === "finance" ? <TableCard rows={invoices} columns={[col("number", "Invoice"), col("order", "Sales order"), statusCol(), moneyCol("total", "Total"), dateCol("dueDate", "Due")]} /> : null}
      {tab === "documents" ? <ProjectDocuments projectId={project.id} /> : null}
      {tab === "activity" ? (
        <>
          <CrmPanel entityType="project" entityId={project.id} record={project as unknown as Record<string, unknown>} />
          <Card>
            <CardHeader title="Audit trail" />
            <CardBody className="pt-4">
              <ActivityFeed items={toActivity(activity.data?.items)} LinkComponent={Link} />
            </CardBody>
          </Card>
        </>
      ) : null}

      <EditProject open={editing} onOpenChange={setEditing} project={project} />
    </Page>
  );
}

function col(key: string, header: string) {
  return { key, header, render: (row: Row) => <span className={key === "number" ? "font-medium" : ""}>{String(row[key] ?? "—")}</span> };
}
function statusCol() {
  return { key: "status", header: "Status", render: (row: Row) => <StatusPill status={String(row.status || "")} /> };
}
function moneyCol(key: string, header: string) {
  return { key, header, align: "right" as const, sortValue: (row: Row) => Number(row[key] || 0), render: (row: Row) => money(row[key]) };
}
function dateCol(key: string, header: string) {
  return { key, header, sortValue: (row: Row) => String(row[key] || ""), render: (row: Row) => <DateText value={row[key] as string} /> };
}
function countCol(key: string, header: string) {
  return { key, header, align: "right" as const, render: (row: Row) => ((row[key] as unknown[]) || []).length };
}

function TableCard({ rows, columns, onOpen }: { rows?: Row[]; columns: Array<{ key: string; header: string; render?: (row: Row) => React.ReactNode; align?: "left" | "right"; sortValue?: (row: Row) => string | number }>; onOpen?: (row: Row) => void }) {
  return (
    <Card>
      <DataTable rows={rows || []} loading={!rows} rowKey={(row) => row.id} onRowClick={onOpen} columns={columns} />
    </Card>
  );
}

function ProjectDocuments({ projectId }: { projectId: string }) {
  const { data, isLoading } = useApi<{ items: Array<{ id: string; title: string; category: string; updatedAt: string; versions: Array<{ version: number; status: string; sizeBytes: number; thumbnailKey?: string | null }> }> }>(`/documents?entityType=project&entityId=${projectId}`);
  const [upload, setUpload] = useState(false);
  const docs: DocumentSummary[] = (data?.items || []).map((doc) => ({ id: doc.id, title: doc.title, category: doc.category, version: doc.versions[0]?.version, status: doc.versions[0]?.status, sizeBytes: doc.versions[0]?.sizeBytes, hasThumbnail: Boolean(doc.versions[0]?.thumbnailKey) }));
  return (
    <Card>
      <CardHeader title="Documents" description="Drawings, BIM, submittals and site records" action={<Button size="sm" onClick={() => setUpload(true)}><Plus /> Upload</Button>} />
      <CardBody>
        {isLoading ? null : docs.length ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
            {docs.map((doc) => <DocumentTile key={doc.id} doc={doc} />)}
          </div>
        ) : (
          <EmptyState icon={<FileText />} title="No documents" description="Upload drawings, BIM models and submittals for this project." />
        )}
      </CardBody>
      <UploadDocument open={upload} onOpenChange={setUpload} entityType="project" entityId={projectId} />
    </Card>
  );
}

function EditProject({ open, onOpenChange, project }: { open: boolean; onOpenChange: (open: boolean) => void; project: Overview["project"] }) {
  const action = useAction([`/projects`, "/activity"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
      if (value === "") continue;
      body[key] = ["fixotecValue", "projectValue", "probability"].includes(key) ? Number(value) : value;
    }
    body.health = form.get("health") || null;
    await action.mutateAsync({ path: `/projects/${project.id}`, method: "PATCH", body });
    onOpenChange(false);
  }
  const date = (value?: string | null) => (value ? value.slice(0, 10) : "");
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Edit project" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="edit-project" loading={action.isPending}>Save changes</Button></>}>
      <form id="edit-project" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" className="sm:col-span-2"><TextInput name="name" defaultValue={project.name} /></Field>
        <Field label="Location"><TextInput name="location" defaultValue={project.location || ""} /></Field>
        <Field label="Stage"><Select name="stage" defaultValue={project.stage}>{PROJECT_STAGES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select></Field>
        <Field label="Fixotec value"><TextInput name="fixotecValue" type="number" defaultValue={project.fixotecValue ?? ""} /></Field>
        <Field label="Probability %"><TextInput name="probability" type="number" min={0} max={100} defaultValue={project.probability} /></Field>
        <Field label="Start date"><TextInput name="startDate" type="date" defaultValue={date(project.startDate)} /></Field>
        <Field label="Expected completion"><TextInput name="expectedCompletion" type="date" defaultValue={date(project.expectedCompletion)} /></Field>
        <Field label="Health override" className="sm:col-span-2" hint="Leave automatic unless the computed health is wrong">
          <Select name="health" defaultValue="">
            <option value="">Automatic</option>
            <option value="ON_TRACK">On Track</option>
            <option value="AT_RISK">At Risk</option>
            <option value="DELAYED">Delayed</option>
          </Select>
        </Field>
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
