"use client";

import { CUSTOM_FIELD_ENTITIES, CUSTOM_FIELD_TYPES, SCORE_FIELDS, SCORE_OPS } from "@fixotec/shared";
import { Badge, Button, Card, CardHeader, DataTable, ErrorNote, Field, Modal, Notice, Page, PageHeader, Select, Tabs, TextArea, TextInput, formatDate, humanize } from "@fixotec/ui";
import { Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { QueryError } from "../../../components/common";
import { Link } from "../../../components/link";
import { useAction, useApi } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type ScoringRule = { id: string; name: string; field: string; op: string; value?: string | null; points: number; active: boolean };
type AssignmentRule = { id: string; name: string; priority: number; condition: { all?: Array<{ field: string; equals?: string; in?: string[] }> }; userIds: string[]; active: boolean };
type Template = { id: string; key: string; name: string; subject: string; body: string; active: boolean };
type Sequence = { id: string; name: string; entityType: string; steps: Array<{ dayOffset: number; templateKey: string }>; autoEnroll: boolean; active: boolean; _count: { enrollments: number } };
type FieldDef = { id: string; entity: string; key: string; label: string; type: string; options: string[]; required: boolean; active: boolean; sortOrder: number };
type DuplicateGroup = { matchedOn: string[]; records: Array<Record<string, unknown> & { id: string; createdAt: string }> };
type Owner = { id: string; name: string };

export default function CrmSettingsPage() {
  const { session } = useSession();
  const [tab, setTab] = useState("scoring");
  const tabs = [
    { key: "scoring", label: "Lead scoring" },
    { key: "assignment", label: "Assignment" },
    { key: "templates", label: "Email templates" },
    { key: "sequences", label: "Sequences" },
    { key: "fields", label: "Custom fields" },
    { key: "duplicates", label: "Duplicates" },
  ];
  return (
    <Page>
      <PageHeader title="CRM settings" description="Scoring, routing, email automation, custom fields and data hygiene." />
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === "scoring" ? <Scoring canEdit={allowed(session, "leads.override")} /> : null}
      {tab === "assignment" ? <Assignment canEdit={allowed(session, "leads.override") && allowed(session, "leads.assign")} /> : null}
      {tab === "templates" ? <Templates canEdit={allowed(session, "leads.override")} /> : null}
      {tab === "sequences" ? <Sequences canEdit={allowed(session, "leads.override")} /> : null}
      {tab === "fields" ? <CustomFields canEdit={allowed(session, "organization.edit")} /> : null}
      {tab === "duplicates" ? <Duplicates canMergeLeads={allowed(session, "leads.assign")} canMergeCustomers={allowed(session, "customers.override")} /> : null}
    </Page>
  );
}

function ActiveToggle({ path, active, invalidate, disabled }: { path: string; active: boolean; invalidate: string; disabled?: boolean }) {
  const action = useAction([invalidate]);
  return (
    <Button size="sm" variant="ghost" disabled={disabled} loading={action.isPending} onClick={() => action.submit({ path, method: "PATCH", body: { active: !active } })}>
      {active ? <Badge tone="good">Active</Badge> : <Badge>Off</Badge>}
    </Button>
  );
}

function Scoring({ canEdit }: { canEdit: boolean }) {
  const rules = useApi<ScoringRule[]>("/crm/scoring-rules");
  const create = useAction(["/crm/scoring-rules"]);
  const rescore = useAction<unknown, { rescored: number }>(["/leads", "/crm/"]);
  const [open, setOpen] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await create.submit({ path: "/crm/scoring-rules", body: { name: form.get("name"), field: form.get("field"), op: form.get("op"), value: String(form.get("value") || "") || undefined, points: Number(form.get("points")) } });
    if (result) setOpen(false);
  }
  return (
    <Card>
      <CardHeader
        title="Lead scoring rules"
        description="Each matching rule adds (or subtracts) points; the score is capped at 0-100. Leads scoring 60+ show as hot."
        action={canEdit ? <div className="flex gap-2"><Button size="sm" variant="outline" loading={rescore.isPending} onClick={() => rescore.submit({ path: "/crm/scoring-rules/rescore" })}>Rescore open leads{rescore.data ? ` (${rescore.data.rescored})` : ""}</Button><Button size="sm" onClick={() => setOpen(true)}><Plus /> Rule</Button></div> : null}
      />
      <QueryError error={rules.error} />
      <DataTable
        rows={rules.data || []}
        rowKey={(row) => row.id}
        density="compact"
        empty={<p className="py-6 text-center text-sm text-muted">No rules yet. Example: source equals CAD_DOWNLOAD → +25; estimated value ≥ 1000000 → +40.</p>}
        columns={[
          { key: "name", header: "Rule", render: (row) => row.name },
          { key: "when", header: "When", render: (row) => <span className="font-mono text-xs">{row.field} {row.op} {row.value ?? ""}</span> },
          { key: "points", header: "Points", align: "right", render: (row) => <span className={row.points < 0 ? "text-danger" : "text-success"}>{row.points > 0 ? "+" : ""}{row.points}</span> },
          { key: "active", header: "", render: (row) => <ActiveToggle path={`/crm/scoring-rules/${row.id}`} active={row.active} invalidate="/crm/scoring-rules" disabled={!canEdit} /> },
        ]}
      />
      <Modal open={open} onOpenChange={setOpen} title="New scoring rule" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="score-form" loading={create.isPending}>Save</Button></>}>
        <form id="score-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" className="sm:col-span-2"><TextInput name="name" required placeholder="Big-ticket enquiry" /></Field>
          <Field label="Field"><Select name="field">{SCORE_FIELDS.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
          <Field label="Condition"><Select name="op">{SCORE_OPS.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
          <Field label="Value" hint="Not needed for present/absent"><TextInput name="value" /></Field>
          <Field label="Points (−100 to 100)"><TextInput name="points" type="number" min={-100} max={100} required defaultValue={10} /></Field>
          {create.error ? <ErrorNote className="sm:col-span-2">{create.error.message}</ErrorNote> : null}
        </form>
      </Modal>
    </Card>
  );
}

function Assignment({ canEdit }: { canEdit: boolean }) {
  const rules = useApi<AssignmentRule[]>("/crm/assignment-rules");
  const owners = useApi<Owner[]>("/crm/owners");
  const create = useAction(["/crm/assignment-rules"]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const nameOf = new Map((owners.data || []).map((owner) => [owner.id, owner.name]));
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const field = String(form.get("field") || "");
    const values = String(form.get("values") || "").split(",").map((item) => item.trim()).filter(Boolean);
    const result = await create.submit({
      path: "/crm/assignment-rules",
      body: { name: form.get("name"), priority: Number(form.get("priority") || 100), condition: { all: field && values.length ? [{ field, in: values }] : [] }, userIds: picked },
    });
    if (result) {
      setOpen(false);
      setPicked([]);
    }
  }
  return (
    <Card>
      <CardHeader title="Round-robin assignment" description="Website, email, WhatsApp and CAD-download leads without an owner go to the first matching rule's next salesperson." action={canEdit ? <Button size="sm" onClick={() => setOpen(true)}><Plus /> Rule</Button> : null} />
      <QueryError error={rules.error} />
      <DataTable
        rows={rules.data || []}
        rowKey={(row) => row.id}
        density="compact"
        empty={<p className="py-6 text-center text-sm text-muted">No rules: unowned leads stay with the sales head.</p>}
        columns={[
          { key: "priority", header: "#", render: (row) => row.priority },
          { key: "name", header: "Rule", render: (row) => row.name },
          { key: "when", header: "When", render: (row) => <span className="text-xs">{row.condition.all?.length ? row.condition.all.map((clause) => `${clause.field} in ${(clause.in || [clause.equals]).join("/")}`).join(" and ") : "Any lead"}</span> },
          { key: "users", header: "Rotation", render: (row) => <span className="text-xs">{row.userIds.map((id) => nameOf.get(id) || "?").join(" → ")}</span> },
          { key: "active", header: "", render: (row) => <ActiveToggle path={`/crm/assignment-rules/${row.id}`} active={row.active} invalidate="/crm/assignment-rules" disabled={!canEdit} /> },
        ]}
      />
      <Modal open={open} onOpenChange={setOpen} title="New assignment rule" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="assign-form" disabled={!picked.length} loading={create.isPending}>Save</Button></>}>
        <form id="assign-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><TextInput name="name" required placeholder="West region website leads" /></Field>
          <Field label="Priority" hint="Lower runs first"><TextInput name="priority" type="number" defaultValue={100} /></Field>
          <Field label="Match field (optional)"><Select name="field"><option value="">Any lead</option>{SCORE_FIELDS.map((item) => <option key={item} value={item}>{item}</option>)}</Select></Field>
          <Field label="Values" hint="Comma separated, e.g. WEBSITE, CAD_DOWNLOAD"><TextInput name="values" /></Field>
          <Field label="Salespeople in rotation" className="sm:col-span-2">
            <div className="grid max-h-48 gap-1 overflow-auto rounded-md border border-line p-2 sm:grid-cols-2">
              {(owners.data || []).map((owner) => (
                <label key={owner.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={picked.includes(owner.id)} onChange={(event) => setPicked(event.target.checked ? [...picked, owner.id] : picked.filter((id) => id !== owner.id))} />
                  {owner.name}
                </label>
              ))}
            </div>
          </Field>
          {create.error ? <ErrorNote className="sm:col-span-2">{create.error.message}</ErrorNote> : null}
        </form>
      </Modal>
    </Card>
  );
}

function Templates({ canEdit }: { canEdit: boolean }) {
  const templates = useApi<Template[]>("/crm/email-templates");
  const save = useAction(["/crm/email-templates"]);
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = { name: form.get("name"), subject: form.get("subject"), body: form.get("body") };
    const result = editing === "new" ? await save.submit({ path: "/crm/email-templates", body: { ...body, key: form.get("key") } }) : await save.submit({ path: `/crm/email-templates/${(editing as Template).id}`, method: "PATCH", body });
    if (result) setEditing(null);
  }
  const current = editing && editing !== "new" ? editing : null;
  return (
    <Card>
      <CardHeader title="Email templates" description="Placeholders: {{customer.name}}, {{quotation.number}}, {{quotation.total}}, {{quotation.validUntil}}, {{project.name}}, {{lead.contactName}}, {{owner.name}}." action={canEdit ? <Button size="sm" onClick={() => setEditing("new")}><Plus /> Template</Button> : null} />
      <QueryError error={templates.error} />
      <DataTable
        rows={templates.data || []}
        rowKey={(row) => row.id}
        density="compact"
        onRowClick={canEdit ? (row) => setEditing(row) : undefined}
        columns={[
          { key: "name", header: "Template", render: (row) => row.name },
          { key: "key", header: "Key", render: (row) => <span className="font-mono text-xs">{row.key}</span> },
          { key: "subject", header: "Subject", render: (row) => <span className="text-xs text-muted">{row.subject}</span> },
          { key: "active", header: "", render: (row) => <ActiveToggle path={`/crm/email-templates/${row.id}`} active={row.active} invalidate="/crm/email-templates" disabled={!canEdit} /> },
        ]}
      />
      {editing ? (
        <Modal open onOpenChange={(value) => !value && setEditing(null)} title={current ? `Edit ${current.name}` : "New template"} className="max-w-2xl" footer={<><Button variant="outline" onClick={() => setEditing(null)}>Cancel</Button><Button type="submit" form="template-form" loading={save.isPending}>Save</Button></>}>
          <form id="template-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
            <Field label="Name"><TextInput name="name" required defaultValue={current?.name} /></Field>
            <Field label="Key" hint="lowercase-with-dashes"><TextInput name="key" required disabled={Boolean(current)} defaultValue={current?.key} pattern="[a-z0-9_-]{2,60}" /></Field>
            <Field label="Subject" className="sm:col-span-2"><TextInput name="subject" required defaultValue={current?.subject} /></Field>
            <Field label="Body" className="sm:col-span-2"><TextArea name="body" required rows={12} defaultValue={current?.body} /></Field>
            {save.error ? <ErrorNote className="sm:col-span-2">{save.error.message}</ErrorNote> : null}
          </form>
        </Modal>
      ) : null}
    </Card>
  );
}

function Sequences({ canEdit }: { canEdit: boolean }) {
  const sequences = useApi<Sequence[]>("/crm/sequences");
  const templates = useApi<Template[]>("/crm/email-templates");
  const save = useAction(["/crm/sequences"]);
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState<Array<{ dayOffset: number; templateKey: string }>>([{ dayOffset: 3, templateKey: "" }]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await save.submit({ path: "/crm/sequences", body: { name: form.get("name"), entityType: form.get("entityType"), autoEnroll: form.get("autoEnroll") === "true", steps } });
    if (result) setOpen(false);
  }
  return (
    <Card>
      <CardHeader title="Follow-up sequences" description="Timed emails that stop automatically when the customer replies or the quotation/lead closes." action={canEdit ? <Button size="sm" onClick={() => setOpen(true)}><Plus /> Sequence</Button> : null} />
      <div className="px-4 pb-2"><Notice>Sequences send through SMTP and run every 15 minutes in the background worker. Turn on <b>auto-enrol</b> to follow up every sent quotation automatically.</Notice></div>
      <QueryError error={sequences.error} />
      <DataTable
        rows={sequences.data || []}
        rowKey={(row) => row.id}
        density="compact"
        columns={[
          { key: "name", header: "Sequence", render: (row) => row.name },
          { key: "for", header: "For", render: (row) => humanize(row.entityType) },
          { key: "steps", header: "Steps", render: (row) => <span className="text-xs">{row.steps.map((step) => `day ${step.dayOffset}: ${step.templateKey}`).join(" · ")}</span> },
          { key: "enrolled", header: "Enrolled", align: "right", render: (row) => row._count.enrollments },
          { key: "auto", header: "Auto-enrol", render: (row) => <AutoToggle sequence={row} disabled={!canEdit} /> },
          { key: "active", header: "", render: (row) => <ActiveToggle path={`/crm/sequences/${row.id}`} active={row.active} invalidate="/crm/sequences" disabled={!canEdit} /> },
        ]}
      />
      <Modal open={open} onOpenChange={setOpen} title="New sequence" className="max-w-xl" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="sequence-form" loading={save.isPending} disabled={steps.some((step) => !step.templateKey)}>Save</Button></>}>
        <form id="sequence-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="Name"><TextInput name="name" required /></Field>
          <Field label="For"><Select name="entityType"><option value="quotation">Quotations</option><option value="lead">Leads</option></Select></Field>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="autoEnroll" value="true" /> Auto-enrol every sent quotation</label>
          <div className="space-y-2 sm:col-span-2">
            {steps.map((step, index) => (
              <div key={index} className="flex items-end gap-2">
                <Field label="Day"><TextInput type="number" min={0} max={365} value={step.dayOffset} onChange={(event) => setSteps(steps.map((item, i) => (i === index ? { ...item, dayOffset: Number(event.target.value) } : item)))} className="w-20" /></Field>
                <Field label="Template" className="flex-1">
                  <Select value={step.templateKey} onChange={(event) => setSteps(steps.map((item, i) => (i === index ? { ...item, templateKey: event.target.value } : item)))}>
                    <option value="">Choose…</option>
                    {(templates.data || []).map((template) => <option key={template.key} value={template.key}>{template.name}</option>)}
                  </Select>
                </Field>
                {steps.length > 1 ? <Button type="button" variant="ghost" size="sm" onClick={() => setSteps(steps.filter((_, i) => i !== index))}>Remove</Button> : null}
              </div>
            ))}
            <Button type="button" size="sm" variant="outline" onClick={() => setSteps([...steps, { dayOffset: (steps.at(-1)?.dayOffset ?? 0) + 4, templateKey: "" }])}><Plus /> Step</Button>
          </div>
          {save.error ? <ErrorNote className="sm:col-span-2">{save.error.message}</ErrorNote> : null}
        </form>
      </Modal>
    </Card>
  );
}

function AutoToggle({ sequence, disabled }: { sequence: Sequence; disabled?: boolean }) {
  const action = useAction(["/crm/sequences"]);
  return (
    <Button size="sm" variant="ghost" disabled={disabled} loading={action.isPending} onClick={() => action.submit({ path: `/crm/sequences/${sequence.id}`, method: "PATCH", body: { autoEnroll: !sequence.autoEnroll } })}>
      {sequence.autoEnroll ? <Badge tone="info">On</Badge> : <Badge>Off</Badge>}
    </Button>
  );
}

function CustomFields({ canEdit }: { canEdit: boolean }) {
  const defs = useApi<FieldDef[]>("/crm/custom-fields");
  const create = useAction(["/crm/custom-fields"]);
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<string>("TEXT");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await create.submit({
      path: "/crm/custom-fields",
      body: { entity: form.get("entity"), key: form.get("key"), label: form.get("label"), type, required: form.get("required") === "true", options: type === "SELECT" ? String(form.get("options") || "").split(",").map((item) => item.trim()).filter(Boolean) : [] },
    });
    if (result) setOpen(false);
  }
  return (
    <Card>
      <CardHeader title="Custom fields" description="Extra fields on leads, customers and projects — e.g. seismic zone, site area, consultant firm." action={canEdit ? <Button size="sm" onClick={() => setOpen(true)}><Plus /> Field</Button> : null} />
      <QueryError error={defs.error} />
      <DataTable
        rows={defs.data || []}
        rowKey={(row) => row.id}
        density="compact"
        columns={[
          { key: "entity", header: "On", render: (row) => humanize(row.entity) },
          { key: "label", header: "Label", render: (row) => row.label },
          { key: "key", header: "Key", render: (row) => <span className="font-mono text-xs">{row.key}</span> },
          { key: "type", header: "Type", render: (row) => `${humanize(row.type)}${row.options.length ? ` (${row.options.join(", ")})` : ""}` },
          { key: "required", header: "Required", render: (row) => (row.required ? "Yes" : "") },
          { key: "active", header: "", render: (row) => <ActiveToggle path={`/crm/custom-fields/${row.id}`} active={row.active} invalidate="/crm/custom-fields" disabled={!canEdit} /> },
        ]}
      />
      <Modal open={open} onOpenChange={setOpen} title="New custom field" footer={<><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" form="field-form" loading={create.isPending}>Save</Button></>}>
        <form id="field-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
          <Field label="On"><Select name="entity">{CUSTOM_FIELD_ENTITIES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label="Type"><Select value={type} onChange={(event) => setType(event.target.value)}>{CUSTOM_FIELD_TYPES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label="Label"><TextInput name="label" required placeholder="Seismic zone" /></Field>
          <Field label="Key" hint="camelCase, e.g. seismicZone"><TextInput name="key" required pattern="[a-z][a-zA-Z0-9_]{1,39}" /></Field>
          {type === "SELECT" ? <Field label="Options" hint="Comma separated" className="sm:col-span-2"><TextInput name="options" required placeholder="II, III, IV, V" /></Field> : null}
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="required" value="true" /> Required</label>
          {create.error ? <ErrorNote className="sm:col-span-2">{create.error.message}</ErrorNote> : null}
        </form>
      </Modal>
    </Card>
  );
}

function Duplicates({ canMergeLeads, canMergeCustomers }: { canMergeLeads: boolean; canMergeCustomers: boolean }) {
  const [entity, setEntity] = useState<"lead" | "customer">("lead");
  const groups = useApi<{ groups: DuplicateGroup[] }>(`/crm/duplicates?entity=${entity}`);
  const merge = useAction(["/crm/duplicates", "/leads", "/customers"]);
  const canMerge = entity === "lead" ? canMergeLeads : canMergeCustomers;
  const label = (row: Record<string, unknown>) => (entity === "lead" ? `${row.number} · ${row.companyName}` : `${row.code} · ${row.name}`);
  return (
    <Card>
      <CardHeader
        title="Possible duplicates"
        description="Records sharing an email, phone (last 10 digits) or GSTIN. Merging keeps the oldest record and moves everything onto it."
        action={<Tabs variant="pill" value={entity} onChange={(key) => setEntity(key as "lead" | "customer")} items={[{ key: "lead", label: "Leads" }, { key: "customer", label: "Customers" }]} />}
      />
      <QueryError error={groups.error} />
      {merge.error ? <ErrorNote className="mx-4">{merge.error.message}</ErrorNote> : null}
      {!groups.data?.groups.length ? (
        <p className="py-8 text-center text-sm text-muted">{groups.isLoading ? "Scanning…" : "No duplicates found."}</p>
      ) : (
        <ul className="divide-y divide-line">
          {groups.data.groups.map((group) => {
            const ordered = [...group.records].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
            const keep = ordered[0];
            return (
              <li key={ordered.map((row) => row.id).join("-")} className="px-4 py-3">
                <p className="mb-2 text-2xs uppercase tracking-wide text-muted">Matched on {group.matchedOn.join(", ")}</p>
                <ul className="space-y-1.5">
                  {ordered.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center gap-3 text-sm">
                      <Link href={`/${entity === "lead" ? "leads" : "customers"}/${row.id}`} className="font-medium text-accent">{label(row)}</Link>
                      <span className="text-2xs text-muted">{String(row.email || "")} {String(row.phone || "")} · {formatDate(row.createdAt)}</span>
                      {row.id === keep.id ? <Badge tone="good">Keep</Badge> : canMerge ? (
                        <Button size="sm" variant="outline" loading={merge.isPending} onClick={() => merge.submit({ path: `/${entity === "lead" ? "leads" : "customers"}/${row.id}/merge`, body: { intoId: keep.id } })}>Merge into {String(entity === "lead" ? keep.number : keep.code)}</Button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
