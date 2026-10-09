"use client";

import { Button, Card, DataTable, ErrorNote, Field, Modal, Page, PageHeader, Select, StatusPill, TextInput, money, relativeTime } from "@fixotec/ui";
import { Search, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { FormEvent, useMemo, useState } from "react";
import { QueryError } from "../../../components/common";
import { useAction, useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type BoqRow = { id: string; number: string; title: string; source: string; status: string; createdAt: string; project?: { name: string; code: string } | null; items: Array<{ amount: number | string }> };

export default function BoqPage() {
  const router = useRouter();
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [importing, setImporting] = useState(false);
  const { data, error, isLoading } = useApi<BoqRow[]>("/boq");
  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return (data || []).filter((row) => !term || [row.number, row.title, row.project?.name].some((value) => value?.toLowerCase().includes(term)));
  }, [data, q]);

  return (
    <Page>
      <PageHeader
        title="Bills of quantities"
        description="Imported or drafted BOQs, matched to the catalogue and converted into RFQs."
        actions={allowed(session, "boq.create") ? <Button onClick={() => setImporting(true)}><Upload /> Import BOQ</Button> : null}
      />
      <Card>
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search BOQs..." value={q} onChange={(event) => setQ(event.target.value)} className="w-72" />
        </div>
        <QueryError error={error} />
        <DataTable
          rows={rows}
          loading={isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => router.push(`/boq/${row.id}`)}
          empty="No BOQs yet. Import a CSV or Excel sheet to start."
          columns={[
            { key: "number", header: "BOQ", sortValue: (row) => row.number, render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "title", header: "Title" },
            { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project ? `${row.project.code} · ${row.project.name}` : "—"}</span> },
            { key: "source", header: "Source", render: (row) => <span className="text-muted">{row.source}</span> },
            { key: "lines", header: "Lines", align: "right", render: (row) => row.items.length },
            { key: "value", header: "Value", align: "right", sortValue: (row) => row.items.reduce((sum, item) => sum + Number(item.amount), 0), render: (row) => money(row.items.reduce((sum, item) => sum + Number(item.amount), 0)) },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
            { key: "createdAt", header: "Created", sortValue: (row) => row.createdAt, render: (row) => <span className="text-muted">{relativeTime(row.createdAt)}</span> },
          ]}
        />
      </Card>
      <ImportBoq open={importing} onOpenChange={setImporting} onDone={(id) => router.push(`/boq/${id}`)} />
    </Page>
  );
}

function ImportBoq({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (open: boolean) => void; onDone: (id: string) => void }) {
  const projects = useApi<Paged<{ id: string; code: string; name: string }>>(open ? "/projects?pageSize=100" : null);
  const action = useAction<FormData, { id: string }>(["/boq"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    for (const [key, value] of [...form.entries()]) if (value === "") form.delete(key);
    const created = await action.mutateAsync({ path: "/boq/import", body: form });
    onOpenChange(false);
    onDone(created.id);
  }
  return (
    <Modal open={open} onOpenChange={onOpenChange} title="Import BOQ" description="CSV or Excel with columns description, qty, unit, rate (and optionally article). PDFs are stored for manual entry." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="import-boq" loading={action.isPending}>Import</Button></>}>
      <form id="import-boq" onSubmit={submit} className="grid gap-4">
        <Field label="File"><input name="file" type="file" required accept=".csv,.xlsx,.pdf" className="text-sm file:mr-3 file:rounded-md file:border-0 file:bg-canvas file:px-3 file:py-1.5 file:text-sm" /></Field>
        <Field label="Title"><TextInput name="title" placeholder="Defaults to the file name" /></Field>
        <Field label="Project">
          <Select name="projectId" defaultValue="">
            <option value="">No project</option>
            {(projects.data?.items || []).map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
          </Select>
        </Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
