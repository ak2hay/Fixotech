"use client";

import { Button, Card, EmptyState, ErrorNote, Page, PageHeader, ProgressBar, Skeleton, StatusPill, Tabs, number, relativeTime } from "@fixotec/ui";
import { AlertTriangle, CheckCircle2, Pause, Play, Wrench } from "lucide-react";
import { useState } from "react";
import { QueryError } from "../../../components/common";
import { useAction, useApi } from "../../../lib/query";

type Job = {
  id: string;
  number: string;
  status: string;
  requiredQty: number | string;
  completedQty: number | string;
  startedAt?: string | null;
  issueNote?: string | null;
  downtimeMinutes: number;
  productionOrder?: { number: string } | null;
  machine?: { name: string; code: string } | null;
};

const LANES = [
  { key: "active", label: "Active", statuses: ["QUEUED", "RUNNING", "PAUSED"] },
  { key: "done", label: "Completed", statuses: ["COMPLETED"] },
  { key: "all", label: "All", statuses: [] as string[] },
];

export default function ShopFloorPage() {
  const [lane, setLane] = useState("active");
  const { data, error, isLoading } = useApi<Job[]>("/production/jobs");
  const statuses = LANES.find((item) => item.key === lane)?.statuses || [];
  const jobs = (data || []).filter((job) => !statuses.length || statuses.includes(job.status));

  return (
    <Page>
      <PageHeader title="Shop floor" description="Job cards for operators: start, pause, complete and report issues." />
      <Tabs value={lane} onChange={setLane} items={LANES.map((item) => ({ key: item.key, label: item.label, count: (data || []).filter((job) => !item.statuses.length || item.statuses.includes(job.status)).length }))} />
      <QueryError error={error} />
      {isLoading ? <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">{Array.from({ length: 4 }).map((_, index) => <Skeleton key={index} className="h-56" />)}</div> : null}
      {!isLoading && !jobs.length ? <Card><EmptyState icon={<Wrench />} title="No job cards" description="Released production orders create job cards here." /></Card> : null}
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {jobs.map((job) => <JobCard key={job.id} job={job} />)}
      </div>
    </Page>
  );
}

function JobCard({ job }: { job: Job }) {
  const action = useAction(["/production"]);
  const required = Number(job.requiredQty);
  const done = Number(job.completedQty);
  const act = (verb: string, body: Record<string, unknown> = {}) => action.mutate({ path: `/production/jobs/${job.id}/${verb}`, body });
  const closed = job.status === "COMPLETED";
  return (
    <Card className="flex flex-col p-5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-mono text-sm font-semibold">{job.number}</p>
          <p className="text-xs text-muted">{job.productionOrder?.number || "—"} · {job.machine?.name || "No machine"}</p>
        </div>
        <StatusPill status={job.status} />
      </div>
      <div className="my-5 flex items-end gap-2">
        <span className="text-4xl font-semibold tabular">{number(done)}</span>
        <span className="pb-1 text-lg text-muted tabular">/ {number(required)}</span>
      </div>
      <ProgressBar value={required ? (done / required) * 100 : 0} />
      <div className="mt-2 flex justify-between text-xs text-muted">
        <span>{job.startedAt ? `Started ${relativeTime(job.startedAt)}` : "Not started"}</span>
        <span>{job.downtimeMinutes ? `${job.downtimeMinutes} min downtime` : ""}</span>
      </div>
      {job.issueNote ? <p className="mt-3 flex items-start gap-2 rounded-md bg-warning-soft p-2 text-xs text-warning"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{job.issueNote}</p> : null}
      {!closed ? (
        <div className="mt-auto grid grid-cols-2 gap-2 pt-5">
          {job.status === "RUNNING" ? (
            <Button size="lg" variant="outline" loading={action.isPending} onClick={() => act("pause", { downtimeMinutes: 15 })}><Pause /> Pause</Button>
          ) : (
            <Button size="lg" loading={action.isPending} onClick={() => act("start")}><Play /> Start</Button>
          )}
          <Button size="lg" variant="dark" loading={action.isPending} onClick={() => act("complete", { completedQty: required })}><CheckCircle2 /> Complete</Button>
          <Button variant="ghost" className="col-span-2" onClick={() => act("issue", { note: "Reported from the floor" })}><AlertTriangle /> Report issue</Button>
        </div>
      ) : null}
      {action.error ? <ErrorNote className="mt-3">{action.error.message}</ErrorNote> : null}
    </Card>
  );
}
