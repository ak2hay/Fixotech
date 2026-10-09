"use client";

import { Button, Card, Checkbox, DataTable, Drawer, ErrorNote, Field, FilterButton, KeyValueList, Modal, Page, PageHeader, Select, StatusPill, TextInput, formatDate, relativeTime } from "@fixotec/ui";
import { Download, Plus } from "lucide-react";
import { FormEvent, useState } from "react";
import { QueryError, fileSize } from "../../../components/common";
import { Link } from "../../../components/link";
import { download, postDownload } from "../../../lib/api";
import { useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";
import { useQueryClient } from "@tanstack/react-query";

type SubmittalRow = { id: string; number: string; title: string; status: string; createdAt: string; project?: { id: string; name: string; code: string } | null; selections: { documentIds?: string[]; variantIds?: string[] } };
type SubmittalDetail = SubmittalRow & { document: { id: string; title: string; versions: Array<{ version: number; status: string; fileName: string; sizeBytes: number; createdAt: string }> } | null };

export default function SubmittalsPage() {
  const { session } = useSession();
  const [projectId, setProjectId] = useState("");
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const query = new URLSearchParams();
  if (projectId) query.set("projectId", projectId);
  if (status) query.set("status", status);
  const { data, error, isLoading } = useApi<{ items: SubmittalRow[] }>(`/submittals?${query}`, { keepPrevious: true });
  const projects = useApi<Paged<{ id: string; code: string; name: string }>>("/projects?pageSize=100");

  return (
    <Page>
      <PageHeader
        title="Technical submittals"
        description="Compiled product data, drawings and certificates issued to consultants for approval."
        actions={allowed(session, "engineering.create") ? <Button onClick={() => setCreating(true)}><Plus /> New submittal</Button> : null}
      />
      <Card>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <FilterButton label="Project" value={projectId} onChange={setProjectId} options={(projects.data?.items || []).map((item) => ({ value: item.id, label: `${item.code} · ${item.name}` }))} />
          <FilterButton label="Status" value={status} onChange={setStatus} options={["DRAFT", "SUBMITTED", "APPROVED", "APPROVED_AS_NOTED", "REJECTED"].map((value) => ({ value, label: value.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase()) }))} />
        </div>
        <QueryError error={error} />
        <DataTable
          rows={data?.items || []}
          loading={isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => setSelected(row.id)}
          empty="No submittals yet."
          columns={[
            { key: "number", header: "Submittal", sortValue: (row) => row.number, render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "title", header: "Title" },
            { key: "project", header: "Project", render: (row) => (row.project ? <span className="text-muted">{row.project.code} · {row.project.name}</span> : "—") },
            { key: "contents", header: "Contents", render: (row) => <span className="text-muted">{row.selections?.variantIds?.length || 0} products · {row.selections?.documentIds?.length || 0} documents</span> },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
            { key: "createdAt", header: "Created", sortValue: (row) => row.createdAt, render: (row) => <span className="text-muted">{relativeTime(row.createdAt)}</span> },
          ]}
        />
      </Card>
      <SubmittalDrawer id={selected} onClose={() => setSelected(null)} />
      <CreateSubmittal open={creating} onOpenChange={setCreating} projects={projects.data?.items || []} />
    </Page>
  );
}

function SubmittalDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const { data } = useApi<SubmittalDetail>(id ? `/submittals/${id}` : null);
  return (
    <Drawer open={Boolean(id)} onOpenChange={(open) => !open && onClose()} title={data?.number || "Submittal"} description={data?.title}>
      {data ? (
        <div className="space-y-5">
          <KeyValueList
            items={[
              { label: "Status", value: <StatusPill status={data.status} /> },
              { label: "Project", value: data.project ? <Link href={`/projects/${data.project.id}`} className="hover:text-accent">{data.project.name}</Link> : "—" },
              { label: "Products", value: data.selections?.variantIds?.length || 0 },
              { label: "Documents", value: data.selections?.documentIds?.length || 0 },
              { label: "Created", value: formatDate(data.createdAt) },
            ]}
          />
          {data.document ? (
            <div>
              <p className="mb-2 text-sm font-semibold">Revisions</p>
              <div className="space-y-2">
                {data.document.versions.map((version) => (
                  <div key={version.version} className="flex items-center justify-between rounded-md border border-line px-3 py-2">
                    <div>
                      <p className="text-sm font-medium">Rev {version.version} · {version.fileName}</p>
                      <p className="text-xs text-muted">{fileSize(version.sizeBytes)} · {formatDate(version.createdAt)}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusPill status={version.status} />
                      <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={() => download(`/documents/${data.document!.id}/download?version=${version.version}`, version.fileName)}><Download /></Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </Drawer>
  );
}

function CreateSubmittal({ open, onOpenChange, projects }: { open: boolean; onOpenChange: (open: boolean) => void; projects: Array<{ id: string; code: string; name: string }> }) {
  const client = useQueryClient();
  const [projectId, setProjectId] = useState("");
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [variantIds, setVariantIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const docs = useApi<{ items: Array<{ id: string; title: string; category: string }> }>(open && projectId ? `/documents?entityType=project&entityId=${projectId}` : null);
  const products = useApi<Paged<{ id: string; name: string; variants: Array<{ id: string; articleNumber: string; name: string }> }>>(open ? "/products?pageSize=100" : null);

  const toggle = (list: string[], set: (value: string[]) => void, id: string) => set(list.includes(id) ? list.filter((item) => item !== id) : [...list, id]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      await postDownload("/submittals", { projectId, title: String(form.get("title")), documentIds, variantIds }, `${String(form.get("title"))}.pdf`);
      await client.invalidateQueries({ predicate: (query) => String(query.queryKey[0] || "").startsWith("/submittals") || String(query.queryKey[0] || "").startsWith("/documents") });
      onOpenChange(false);
      setDocumentIds([]);
      setVariantIds([]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} title="New technical submittal" description="Selected product data and project drawings are compiled into one PDF." footer={<><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" form="new-submittal" loading={busy} disabled={!projectId}>Compile PDF</Button></>}>
      <form id="new-submittal" onSubmit={submit} className="grid gap-4">
        <Field label="Project">
          <Select value={projectId} onChange={(event) => { setProjectId(event.target.value); setDocumentIds([]); }} required>
            <option value="" disabled>Select project</option>
            {projects.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}
          </Select>
        </Field>
        <Field label="Title"><TextInput name="title" required placeholder="e.g. Pipe support system - Tower A" /></Field>
        <div>
          <p className="mb-2 text-sm font-medium">Project documents</p>
          <div className="max-h-40 space-y-1.5 overflow-auto rounded-md border border-line p-2 scrollbar-thin">
            {!projectId ? <p className="text-xs text-muted">Choose a project first.</p> : docs.data?.items.length ? docs.data.items.map((doc) => (
              <label key={doc.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={documentIds.includes(doc.id)} onChange={() => toggle(documentIds, setDocumentIds, doc.id)} />
                {doc.title} <span className="text-xs text-muted">{doc.category}</span>
              </label>
            )) : <p className="text-xs text-muted">No documents on this project.</p>}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">Products ({variantIds.length} selected)</p>
          <div className="max-h-48 space-y-1.5 overflow-auto rounded-md border border-line p-2 scrollbar-thin">
            {(products.data?.items || []).flatMap((product) => product.variants.map((variant) => (
              <label key={variant.id} className="flex items-center gap-2 text-sm">
                <Checkbox checked={variantIds.includes(variant.id)} onChange={() => toggle(variantIds, setVariantIds, variant.id)} />
                <span className="font-mono text-2xs text-muted">{variant.articleNumber}</span> {product.name} - {variant.name}
              </label>
            )))}
          </div>
        </div>
        <ErrorNote>{error}</ErrorNote>
      </form>
    </Modal>
  );
}
