"use client";

import { Button, Card, CardBody, CardHeader, ErrorNote, Field, Select, TextArea, TextInput } from "@fixotec/ui";
import { Plus, Send, Trash2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, Suspense, useState } from "react";
import { ListPage } from "../../../../components/common";
import { useAction, useApi, type Paged } from "../../../../lib/query";

type Line = { description: string; qty: string; unit: string; specification: string };
const UNITS = ["NOS", "SET", "MTR", "KG", "LOT"];
const blank = (): Line => ({ description: "", qty: "1", unit: "NOS", specification: "" });

export default function NewRfqPage() {
  return (
    <Suspense>
      <NewRfqForm />
    </Suspense>
  );
}

function NewRfqForm() {
  const router = useRouter();
  const params = useSearchParams();
  const projects = useApi<Paged<{ id: string; name: string; code: string }>>("/projects?pageSize=100");
  const action = useAction<Record<string, unknown>, { id: string }>(["/rfqs", "/portal"]);
  const [projectId, setProjectId] = useState(params.get("project") || "");
  const [application, setApplication] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([blank()]);

  const update = (index: number, patch: Partial<Line>) => setLines((current) => current.map((line, position) => (position === index ? { ...line, ...patch } : line)));

  async function submit(event: FormEvent) {
    event.preventDefault();
    const items = lines.filter((line) => line.description.trim()).map((line) => ({ description: line.description.trim(), qty: Number(line.qty) || 1, unit: line.unit, specification: line.specification || undefined }));
    const rfq = await action.submit({ path: "/rfqs", body: { projectId: projectId || undefined, application: application || undefined, priority, dueDate: dueDate || undefined, notes: notes || undefined, items } });
    if (rfq) router.push(`/rfqs/${rfq.id}`);
  }

  return (
    <ListPage title="New request for quotation" description="Tell us what you need. Our engineers reply with a priced quotation." breadcrumbs={[{ label: "RFQs", href: "/rfqs" }, { label: "New" }]}>
      <form onSubmit={submit} className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <Card>
          <CardHeader title="Requirement" description="One line per item. Add drawings references or specifications where you have them." />
          <CardBody className="space-y-3">
            {lines.map((line, index) => (
              <div key={index} className="grid gap-2 rounded-lg border border-line p-3 md:grid-cols-[1fr_90px_100px_36px]">
                <TextInput aria-label={`Line ${index + 1} description`} value={line.description} onChange={(event) => update(index, { description: event.target.value })} placeholder="e.g. Seismic brace kit for 150 mm pipe" required={index === 0} maxLength={500} />
                <TextInput aria-label={`Line ${index + 1} quantity`} value={line.qty} onChange={(event) => update(index, { qty: event.target.value })} type="number" min="0" step="any" placeholder="Qty" />
                <Select aria-label={`Line ${index + 1} unit`} value={line.unit} onChange={(event) => update(index, { unit: event.target.value })}>
                  {UNITS.map((unit) => (
                    <option key={unit}>{unit}</option>
                  ))}
                </Select>
                <Button type="button" variant="ghost" size="icon" aria-label="Remove line" disabled={lines.length === 1} onClick={() => setLines((current) => current.filter((_, position) => position !== index))}>
                  <Trash2 />
                </Button>
                <TextInput aria-label={`Line ${index + 1} specification`} className="md:col-span-3" value={line.specification} onChange={(event) => update(index, { specification: event.target.value })} placeholder="Specification, finish or load (optional)" />
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((current) => [...current, blank()])}>
              <Plus /> Add line
            </Button>
          </CardBody>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Details" />
            <CardBody className="space-y-4">
              <Field label="Project">
                <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="">Not linked to a project</option>
                  {(projects.data?.items || []).map((project) => (
                    <option key={project.id} value={project.id}>{project.code} · {project.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Application">
                <TextInput value={application} onChange={(event) => setApplication(event.target.value)} placeholder="HVAC, fire, plumbing..." />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Priority">
                  <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </Select>
                </Field>
                <Field label="Needed by">
                  <TextInput type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
                </Field>
              </div>
              <Field label="Notes">
                <TextArea rows={4} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Site conditions, delivery location, anything else" />
              </Field>
            </CardBody>
          </Card>
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          <Button type="submit" size="lg" className="w-full" loading={action.isPending}>
            <Send /> Submit RFQ
          </Button>
        </div>
      </form>
    </ListPage>
  );
}
