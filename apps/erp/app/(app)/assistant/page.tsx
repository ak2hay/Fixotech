"use client";

import { Button, Card, CardBody, DataTable, ErrorNote, Page, PageHeader, TextInput, humanize } from "@fixotec/ui";
import { Bot, Send, Sparkles } from "lucide-react";
import { FormEvent, useState } from "react";
import { useAction } from "../../../lib/query";

type Answer = { intent?: string; answer: string; records?: Array<Record<string, unknown>> };
type Turn = { question: string; answer: Answer };

const SUGGESTIONS = ["Which products are below safety stock?", "Show pending RFQs above 10 lakh", "Why is Skyline Towers delayed?", "Find the datasheet for strut channel", "What is the demand forecast?"];

export default function AssistantPage() {
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<Turn[]>([]);
  const action = useAction<{ question: string }, Answer>([]);

  async function ask(text: string) {
    if (!text.trim()) return;
    const answer = await action.mutateAsync({ path: "/assistant/query", body: { question: text } });
    setTurns((current) => [{ question: text, answer }, ...current]);
    setQuestion("");
  }

  return (
    <Page width="narrow">
      <PageHeader title="Operations assistant" description="Ask about RFQs, stock, project delays, datasheets or the forecast. Answers come straight from ERP records." />
      <Card>
        <CardBody className="space-y-3 pt-5">
          <form onSubmit={(event: FormEvent) => { event.preventDefault(); ask(question); }} className="flex gap-2">
            <TextInput icon={<Sparkles />} value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="Ask a question..." className="flex-1" autoFocus />
            <Button type="submit" loading={action.isPending}><Send /> Ask</Button>
          </form>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((item) => (
              <button key={item} type="button" onClick={() => ask(item)} className="rounded-full border border-line px-3 py-1 text-xs text-muted transition hover:border-accent hover:text-accent">
                {item}
              </button>
            ))}
          </div>
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        </CardBody>
      </Card>
      {turns.map((turn, index) => (
        <Card key={index}>
          <CardBody className="space-y-3 pt-4">
            <p className="text-sm font-medium">{turn.question}</p>
            <div className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-soft text-accent"><Bot className="h-4 w-4" /></span>
              <p className="pt-1 text-sm leading-relaxed">{turn.answer.answer}</p>
            </div>
          </CardBody>
          {turn.answer.records?.length ? (
            <DataTable
              rows={turn.answer.records}
              rowKey={(_, row) => String(row)}
              density="compact"
              columns={Object.keys(turn.answer.records[0]).map((key) => ({ key, header: humanize(key.replace(/([a-z])([A-Z])/g, "$1_$2")), render: (row: Record<string, unknown>) => String(row[key] ?? "—") }))}
            />
          ) : null}
        </Card>
      ))}
    </Page>
  );
}
