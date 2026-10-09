"use client";

import { Avatar, Card, CardBody, CardHeader, DataTable, Field, FunnelBar, MiniStat, Page, PageHeader, Tabs, TextInput, compactMoney, formatDate, humanize, money } from "@fixotec/ui";
import { Clock, Target, Trophy, XCircle } from "lucide-react";
import { useState } from "react";
import { QueryError } from "../../../components/common";
import { Link } from "../../../components/link";
import { useApi } from "../../../lib/query";

type Reports = {
  total: number;
  avgDaysToWin: number | null;
  funnel: Array<{ stage: string; count: number; pct: number }>;
  bySource: Array<{ source: string; total: number; won: number; lost: number; wonValue: number; winRate: number }>;
  leaderboard: Array<{ ownerId: string; name: string; open: number; won: number; lost: number; wonValue: number; pipeline: number; activities: number; overdue: number }>;
  ageing: Array<{ status: string; "0-7": number; "8-30": number; "31-90": number; "90+": number }>;
  lostReasons: Array<{ reason: string; count: number }>;
};
type Specifiers = { items: Array<{ id: string; code: string; name: string; type: string; projects: number; active: number; won: number; lost: number; winRate: number; influencedValue: number; wonValue: number; lastProjectAt?: string | null }>; withoutProjects: number };

const yearAgo = () => new Date(Date.now() - 365 * 86_400_000).toISOString().slice(0, 10);

export default function CrmReportsPage() {
  const [tab, setTab] = useState("sales");
  const [from, setFrom] = useState(yearAgo());
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const reports = useApi<Reports>(tab === "sales" ? `/crm/reports?from=${from}&to=${to}T23:59:59` : null, { keepPrevious: true });
  const specifiers = useApi<Specifiers>(tab === "specifiers" ? "/crm/specifiers" : null);
  const data = reports.data;
  const won = data?.bySource.reduce((sum, row) => sum + row.won, 0) ?? 0;
  const lost = data?.bySource.reduce((sum, row) => sum + row.lost, 0) ?? 0;

  return (
    <Page>
      <PageHeader title="Sales analytics" description="Funnel, sources, team performance, ageing and specifier influence." />
      <Tabs items={[{ key: "sales", label: "Sales" }, { key: "specifiers", label: "Specifiers" }]} value={tab} onChange={setTab} />
      {tab === "sales" ? (
        <>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From"><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field label="To"><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
          </div>
          <QueryError error={reports.error} />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <MiniStat label="Leads created" value={data?.total ?? "—"} icon={<Target />} />
            <MiniStat label="Won" value={won} icon={<Trophy />} tone="good" hint={won + lost ? `${Math.round((won / (won + lost)) * 100)}% win rate` : undefined} />
            <MiniStat label="Lost" value={lost} icon={<XCircle />} tone="bad" />
            <MiniStat label="Average days to win" value={data?.avgDaysToWin ?? "—"} icon={<Clock />} tone="info" />
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <Card>
              <CardHeader title="Funnel" description="Share of leads that reached each stage" />
              <CardBody>
                <FunnelBar stages={(data?.funnel || []).map((row) => ({ label: `${humanize(row.stage)} (${row.pct}%)`, count: row.count }))} />
              </CardBody>
            </Card>
            <Card>
              <CardHeader title="Lost reasons" />
              <DataTable rows={data?.lostReasons || []} rowKey={(row) => row.reason} density="compact" empty={<p className="py-6 text-center text-sm text-muted">No lost leads in this period.</p>} columns={[{ key: "reason", header: "Reason", render: (row) => humanize(row.reason) }, { key: "count", header: "Leads", align: "right", render: (row) => row.count }]} />
            </Card>
          </div>
          <Card>
            <CardHeader title="Conversion by source" />
            <DataTable
              rows={data?.bySource || []}
              rowKey={(row) => row.source}
              density="compact"
              columns={[
                { key: "source", header: "Source", render: (row) => humanize(row.source) },
                { key: "total", header: "Leads", align: "right", sortValue: (row) => row.total, render: (row) => row.total },
                { key: "won", header: "Won", align: "right", sortValue: (row) => row.won, render: (row) => row.won },
                { key: "lost", header: "Lost", align: "right", render: (row) => row.lost },
                { key: "winRate", header: "Win rate", align: "right", sortValue: (row) => row.winRate, render: (row) => `${row.winRate}%` },
                { key: "wonValue", header: "Won value", align: "right", sortValue: (row) => row.wonValue, render: (row) => money(row.wonValue) },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Leaderboard" description="Won value, weighted open pipeline and activity discipline per owner" />
            <DataTable
              rows={data?.leaderboard || []}
              rowKey={(row) => row.ownerId}
              density="compact"
              columns={[
                { key: "name", header: "Owner", render: (row) => <span className="flex items-center gap-2"><Avatar name={row.name} size="xs" />{row.name}</span> },
                { key: "wonValue", header: "Won value", align: "right", sortValue: (row) => row.wonValue, render: (row) => compactMoney(row.wonValue) },
                { key: "won", header: "Won", align: "right", render: (row) => row.won },
                { key: "lost", header: "Lost", align: "right", render: (row) => row.lost },
                { key: "open", header: "Open", align: "right", render: (row) => row.open },
                { key: "pipeline", header: "Weighted pipeline", align: "right", sortValue: (row) => row.pipeline, render: (row) => compactMoney(row.pipeline) },
                { key: "activities", header: "Activities done", align: "right", sortValue: (row) => row.activities, render: (row) => row.activities },
                { key: "overdue", header: "Overdue tasks", align: "right", sortValue: (row) => row.overdue, render: (row) => <span className={row.overdue ? "font-medium text-danger" : undefined}>{row.overdue}</span> },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Open lead ageing" description="Days since the lead was created" />
            <DataTable
              rows={data?.ageing || []}
              rowKey={(row) => row.status}
              density="compact"
              columns={[
                { key: "status", header: "Stage", render: (row) => humanize(row.status) },
                ...(["0-7", "8-30", "31-90", "90+"] as const).map((bucket) => ({ key: bucket, header: `${bucket} days`, align: "right" as const, render: (row: Reports["ageing"][number]) => <span className={bucket === "90+" && row[bucket] ? "font-medium text-danger" : undefined}>{row[bucket]}</span> })),
              ]}
            />
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader title="Specifier influence" description={`Consultants, architects and PMCs ranked by the Fixotec value of projects they specified.${specifiers.data?.withoutProjects ? ` ${specifiers.data.withoutProjects} specifiers have no linked projects yet.` : ""}`} />
          <QueryError error={specifiers.error} />
          <DataTable
            rows={specifiers.data?.items || []}
            loading={specifiers.isLoading}
            rowKey={(row) => row.id}
            density="compact"
            columns={[
              { key: "name", header: "Specifier", render: (row) => <Link href={`/customers/${row.id}`} className="font-medium text-accent">{row.name}</Link> },
              { key: "type", header: "Type", render: (row) => humanize(row.type) },
              { key: "projects", header: "Projects", align: "right", sortValue: (row) => row.projects, render: (row) => row.projects },
              { key: "active", header: "Active", align: "right", render: (row) => row.active },
              { key: "won", header: "Won", align: "right", sortValue: (row) => row.won, render: (row) => row.won },
              { key: "winRate", header: "Win rate", align: "right", sortValue: (row) => row.winRate, render: (row) => `${row.winRate}%` },
              { key: "influencedValue", header: "Influenced", align: "right", sortValue: (row) => row.influencedValue, render: (row) => compactMoney(row.influencedValue) },
              { key: "wonValue", header: "Won value", align: "right", sortValue: (row) => row.wonValue, render: (row) => compactMoney(row.wonValue) },
              { key: "last", header: "Last project", render: (row) => (row.lastProjectAt ? formatDate(row.lastProjectAt) : "—") },
            ]}
          />
        </Card>
      )}
    </Page>
  );
}
