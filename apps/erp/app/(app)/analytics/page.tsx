"use client";

import { Badge, Card, CardBody, CardHeader, DataTable, Meter, Page, PageHeader, StatCard, StatusPill, compactMoney, money, number, percent } from "@fixotec/ui";
import { useRouter } from "next/navigation";
import { PageSkeleton, QueryError } from "../../../components/common";
import { useApi } from "../../../lib/query";

type Executive = {
  revenue: number;
  orders: number;
  pipeline: number;
  grossMarginPct: number | null;
  receivables: number;
  inventory: number | null;
  sales: { won: number; rfqs: number; conversionPct: number };
  manufacturing: { productionPct: number; capacityPct: number; rejectionPct: number };
  projects: { active: number; delayed: number };
  procurement: { openPo: number };
  collections: { due: number; overdue: number };
};
type Sales = { revenue: number; deals: number; averageDeal: number; byCustomer: Array<{ key: string; amount: number }> };
type Forecast = { method: string; horizon: string; items: Array<{ name: string; monthlyAverage: number }> };
type ProjectMargin = { id: string; code: string; name: string; stage: string; margin: number | null; billed: number; delayed: boolean };

export default function AnalyticsPage() {
  const router = useRouter();
  const executive = useApi<Executive>("/reports/executive");
  const sales = useApi<Sales>("/reports/sales");
  const forecast = useApi<Forecast>("/reports/forecast");
  const projects = useApi<ProjectMargin[]>("/reports/projects");

  if (executive.isLoading) return <PageSkeleton />;
  if (executive.error || !executive.data) return <Page><QueryError error={executive.error} /></Page>;
  const data = executive.data;
  const customers = [...(sales.data?.byCustomer || [])].sort((a, b) => b.amount - a.amount).slice(0, 8);
  const topCustomer = customers[0]?.amount || 1;

  return (
    <Page>
      <PageHeader title="Analytics" description="Commercial, plant and finance performance across the business." />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Invoiced revenue" value={compactMoney(data.revenue)} />
        <StatCard label="Order book" value={compactMoney(data.orders)} />
        <StatCard label="Open pipeline" value={compactMoney(data.pipeline)} />
        {data.grossMarginPct != null ? <StatCard label="Gross margin" value={percent(data.grossMarginPct, 1)} /> : null}
        <StatCard label="Receivables" value={compactMoney(data.receivables)} footer={<span className="text-danger">{compactMoney(data.collections.overdue)} overdue</span>} />
        {data.inventory != null ? <StatCard label="Inventory value" value={compactMoney(data.inventory)} /> : null}
        <StatCard label="Open purchase orders" value={compactMoney(data.procurement.openPo)} />
        <StatCard label="RFQ to order" value={percent(data.sales.conversionPct, 1)} footer={<span className="text-muted">{data.sales.won} won of {data.sales.rfqs} RFQs</span>} />
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader title="Plant" />
          <CardBody className="space-y-4">
            <Meter label="Job cards completed" value={data.manufacturing.productionPct} tone="good" />
            <Meter label="Capacity in use" value={data.manufacturing.capacityPct} tone="info" />
            <Meter label="QC rejection rate" value={data.manufacturing.rejectionPct} tone={data.manufacturing.rejectionPct > 5 ? "bad" : "good"} />
            <div className="flex justify-between border-t border-line pt-3 text-sm">
              <span className="text-muted">Active projects</span>
              <span className="font-semibold">{data.projects.active} <span className="font-normal text-danger">({data.projects.delayed} delayed)</span></span>
            </div>
          </CardBody>
        </Card>
        <Card className="xl:col-span-2">
          <CardHeader title="Revenue by customer" description={sales.data ? `${sales.data.deals} orders · average ${compactMoney(sales.data.averageDeal)}` : undefined} />
          <CardBody className="space-y-2.5">
            {customers.map((row) => (
              <div key={row.key} className="grid grid-cols-[160px_1fr_90px] items-center gap-3 text-sm">
                <span className="truncate">{row.key}</span>
                <span className="h-2 overflow-hidden rounded-full bg-canvas"><span className="block h-full rounded-full bg-accent" style={{ width: `${(row.amount / topCustomer) * 100}%` }} /></span>
                <span className="text-right font-medium tabular">{compactMoney(row.amount)}</span>
              </div>
            ))}
            {!customers.length ? <p className="text-sm text-muted">No orders yet.</p> : null}
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Project margin" />
          <DataTable
            rows={projects.data || []}
            loading={projects.isLoading}
            rowKey={(row) => row.id}
            onRowClick={(row) => router.push(`/projects/${row.id}`)}
            density="compact"
            columns={[
              { key: "name", header: "Project", sortValue: (row) => row.name, render: (row) => <div><p className="font-medium">{row.name}</p><p className="font-mono text-2xs text-muted">{row.code}</p></div> },
              { key: "stage", header: "Stage", render: (row) => <StatusPill status={row.stage} /> },
              { key: "billed", header: "Billed", align: "right", sortValue: (row) => row.billed, render: (row) => money(row.billed) },
              { key: "margin", header: "Margin", align: "right", sortValue: (row) => row.margin ?? 0, render: (row) => (row.margin == null ? <span className="text-muted">—</span> : <span className={row.margin < 0 ? "text-danger" : ""}>{money(row.margin)}</span>) },
              { key: "delayed", header: "", render: (row) => (row.delayed ? <Badge tone="bad">Delayed</Badge> : null) },
            ]}
          />
        </Card>
        <Card>
          <CardHeader title="Demand forecast" description={forecast.data ? `Six-month trailing average for ${forecast.data.horizon.replace(/_/g, " ")}` : undefined} />
          <DataTable
            rows={[...(forecast.data?.items || [])].sort((a, b) => b.monthlyAverage - a.monthlyAverage)}
            loading={forecast.isLoading}
            rowKey={(row) => row.name}
            density="compact"
            empty="Not enough order history."
            columns={[
              { key: "name", header: "Item", render: (row) => row.name },
              { key: "monthlyAverage", header: "Per month", align: "right", sortValue: (row) => row.monthlyAverage, render: (row) => <span className="tabular">{number(row.monthlyAverage, 1)}</span> },
            ]}
          />
        </Card>
      </div>
    </Page>
  );
}
