"use client";

import { ActionRow, ActivityFeed, Card, CardBody, CardHeader, DataTable, FunnelBar, Meter, Page, StatCard, StatusPill, compactMoney, formatDate, greeting, percent } from "@fixotec/ui";
import { AlertTriangle, ArrowRight, CheckSquare, ClipboardList, Package, Ruler, Truck } from "lucide-react";
import { useRouter } from "next/navigation";
import { DueText, PageSkeleton, QueryError, toActivity, type ActivityRow } from "../../components/common";
import { Link } from "../../components/link";
import { useApi } from "../../lib/query";
import { useSession } from "../../lib/session";

type Kpi = { value: number; delta: number | null; series: number[]; invert?: boolean };
type Dashboard = {
  kpis: { revenue: Kpi; orders: Kpi; pipeline: Kpi; receivables: Kpi; grossMargin: Kpi | null } | null;
  actions: Array<{ key: string; count: number; title: string; description: string; href: string; tone: "accent" | "warn" | "info" | "bad" | "neutral" }>;
  funnel: Array<{ label: string; count: number; value?: number }>;
  recentRfqs: Array<{ id: string; number: string; status: string; dueDate: string | null; customer: string | null; project: string | null; value: number; priority: string }>;
  operations: { productionPct: number; warehousePct: number; openPurchaseOrders: number; delayedDispatches: number; deliveredPct: number };
  activity: ActivityRow[];
};

const ACTION_ICONS: Record<string, React.ReactNode> = { approvals: <CheckSquare />, rfqs: <ClipboardList />, engineering: <Ruler />, dispatch: <Truck />, purchases: <Package /> };

export default function OverviewPage() {
  const { session } = useSession();
  const router = useRouter();
  const { data, error, isLoading } = useApi<Dashboard>("/reports/dashboard");
  if (isLoading) return <PageSkeleton />;
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
        <div className="relative flex flex-wrap items-end justify-between gap-4 px-6 py-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {greeting()}, {first}
            </h1>
            <p className="mt-1 text-sm text-sidebar-muted">{today}</p>
            <p className="mt-3 text-sm text-white/80">Here&apos;s what needs your attention today.</p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">Engineered support</p>
            <p className="text-sm font-semibold uppercase tracking-[0.12em]">for a stronger tomorrow</p>
          </div>
        </div>
      </section>

      <QueryError error={error} />

      {data?.kpis ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <StatCard label="Revenue" value={compactMoney(data.kpis.revenue.value)} delta={data.kpis.revenue.delta} series={data.kpis.revenue.series} deltaSuffix="vs last month" />
          <StatCard label="Orders" value={compactMoney(data.kpis.orders.value)} delta={data.kpis.orders.delta} series={data.kpis.orders.series} deltaSuffix="vs last month" />
          <StatCard label="Pipeline" value={compactMoney(data.kpis.pipeline.value)} delta={data.kpis.pipeline.delta} series={data.kpis.pipeline.series} deltaSuffix="vs last month" />
          <StatCard label="Receivables" value={compactMoney(data.kpis.receivables.value)} delta={data.kpis.receivables.delta} series={data.kpis.receivables.series} invertDelta deltaSuffix="overdue trend" />
          {data.kpis.grossMargin ? <StatCard label="Gross margin" value={percent(data.kpis.grossMargin.value)} delta={data.kpis.grossMargin.delta} series={data.kpis.grossMargin.series} deltaSuffix="pts vs last month" /> : null}
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[320px_1fr_340px]">
        <Card>
          <CardHeader title="Today's actions" />
          <CardBody className="space-y-0.5 px-2">
            {data?.actions.length ? (
              data.actions.map((item) => <ActionRow key={item.key} icon={ACTION_ICONS[item.key] || <AlertTriangle />} title={item.title} description={item.description} tone={item.tone} href={item.href} LinkComponent={Link} />)
            ) : (
              <p className="px-2 py-6 text-center text-sm text-muted">Nothing waiting on you.</p>
            )}
          </CardBody>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Sales pipeline" action={<Link href="/projects" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>} />
            <CardBody>{data ? <FunnelBar stages={data.funnel} format={compactMoney} /> : null}</CardBody>
          </Card>
          <Card>
            <CardHeader title="Recent RFQs" action={<Link href="/rfqs" className="inline-flex items-center gap-1 font-medium text-accent hover:underline">View all <ArrowRight className="h-3 w-3" /></Link>} />
            <DataTable
              density="compact"
              rows={data?.recentRfqs || []}
              rowKey={(row) => row.id}
              onRowClick={(row) => router.push(`/rfqs/${row.id}`)}
              columns={[
                { key: "number", header: "RFQ No.", render: (row) => <span className="font-medium">{row.number}</span> },
                { key: "project", header: "Project", render: (row) => <span className="text-muted">{row.project || "—"}</span> },
                { key: "customer", header: "Customer", render: (row) => row.customer || "—" },
                { key: "value", header: "Value", align: "right", sortValue: (row) => row.value, render: (row) => compactMoney(row.value) },
                { key: "status", header: "Stage", render: (row) => <StatusPill status={row.status} /> },
                { key: "dueDate", header: "Due", render: (row) => <DueText value={row.dueDate} /> },
              ]}
              empty={<p className="px-4 py-8 text-center text-sm text-muted">No open RFQs.</p>}
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Operations" />
            <CardBody className="space-y-4">
              {data ? (
                <>
                  <Meter label="Production (7 days)" value={data.operations.productionPct} tone="good" />
                  <Meter label="Warehouse utilisation" value={data.operations.warehousePct} tone="warn" />
                  <div className="flex items-center justify-between border-t border-line pt-3 text-sm">
                    <span className="text-muted">Open purchase orders</span>
                    <span className="font-semibold tabular">{compactMoney(data.operations.openPurchaseOrders)}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted">Delayed dispatches</span>
                    <span className={`font-semibold tabular ${data.operations.delayedDispatches ? "text-danger" : ""}`}>{data.operations.delayedDispatches}</span>
                  </div>
                </>
              ) : null}
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Activity" action={<span className="text-muted">{formatDate(new Date(), "short")}</span>} />
            <CardBody>
              <ActivityFeed items={toActivity(data?.activity)} compact LinkComponent={Link} />
            </CardBody>
          </Card>
        </div>
      </section>
    </Page>
  );
}
