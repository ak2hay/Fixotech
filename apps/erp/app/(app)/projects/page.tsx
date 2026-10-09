"use client";

import { PROJECT_STAGES } from "@fixotec/shared";
import { Avatar, Button, Card, DataTable, FilterButton, Modal, Page, PageHeader, ProgressBar, Select, StatusPill, Tabs, TextInput, Field, compactMoney, humanize, relativeTime, cn, ErrorNote } from "@fixotec/ui";
import { Download, LayoutGrid, List, MapPin, Plus, Search } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useMemo, useState } from "react";
import { Cover, HealthPill, QueryError } from "../../../components/common";
import { useAction, useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type ProjectRow = {
  id: string;
  code: string;
  name: string;
  location?: string | null;
  stage: string;
  fixotecValue?: number | null;
  projectValue?: number | null;
  progress: number;
  health: string | null;
  coverUrl: string | null;
  lastActivityAt: string;
  customer?: { name: string } | null;
  owner?: { name: string } | null;
};

const TAB_STAGES: Array<{ key: string; label: string; stages: string[] }> = [
  { key: "", label: "All", stages: [] },
  { key: "planning", label: "Planning", stages: ["IDENTIFIED", "RFQ"] },
  { key: "engineering", label: "Engineering", stages: ["ENGINEERING"] },
  { key: "commercial", label: "Commercial", stages: ["QUOTED", "NEGOTIATION"] },
  { key: "won", label: "Won", stages: ["WON"] },
  { key: "execution", label: "Site Execution", stages: ["EXECUTION"] },
  { key: "closed", label: "Completed", stages: ["CLOSED"] },
];

export default function ProjectsPage() {
  return (
    <Suspense>
      <Projects />
    </Suspense>
  );
}

function Projects() {
  const router = useRouter();
  const params = useSearchParams();
  const { session } = useSession();
  const [tab, setTab] = useState(params.get("tab") || "");
  const [stage, setStage] = useState("");
  const [health, setHealth] = useState("");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useState<"list" | "grid">("list");
  const [creating, setCreating] = useState(false);

  const tabStages = TAB_STAGES.find((item) => item.key === tab)?.stages || [];
  const status = stage || (tabStages.length === 1 ? tabStages[0] : "");
  const path = `/projects?page=${page}&pageSize=${tabStages.length > 1 ? 100 : 25}${status ? `&status=${status}` : ""}${q ? `&q=${encodeURIComponent(q)}` : ""}`;
  const { data, error, isLoading } = useApi<Paged<ProjectRow> & { stages: Record<string, number> }>(path, { keepPrevious: true });

  const rows = useMemo(() => {
    let items = data?.items || [];
    if (tabStages.length > 1 && !stage) items = items.filter((row) => tabStages.includes(row.stage));
    if (health) items = items.filter((row) => row.health === health);
    return items;
  }, [data, tabStages, stage, health]);

  const counts = data?.stages || {};
  const total = Object.values(counts).reduce((sum, value) => sum + value, 0);

  return (
    <Page>
      <PageHeader
        title="Projects"
        description="Manage all customer projects from enquiry to completion."
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv(rows)}>
              <Download /> Export
            </Button>
            {session && allowed(session, "projects.create") ? (
              <Button onClick={() => setCreating(true)}>
                <Plus /> Create Project
              </Button>
            ) : null}
          </>
        }
      />
      <Card>
        <div className="px-4 pt-2">
          <Tabs
            value={tab}
            onChange={(key) => {
              setTab(key);
              setStage("");
              setPage(1);
            }}
            items={TAB_STAGES.map((item) => ({ key: item.key, label: item.label, count: item.key ? item.stages.reduce((sum, key) => sum + (counts[key] || 0), 0) : total }))}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
          <TextInput icon={<Search />} placeholder="Search projects..." value={q} onChange={(event) => { setQ(event.target.value); setPage(1); }} className="w-64" />
          <FilterButton label="Stage" value={stage} onChange={(value) => { setStage(value); setPage(1); }} options={PROJECT_STAGES.map((value) => ({ value, label: humanize(value) }))} />
          <FilterButton label="Health" value={health} onChange={setHealth} options={[{ value: "ON_TRACK", label: "On Track" }, { value: "AT_RISK", label: "At Risk" }, { value: "DELAYED", label: "Delayed" }]} />
          <div className="ml-auto inline-flex rounded-md border border-line p-0.5">
            <button type="button" aria-label="List view" className={cn("rounded p-1.5", view === "list" ? "bg-sidebar text-white" : "text-muted hover:text-fg")} onClick={() => setView("list")}>
              <List className="h-4 w-4" />
            </button>
            <button type="button" aria-label="Grid view" className={cn("rounded p-1.5", view === "grid" ? "bg-sidebar text-white" : "text-muted hover:text-fg")} onClick={() => setView("grid")}>
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
        </div>
        <QueryError error={error} />
        {view === "list" ? (
          <DataTable
            rows={rows}
            loading={isLoading}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/projects/${row.id}`)}
            pagination={tabStages.length > 1 ? undefined : { page, pageSize: data?.pageSize || 25, total: data?.total || 0, onPage: setPage }}
            columns={[
              {
                key: "name",
                header: "Project",
                sortValue: (row) => row.name,
                render: (row) => (
                  <div className="flex items-center gap-3">
                    <Cover url={row.coverUrl} className="h-9 w-12" />
                    <div className="min-w-0">
                      <p className="truncate font-medium text-fg">{row.name}</p>
                      <p className="font-mono text-[11px] text-muted">{row.code}</p>
                    </div>
                  </div>
                ),
              },
              { key: "customer", header: "Customer", sortValue: (row) => row.customer?.name || "", render: (row) => row.customer?.name || "—" },
              { key: "location", header: "Location", render: (row) => <span className="text-muted">{row.location || "—"}</span> },
              { key: "stage", header: "Stage", sortValue: (row) => row.stage, render: (row) => <StatusPill status={row.stage} /> },
              { key: "value", header: "Value", align: "right", sortValue: (row) => Number(row.fixotecValue || 0), render: (row) => compactMoney(row.fixotecValue) },
              { key: "progress", header: "Progress", sortValue: (row) => row.progress, render: (row) => <ProgressBar value={row.progress} showLabel className="w-32" /> },
              { key: "health", header: "Health", sortValue: (row) => row.health || "", render: (row) => <HealthPill health={row.health} /> },
              { key: "owner", header: "Owner", render: (row) => (row.owner ? <Avatar name={row.owner.name} size="sm" /> : "—") },
              { key: "lastActivityAt", header: "Last activity", sortValue: (row) => row.lastActivityAt, render: (row) => <span className="whitespace-nowrap text-muted">{relativeTime(row.lastActivityAt)}</span> },
            ]}
          />
        ) : (
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {rows.map((row) => (
              <button key={row.id} type="button" onClick={() => router.push(`/projects/${row.id}`)} className="overflow-hidden rounded-lg border border-line bg-surface text-left shadow-card transition hover:shadow-pop">
                <Cover url={row.coverUrl} className="h-32 w-full" rounded="rounded-none" />
                <div className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold">{row.name}</p>
                      <p className="flex items-center gap-1 text-xs text-muted"><MapPin className="h-3 w-3" />{row.location || row.code}</p>
                    </div>
                    <HealthPill health={row.health} />
                  </div>
                  <ProgressBar value={row.progress} showLabel />
                  <div className="flex items-center justify-between text-xs">
                    <StatusPill status={row.stage} />
                    <span className="font-semibold tabular">{compactMoney(row.fixotecValue)}</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </Card>
      <CreateProject open={creating} onOpenChange={setCreating} onCreated={(id) => router.push(`/projects/${id}`)} />
    </Page>
  );
}

function CreateProject({ open, onOpenChange, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; onCreated: (id: string) => void }) {
  const customers = useApi<Paged<{ id: string; name: string; code: string }>>(open ? "/customers?pageSize=100" : null);
  const action = useAction<Record<string, unknown>, { id: string }>(["/projects"]);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body = Object.fromEntries([...form.entries()].filter(([, value]) => value !== ""));
    const created = await action.mutateAsync({ path: "/projects", body });
    onOpenChange(false);
    onCreated(created.id);
  }
  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="Create project"
      description="Milestones are created automatically from the start and completion dates."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="create-project" loading={action.isPending}>Create project</Button>
        </>
      }
    >
      <form id="create-project" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Project name" className="sm:col-span-2"><TextInput name="name" required minLength={2} /></Field>
        <Field label="Customer" className="sm:col-span-2">
          <Select name="customerId" required defaultValue="">
            <option value="" disabled>Select customer</option>
            {customers.data?.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name} ({customer.code})</option>)}
          </Select>
        </Field>
        <Field label="Location"><TextInput name="location" /></Field>
        <Field label="Stage">
          <Select name="stage" defaultValue="IDENTIFIED">{PROJECT_STAGES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
        </Field>
        <Field label="Fixotec value (INR)"><TextInput name="fixotecValue" type="number" min={0} /></Field>
        <Field label="Project value (INR)"><TextInput name="projectValue" type="number" min={0} /></Field>
        <Field label="Start date"><TextInput name="startDate" type="date" /></Field>
        <Field label="Expected completion"><TextInput name="expectedCompletion" type="date" /></Field>
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function exportCsv(rows: ProjectRow[]) {
  const header = ["Code", "Project", "Customer", "Location", "Stage", "Value", "Progress", "Health"];
  const lines = rows.map((row) => [row.code, row.name, row.customer?.name || "", row.location || "", row.stage, row.fixotecValue || 0, `${row.progress}%`, row.health || ""].map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(","));
  const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "projects.csv";
  anchor.click();
  URL.revokeObjectURL(url);
}
