"use client";

import { DataTable, DropdownMenu, EmptyState, PaginationBar, ProgressBar, formatDate } from "@fixotec/ui";
import { ArrowRight, Building2, CalendarDays, CheckCircle2, Clock3, Copy, Folder, IndianRupee, MapPin, MoreHorizontal, Timer, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { DateText, DotTabs, KpiCard, KpiGrid, ListPage, MetaItem, PrimaryButton, QueryError, SearchBox, SortSelect, StageBadge, StatusChip, TableCard, ToolbarCard, ViewToggle, rupees, shareOf } from "../../../components/common";
import { Link } from "../../../components/link";
import { mediaUrl } from "../../../lib/api";
import { useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Project = { id: string; code: string; name: string; location?: string | null; stage: string; progress: number; health: string; coverUrl?: string | null; startDate?: string | null; expectedCompletion?: string | null; projectValue?: number | string | null; notes?: string | null; lastActivityAt: string; customer?: { name: string } | null };

type ProjectsResponse = Paged<Project> & { stages?: Record<string, number> };

const ACTIVE = ["IDENTIFIED", "RFQ", "ENGINEERING", "NEGOTIATION", "WON", "EXECUTION"];

const GROUPS: Record<string, string[]> = { active: ACTIVE, quoted: ["QUOTED"], completed: ["CLOSED"], lost: ["LOST"] };

const TABS = [
  { key: "", label: "All Projects" },
  { key: "active", label: "Active", dot: "bg-emerald-500" },
  { key: "quoted", label: "Quoted", dot: "bg-amber-500" },
  { key: "completed", label: "Completed", dot: "bg-violet-500" },
  { key: "lost", label: "Lost", dot: "bg-rose-500" },
];

const SORTS = [
  { key: "latest", label: "Latest" },
  { key: "name", label: "Name" },
  { key: "value", label: "Value" },
];

function sumStages(stages: Record<string, number>, keys?: string[]) {
  return Object.entries(stages).reduce((sum, [stage, count]) => (!keys || keys.includes(stage) ? sum + count : sum), 0);
}

export default function ProjectsPage() {
  const router = useRouter();
  const { session } = useSession();
  const [q, setQ] = useState("");
  const [page, setPage] = useState(1);
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState("latest");
  const [view, setView] = useState<"grid" | "list">("grid");
  const { data, error, isLoading } = useApi<ProjectsResponse>(`/projects?page=${page}&pageSize=24${q ? `&q=${encodeURIComponent(q)}` : ""}`, { keepPrevious: true });

  const stages = data?.stages || {};
  const total = sumStages(stages);
  const active = sumStages(stages, ACTIVE);
  const quoted = sumStages(stages, GROUPS.quoted);
  const completed = sumStages(stages, GROUPS.completed);

  const rows = useMemo(() => {
    const filtered = (data?.items || []).filter((row) => !group || GROUPS[group].includes(row.stage));
    if (sort === "name") return [...filtered].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === "value") return [...filtered].sort((a, b) => Number(b.projectValue || 0) - Number(a.projectValue || 0));
    return filtered;
  }, [data, group, sort]);

  return (
    <ListPage
      title="Projects"
      description="Manage your ongoing and past projects, track progress, documents and key details."
      actions={allowed(session, "rfqs.create") ? <PrimaryButton href="/rfqs/new">New RFQ</PrimaryButton> : null}
    >
      <KpiGrid>
        <KpiCard label="Total Projects" value={total} icon={<Folder />} tone="blue" footer="Across all stages" loading={isLoading} />
        <KpiCard label="Active Projects" value={active} icon={<TrendingUp />} tone="green" footer={shareOf(active, total)} loading={isLoading} />
        <KpiCard label="Quoted" value={quoted} icon={<Clock3 />} tone="amber" footer={shareOf(quoted, total)} loading={isLoading} />
        <KpiCard label="Completed" value={completed} icon={<CheckCircle2 />} tone="violet" footer={shareOf(completed, total)} loading={isLoading} />
      </KpiGrid>

      <ToolbarCard tabs={<DotTabs items={TABS} value={group} onChange={setGroup} />}>
        <SearchBox value={q} onChange={(value) => { setQ(value); setPage(1); }} placeholder="Search projects..." />
        <SortSelect value={sort} onChange={setSort} options={SORTS} />
        <ViewToggle value={view} onChange={setView} />
      </ToolbarCard>

      <QueryError error={error} />
      {!isLoading && !rows.length ? (
        <TableCard>
          <EmptyState icon={<Building2 />} title="No projects found" description="Try another filter, or contact your Fixotec account manager." />
        </TableCard>
      ) : view === "grid" ? (
        <div className="grid gap-5 lg:grid-cols-2 2xl:grid-cols-3">
          {rows.map((project) => (
            <ProjectCard key={project.id} project={project} onOpen={() => router.push(`/projects/${project.id}`)} />
          ))}
        </div>
      ) : (
        <TableCard>
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            loading={isLoading}
            onRowClick={(row) => router.push(`/projects/${row.id}`)}
            columns={[
              { key: "name", header: "Project", render: (row) => <div className="flex items-center gap-3"><Thumb url={row.coverUrl} /><div><p className="font-medium">{row.name}</p><p className="text-xs text-muted">{row.code}</p></div></div> },
              { key: "location", header: "Location", render: (row) => <span className="text-muted">{row.location || "—"}</span> },
              { key: "stage", header: "Stage", render: (row) => <StageBadge status={row.stage} kind="stage" /> },
              { key: "progress", header: "Progress", render: (row) => <div className="flex w-36 items-center gap-2"><ProgressBar value={row.progress} tone="good" className="flex-1" /><span className="text-xs tabular">{Math.round(row.progress)}%</span></div> },
              { key: "startDate", header: "Start", render: (row) => <DateText value={row.startDate} /> },
              { key: "expectedCompletion", header: "End", render: (row) => <DateText value={row.expectedCompletion} /> },
              { key: "projectValue", header: "Value", align: "right", render: (row) => <span className="font-medium">{rupees(row.projectValue)}</span> },
            ]}
          />
        </TableCard>
      )}
      {data && data.total > data.pageSize ? <PaginationBar page={page} pageSize={data.pageSize} total={data.total} onPage={setPage} /> : null}
    </ListPage>
  );
}

function Thumb({ url }: { url?: string | null }) {
  const src = mediaUrl(url);
  if (!src) return <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent"><Building2 className="h-4 w-4" /></span>;
  return <img src={src} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />;
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const src = mediaUrl(project.coverUrl);
  const href = `/projects/${project.id}`;
  const showProgress = ACTIVE.includes(project.stage) && project.progress > 0;
  return (
    <article className="group flex flex-col overflow-hidden rounded-xl border border-line/70 bg-surface shadow-card transition hover:shadow-card-hover">
      <Link href={href} className="relative block h-44 overflow-hidden">
        {src ? (
          <img src={src} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]" />
        ) : (
          <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-slate-100 text-accent/40">
            <Building2 className="h-14 w-14" />
          </span>
        )}
        <span className="absolute right-3 top-3">
          <StatusChip status={project.stage} kind="stage" />
        </span>
      </Link>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Link href={href} className="block truncate text-lg font-bold text-fg hover:text-accent">{project.name}</Link>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-muted"><MapPin className="h-3.5 w-3.5 shrink-0" />{project.location || "Location not set"}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-xs text-muted">Project ID</p>
            <p className="mt-0.5 text-sm font-medium text-fg">{project.code}</p>
          </div>
        </div>

        {showProgress ? (
          <div className="mt-4 flex items-center gap-4">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400" style={{ width: `${Math.min(100, Math.round(project.progress))}%` }} />
            </div>
            <span className="text-sm font-semibold tabular text-fg">{Math.round(project.progress)}% Complete</span>
          </div>
        ) : null}

        <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-4">
          <MetaItem icon={<Timer />} label="Stage"><StageBadge status={project.stage} kind="stage" /></MetaItem>
          <MetaItem icon={<CalendarDays />} label="Start Date">{formatDate(project.startDate) || "—"}</MetaItem>
          <MetaItem icon={<CalendarDays />} label="End Date">{formatDate(project.expectedCompletion) || "—"}</MetaItem>
          <MetaItem icon={<IndianRupee />} label="Value">{rupees(project.projectValue)}</MetaItem>
        </div>

        {project.notes ? <p className="mt-4 line-clamp-2 text-sm leading-relaxed text-muted">{project.notes}</p> : null}

        <div className="mt-auto flex items-center justify-between gap-3 pt-5">
          <Link href={href} className="inline-flex h-10 items-center gap-2 rounded-lg border border-accent/30 bg-accent-soft px-5 text-sm font-semibold text-accent transition hover:border-accent hover:bg-accent hover:text-white">
            View Details <ArrowRight className="h-4 w-4" />
          </Link>
          <DropdownMenu
            trigger={
              <button type="button" aria-label="More actions" className="flex h-10 w-10 items-center justify-center rounded-lg border border-line text-muted transition hover:bg-canvas hover:text-fg">
                <MoreHorizontal className="h-4 w-4" />
              </button>
            }
            items={[
              { label: "Open project", icon: <ArrowRight />, onSelect: onOpen },
              { label: "Copy project ID", icon: <Copy />, onSelect: () => void navigator.clipboard?.writeText(project.code).catch(() => undefined) },
            ]}
          />
        </div>
      </div>
    </article>
  );
}
