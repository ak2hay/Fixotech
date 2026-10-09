"use client";

import { ActionRow, ActivityFeed, Button, Card, CardBody, CardHeader, DataTable, EmptyState, MiniStat, Page, ProgressBar, StatusPill, compactMoney, formatDate, greeting, money } from "@fixotec/ui";
import { ArrowRight, Building2, CheckSquare, ClipboardList, FileStack, Gift, MapPin, PackageSearch, Plus, Receipt, Ruler, ShoppingCart, Target, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { Cover, HealthPill, PageSkeleton, QueryError, toActivity, type ActivityRow } from "../../components/common";
import { Link } from "../../components/link";
import { rowsOf } from "../../lib/api";
import { useApi } from "../../lib/query";
import { useSession } from "../../lib/session";

type SummaryProject = { id: string; code: string; name: string; location?: string | null; stage: string; expectedCompletion?: string | null; progress: number; health: string; coverUrl?: string | null; nextMilestone?: string | null };
type Summary = { stats: { activeProjects: number; openRfqs: number; pendingApprovals: number; ordersInTransit: number }; projects: SummaryProject[]; activity: ActivityRow[] };

export default function PortalHome() {
  const { session, role } = useSession();
  const first = session?.user.name.split(" ")[0] || "";
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });

  return (
    <Page>
      <section className="relative overflow-hidden rounded-xl bg-sidebar text-white shadow-card">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_20%,rgba(242,107,29,0.35),transparent_45%),linear-gradient(120deg,transparent_55%,rgba(255,255,255,0.04)_55%)]" />
        <svg className="absolute bottom-0 right-0 h-full w-1/2 opacity-[0.12]" viewBox="0 0 400 160" preserveAspectRatio="xMaxYMax slice" aria-hidden>
          <path d="M0 160V100h40V60h30v40h20V30h40v130M150 160V80h35v80M200 160V50h50v110M270 160V90h30V40h40v120M350 160V70h50v90" fill="none" stroke="white" strokeWidth="2" />
          <path d="M20 120h360M20 140h360" stroke="white" strokeDasharray="4 6" />
        </svg>
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 py-7">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {greeting()}, {first}
            </h1>
            <p className="mt-1 text-sm text-sidebar-muted">{today}</p>
            <p className="mt-3 max-w-lg text-sm text-white/80">
              {role === "distributor" ? "Check availability, place orders and track your targets." : role === "consultant" ? "Specify, review drawings and follow your engineering requests." : "Track your projects, quotations and deliveries in one place."}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Engineered support</p>
            <p className="text-sm font-semibold uppercase tracking-[0.12em]">for a stronger tomorrow</p>
          </div>
        </div>
      </section>
      {role === "distributor" ? <DistributorHome /> : role === "consultant" ? <ConsultantHome /> : <CustomerHome />}
    </Page>
  );
}

function CustomerHome() {
  const { data, error, isLoading } = useApi<Summary>("/portal/summary");
  if (isLoading) return <PageSkeleton />;
  return (
    <>
      <QueryError error={error} />
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Active projects" value={data?.stats.activeProjects ?? 0} icon={<Building2 />} tone="accent" />
        <MiniStat label="Open RFQs" value={data?.stats.openRfqs ?? 0} icon={<ClipboardList />} tone="info" />
        <MiniStat label="Pending approvals" value={data?.stats.pendingApprovals ?? 0} icon={<CheckSquare />} tone="warn" hint="Quotations and drawings for your review" />
        <MiniStat label="Orders in transit" value={data?.stats.ordersInTransit ?? 0} icon={<Truck />} tone="good" />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Your projects" action={<Link href="/projects" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>} />
          <CardBody>
            {data?.projects.length ? (
              <div className="grid gap-4 md:grid-cols-2">
                {data.projects.map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            ) : (
              <EmptyState icon={<Building2 />} title="No active projects" description="Projects appear here once Fixotec links them to your account." />
            )}
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Quick actions" />
            <CardBody className="space-y-0.5 px-2">
              <ActionRow icon={<Plus />} title="Request a quotation" description="Send us your requirement" href="/rfqs/new" LinkComponent={Link} />
              <ActionRow icon={<CheckSquare />} tone="warn" title="Review quotations" description="Accept or ask for changes" href="/quotations" LinkComponent={Link} />
              <ActionRow icon={<Truck />} tone="good" title="Track deliveries" description="Dispatch and proof of delivery" href="/deliveries" LinkComponent={Link} />
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent activity" />
            <CardBody>
              <ActivityFeed items={toActivity(data?.activity)} compact LinkComponent={Link} />
            </CardBody>
          </Card>
        </div>
      </section>
    </>
  );
}

function ProjectCard({ project }: { project: SummaryProject }) {
  return (
    <Link href={`/projects/${project.id}`} className="group block overflow-hidden rounded-lg border border-line bg-surface transition hover:border-accent/50 hover:shadow-card">
      <Cover url={project.coverUrl} className="h-32 w-full" rounded="rounded-none" />
      <div className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-semibold text-fg group-hover:text-accent">{project.name}</p>
            <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted">
              <MapPin className="h-3 w-3" /> {project.location || project.code}
            </p>
          </div>
          <HealthPill health={project.health} />
        </div>
        <div>
          <div className="mb-1 flex justify-between text-xs">
            <span className="text-muted">{project.nextMilestone ? `Next: ${project.nextMilestone}` : "Progress"}</span>
            <span className="font-semibold tabular">{Math.round(project.progress)}%</span>
          </div>
          <ProgressBar value={project.progress} tone={project.health === "DELAYED" ? "bad" : project.health === "AT_RISK" ? "warn" : "accent"} />
        </div>
        {project.expectedCompletion ? <p className="text-xs text-subtle">Completion {formatDate(project.expectedCompletion)}</p> : null}
      </div>
    </Link>
  );
}

type Order = { id: string; number: string; status: string; total: number | string; createdAt: string };
type TargetRow = { id: string; period: string; metric: string; targetAmount: number | string; achievedAmount: number | string };

function DistributorHome() {
  const router = useRouter();
  const orders = useApi<{ items: Order[]; total: number }>("/sales-orders?pageSize=6");
  const targets = useApi<TargetRow[]>("/distributor/targets");
  const invoices = useApi<unknown>("/invoices");
  const schemes = useApi<unknown[]>("/distributor/schemes");
  const invoiceRows = rowsOf<{ status: string; total: number | string; payments?: Array<{ amount: number | string }> }>(invoices.data);
  const outstanding = invoiceRows.reduce((sum, row) => sum + Number(row.total) - (row.payments || []).reduce((paid, payment) => paid + Number(payment.amount), 0), 0);
  const current = targets.data?.[0];
  const achievement = current && Number(current.targetAmount) ? (Number(current.achievedAmount) / Number(current.targetAmount)) * 100 : 0;
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Orders" value={orders.data?.total ?? 0} icon={<ShoppingCart />} tone="accent" />
        <MiniStat label="Outstanding" value={compactMoney(outstanding)} icon={<Receipt />} tone="warn" />
        <MiniStat label="Target achieved" value={`${Math.round(achievement)}%`} icon={<Target />} tone="good" hint={current?.period} />
        <MiniStat label="Active schemes" value={schemes.data?.length ?? 0} icon={<Gift />} tone="info" />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Recent orders" action={<Button size="sm" onClick={() => router.push("/orders/new")}><Plus /> New order</Button>} />
          <DataTable
            rows={orders.data?.items || []}
            rowKey={(row) => row.id}
            loading={orders.isLoading}
            onRowClick={(row) => router.push(`/orders/${row.id}`)}
            empty={<p className="px-4 py-8 text-center text-sm text-muted">No orders yet.</p>}
            columns={[
              { key: "number", header: "Order", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "createdAt", header: "Placed", render: (row) => formatDate(row.createdAt) },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
              { key: "total", header: "Value", align: "right", render: (row) => money(row.total) },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Quick actions" />
          <CardBody className="space-y-0.5 px-2">
            <ActionRow icon={<PackageSearch />} title="Browse catalogue" description="Products and your prices" href="/catalogue" LinkComponent={Link} />
            <ActionRow icon={<Truck />} tone="good" title="Check availability" description="Stock bands by article" href="/stock" LinkComponent={Link} />
            <ActionRow icon={<Gift />} tone="info" title="Claim a scheme" description="Submit a scheme claim" href="/schemes" LinkComponent={Link} />
          </CardBody>
        </Card>
      </section>
    </>
  );
}

function ConsultantHome() {
  const router = useRouter();
  const summary = useApi<Summary>("/portal/summary");
  const engineering = useApi<{ items: Array<{ id: string; number: string; status: string; application?: string | null; project?: { name: string } | null; createdAt: string }>; counts: Record<string, number> }>("/engineering");
  const boqs = useApi<unknown[]>("/boq");
  const submittals = useApi<{ items: unknown[] }>("/submittals");
  const openRequests = (engineering.data?.items || []).filter((row) => !["APPROVED", "CLOSED", "CANCELLED"].includes(row.status)).length;
  if (summary.isLoading) return <PageSkeleton />;
  return (
    <>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Projects" value={summary.data?.stats.activeProjects ?? 0} icon={<Building2 />} tone="accent" />
        <MiniStat label="Open requests" value={openRequests} icon={<Ruler />} tone="info" />
        <MiniStat label="BOQs" value={boqs.data?.length ?? 0} icon={<ClipboardList />} tone="warn" />
        <MiniStat label="Submittals" value={submittals.data?.items.length ?? 0} icon={<FileStack />} tone="good" />
      </section>
      <section className="grid gap-4 xl:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader title="Engineering requests" action={<Link href="/engineering" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>} />
          <DataTable
            rows={(engineering.data?.items || []).slice(0, 6)}
            rowKey={(row) => row.id}
            loading={engineering.isLoading}
            onRowClick={(row) => router.push(`/engineering/${row.id}`)}
            empty={<p className="px-4 py-8 text-center text-sm text-muted">No requests yet.</p>}
            columns={[
              { key: "number", header: "Request", render: (row) => <span className="font-medium">{row.number}</span> },
              { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project?.name || "—"}</span> },
              { key: "application", header: "Application", render: (row) => row.application || "—" },
              { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Recent activity" />
          <CardBody>
            <ActivityFeed items={toActivity(summary.data?.activity)} compact LinkComponent={Link} />
          </CardBody>
        </Card>
      </section>
      {summary.data?.projects.length ? (
        <Card>
          <CardHeader title="Your projects" />
          <CardBody>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {summary.data.projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </div>
          </CardBody>
        </Card>
      ) : null}
    </>
  );
}
