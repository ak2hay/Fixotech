"use client";

import { Avatar, Badge, Button, Card, CardBody, CardHeader, Checkbox, DataTable, ErrorNote, Field, FilterButton, KeyValueList, Modal, Page, PageHeader, Select, StatusPill, TextArea, TextInput, formatDate, humanize, money, relativeTime, type Column } from "@fixotec/ui";
import { Download, Plus, Search } from "lucide-react";
import { notFound, useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { RESOURCES, type ActionDef, type ColumnDef, type FieldDef, type ResourceDef } from "../config/resources";
import { download } from "../lib/api";
import { useAction, useApi } from "../lib/query";
import { allowed, useSession } from "../lib/session";
import { PageSkeleton, QueryError } from "./common";
import { CrmPanel, Customer360 } from "./crm";
import { Link } from "./link";
import { UploadDocument } from "./upload-document";

type Row = Record<string, unknown>;
type ListPayload = Row[] | { items: Row[]; total?: number; page?: number; pageSize?: number };

export function valueAt(row: Row, path: string): unknown {
  return path.split(".").reduce<unknown>((value, key) => (value && typeof value === "object" ? (value as Row)[key] : undefined), row);
}

function rowsFrom(payload?: ListPayload): Row[] {
  if (!payload) return [];
  return Array.isArray(payload) ? payload : payload.items || [];
}

function renderCell(column: ColumnDef, row: Row) {
  const value = valueAt(row, column.get || column.key);
  switch (column.kind) {
    case "strong":
      return <span className="font-medium">{value == null || value === "" ? "—" : String(value)}</span>;
    case "mono":
      return <span className="font-mono text-xs text-muted">{value == null || value === "" ? "—" : String(value)}</span>;
    case "money":
      return <span className="tabular">{money(value)}</span>;
    case "date":
      return <span className="tabular text-muted">{value ? formatDate(value) : "—"}</span>;
    case "relative":
      return <span className="whitespace-nowrap text-muted">{value ? relativeTime(String(value)) : "—"}</span>;
    case "status":
      return value ? <StatusPill status={String(value)} /> : "—";
    case "count":
      return Array.isArray(value) ? value.length : 0;
    case "bool":
      return value ? <Badge tone="good">Yes</Badge> : <span className="text-subtle">No</span>;
    case "humanize":
      return value ? humanize(String(value)) : "—";
    case "avatar":
      return value ? <span className="flex items-center gap-2"><Avatar name={String(value)} size="sm" /><span className="hidden text-xs text-muted 2xl:inline">{String(value)}</span></span> : <span className="text-subtle">—</span>;
    case "download":
      return (
        <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={(event) => { event.stopPropagation(); download(`/documents/${row.id}/download`, String(row.title || "document")); }}>
          <Download />
        </Button>
      );
    default:
      return value == null || value === "" ? "—" : typeof value === "object" ? String((value as Row).name || (value as Row).number || "—") : String(value);
  }
}

function sortValue(column: ColumnDef, row: Row) {
  const value = valueAt(row, column.get || column.key);
  if (Array.isArray(value)) return value.length;
  if (typeof value === "number") return value;
  if (column.kind === "money") return Number(value || 0);
  return String(value ?? "");
}

/* --------------------------------- List ---------------------------------- */

export function ResourceListPage({ resourceKey }: { resourceKey: string }) {
  const config = RESOURCES[resourceKey];
  if (!config) notFound();
  return <ResourceList resourceKey={resourceKey} config={config} />;
}

function ResourceList({ resourceKey, config }: { resourceKey: string; config: ResourceDef }) {
  const router = useRouter();
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [uploading, setUploading] = useState(false);

  const probe = useApi<ListPayload>(`${config.path}?pageSize=1`);
  const serverPaged = Boolean(probe.data && !Array.isArray(probe.data) && typeof probe.data.total === "number");
  const query = new URLSearchParams();
  if (serverPaged) {
    query.set("page", String(page));
    query.set("pageSize", "25");
    if (q) query.set("q", q);
    if (status) query.set("status", status);
  }
  const listPath = serverPaged ? `${config.path}?${query}` : config.path;
  const list = useApi<ListPayload>(probe.data ? listPath : null, { keepPrevious: true });
  const payload = list.data;

  const rows = useMemo(() => {
    const all = rowsFrom(payload);
    if (serverPaged) return all;
    const term = q.trim().toLowerCase();
    return all.filter((row) => (!status || (config.statusKey && row[config.statusKey] === status)) && (!term || config.columns.some((column) => String(valueAt(row, column.get || column.key) ?? "").toLowerCase().includes(term))));
  }, [payload, serverPaged, q, status, config]);

  const columns: Array<Column<Row>> = config.columns.map((column) => ({
    key: column.key,
    header: column.header,
    align: column.align,
    sortValue: column.kind === "download" ? undefined : (row: Row) => sortValue(column, row),
    render: (row: Row) => renderCell(column, row),
  }));

  const paged = !Array.isArray(payload) && payload && typeof payload.total === "number" ? payload : null;

  return (
    <Page>
      <PageHeader
        title={config.title}
        description={config.description}
        actions={
          <>
            {config.upload && allowed(session, "documents.create") ? <Button onClick={() => setUploading(true)}><Plus /> Upload</Button> : null}
            {config.create && allowed(session, config.create.permission) ? <Button onClick={() => setCreating(true)}><Plus /> {config.create.label || "New"}</Button> : null}
          </>
        }
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder={`Search ${config.title.toLowerCase()}...`} value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} className="w-72" />
          {config.statuses ? <FilterButton label="Status" value={status} onChange={(value) => { setStatus(value); setPage(1); }} options={config.statuses.map((value) => ({ value, label: humanize(value) }))} /> : null}
          <span className="ml-auto text-xs text-muted">{paged ? paged.total : rows.length} records</span>
        </div>
        <QueryError error={list.error || probe.error} />
        <DataTable
          rows={rows}
          loading={probe.isLoading || list.isLoading}
          rowKey={(row, index) => String(row.id ?? index)}
          onRowClick={(row) => row.id && router.push(`/${resourceKey}/${row.id}`)}
          pagination={paged ? { page, pageSize: paged.pageSize || 25, total: paged.total || 0, onPage: setPage } : undefined}
          empty={`No ${config.title.toLowerCase()} yet.`}
          columns={columns}
        />
      </Card>
      {config.create ? <CreateRecord open={creating} onOpenChange={setCreating} config={config} onCreated={(id) => id && router.push(`/${resourceKey}/${id}`)} /> : null}
      {config.upload ? <UploadDocument open={uploading} onOpenChange={setUploading} defaultCategory={config.upload.category} /> : null}
    </Page>
  );
}

/* --------------------------------- Forms --------------------------------- */

export function FormFields({ fields, initial }: { fields: FieldDef[]; initial?: Row }) {
  return (
    <>
      {fields.map((field) => (
        <FormField key={field.key} field={field} initial={initial?.[field.key]} />
      ))}
    </>
  );
}

function FormField({ field, initial }: { field: FieldDef; initial?: unknown }) {
  const remote = useApi<ListPayload>(field.optionsFrom ? field.optionsFrom.path : null);
  const defaultValue = initial != null && typeof initial !== "object" ? String(initial).slice(0, field.type === "date" ? 10 : undefined) : field.defaultValue;
  const span = field.wide || field.type === "textarea" ? "sm:col-span-2" : "";
  if (field.type === "checkbox") {
    return (
      <label className={`flex items-center gap-2 text-sm ${span}`}>
        <Checkbox name={field.key} value="true" defaultChecked={initial === true} /> {field.label}
      </label>
    );
  }
  let control: React.ReactNode;
  if (field.type === "select") {
    const options = field.optionsFrom
      ? rowsFrom(remote.data).map((row) => ({ value: String(row.id), label: field.optionsFrom!.label(row) }))
      : (field.options || []).map((option) => (typeof option === "string" ? { value: option, label: humanize(option) } : option));
    control = (
      <Select name={field.key} defaultValue={defaultValue || ""} required={field.required}>
        <option value="" disabled={field.required}>{field.required ? "Select..." : "None"}</option>
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </Select>
    );
  } else if (field.type === "textarea") {
    control = <TextArea name={field.key} rows={3} defaultValue={defaultValue} required={field.required} />;
  } else {
    control = <TextInput name={field.key} type={field.type === "list" ? "text" : field.type || "text"} defaultValue={defaultValue} required={field.required} step={field.type === "number" ? "any" : undefined} />;
  }
  return (
    <Field label={field.label} hint={field.hint} className={span}>
      {control}
    </Field>
  );
}

export function formBody(form: FormData, fields: FieldDef[]) {
  const body: Row = {};
  for (const field of fields) {
    const raw = form.get(field.key);
    if (field.type === "checkbox") {
      body[field.key] = raw === "true";
      continue;
    }
    const value = typeof raw === "string" ? raw.trim() : "";
    if (!value) continue;
    if (field.type === "number") body[field.key] = Number(value);
    else if (field.type === "list") body[field.key] = value.split(",").map((item) => item.trim()).filter(Boolean);
    else body[field.key] = value;
  }
  return body;
}

function CreateRecord({ open, onOpenChange, config, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; config: ResourceDef; onCreated: (id?: string) => void }) {
  const create = config.create!;
  const action = useAction<Row, { id?: string }>([config.path]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    let body = formBody(new FormData(event.currentTarget), create.fields);
    if (create.transform) body = create.transform(body);
    const created = await action.mutateAsync({ path: create.path || config.path, body });
    onOpenChange(false);
    onCreated(created?.id);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title={create.label || `New ${config.title}`} footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="create-record" loading={action.isPending}>Save</Button></>}>
      <form id="create-record" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormFields fields={create.fields} />
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

/* -------------------------------- Detail --------------------------------- */

export function ResourceDetailPage({ resourceKey, id }: { resourceKey: string; id: string }) {
  const config = RESOURCES[resourceKey];
  if (!config) notFound();
  return <ResourceDetail resourceKey={resourceKey} config={config} id={id} />;
}

const SKIP = new Set(["id", "passwordHash", "mfaSecret"]);

function ResourceDetail({ resourceKey, config, id }: { resourceKey: string; config: ResourceDef; id: string }) {
  const { session } = useSession();
  const single = useApi<Row>(config.detailPath ? config.detailPath(id) : null);
  const list = useApi<ListPayload>(config.detailPath ? null : `${config.path}${config.path.includes("?") ? "&" : "?"}pageSize=100`);
  const [running, setRunning] = useState<ActionDef | null>(null);
  const quick = useAction([config.path, "/activity", "/invoices"]);

  const record = config.detailPath ? single.data : rowsFrom(list.data).find((row) => String(row.id) === id);
  const loading = single.isLoading || list.isLoading;
  const error = single.error || list.error;

  if (loading) return <PageSkeleton />;
  if (error) return <Page><QueryError error={error} /></Page>;
  if (!record) return <Page><ErrorNote>This record was not found or is outside your access.</ErrorNote></Page>;

  const hidden = new Set([...(config.hidden || []), ...SKIP]);
  const entries = Object.entries(record).filter(([key]) => !hidden.has(key));
  const scalars = entries.filter(([, value]) => value === null || typeof value !== "object" || isRef(value));
  const collections = entries.filter(([, value]) => Array.isArray(value) && value.length && typeof value[0] === "object") as Array<[string, Row[]]>;
  const blobs = entries.filter(([, value]) => value && typeof value === "object" && !Array.isArray(value) && !isRef(value));
  const actions = (config.actions || []).filter((action) => allowed(session, action.permission) && (!action.when || action.when(record)));
  const status = config.statusKey ? record[config.statusKey] : record.status;

  async function run(action: ActionDef) {
    if (action.fields?.length) return setRunning(action);
    await quick.mutateAsync({ path: action.path(record!), method: action.method || "POST", body: action.body ? action.body(record!) : {} });
  }

  return (
    <Page>
      <PageHeader
        LinkComponent={Link}
        breadcrumbs={[{ label: config.title, href: `/${resourceKey}` }, { label: String(record[config.subtitleKey || config.titleKey] || id) }]}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {String(record[config.titleKey] || "Record")}
            {status ? <StatusPill status={String(status)} /> : null}
          </span>
        }
        description={config.subtitleKey && record[config.subtitleKey] ? humanizeMaybe(record[config.subtitleKey]) : undefined}
        actions={actions.map((action) => (
          <Button key={action.key} variant={action.variant === "danger" ? "danger" : action.variant === "outline" ? "outline" : "default"} loading={quick.isPending && !action.fields} onClick={() => run(action)}>
            {action.label}
          </Button>
        ))}
      />
      {quick.error ? <ErrorNote>{quick.error.message}</ErrorNote> : null}
      {config.crm === "customer" ? <Customer360 id={id} /> : null}
      <Card>
        <CardHeader title="Details" />
        <CardBody>
          <KeyValueList columns={2} items={scalars.map(([key, value]) => ({ label: labelFor(key), value: displayValue(key, value) }))} />
        </CardBody>
      </Card>
      {config.crm ? <CrmPanel entityType={config.crm} entityId={id} record={record} contact={{ email: record.email as string | null, phone: record.phone as string | null }} /> : null}
      {collections.map(([key, items]) => (
        <Card key={key}>
          <CardHeader title={labelFor(key)} description={`${items.length} record${items.length === 1 ? "" : "s"}`} />
          <DataTable rows={items} rowKey={(row, index) => String(row.id ?? index)} columns={collectionColumns(items)} density="compact" />
        </Card>
      ))}
      {blobs.map(([key, value]) => (
        <Card key={key}>
          <CardHeader title={labelFor(key)} />
          <CardBody>
            <pre className="overflow-auto rounded-md bg-canvas p-3 font-mono text-xs text-muted scrollbar-thin">{JSON.stringify(value, null, 2)}</pre>
          </CardBody>
        </Card>
      ))}
      {running ? <ActionModal action={running} record={record} invalidate={[config.path, "/activity"]} onClose={() => setRunning(null)} /> : null}
    </Page>
  );
}

function ActionModal({ action, record, invalidate, onClose }: { action: ActionDef; record: Row; invalidate: string[]; onClose: () => void }) {
  const mutation = useAction(invalidate);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { ...(action.body ? action.body(record) : {}), ...formBody(new FormData(event.currentTarget), action.fields || []) };
    await mutation.mutateAsync({ path: action.path(record), method: action.method || "POST", body });
    onClose();
  }
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={action.label} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="record-action" loading={mutation.isPending} variant={action.variant === "danger" ? "danger" : "default"}>{action.label}</Button></>}>
      <form id="record-action" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <FormFields fields={action.fields || []} initial={record} />
        {mutation.error ? <ErrorNote className="sm:col-span-2">{mutation.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function isRef(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Row;
  return "name" in row || "number" in row || "code" in row || "title" in row;
}

function labelFor(key: string) {
  return humanize(key.replace(/([a-z])([A-Z])/g, "$1_$2")).replace(/\bId\b/, "ID");
}

function humanizeMaybe(value: unknown) {
  const text = String(value);
  return /^[A-Z_]+$/.test(text) ? humanize(text) : text;
}

function displayValue(key: string, value: unknown): React.ReactNode {
  if (value === null || value === undefined || value === "") return <span className="text-subtle">—</span>;
  if (isRef(value)) {
    const row = value as Row;
    return String(row.name || row.number || row.title || row.code);
  }
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (/(At|Date|On|Until|deadline|plannedStart)$/.test(key) && typeof value === "string" && !Number.isNaN(Date.parse(value))) return formatDate(value);
  if (/(price|cost|amount|total|subtotal|tax|limit|value|salary|exposure)$/i.test(key) && !Number.isNaN(Number(value))) return money(value);
  if (key === "status" || key === "priority") return <StatusPill status={String(value)} />;
  if (/Id$/.test(key)) return <span className="font-mono text-xs text-muted">{String(value)}</span>;
  return humanizeMaybe(value);
}

function collectionColumns(items: Row[]): Array<Column<Row>> {
  const keys = Object.keys(items[0]).filter((key) => !SKIP.has(key) && !/Id$/.test(key) && (items[0][key] === null || typeof items[0][key] !== "object" || isRef(items[0][key]))).slice(0, 7);
  return keys.map((key) => ({ key, header: labelFor(key), render: (row: Row) => displayValue(key, row[key]) }));
}
