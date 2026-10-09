"use client";

import { ACTIVITY_TYPES } from "@fixotec/shared";
import { Badge, Button, Card, CardBody, CardHeader, DataTable, ErrorNote, Field, MiniStat, Modal, Notice, Select, StatusPill, Tabs, TextArea, TextInput, formatDate, humanize, money, relativeTime } from "@fixotec/ui";
import { CalendarClock, Check, IndianRupee, Mail, MessageCircle, Phone, Plus, Receipt, StickyNote, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAction, useApi } from "../lib/query";
import { allowed, useSession } from "../lib/session";
import { QueryError } from "./common";
import { Link } from "./link";

type Row = Record<string, unknown>;
export type CrmEntity = "lead" | "customer" | "project" | "quotation" | "rfq";

const RESOURCE: Record<CrmEntity, string> = { lead: "leads", customer: "customers", project: "projects", quotation: "quotations", rfq: "rfqs" };
const TYPE_ICON: Record<string, React.ReactNode> = {
  CALL: <Phone className="h-3.5 w-3.5" />,
  MEETING: <Users className="h-3.5 w-3.5" />,
  TASK: <Check className="h-3.5 w-3.5" />,
  EMAIL: <Mail className="h-3.5 w-3.5" />,
  WHATSAPP: <MessageCircle className="h-3.5 w-3.5" />,
  NOTE: <StickyNote className="h-3.5 w-3.5" />,
};

type TimelineEntry = { kind: string; id: string; at: string; type: string; title: string; body?: string | null; status?: string; direction?: string | null; actor?: string };
type Activity = { id: string; type: string; subject: string; body?: string | null; status: string; dueAt?: string | null; entityType: string; entityId: string; owner?: { name: string } | null; direction?: string | null };
type FieldDef = { id: string; key: string; label: string; type: string; options: string[]; required: boolean; active: boolean };

/** Activities, timeline, email/WhatsApp and custom fields for any CRM record. */
export function CrmPanel({ entityType, entityId, record, contact }: { entityType: CrmEntity; entityId: string; record?: Row; contact?: { email?: string | null; phone?: string | null } }) {
  const { session } = useSession();
  const canEdit = allowed(session, `${RESOURCE[entityType]}.edit`);
  const [tab, setTab] = useState("timeline");
  const [composer, setComposer] = useState<"activity" | "email" | "whatsapp" | null>(null);
  const timeline = useApi<{ items: TimelineEntry[] }>(`/crm/timeline/${entityType}/${entityId}`);
  const open = useApi<{ items: Activity[] }>(`/activities?entityType=${entityType}&entityId=${entityId}&status=OPEN`);
  const channels = useApi<{ email: boolean; whatsapp: boolean }>("/crm/channels");
  const action = useAction(["/activities", "/crm/"]);
  const openItems = open.data?.items || [];
  const customEntity = entityType === "lead" || entityType === "customer" || entityType === "project" ? entityType : null;

  return (
    <Card>
      <CardHeader
        title="Activity"
        description="Calls, meetings, tasks, emails and WhatsApp in one timeline."
        action={
          canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setComposer("activity")}><Plus /> Log / schedule</Button>
              <Button size="sm" variant="outline" disabled={!channels.data?.email} title={channels.data?.email ? undefined : "SMTP is not configured"} onClick={() => setComposer("email")}><Mail /> Email</Button>
              <Button size="sm" variant="outline" disabled={!channels.data?.whatsapp} title={channels.data?.whatsapp ? undefined : "WhatsApp is not configured"} onClick={() => setComposer("whatsapp")}><MessageCircle /> WhatsApp</Button>
            </div>
          ) : null
        }
      />
      <div className="px-4">
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { key: "timeline", label: "Timeline", count: timeline.data?.items.length ?? null },
            { key: "open", label: "Open tasks", count: openItems.length },
            ...(customEntity ? [{ key: "fields", label: "Custom fields" }] : []),
            ...(entityType === "quotation" || entityType === "lead" ? [{ key: "sequences", label: "Follow-up sequences" }] : []),
          ]}
        />
      </div>
      <CardBody>
        <QueryError error={timeline.error || open.error} />
        {tab === "timeline" ? <Timeline items={timeline.data?.items || []} loading={timeline.isLoading} /> : null}
        {tab === "open" ? (
          openItems.length ? (
            <ul className="divide-y divide-line">
              {openItems.map((item) => (
                <li key={item.id} className="flex items-center gap-3 py-2.5">
                  <span className="text-muted">{TYPE_ICON[item.type]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{item.subject}</p>
                    <p className="text-2xs text-muted">{item.owner?.name || "Unassigned"} · {item.dueAt ? <DueText value={item.dueAt} /> : "no due date"}</p>
                  </div>
                  {canEdit ? <Button size="sm" variant="outline" loading={action.isPending} onClick={() => action.submit({ path: `/activities/${item.id}`, method: "PATCH", body: { status: "DONE" } })}><Check /> Done</Button> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="py-6 text-center text-sm text-muted">No open tasks. Schedule the next step so this record does not go cold.</p>
          )
        ) : null}
        {tab === "fields" && customEntity ? <CustomFieldsEditor entity={customEntity} entityId={entityId} values={(record?.customFields as Row) || {}} canEdit={canEdit} /> : null}
        {tab === "sequences" ? <SequencePanel entityType={entityType as "quotation" | "lead"} entityId={entityId} email={contact?.email} canEdit={canEdit} /> : null}
      </CardBody>
      {composer === "activity" ? <ActivityComposer entityType={entityType} entityId={entityId} contact={contact} onClose={() => setComposer(null)} /> : null}
      {composer === "email" ? <EmailComposer entityType={entityType} entityId={entityId} to={contact?.email || ""} onClose={() => setComposer(null)} /> : null}
      {composer === "whatsapp" ? <WhatsAppComposer entityType={entityType} entityId={entityId} to={contact?.phone || ""} onClose={() => setComposer(null)} /> : null}
    </Card>
  );
}

function DueText({ value }: { value: string }) {
  const overdue = new Date(value).getTime() < Date.now();
  return <span className={overdue ? "font-medium text-danger" : undefined}>{overdue ? "overdue · " : "due "}{relativeTime(value)}</span>;
}

export function Timeline({ items, loading }: { items: TimelineEntry[]; loading?: boolean }) {
  if (loading) return <p className="py-6 text-center text-sm text-muted">Loading…</p>;
  if (!items.length) return <p className="py-6 text-center text-sm text-muted">Nothing logged yet.</p>;
  return (
    <ol className="relative space-y-4 border-l border-line pl-5">
      {items.map((item) => (
        <li key={`${item.kind}-${item.id}`} className="relative">
          <span className="absolute -left-[27px] flex h-5 w-5 items-center justify-center rounded-full border border-line bg-surface text-muted">{TYPE_ICON[item.type] || <span className="h-1.5 w-1.5 rounded-full bg-accent" />}</span>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">{item.title}</p>
            {item.direction ? <Badge tone={item.direction === "IN" ? "info" : "neutral"}>{item.direction === "IN" ? "Received" : "Sent"}</Badge> : null}
            {item.status === "OPEN" ? <Badge tone="warn">Open</Badge> : null}
          </div>
          {item.body ? <p className="mt-0.5 line-clamp-4 whitespace-pre-line text-xs text-muted">{item.body}</p> : null}
          <p className="mt-0.5 text-2xs text-subtle">{humanize(item.type)} · {item.actor ? `${item.actor} · ` : ""}{relativeTime(item.at)}</p>
        </li>
      ))}
    </ol>
  );
}

function ActivityComposer({ entityType, entityId, contact, onClose }: { entityType: CrmEntity; entityId: string; contact?: { email?: string | null; phone?: string | null }; onClose: () => void }) {
  const action = useAction(["/activities", "/crm/"]);
  const [type, setType] = useState<string>("CALL");
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const dueAt = String(form.get("dueAt") || "");
    const result = await action.submit({
      path: "/activities",
      body: {
        type,
        entityType,
        entityId,
        subject: String(form.get("subject") || "").trim(),
        body: String(form.get("body") || "").trim() || undefined,
        dueAt: dueAt ? new Date(dueAt).toISOString() : undefined,
        status: done || type === "NOTE" ? "DONE" : "OPEN",
        contactEmail: contact?.email || undefined,
        contactPhone: contact?.phone || undefined,
      },
    });
    if (result) onClose();
  }
  return (
    <Modal open onOpenChange={(value) => !value && onClose()} title="Log or schedule activity" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="activity-form" loading={action.isPending}>Save</Button></>}>
      <form id="activity-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Type">
          <Select value={type} onChange={(event) => setType(event.target.value)}>
            {ACTIVITY_TYPES.filter((item) => item !== "EMAIL" && item !== "WHATSAPP").map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
        </Field>
        {type !== "NOTE" ? (
          <Field label="Due">
            <TextInput name="dueAt" type="datetime-local" />
          </Field>
        ) : <div />}
        <Field label="Subject" className="sm:col-span-2"><TextInput name="subject" required maxLength={200} placeholder={type === "CALL" ? "Discuss revised BOQ" : "Site visit at Tower B"} /></Field>
        <Field label="Notes" className="sm:col-span-2"><TextArea name="body" rows={4} /></Field>
        {type !== "NOTE" ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" checked={done} onChange={(event) => setDone(event.target.checked)} /> Already done (log it)
          </label>
        ) : null}
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function EmailComposer({ entityType, entityId, to, onClose }: { entityType: CrmEntity; entityId: string; to: string; onClose: () => void }) {
  const templates = useApi<Array<{ key: string; name: string; active: boolean }>>("/crm/email-templates");
  const preview = useAction<Row, { subject: string; text: string }>([]);
  const send = useAction(["/activities", "/crm/"]);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [recipient, setRecipient] = useState(to);
  async function applyTemplate(templateKey: string) {
    if (!templateKey) return;
    const result = await preview.submit({ path: "/crm/email/preview", body: { entityType, entityId, to: recipient || "preview@example.com", templateKey } });
    if (result) {
      setSubject(result.subject);
      setBody(result.text);
    }
  }
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await send.submit({ path: "/crm/email/send", body: { entityType, entityId, to: recipient, subject, body } });
    if (result) onClose();
  }
  return (
    <Modal open onOpenChange={(value) => !value && onClose()} title="Send email" className="max-w-2xl" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="email-form" loading={send.isPending}><Mail /> Send</Button></>}>
      <form id="email-form" onSubmit={submit} className="grid gap-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="To"><TextInput type="email" required value={recipient} onChange={(event) => setRecipient(event.target.value)} /></Field>
          <Field label="Template">
            <Select defaultValue="" onChange={(event) => void applyTemplate(event.target.value)}>
              <option value="">Write from scratch</option>
              {(templates.data || []).filter((item) => item.active).map((item) => <option key={item.key} value={item.key}>{item.name}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Subject" hint="Keep the [LD-…]/[QT-…] reference so replies are filed here automatically."><TextInput required value={subject} onChange={(event) => setSubject(event.target.value)} /></Field>
        <Field label="Message"><TextArea required rows={10} value={body} onChange={(event) => setBody(event.target.value)} /></Field>
        {preview.error || send.error ? <ErrorNote>{(preview.error || send.error)?.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function WhatsAppComposer({ entityType, entityId, to, onClose }: { entityType: CrmEntity; entityId: string; to: string; onClose: () => void }) {
  const send = useAction(["/activities", "/crm/"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await send.submit({ path: "/crm/whatsapp/send", body: { entityType, entityId, to: String(form.get("to") || ""), body: String(form.get("body") || "") } });
    if (result) onClose();
  }
  return (
    <Modal open onOpenChange={(value) => !value && onClose()} title="Send WhatsApp" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="wa-form" loading={send.isPending}><MessageCircle /> Send</Button></>}>
      <form id="wa-form" onSubmit={submit} className="grid gap-4">
        <Notice>Free-form messages reach only contacts who messaged you in the last 24 hours (WhatsApp policy).</Notice>
        <Field label="To"><TextInput name="to" required defaultValue={to} placeholder="+91 98765 43210" /></Field>
        <Field label="Message"><TextArea name="body" required rows={5} maxLength={4096} /></Field>
        {send.error ? <ErrorNote>{send.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function CustomFieldsEditor({ entity, entityId, values, canEdit }: { entity: "lead" | "customer" | "project"; entityId: string; values: Row; canEdit: boolean }) {
  const defs = useApi<FieldDef[]>(`/crm/custom-fields?entity=${entity.toUpperCase()}`);
  const save = useAction([`/${RESOURCE[entity]}`, "/crm/"]);
  const [saved, setSaved] = useState(false);
  const active = (defs.data || []).filter((def) => def.active);
  if (!active.length) return <p className="py-6 text-center text-sm text-muted">No custom fields defined for {entity}s yet. Admins add them under CRM settings.</p>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Row = {};
    for (const def of active) {
      const raw = form.get(def.key);
      body[def.key] = def.type === "BOOLEAN" ? raw === "true" : raw === null || raw === "" ? null : String(raw);
    }
    const result = await save.submit({ path: `/crm/custom-values/${entity}/${entityId}`, method: "PATCH", body });
    setSaved(Boolean(result));
  }
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
      {active.map((def) => {
        const value = values[def.key];
        const text = value == null ? "" : String(value);
        return (
          <Field key={def.id} label={`${def.label}${def.required ? " *" : ""}`}>
            {def.type === "SELECT" ? (
              <Select name={def.key} defaultValue={text} disabled={!canEdit}>
                <option value="">—</option>
                {def.options.map((option) => <option key={option} value={option}>{option}</option>)}
              </Select>
            ) : def.type === "BOOLEAN" ? (
              <Select name={def.key} defaultValue={value === true ? "true" : "false"} disabled={!canEdit}>
                <option value="false">No</option>
                <option value="true">Yes</option>
              </Select>
            ) : (
              <TextInput name={def.key} type={def.type === "NUMBER" ? "number" : def.type === "DATE" ? "date" : "text"} step="any" defaultValue={text} disabled={!canEdit} />
            )}
          </Field>
        );
      })}
      {canEdit ? (
        <div className="flex items-center gap-3 sm:col-span-2">
          <Button type="submit" size="sm" loading={save.isPending}>Save fields</Button>
          {saved && !save.isPending ? <span className="text-xs text-muted">Saved</span> : null}
          {save.error ? <ErrorNote>{save.error.message}</ErrorNote> : null}
        </div>
      ) : null}
    </form>
  );
}

function SequencePanel({ entityType, entityId, email, canEdit }: { entityType: "quotation" | "lead"; entityId: string; email?: string | null; canEdit: boolean }) {
  const sequences = useApi<Array<{ id: string; name: string; entityType: string; active: boolean }>>("/crm/sequences");
  const enrollments = useApi<Array<{ id: string; status: string; step: number; nextRunAt?: string | null; email: string; lastError?: string | null; sequence: { name: string; steps: unknown[] } }>>(`/crm/sequences/enrollments?entityType=${entityType}&entityId=${entityId}`);
  const action = useAction(["/crm/sequences"]);
  const [sequenceId, setSequenceId] = useState("");
  const [to, setTo] = useState(email || "");
  const available = (sequences.data || []).filter((item) => item.active && item.entityType === entityType);
  return (
    <div className="space-y-4">
      {canEdit && available.length ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Sequence"><Select value={sequenceId} onChange={(event) => setSequenceId(event.target.value)}><option value="">Choose…</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</Select></Field>
          <Field label="Send to"><TextInput type="email" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          <Button size="sm" disabled={!sequenceId || !to} loading={action.isPending} onClick={() => action.submit({ path: "/crm/sequences/enroll", body: { sequenceId, entityType, entityId, email: to } })}>Enrol</Button>
        </div>
      ) : null}
      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      <DataTable
        rows={enrollments.data || []}
        rowKey={(row) => row.id}
        density="compact"
        empty={<p className="py-4 text-center text-sm text-muted">Not enrolled in any follow-up sequence. Sequences stop automatically when the customer replies.</p>}
        columns={[
          { key: "sequence", header: "Sequence", render: (row) => row.sequence.name },
          { key: "email", header: "To", render: (row) => row.email },
          { key: "step", header: "Sent", render: (row) => `${row.step} / ${row.sequence.steps.length}` },
          { key: "next", header: "Next", render: (row) => (row.nextRunAt ? formatDate(row.nextRunAt) : "—") },
          { key: "status", header: "Status", render: (row) => <span title={row.lastError || undefined}><StatusPill status={row.status} /></span> },
          { key: "stop", header: "", render: (row) => (row.status === "ACTIVE" && canEdit ? <Button size="sm" variant="ghost" onClick={() => action.submit({ path: `/crm/sequences/enrollments/${row.id}/stop` })}>Stop</Button> : null) },
        ]}
      />
    </div>
  );
}

/* ------------------------------ Customer 360 ------------------------------ */

type View360 = {
  kpis: { revenue: number; outstanding: number; overdue: number; creditLimit: number; creditAvailable: number; avgDaysToPay: number | null; quoteWinRate: number | null; openQuotes: number; openTickets: number; projects: number };
  projects: Array<{ id: string; code: string; name: string; stage: string; fixotecValue?: number | null; role: string }>;
  leads: Array<{ id: string; number: string; status: string; estimatedValue?: number | null; score: number }>;
  quotations: Array<{ id: string; number: string; status: string; total: number; createdAt: string }>;
  orders: Array<{ id: string; number: string; status: string; total: number; createdAt: string }>;
  invoices: Array<{ id: string; number: string; status: string; total: number; paid: number; issueDate: string; dueDate?: string | null }>;
  tickets: Array<{ id: string; number: string; subject: string; status: string; priority: string }>;
};

export function Customer360({ id }: { id: string }) {
  const view = useApi<View360>(`/crm/customers/${id}/360`);
  const [tab, setTab] = useState("projects");
  if (view.error) return <QueryError error={view.error} />;
  if (!view.data) return null;
  const { kpis } = view.data;
  const tabs = [
    { key: "projects", label: "Projects", count: view.data.projects.length },
    { key: "leads", label: "Leads", count: view.data.leads.length },
    { key: "quotations", label: "Quotations", count: view.data.quotations.length },
    { key: "orders", label: "Orders", count: view.data.orders.length },
    { key: "invoices", label: "Invoices", count: view.data.invoices.length },
    { key: "tickets", label: "Service", count: view.data.tickets.length },
  ];
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Lifetime billing" value={money(kpis.revenue)} icon={<IndianRupee />} />
        <MiniStat label="Outstanding" value={money(kpis.outstanding)} tone={kpis.overdue > 0 ? "bad" : "accent"} hint={kpis.overdue > 0 ? `${money(kpis.overdue)} overdue` : "nothing overdue"} icon={<Receipt />} />
        <MiniStat label="Credit available" value={money(kpis.creditAvailable)} hint={`limit ${money(kpis.creditLimit)}`} icon={<IndianRupee />} />
        <MiniStat label="Quote win rate" value={kpis.quoteWinRate == null ? "—" : `${kpis.quoteWinRate}%`} hint={kpis.avgDaysToPay == null ? `${money(kpis.openQuotes)} open` : `pays in ~${kpis.avgDaysToPay} days`} icon={<CalendarClock />} />
      </div>
      <Card>
        <CardHeader title="Customer 360" description="Everything Fixotec has done with this account." />
        <div className="px-4"><Tabs items={tabs} value={tab} onChange={setTab} /></div>
        {tab === "projects" ? <DataTable rows={view.data.projects} rowKey={(row) => row.id} density="compact" columns={[{ key: "code", header: "Project", render: (row) => <Link href={`/projects/${row.id}`} className="font-medium text-accent">{row.code}</Link> }, { key: "name", header: "Name", render: (row) => row.name }, { key: "role", header: "Role", render: (row) => row.role }, { key: "stage", header: "Stage", render: (row) => <StatusPill status={row.stage} /> }, { key: "value", header: "Fixotec value", align: "right", render: (row) => money(row.fixotecValue) }]} /> : null}
        {tab === "leads" ? <DataTable rows={view.data.leads} rowKey={(row) => row.id} density="compact" columns={[{ key: "number", header: "Lead", render: (row) => <Link href={`/leads/${row.id}`} className="font-medium text-accent">{row.number}</Link> }, { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> }, { key: "score", header: "Score", align: "right", render: (row) => row.score }, { key: "value", header: "Value", align: "right", render: (row) => money(row.estimatedValue) }]} /> : null}
        {tab === "quotations" ? <DataTable rows={view.data.quotations} rowKey={(row) => row.id} density="compact" columns={[{ key: "number", header: "Quotation", render: (row) => <Link href={`/quotations/${row.id}`} className="font-medium text-accent">{row.number}</Link> }, { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> }, { key: "date", header: "Date", render: (row) => formatDate(row.createdAt) }, { key: "total", header: "Total", align: "right", render: (row) => money(row.total) }]} /> : null}
        {tab === "orders" ? <DataTable rows={view.data.orders} rowKey={(row) => row.id} density="compact" columns={[{ key: "number", header: "Order", render: (row) => <Link href={`/sales-orders/${row.id}`} className="font-medium text-accent">{row.number}</Link> }, { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> }, { key: "date", header: "Date", render: (row) => formatDate(row.createdAt) }, { key: "total", header: "Total", align: "right", render: (row) => money(row.total) }]} /> : null}
        {tab === "invoices" ? <DataTable rows={view.data.invoices} rowKey={(row) => row.id} density="compact" columns={[{ key: "number", header: "Invoice", render: (row) => <Link href={`/invoices/${row.id}`} className="font-medium text-accent">{row.number}</Link> }, { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> }, { key: "date", header: "Issued", render: (row) => formatDate(row.issueDate) }, { key: "due", header: "Due", render: (row) => (row.dueDate ? formatDate(row.dueDate) : "—") }, { key: "total", header: "Total", align: "right", render: (row) => money(row.total) }, { key: "balance", header: "Balance", align: "right", render: (row) => money(Math.max(0, row.total - row.paid)) }]} /> : null}
        {tab === "tickets" ? <DataTable rows={view.data.tickets} rowKey={(row) => row.id} density="compact" columns={[{ key: "number", header: "Ticket", render: (row) => <Link href={`/service/${row.id}`} className="font-medium text-accent">{row.number}</Link> }, { key: "subject", header: "Subject", render: (row) => row.subject }, { key: "priority", header: "Priority", render: (row) => humanize(row.priority) }, { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> }]} /> : null}
      </Card>
    </>
  );
}
