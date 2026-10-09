"use client";

import { Button, Card, DataTable, ErrorNote, Field, Modal, Select, StatusPill, Tabs, TextArea, TextInput, humanize } from "@fixotec/ui";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";
import { DateText, ListPage, QueryError, SearchBox, matches } from "../../../components/common";
import { useAction, useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Request = { id: string; number: string; status: string; application?: string | null; requiredSystem?: string | null; dueDate?: string | null; createdAt: string; project?: { name: string; code: string } | null; engineer?: { name: string } | null };

export default function EngineeringPage() {
  const router = useRouter();
  const { session } = useSession();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const { data, error, isLoading } = useApi<{ items: Request[]; counts: Record<string, number> }>("/engineering");
  const all = data?.items || [];
  const rows = all.filter((row) => (!status || row.status === status) && matches(row, q));
  const statuses = Object.keys(data?.counts || {});

  return (
    <ListPage
      title="Engineering requests"
      description="Design support, load calculations and drawings from Fixotec engineers."
      actions={allowed(session, "engineering.create") ? <Button onClick={() => setCreating(true)}><Plus /> New request</Button> : null}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs variant="pill" items={[{ key: "", label: "All", count: all.length }, ...statuses.map((item) => ({ key: item, label: humanize(item), count: data?.counts[item] }))]} value={status} onChange={setStatus} />
        <SearchBox value={q} onChange={setQ} placeholder="Search requests..." />
      </div>
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => router.push(`/engineering/${row.id}`)}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No engineering requests.</p>}
          columns={[
            { key: "number", header: "Request", render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || "—"}</span> },
            { key: "application", header: "Application", render: (row) => <div><p>{row.application || "—"}</p>{row.requiredSystem ? <p className="text-xs text-muted">{row.requiredSystem}</p> : null}</div> },
            { key: "engineer", header: "Engineer", render: (row) => row.engineer?.name || <span className="text-subtle">Unassigned</span> },
            { key: "dueDate", header: "Due", render: (row) => <DateText value={row.dueDate} /> },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
          ]}
        />
      </Card>
      <NewRequest open={creating} onOpenChange={setCreating} onCreated={(id) => router.push(`/engineering/${id}`)} />
    </ListPage>
  );
}

function NewRequest({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: string) => void }) {
  const action = useAction<Record<string, unknown>, { id: string }>(["/engineering", "/portal"]);
  const projects = useApi<Paged<{ id: string; name: string; code: string }>>(open ? "/projects?pageSize=100" : null);
  const [form, setForm] = useState({ projectId: "", application: "", requiredSystem: "", load: "", dimensions: "", material: "", installationCondition: "", standard: "", dueDate: "", notes: "" });
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((current) => ({ ...current, [key]: event.target.value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const body = Object.fromEntries(Object.entries(form).filter(([, value]) => value));
    const row = await action.submit({ path: "/engineering", body });
    if (!row) return;
    onOpenChange(false);
    onCreated(row.id);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New engineering request"
      description="Share the design inputs; an engineer will pick it up and keep you posted here."
      className="max-w-2xl"
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="engineering-form" loading={action.isPending}>Send request</Button>
        </>
      }
    >
      <form id="engineering-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Project" className="sm:col-span-2">
          <Select value={form.projectId} onChange={set("projectId")}>
            <option value="">Not linked to a project</option>
            {(projects.data?.items || []).map((project) => (
              <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
            ))}
          </Select>
        </Field>
        <Field label="Application"><TextInput value={form.application} onChange={set("application")} placeholder="Pipe support, cable tray..." required /></Field>
        <Field label="Required system"><TextInput value={form.requiredSystem} onChange={set("requiredSystem")} placeholder="Strut, seismic, trapeze..." /></Field>
        <Field label="Load"><TextInput value={form.load} onChange={set("load")} placeholder="e.g. 2.5 kN per support" /></Field>
        <Field label="Dimensions"><TextInput value={form.dimensions} onChange={set("dimensions")} /></Field>
        <Field label="Material"><TextInput value={form.material} onChange={set("material")} /></Field>
        <Field label="Standard"><TextInput value={form.standard} onChange={set("standard")} placeholder="IS, ASCE, NFPA..." /></Field>
        <Field label="Installation condition"><TextInput value={form.installationCondition} onChange={set("installationCondition")} /></Field>
        <Field label="Needed by"><TextInput type="date" value={form.dueDate} onChange={set("dueDate")} /></Field>
        <Field label="Notes" className="sm:col-span-2"><TextArea rows={3} value={form.notes} onChange={set("notes")} /></Field>
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
