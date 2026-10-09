"use client";

import { Badge, Button, Card, EmptyState, ErrorNote, Page, PageHeader, Skeleton, TextInput, humanize, money, relativeTime } from "@fixotec/ui";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { useState } from "react";
import { QueryError } from "../../../components/common";
import { Link } from "../../../components/link";
import { useAction, useApi } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Approval = { id: string; entityType: string; entityId: string; approverRole: string; status: string; snapshot?: Record<string, unknown> | null; createdAt: string };

const ROUTES: Record<string, string> = { QUOTATION: "/quotations", ENGINEERING: "/engineering", SALES_ORDER: "/sales-orders", PURCHASE_ORDER: "/purchases", EXPENSE: "/expenses" };

export default function ApprovalsPage() {
  const { session } = useSession();
  const { data, error, isLoading } = useApi<{ items: Approval[] }>("/approvals");
  const items = data?.items || [];
  const canDecide = allowed(session, "approvals.approve");

  return (
    <Page width="narrow">
      <PageHeader title="Approvals" description="Discounts, engineering submissions and purchases waiting on your role." />
      <QueryError error={error} />
      {isLoading ? <div className="space-y-3">{Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="h-28" />)}</div> : null}
      {!isLoading && !items.length ? (
        <Card>
          <EmptyState icon={<CheckCircle2 />} title="You're all caught up" description="Nothing is waiting for your approval." />
        </Card>
      ) : null}
      <div className="space-y-3">
        {items.map((item) => <ApprovalCard key={item.id} item={item} canDecide={canDecide} />)}
      </div>
    </Page>
  );
}

function ApprovalCard({ item, canDecide }: { item: Approval; canDecide: boolean }) {
  const [note, setNote] = useState("");
  const action = useAction(["/approvals", "/quotations", "/engineering", "/reports", "/notifications"]);
  const snapshot = item.snapshot || {};
  const route = ROUTES[item.entityType];
  const decide = (decision: "APPROVED" | "REJECTED") => action.mutate({ path: `/approvals/${item.id}/decide`, body: { decision, note } });

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge tone="warn" dot>{humanize(item.entityType)}</Badge>
            <span className="text-xs text-muted">for {humanize(item.approverRole)} · {relativeTime(item.createdAt)}</span>
          </div>
          <p className="text-base font-semibold">{String(snapshot.number || item.entityId)}</p>
          <div className="flex flex-wrap gap-4 text-sm text-muted">
            {snapshot.total !== undefined ? <span>Value <span className="font-medium text-fg tabular">{money(snapshot.total)}</span></span> : null}
            {snapshot.discountPct !== undefined ? <span>Discount <span className="font-medium text-fg">{String(snapshot.discountPct)}%</span></span> : null}
            {Object.entries(snapshot).filter(([key]) => !["number", "total", "discountPct"].includes(key)).slice(0, 3).map(([key, value]) => (
              <span key={key}>{humanize(key)} <span className="font-medium text-fg">{typeof value === "object" ? JSON.stringify(value) : String(value)}</span></span>
            ))}
          </div>
        </div>
        {route ? (
          <Link href={route === "/purchases" || route === "/expenses" ? route : `${route}/${item.entityId}`} className="inline-flex items-center gap-1 text-sm font-medium text-accent hover:underline">
            Open record <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        ) : null}
      </div>
      {canDecide ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
          <TextInput placeholder="Decision note (optional)" value={note} onChange={(event) => setNote(event.target.value)} className="min-w-0 flex-1" />
          <Button variant="outline" loading={action.isPending} onClick={() => decide("REJECTED")}>Reject</Button>
          <Button loading={action.isPending} onClick={() => decide("APPROVED")}>Approve</Button>
        </div>
      ) : null}
      {action.error ? <ErrorNote className="mt-3">{action.error.message}</ErrorNote> : null}
    </Card>
  );
}
