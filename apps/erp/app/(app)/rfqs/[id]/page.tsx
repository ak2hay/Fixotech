"use client";

import { RFQ_PRIORITIES, RFQ_STATUSES } from "@fixotec/shared";
import { ActivityFeed, Badge, Button, Card, CardBody, CardHeader, DataTable, DetailHeader, EmptyState, ErrorNote, Field, KeyValueList, Modal, Notice, Page, Select, StatusPill, Stepper, Tabs, TextArea, TextInput, compactMoney, formatDate, humanize, money, number, type Step } from "@fixotec/ui";
import { Building2, CalendarDays, Calculator, FileText, FolderKanban, Plus, Ruler, UserPlus, Wrench } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { DateText, DocumentTile, DueText, PageSkeleton, QueryError, priorityTone, toActivity, type ActivityRow, type DocumentSummary } from "../../../../components/common";
import { Link } from "../../../../components/link";
import { UploadDocument } from "../../../../components/upload-document";
import { useAction, useApi, type Paged } from "../../../../lib/query";
import { allowed, useSession } from "../../../../lib/session";

type RfqItem = { id: string; description: string; qty: number | string; unit: string; specification?: string | null; variant?: { articleNumber: string; name: string; product?: { id: string; name: string; applications: string[] } } | null };
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
    customer?: { id: string; name: string; code: string; priceList?: string } | null;
    project?: { id: string; name: string; code: string; location?: string | null } | null;
    assignee?: { id: string; name: string } | null;
    lead?: { id: string; number: string; source: string } | null;
    items: RfqItem[];
    quotations: Array<{ id: string; number: string; status: string; total: number | string; createdAt: string; validUntil?: string | null }>;
    engineering: Array<{ id: string; number: string; status: string; engineer?: { name: string } | null; dueDate?: string | null }>;
    boqs: Array<{ id: string; number: string; title: string; status: string; _count: { items: number } }>;
  };
  steps: Array<{ key: string; label: string }>;
  step: number;
  dueStatus: "OVERDUE" | "DUE_TODAY" | "UPCOMING" | null;
  estimatedValue: number;
  documents: DocumentSummary[];
};

export default function RfqDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useSession();
  const [tab, setTab] = useState("overview");
  const [dialog, setDialog] = useState<"" | "quote" | "assign" | "status" | "engineering" | "upload">("");
  const overview = useApi<Overview>(`/rfqs/${id}/overview`);
  const activity = useApi<{ items: ActivityRow[] }>(tab === "overview" || tab === "activity" ? `/activity?entityType=rfq&entityId=${id}&limit=40` : null);

  if (overview.isLoading) return <PageSkeleton />;
  if (overview.error || !overview.data) return <Page><QueryError error={overview.error} /></Page>;
  const { rfq, steps, step, dueStatus, estimatedValue, documents } = overview.data;
  const can = (permission: string) => allowed(session, permission);
  const closed = ["WON", "LOST", "CANCELLED"].includes(rfq.status);

  const stepperSteps: Step[] = steps.map((item, index) => ({
    key: item.key,
    label: item.label,
    state: rfq.status === "LOST" && index === steps.length - 1 ? "blocked" : index < step ? "done" : index === step ? (step === steps.length - 1 && rfq.status === "WON" ? "done" : "current") : "upcoming",
  }));

  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "items", label: "Requested products", count: rfq.items.length },
    { key: "quotations", label: "Quotations", count: rfq.quotations.length },
    { key: "engineering", label: "Engineering", count: rfq.engineering.length + rfq.boqs.length },
    { key: "documents", label: "Documents", count: documents.length },
    { key: "activity", label: "Activity" },
  ];

  return (
    <Page>
      <DetailHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: "RFQs", href: "/rfqs" }, { label: rfq.number }]}
        title={rfq.application || rfq.number}
        code={rfq.number}
        pills={
          <>
            <StatusPill status={rfq.status} />
            <Badge tone={priorityTone(rfq.priority)}>{humanize(rfq.priority)} priority</Badge>
            {dueStatus === "OVERDUE" ? <Badge tone="bad" dot>Overdue</Badge> : dueStatus === "DUE_TODAY" ? <Badge tone="warn" dot>Due today</Badge> : null}
          </>
        }
        meta={[
          { icon: <Building2 />, label: rfq.customer?.name || "No customer" },
          ...(rfq.project ? [{ icon: <FolderKanban />, label: <Link href={`/projects/${rfq.project.id}`} className="hover:text-accent">{rfq.project.name}</Link> }] : []),
          { icon: <CalendarDays />, label: <>Due <DueText value={rfq.dueDate} /></> },
        ]}
        value={{ label: rfq.quotations.length ? "Quoted value" : "Estimated value", amount: compactMoney(estimatedValue) }}
        actions={
          <>
            {can("rfqs.edit") && !closed ? (
              <Button variant="outline" onClick={() => setDialog("assign")}>
                <UserPlus /> Assign
              </Button>
            ) : null}
            {can("quotations.create") && !closed ? (
              <Button onClick={() => setDialog("quote")}>
                <Calculator /> Generate quotation
              </Button>
            ) : null}
          </>
        }
      >
        <div className="overflow-x-auto pb-4 pt-2">
          <div className="min-w-[720px]">
            <Stepper steps={stepperSteps} current={step} />
          </div>
        </div>
        <Tabs items={tabs} value={tab} onChange={setTab} />
      </DetailHeader>

      {tab === "overview" ? (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Card>
              <CardHeader title="RFQ information" />
              <CardBody>
                <KeyValueList
                  columns={2}
                  items={[
                    { label: "Customer", value: rfq.customer ? <Link href={`/customers/${rfq.customer.id}`} className="hover:text-accent">{rfq.customer.name}</Link> : "—" },
                    { label: "Customer code", value: rfq.customer?.code || "—" },
                    { label: "Project", value: rfq.project ? `${rfq.project.code} · ${rfq.project.name}` : "—" },
                    { label: "Location", value: rfq.project?.location || "—" },
                    { label: "Received", value: formatDate(rfq.createdAt) },
                    { label: "Due date", value: <DueText value={rfq.dueDate} /> },
                    { label: "Owner", value: rfq.assignee?.name || "Unassigned" },
                    { label: "Source", value: rfq.lead ? `${rfq.lead.number} (${humanize(rfq.lead.source)})` : "Direct" },
                    { label: "Price list", value: humanize(rfq.customer?.priceList || "STANDARD") },
                    { label: "Lines", value: rfq.items.length },
                  ]}
                />
                {rfq.notes ? <p className="mt-4 rounded-md bg-canvas p-3 text-sm text-muted">{rfq.notes}</p> : null}
              </CardBody>
            </Card>
            <ItemsCard items={rfq.items} limit={6} onMore={() => setTab("items")} />
            <Card>
              <CardHeader title="Recent activity" />
              <CardBody>
                <ActivityFeed items={toActivity(activity.data?.items.slice(0, 8))} LinkComponent={Link} />
              </CardBody>
            </Card>
          </div>
          <div className="space-y-4">
            <Card>
              <CardHeader title="Actions" />
              <CardBody className="grid gap-2">
                {can("quotations.create") && !closed ? <Button className="justify-start" onClick={() => setDialog("quote")}><Calculator /> Generate quotation</Button> : null}
                {can("engineering.create") && !closed ? <Button variant="outline" className="justify-start" onClick={() => setDialog("engineering")}><Ruler /> Request engineering review</Button> : null}
                {can("rfqs.edit") ? <Button variant="outline" className="justify-start" onClick={() => setDialog("status")}><Wrench /> Update status</Button> : null}
                {can("rfqs.edit") && !closed ? <Button variant="outline" className="justify-start" onClick={() => setDialog("assign")}><UserPlus /> Assign owner</Button> : null}
                {can("documents.create") ? <Button variant="outline" className="justify-start" onClick={() => setDialog("upload")}><Plus /> Upload document</Button> : null}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Quotations" />
              <CardBody className="space-y-2">
                {rfq.quotations.length ? rfq.quotations.map((quote) => (
                  <Link key={quote.id} href={`/quotations/${quote.id}`} className="flex items-center justify-between rounded-md border border-line px-3 py-2 hover:border-accent/50">
                    <span>
                      <span className="block text-sm font-medium">{quote.number}</span>
                      <span className="text-xs text-muted">{formatDate(quote.createdAt, "short")}</span>
                    </span>
                    <span className="text-right">
                      <span className="block text-sm font-semibold tabular">{compactMoney(quote.total)}</span>
                      <StatusPill status={quote.status} />
                    </span>
                  </Link>
                )) : <p className="text-sm text-muted">No quotation yet.</p>}
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Documents" action={<button type="button" className="font-medium text-accent hover:underline" onClick={() => setTab("documents")}>View all</button>} />
              <CardBody>
                {documents.length ? (
                  <div className="grid grid-cols-2 gap-3">{documents.slice(0, 4).map((doc) => <DocumentTile key={doc.id} doc={doc} />)}</div>
                ) : (
                  <p className="text-sm text-muted">No documents attached.</p>
                )}
              </CardBody>
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "items" ? <ItemsCard items={rfq.items} /> : null}

      {tab === "quotations" ? (
        <Card>
          <DataTable
            rows={rfq.quotations}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/quotations/${row.id}`)}
            empty="No quotations yet."
            columns={[
              { key: "number", header: "Quotation", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "total", header: "Total", align: "right", render: (row) => money(row.total) },
              { key: "createdAt", header: "Created", render: (row) => <DateText value={row.createdAt} /> },
              { key: "validUntil", header: "Valid until", render: (row) => <DateText value={row.validUntil} /> },
            ]}
          />
        </Card>
      ) : null}

      {tab === "engineering" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Engineering requests" />
            <DataTable
              rows={rfq.engineering}
              rowKey={(row) => row.id}
              onRowClick={(row) => router.push(`/engineering/${row.id}`)}
              empty="No engineering review requested."
              columns={[
                { key: "number", header: "Request", render: (row) => <span className="font-medium">{row.number}</span> },
                { key: "engineer", header: "Engineer", render: (row) => row.engineer?.name || "—" },
                { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
                { key: "dueDate", header: "Due", render: (row) => <DueText value={row.dueDate} /> },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Bills of quantities" />
            <DataTable
              rows={rfq.boqs}
              rowKey={(row) => row.id}
              empty="No BOQ linked."
              columns={[
                { key: "number", header: "BOQ", render: (row) => <span className="font-medium">{row.number}</span> },
                { key: "title", header: "Title" },
                { key: "lines", header: "Lines", align: "right", render: (row) => row._count.items },
                { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              ]}
            />
          </Card>
        </div>
      ) : null}

      {tab === "documents" ? (
        <Card>
          <CardHeader title="Documents" action={<Button size="sm" onClick={() => setDialog("upload")}><Plus /> Upload</Button>} />
          <CardBody>
            {documents.length ? (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{documents.map((doc) => <DocumentTile key={doc.id} doc={doc} />)}</div>
            ) : (
              <EmptyState icon={<FileText />} title="No documents" description="Attach drawings, specifications or the customer's enquiry." />
            )}
          </CardBody>
        </Card>
      ) : null}

      {tab === "activity" ? (
        <Card>
          <CardBody className="pt-4">
            <ActivityFeed items={toActivity(activity.data?.items)} LinkComponent={Link} />
          </CardBody>
        </Card>
      ) : null}

      <GenerateQuote open={dialog === "quote"} onOpenChange={(open) => setDialog(open ? "quote" : "")} rfq={rfq} onCreated={(quoteId) => router.push(`/quotations/${quoteId}`)} />
      <AssignOwner open={dialog === "assign"} onOpenChange={(open) => setDialog(open ? "assign" : "")} rfq={rfq} canList={can("users.view")} selfId={session?.user.id} />
      <UpdateStatus open={dialog === "status"} onOpenChange={(open) => setDialog(open ? "status" : "")} rfq={rfq} />
      <RequestEngineering open={dialog === "engineering"} onOpenChange={(open) => setDialog(open ? "engineering" : "")} rfq={rfq} />
      <UploadDocument open={dialog === "upload"} onOpenChange={(open) => setDialog(open ? "upload" : "")} entityType="rfq" entityId={rfq.id} defaultCategory="SPECIFICATION" />
    </Page>
  );
}

function ItemsCard({ items, limit, onMore }: { items: RfqItem[]; limit?: number; onMore?: () => void }) {
  const rows = limit ? items.slice(0, limit) : items;
  return (
    <Card>
      <CardHeader
        title="Requested products"
        description={`${items.length} line${items.length === 1 ? "" : "s"}`}
        action={limit && items.length > limit ? <button type="button" className="font-medium text-accent hover:underline" onClick={onMore}>View all</button> : null}
      />
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        empty="No lines on this RFQ."
        columns={[
          { key: "line", header: "#", render: (row) => <span className="text-muted">{items.indexOf(row) + 1}</span> },
          {
            key: "description",
            header: "Product",
            render: (row) => (
              <div>
                <p className="font-medium">{row.description}</p>
                {row.variant ? <p className="font-mono text-2xs text-muted">{row.variant.articleNumber}</p> : <p className="text-2xs text-warning">Not matched to catalogue</p>}
              </div>
            ),
          },
          { key: "specification", header: "Specification", render: (row) => <span className="text-muted">{row.specification || "—"}</span> },
          { key: "qty", header: "Qty", align: "right", render: (row) => <span className="tabular">{number(row.qty, 3)} {row.unit}</span> },
        ]}
      />
    </Card>
  );
}

function GenerateQuote({ open, onOpenChange, rfq, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; rfq: Overview["rfq"]; onCreated: (id: string) => void }) {
  const action = useAction<Record<string, unknown>, { id: string }>([`/rfqs`, "/quotations", "/activity"]);
  const unmatched = rfq.items.filter((item) => !item.variant).length;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { discountPct: Number(form.get("discountPct") || 0), freight: Number(form.get("freight") || 0), validDays: Number(form.get("validDays") || 15), paymentTerms: String(form.get("paymentTerms") || "") || undefined, deliveryTerms: String(form.get("deliveryTerms") || "") || undefined };
    const quote = await action.mutateAsync({ path: `/rfqs/${rfq.id}/quotation`, body });
    onOpenChange(false);
    onCreated(quote.id);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Generate quotation" description="Prices come from the customer's price list. Discounts above policy go to approval when submitted." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="gen-quote" loading={action.isPending}>Generate</Button></>}>
      <form id="gen-quote" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        {!rfq.customer ? <ErrorNote className="sm:col-span-2">Link this RFQ to a customer before pricing it.</ErrorNote> : null}
        {unmatched ? <Notice tone="warn" className="sm:col-span-2">{unmatched} line{unmatched === 1 ? " is" : "s are"} not matched to the catalogue and will be priced at zero.</Notice> : null}
        <Field label="Discount %"><TextInput name="discountPct" type="number" min={0} max={100} step="0.5" defaultValue={0} /></Field>
        <Field label="Freight (INR)"><TextInput name="freight" type="number" min={0} defaultValue={0} /></Field>
        <Field label="Valid for (days)"><TextInput name="validDays" type="number" min={1} defaultValue={15} /></Field>
        <Field label="Delivery terms"><TextInput name="deliveryTerms" placeholder="Ex-works Pune" /></Field>
        <Field label="Payment terms" className="sm:col-span-2"><TextInput name="paymentTerms" placeholder="Customer default" /></Field>
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function AssignOwner({ open, onOpenChange, rfq, canList, selfId }: { open: boolean; onOpenChange: (open: boolean) => void; rfq: Overview["rfq"]; canList: boolean; selfId?: string }) {
  const users = useApi<Paged<{ id: string; name: string; kind: string; jobTitle?: string | null; active: boolean }>>(open && canList ? "/users?pageSize=100" : null);
  const action = useAction([`/rfqs`, "/activity"]);
  const [assigneeId, setAssigneeId] = useState(rfq.assignee?.id || selfId || "");
  const [dueDate, setDueDate] = useState(rfq.dueDate ? rfq.dueDate.slice(0, 10) : "");
  const [priority, setPriority] = useState(rfq.priority);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await action.mutateAsync({ path: `/rfqs/${rfq.id}`, method: "PATCH", body: { assigneeId: assigneeId || undefined, dueDate: dueDate || null, priority } });
    onOpenChange(false);
  }
  const staff = (users.data?.items || []).filter((user) => user.kind !== "EXTERNAL" && user.active);
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Assign RFQ" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="assign-rfq" loading={action.isPending}>Save</Button></>}>
      <form id="assign-rfq" onSubmit={submit} className="grid gap-4">
        <Field label="Owner">
          {canList ? (
            <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">Unassigned</option>
              {staff.map((user) => <option key={user.id} value={user.id}>{user.name}{user.jobTitle ? ` · ${user.jobTitle}` : ""}</option>)}
            </Select>
          ) : (
            <Select value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              {rfq.assignee ? <option value={rfq.assignee.id}>{rfq.assignee.name}</option> : null}
              {selfId && selfId !== rfq.assignee?.id ? <option value={selfId}>Assign to me</option> : null}
            </Select>
          )}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Due date"><TextInput type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></Field>
          <Field label="Priority">
            <Select value={priority} onChange={(event) => setPriority(event.target.value)}>{RFQ_PRIORITIES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
          </Field>
        </div>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function UpdateStatus({ open, onOpenChange, rfq }: { open: boolean; onOpenChange: (open: boolean) => void; rfq: Overview["rfq"] }) {
  const action = useAction([`/rfqs`, "/activity", "/reports"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const notes = String(form.get("notes") || "");
    await action.mutateAsync({ path: `/rfqs/${rfq.id}`, method: "PATCH", body: { status: form.get("status"), ...(notes ? { notes } : {}) } });
    onOpenChange(false);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Update status" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="rfq-status" loading={action.isPending}>Update</Button></>}>
      <form id="rfq-status" onSubmit={submit} className="grid gap-4">
        <Field label="Status">
          <Select name="status" defaultValue={rfq.status}>{RFQ_STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
        </Field>
        <Field label="Notes" hint="Replaces the RFQ notes when filled in"><TextArea name="notes" rows={3} defaultValue={rfq.notes || ""} /></Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function RequestEngineering({ open, onOpenChange, rfq }: { open: boolean; onOpenChange: (open: boolean) => void; rfq: Overview["rfq"] }) {
  const action = useAction([`/rfqs`, "/engineering", "/activity"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries([...form.entries()].filter(([, value]) => value !== ""));
    await action.mutateAsync({ path: "/engineering", body: { ...body, rfqId: rfq.id, projectId: rfq.project?.id, customerId: rfq.customer?.id } });
    if (rfq.status === "RECEIVED" || rfq.status === "DRAFT" || rfq.status === "UNDER_REVIEW") {
      await action.mutateAsync({ path: `/rfqs/${rfq.id}`, method: "PATCH", body: { status: "ENGINEERING_REQUIRED" } });
    }
    onOpenChange(false);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Request engineering review" footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="rfq-eng" loading={action.isPending}>Send to engineering</Button></>}>
      <form id="rfq-eng" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Application" className="sm:col-span-2"><TextInput name="application" defaultValue={rfq.application || ""} /></Field>
        <Field label="Required system"><TextInput name="requiredSystem" placeholder="e.g. Seismic bracing" /></Field>
        <Field label="Load"><TextInput name="load" placeholder="e.g. 250 kg/m" /></Field>
        <Field label="Material"><TextInput name="material" /></Field>
        <Field label="Standard"><TextInput name="standard" placeholder="e.g. NFPA 13" /></Field>
        <Field label="Due date"><TextInput name="dueDate" type="date" /></Field>
        <Field label="Installation condition"><TextInput name="installationCondition" /></Field>
        <Field label="Notes" className="sm:col-span-2"><TextArea name="notes" rows={3} /></Field>
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
