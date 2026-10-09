"use client";

import { LOST_REASONS } from "@fixotec/shared";
import { Avatar, Badge, Button, ErrorNote, Field, MiniStat, Modal, Page, PageHeader, Select, TextInput, compactMoney, humanize, relativeTime } from "@fixotec/ui";
import { CalendarClock, Search, Target, TrendingUp, Trophy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { QueryError } from "../../../components/common";
import { useAction, useApi } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Card = { id: string; number: string; status: string; companyName: string; contactName: string; source: string; score: number; estimatedValue?: number | null; nextFollowUpAt?: string | null; updatedAt: string; owner?: { id: string; name: string } | null };
type Stage = { status: string; probability: number; count: number; value: number; weighted: number; items: Card[] };
type Pipeline = { stages: Stage[]; totals: { open: number; openValue: number; forecast: number; won90: number } };

const HIDDEN_BY_DEFAULT = new Set(["LOST"]);

export default function PipelinePage() {
  const router = useRouter();
  const { session } = useSession();
  const canEdit = allowed(session, "leads.edit");
  const [mine, setMine] = useState(false);
  const [q, setQ] = useState("");
  const [showLost, setShowLost] = useState(false);
  const [dragging, setDragging] = useState<Card | null>(null);
  const [losing, setLosing] = useState<Card | null>(null);
  const params = new URLSearchParams();
  if (mine) params.set("mine", "1");
  if (q.trim()) params.set("q", q.trim());
  const pipeline = useApi<Pipeline>(`/crm/pipeline?${params}`, { keepPrevious: true });
  const move = useAction(["/crm/pipeline", "/leads"]);

  async function drop(status: string) {
    const card = dragging;
    setDragging(null);
    if (!card || card.status === status || !canEdit) return;
    if (status === "LOST") return setLosing(card);
    await move.submit({ path: `/leads/${card.id}`, method: "PATCH", body: { status } });
  }

  const stages = (pipeline.data?.stages || []).filter((stage) => showLost || !HIDDEN_BY_DEFAULT.has(stage.status));
  const totals = pipeline.data?.totals;

  return (
    <Page>
      <PageHeader
        title="Pipeline"
        description="Drag leads between stages. Values are weighted by each stage's win probability."
        actions={
          <>
            <TextInput icon={<Search />} placeholder="Search leads…" value={q} onChange={(event) => setQ(event.target.value)} className="w-56" />
            <Button variant={mine ? "default" : "outline"} onClick={() => setMine(!mine)}>{mine ? "My leads" : "All leads"}</Button>
            <Button variant="outline" onClick={() => setShowLost(!showLost)}>{showLost ? "Hide lost" : "Show lost"}</Button>
          </>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MiniStat label="Open leads" value={totals?.open ?? "—"} icon={<Target />} />
        <MiniStat label="Open pipeline" value={compactMoney(totals?.openValue ?? 0)} icon={<TrendingUp />} />
        <MiniStat label="Weighted forecast" value={compactMoney(totals?.forecast ?? 0)} icon={<CalendarClock />} tone="info" />
        <MiniStat label="Won (90 days)" value={compactMoney(totals?.won90 ?? 0)} icon={<Trophy />} tone="good" />
      </div>
      <QueryError error={pipeline.error} />
      {move.error ? <ErrorNote>{move.error.message}</ErrorNote> : null}
      <div className="flex gap-3 overflow-x-auto pb-4 scrollbar-thin">
        {stages.map((stage) => (
          <section
            key={stage.status}
            onDragOver={(event) => canEdit && event.preventDefault()}
            onDrop={() => void drop(stage.status)}
            className={`flex w-72 shrink-0 flex-col rounded-lg border bg-canvas/60 ${dragging && dragging.status !== stage.status ? "border-accent/50 border-dashed" : "border-line"}`}
          >
            <header className="border-b border-line px-3 py-2.5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">{humanize(stage.status)}</h2>
                <Badge>{stage.count}</Badge>
              </div>
              <p className="mt-0.5 text-2xs text-muted">
                {compactMoney(stage.value)} · {stage.probability}% → <span className="font-medium text-fg">{compactMoney(stage.weighted)}</span>
              </p>
            </header>
            <div className="flex max-h-[65vh] flex-col gap-2 overflow-y-auto p-2 scrollbar-thin">
              {stage.items.map((card) => (
                <article
                  key={card.id}
                  draggable={canEdit}
                  onDragStart={() => setDragging(card)}
                  onDragEnd={() => setDragging(null)}
                  onClick={() => router.push(`/leads/${card.id}`)}
                  className="cursor-pointer rounded-md border border-line bg-surface p-2.5 shadow-sm transition hover:border-accent/40"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="line-clamp-2 text-sm font-medium">{card.companyName}</p>
                    <ScoreBadge score={card.score} />
                  </div>
                  <p className="mt-0.5 text-2xs text-muted">{card.number} · {card.contactName}</p>
                  <div className="mt-2 flex items-center justify-between text-2xs">
                    <span className="font-medium tabular">{card.estimatedValue ? compactMoney(card.estimatedValue) : "—"}</span>
                    <span className="text-muted">{humanize(card.source)}</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-2xs text-muted">
                    {card.owner ? <span className="flex items-center gap-1.5"><Avatar name={card.owner.name} size="xs" />{card.owner.name.split(" ")[0]}</span> : <span className="text-warning">Unassigned</span>}
                    {card.nextFollowUpAt ? (
                      <span className={new Date(card.nextFollowUpAt).getTime() < Date.now() ? "font-medium text-danger" : undefined}>follow-up {relativeTime(card.nextFollowUpAt)}</span>
                    ) : (
                      <span title="No follow-up scheduled">idle {relativeTime(card.updatedAt)}</span>
                    )}
                  </div>
                </article>
              ))}
              {!stage.items.length ? <p className="py-6 text-center text-2xs text-subtle">Drop leads here</p> : null}
            </div>
          </section>
        ))}
      </div>
      {losing ? <LostModal card={losing} onClose={() => setLosing(null)} /> : null}
    </Page>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone = score >= 60 ? "good" : score >= 30 ? "warn" : "neutral";
  return <Badge tone={tone}>{score}</Badge>;
}

function LostModal({ card, onClose }: { card: Card; onClose: () => void }) {
  const action = useAction(["/crm/pipeline", "/leads"]);
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  async function submit() {
    const result = await action.submit({ path: `/leads/${card.id}`, method: "PATCH", body: { status: "LOST", lostReason: reason, note: note || undefined } });
    if (result) onClose();
  }
  return (
    <Modal open onOpenChange={(open) => !open && onClose()} title={`Mark ${card.number} as lost`} footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button variant="danger" disabled={!reason} loading={action.isPending} onClick={() => void submit()}>Mark lost</Button></>}>
      <div className="grid gap-4">
        <Field label="Why was it lost?">
          <Select value={reason} onChange={(event) => setReason(event.target.value)} required>
            <option value="">Choose a reason…</option>
            {LOST_REASONS.filter((item) => item !== "MERGED").map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
        </Field>
        <Field label="Note (competitor, price gap, …)"><TextInput value={note} onChange={(event) => setNote(event.target.value)} /></Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </div>
    </Modal>
  );
}
