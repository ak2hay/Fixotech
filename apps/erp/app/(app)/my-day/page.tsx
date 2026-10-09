"use client";

import { Badge, Button, Card, CardHeader, EmptyState, Page, PageHeader, compactMoney, formatDate, greeting, humanize, money, relativeTime } from "@fixotec/ui";
import { AlarmClock, Check, Flame, Hourglass, Sun } from "lucide-react";
import { QueryError } from "../../../components/common";
import { Link } from "../../../components/link";
import { useAction, useApi } from "../../../lib/query";
import { useSession } from "../../../lib/session";

type Activity = { id: string; type: string; subject: string; dueAt?: string | null; entityType: string; entityId: string };
type LeadRef = { id: string; number: string; companyName: string; status: string; score?: number; estimatedValue?: number | null; nextFollowUpAt?: string | null; updatedAt?: string };
type MyDay = {
  overdue: Activity[];
  today: Activity[];
  upcoming: Activity[];
  followUps: LeadRef[];
  hotLeads: LeadRef[];
  expiringQuotes: Array<{ id: string; number: string; total: number; validUntil?: string | null; customer: { name: string } }>;
  staleLeads: LeadRef[];
};

const ROUTES: Record<string, string> = { lead: "/leads", customer: "/customers", project: "/projects", quotation: "/quotations", rfq: "/rfqs" };

export default function MyDayPage() {
  const { session } = useSession();
  const day = useApi<MyDay>("/crm/my-day");
  const action = useAction(["/crm/my-day", "/activities"]);
  const data = day.data;

  function activityList(items: Activity[], tone?: "bad") {
    if (!items.length) return <p className="px-4 py-6 text-center text-sm text-muted">Nothing here.</p>;
    return (
      <ul className="divide-y divide-line">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-3 px-4 py-2.5">
            <Badge tone={tone || "neutral"}>{humanize(item.type)}</Badge>
            <Link href={`${ROUTES[item.entityType] || ""}/${item.entityId}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">{item.subject}</Link>
            <span className={`whitespace-nowrap text-2xs ${tone === "bad" ? "text-danger" : "text-muted"}`}>{item.dueAt ? relativeTime(item.dueAt) : "no date"}</span>
            <Button size="sm" variant="ghost" aria-label="Mark done" onClick={() => action.submit({ path: `/activities/${item.id}`, method: "PATCH", body: { status: "DONE" } })}><Check /></Button>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <Page>
      <PageHeader title={`${greeting()}, ${session?.user.name.split(" ")[0] || ""}`} description="Your calls, meetings, follow-ups and deals that need attention today." />
      <QueryError error={day.error} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader title="Overdue" icon={<AlarmClock />} description={`${data?.overdue.length ?? 0} tasks`} />
          {activityList(data?.overdue || [], "bad")}
        </Card>
        <Card>
          <CardHeader title="Today" icon={<Sun />} description={`${data?.today.length ?? 0} tasks`} />
          {activityList(data?.today || [])}
        </Card>
        <Card>
          <CardHeader title="Follow-ups due" icon={<Hourglass />} description="Leads whose next follow-up is today or earlier" />
          {data?.followUps.length ? (
            <ul className="divide-y divide-line">
              {data.followUps.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">{lead.number} · {lead.companyName}</Link>
                  <Badge>{humanize(lead.status)}</Badge>
                  <span className="text-2xs text-danger">{lead.nextFollowUpAt ? relativeTime(lead.nextFollowUpAt) : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-6 text-center text-sm text-muted">All follow-ups are on schedule.</p>}
        </Card>
        <Card>
          <CardHeader title="Hot leads" icon={<Flame />} description="Score 60+ and still open" />
          {data?.hotLeads.length ? (
            <ul className="divide-y divide-line">
              {data.hotLeads.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Badge tone="good">{lead.score}</Badge>
                  <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">{lead.companyName}</Link>
                  <span className="text-2xs tabular text-muted">{lead.estimatedValue ? compactMoney(lead.estimatedValue) : "—"}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-6 text-center text-sm text-muted">No hot leads. Set up scoring rules in CRM settings.</p>}
        </Card>
        <Card>
          <CardHeader title="Quotations expiring this week" />
          {data?.expiringQuotes.length ? (
            <ul className="divide-y divide-line">
              {data.expiringQuotes.map((quote) => (
                <li key={quote.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Link href={`/quotations/${quote.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">{quote.number} · {quote.customer.name}</Link>
                  <span className="text-2xs tabular">{money(quote.total)}</span>
                  <span className="text-2xs text-warning">{quote.validUntil ? formatDate(quote.validUntil) : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-6 text-center text-sm text-muted">No quotations about to lapse.</p>}
        </Card>
        <Card>
          <CardHeader title="Going cold" description="No update in 14 days and nothing scheduled" />
          {data?.staleLeads.length ? (
            <ul className="divide-y divide-line">
              {data.staleLeads.map((lead) => (
                <li key={lead.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Link href={`/leads/${lead.id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-accent">{lead.number} · {lead.companyName}</Link>
                  <span className="text-2xs text-muted">{lead.updatedAt ? relativeTime(lead.updatedAt) : ""}</span>
                </li>
              ))}
            </ul>
          ) : <p className="px-4 py-6 text-center text-sm text-muted">Nothing going cold.</p>}
        </Card>
      </div>
      {data && !data.upcoming.length && !data.today.length && !data.overdue.length ? <EmptyState title="Clear calendar" description="Log a call or schedule a meeting from any lead, customer or quotation." /> : null}
      {data?.upcoming.length ? (
        <Card>
          <CardHeader title="Next 7 days" />
          {activityList(data.upcoming)}
        </Card>
      ) : null}
    </Page>
  );
}
