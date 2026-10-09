"use client";

import { Card, CardBody, CardHeader, EmptyState, MiniStat, ProgressBar, compactMoney, humanize, money } from "@fixotec/ui";
import { Target, TrendingUp, Trophy } from "lucide-react";
import { ListPage, PageSkeleton, QueryError } from "../../../components/common";
import { useApi } from "../../../lib/query";

type TargetRow = { id: string; period: string; metric: string; targetAmount: number | string; achievedAmount: number | string };

export default function TargetsPage() {
  const { data, error, isLoading } = useApi<TargetRow[]>("/distributor/targets");
  if (isLoading) return <PageSkeleton />;
  const rows = data || [];
  const target = rows.reduce((sum, row) => sum + Number(row.targetAmount), 0);
  const achieved = rows.reduce((sum, row) => sum + Number(row.achievedAmount), 0);
  const overall = target ? (achieved / target) * 100 : 0;

  return (
    <ListPage title="Targets" description="Your agreed targets and progress against them.">
      <QueryError error={error} />
      <section className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Total target" value={compactMoney(target)} icon={<Target />} tone="accent" />
        <MiniStat label="Achieved" value={compactMoney(achieved)} icon={<TrendingUp />} tone="good" />
        <MiniStat label="Overall" value={`${Math.round(overall)}%`} icon={<Trophy />} tone={overall >= 100 ? "good" : overall >= 70 ? "warn" : "bad"} />
      </section>
      {rows.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const pct = Number(row.targetAmount) ? (Number(row.achievedAmount) / Number(row.targetAmount)) * 100 : 0;
            const remaining = Math.max(0, Number(row.targetAmount) - Number(row.achievedAmount));
            return (
              <Card key={row.id}>
                <CardHeader title={row.period} description={humanize(row.metric)} />
                <CardBody className="space-y-4">
                  <div className="flex items-end justify-between">
                    <span className="text-3xl font-bold tracking-tight tabular">{Math.round(pct)}%</span>
                    <span className="text-xs text-muted">{remaining ? `${money(remaining)} to go` : "Target met"}</span>
                  </div>
                  <ProgressBar value={Math.min(100, pct)} tone={pct >= 100 ? "good" : pct >= 70 ? "warn" : "accent"} />
                  <div className="flex justify-between text-xs">
                    <span className="text-muted">Achieved <span className="font-semibold text-fg">{money(row.achievedAmount)}</span></span>
                    <span className="text-muted">Target <span className="font-semibold text-fg">{money(row.targetAmount)}</span></span>
                  </div>
                </CardBody>
              </Card>
            );
          })}
        </div>
      ) : (
        <EmptyState icon={<Target />} title="No targets set" description="Your Fixotec sales manager will publish targets here." />
      )}
    </ListPage>
  );
}
