"use client";

import { RFQ_PRIORITIES } from "@fixotec/shared";
import { Button, ErrorNote, Field, Modal, Select, TextArea, TextInput, humanize } from "@fixotec/ui";
import { FormEvent, useEffect, useState } from "react";
import { useAction, useApi, type Paged } from "../lib/query";
import { LineEditor, emptyLine, type Line } from "./line-editor";

export function CreateRfq({ open, onOpenChange, projectId = "", initialLines, onCreated }: { open: boolean; onOpenChange: (open: boolean) => void; projectId?: string; initialLines?: Line[]; onCreated: (id: string) => void }) {
  const [customerId, setCustomerId] = useState("");
  const [lines, setLines] = useState<Line[]>(initialLines?.length ? initialLines : [emptyLine()]);
  const customers = useApi<Paged<{ id: string; name: string; code: string }>>(open ? "/customers?pageSize=100" : null);
  const projects = useApi<Paged<{ id: string; name: string; code: string; customerId?: string }>>(open ? "/projects?pageSize=100" : null);
  const action = useAction<Record<string, unknown>, { id: string }>(["/rfqs", "/reports"]);

  useEffect(() => {
    if (open) setLines(initialLines?.length ? initialLines : [emptyLine()]);
  }, [open, initialLines]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = Object.fromEntries([...form.entries()].filter(([, value]) => value !== ""));
    body.items = lines.filter((line) => line.description.trim()).map((line) => ({ ...line, description: line.description.trim() }));
    const created = await action.mutateAsync({ path: "/rfqs", body });
    onOpenChange(false);
    onCreated(created.id);
  }

  const projectOptions = (projects.data?.items || []).filter((project) => !customerId || project.customerId === customerId);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New RFQ"
      description="Capture the request; pricing and engineering review follow from the RFQ page."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="create-rfq" loading={action.isPending}>Create RFQ</Button>
        </>
      }
    >
      <form id="create-rfq" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Customer">
          <Select name="customerId" value={customerId} onChange={(event) => setCustomerId(event.target.value)} required>
            <option value="" disabled>Select customer</option>
            {customers.data?.items.map((customer) => <option key={customer.id} value={customer.id}>{customer.name}</option>)}
          </Select>
        </Field>
        <Field label="Project">
          <Select name="projectId" defaultValue={projectId}>
            <option value="">No project</option>
            {projectOptions.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
          </Select>
        </Field>
        <Field label="Application" className="sm:col-span-2"><TextInput name="application" placeholder="e.g. Fire-fighting pipe supports, basement" /></Field>
        <Field label="Priority">
          <Select name="priority" defaultValue="MEDIUM">{RFQ_PRIORITIES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
        </Field>
        <Field label="Due date" hint="Defaults to 7 days"><TextInput name="dueDate" type="date" /></Field>
        <div className="sm:col-span-2">
          <p className="mb-2 text-sm font-medium">Requested items</p>
          <LineEditor lines={lines} onChange={setLines} />
        </div>
        <Field label="Notes" className="sm:col-span-2"><TextArea name="notes" rows={3} /></Field>
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
