"use client";

import { Button, Card, EmptyState, Page, PageHeader, Skeleton, Tabs, cn, relativeTime } from "@fixotec/ui";
import { BellOff, Radar } from "lucide-react";
import { useState } from "react";
import { QueryError } from "../../../components/common";
import { Link } from "../../../components/link";
import { useAction, useApi } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Notification = { id: string; title: string; body: string; readAt: string | null; entityType?: string | null; entityId?: string | null; createdAt: string };

const ROUTES: Record<string, string> = { rfq: "/rfqs", quotation: "/quotations", project: "/projects", sales_order: "/sales-orders", engineering: "/engineering" };

export default function NotificationsPage() {
  const { session } = useSession();
  const [tab, setTab] = useState("");
  const { data, error, isLoading } = useApi<{ items: Notification[]; unreadCount: number }>(`/notifications${tab === "unread" ? "?unread=1" : ""}`);
  const action = useAction(["/notifications"]);
  const items = data?.items || [];

  return (
    <Page width="narrow">
      <PageHeader
        title="Notifications"
        description="Assignments, approvals and alerts raised for you."
        actions={
          <>
            {allowed(session, "notifications.edit") ? <Button variant="outline" loading={action.isPending} onClick={() => action.mutate({ path: "/notifications/scan" })}><Radar /> Scan for alerts</Button> : null}
            <Button variant="outline" disabled={!data?.unreadCount} onClick={() => action.mutate({ path: "/notifications/read-all" })}>Mark all read</Button>
          </>
        }
      />
      <Card>
        <div className="px-4 pt-2">
          <Tabs value={tab} onChange={setTab} items={[{ key: "", label: "All" }, { key: "unread", label: "Unread", count: data?.unreadCount }]} />
        </div>
        <QueryError error={error} />
        {isLoading ? <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="h-14" />)}</div> : null}
        {!isLoading && !items.length ? <EmptyState icon={<BellOff />} title="No notifications" /> : null}
        <ul className="divide-y divide-line">
          {items.map((item) => {
            const base = item.entityType ? ROUTES[item.entityType] : undefined;
            const content = (
              <div className="flex gap-3 px-4 py-3">
                <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", item.readAt ? "bg-transparent" : "bg-accent")} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-sm", item.readAt ? "text-muted" : "font-medium")}>{item.title}</p>
                  <p className="text-sm text-muted">{item.body}</p>
                </div>
                <span className="shrink-0 text-xs text-subtle">{relativeTime(item.createdAt)}</span>
              </div>
            );
            return (
              <li key={item.id} className="hover:bg-canvas" onClick={() => !item.readAt && action.mutate({ path: `/notifications/${item.id}/read` })}>
                {base && item.entityId ? <Link href={`${base}/${item.entityId}`}>{content}</Link> : content}
              </li>
            );
          })}
        </ul>
      </Card>
    </Page>
  );
}
