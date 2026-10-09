"use client";

import { Badge, Card, CardBody, CardHeader, KeyValueList, Page, PageHeader, Tabs, humanize } from "@fixotec/ui";
import { Building, Factory, MapPin, Warehouse } from "lucide-react";
import { useState } from "react";
import { PageSkeleton, QueryError } from "../../../components/common";
import { useApi } from "../../../lib/query";

type Row = Record<string, unknown> & { id?: string };
type Org = {
  legalEntities: Array<Row & { name: string; taxRegs: Row[]; bankAccounts: Row[] }>;
  branches: Array<Row & { name: string; code: string; region?: string; active?: boolean; offices: Array<Row & { name: string }>; plants: Array<Row & { name: string; code: string; warehouses: Array<Row & { name: string; code: string }> }> }>;
  departments: Array<Row & { name: string; code: string; children: Array<Row & { name: string }> }>;
  costCenters: Array<Row & { name: string; code: string; department?: { name: string } | null }>;
  profitCenters: Array<Row & { name: string; code: string }>;
  financialYears: Array<Row & { code?: string; name?: string; startDate?: string; endDate?: string }>;
  currencies: Array<Row & { code: string; name?: string }>;
  units: Array<Row & { code: string; name?: string }>;
  settings: Array<{ key: string; value: unknown }>;
};

export default function OrganizationPage() {
  const { data, error, isLoading } = useApi<Org>("/organization");
  const [tab, setTab] = useState("structure");
  if (isLoading) return <PageSkeleton />;
  if (error || !data) return <Page><QueryError error={error} /></Page>;

  return (
    <Page>
      <PageHeader title="Organization" description="Legal entities, branches, plants, departments and business settings." />
      <Tabs value={tab} onChange={setTab} items={[{ key: "structure", label: "Structure" }, { key: "finance", label: "Finance" }, { key: "settings", label: "Settings", count: data.settings.length }]} />

      {tab === "structure" ? (
        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            {data.legalEntities.map((entity) => (
              <Card key={String(entity.id)}>
                <CardHeader title={entity.name} icon={<Building />} description={`${entity.taxRegs.length} tax registration(s) · ${entity.bankAccounts.length} bank account(s)`} />
                <CardBody>
                  <KeyValueList columns={2} items={Object.entries(entity).filter(([key, value]) => !["id", "name"].includes(key) && (value === null || typeof value !== "object")).slice(0, 8).map(([key, value]) => ({ label: humanize(key.replace(/([a-z])([A-Z])/g, "$1_$2")), value: value == null ? "—" : String(value) }))} />
                </CardBody>
              </Card>
            ))}
            <Card>
              <CardHeader title="Branches & plants" />
              <CardBody className="space-y-4">
                {data.branches.map((branch) => (
                  <div key={String(branch.id)} className="rounded-md border border-line p-3">
                    <div className="flex items-center justify-between">
                      <p className="flex items-center gap-2 font-medium"><MapPin className="h-4 w-4 text-muted" />{branch.name} <span className="font-mono text-2xs text-muted">{branch.code}</span></p>
                      <div className="flex gap-1">
                        {branch.region ? <Badge>{humanize(String(branch.region))}</Badge> : null}
                        {branch.active === false ? <Badge tone="bad">Archived</Badge> : null}
                      </div>
                    </div>
                    {branch.offices.length ? <p className="mt-1 text-xs text-muted">Offices: {branch.offices.map((office) => office.name).join(", ")}</p> : null}
                    {branch.plants.map((plant) => (
                      <div key={String(plant.id)} className="mt-2 rounded bg-canvas p-2 text-sm">
                        <p className="flex items-center gap-2 font-medium"><Factory className="h-3.5 w-3.5 text-muted" />{plant.name}</p>
                        <p className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
                          {plant.warehouses.map((warehouse) => <span key={String(warehouse.id)} className="inline-flex items-center gap-1"><Warehouse className="h-3 w-3" />{warehouse.name}</span>)}
                        </p>
                      </div>
                    ))}
                  </div>
                ))}
              </CardBody>
            </Card>
          </div>
          <Card>
            <CardHeader title="Departments" />
            <CardBody className="space-y-2">
              {data.departments.map((department) => (
                <div key={String(department.id)}>
                  <p className="text-sm font-medium">{department.name} <span className="font-mono text-2xs text-muted">{department.code}</span></p>
                  {department.children.length ? <p className="pl-3 text-xs text-muted">{department.children.map((child) => child.name).join(" · ")}</p> : null}
                </div>
              ))}
            </CardBody>
          </Card>
        </div>
      ) : null}

      {tab === "finance" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <SimpleList title="Cost centres" rows={data.costCenters.map((row) => ({ id: String(row.id), main: row.name, side: row.department?.name || row.code }))} />
          <SimpleList title="Profit centres" rows={data.profitCenters.map((row) => ({ id: String(row.id), main: row.name, side: row.code }))} />
          <SimpleList title="Financial years" rows={data.financialYears.map((row) => ({ id: String(row.id), main: String(row.code || row.name || ""), side: row.startDate ? `${String(row.startDate).slice(0, 10)} → ${String(row.endDate || "").slice(0, 10)}` : "" }))} />
          <SimpleList title="Currencies & units" rows={[...data.currencies.map((row) => ({ id: `c-${row.code}`, main: row.code, side: row.name || "Currency" })), ...data.units.map((row) => ({ id: `u-${row.code}`, main: row.code, side: row.name || "Unit" }))]} />
        </div>
      ) : null}

      {tab === "settings" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          {data.settings.map((setting) => (
            <Card key={setting.key}>
              <CardHeader title={humanize(setting.key)} description={setting.key} />
              <CardBody>
                <pre className="overflow-auto rounded-md bg-canvas p-3 font-mono text-xs text-muted scrollbar-thin">{JSON.stringify(setting.value, null, 2)}</pre>
              </CardBody>
            </Card>
          ))}
        </div>
      ) : null}
    </Page>
  );
}

function SimpleList({ title, rows }: { title: string; rows: Array<{ id: string; main: string; side: string }> }) {
  return (
    <Card>
      <CardHeader title={title} description={`${rows.length} record${rows.length === 1 ? "" : "s"}`} />
      <CardBody className="divide-y divide-line py-0">
        {rows.map((row) => (
          <div key={row.id} className="flex justify-between py-2 text-sm">
            <span className="font-medium">{row.main}</span>
            <span className="text-muted">{row.side}</span>
          </div>
        ))}
        {!rows.length ? <p className="py-3 text-sm text-muted">None configured.</p> : null}
      </CardBody>
    </Card>
  );
}
