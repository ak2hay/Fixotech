"use client";

import { Button, Card, CardBody, CardHeader, DataTable, Drawer, ErrorNote, Field, Modal, Select, StatusPill, Tabs, TextArea, TextInput, formatDate, relativeTime } from "@fixotec/ui";
import { MessageSquare, Plus, Send } from "lucide-react";
import { FormEvent, useState } from "react";
import { DateText, ListPage, QueryError } from "../../../components/common";
import { rowsOf } from "../../../lib/api";
import { useAction, useApi, type Paged } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Ticket = { id: string; number: string; subject: string; description?: string | null; priority: string; status: string; dueAt?: string | null; createdAt: string; assignee?: { name: string } | null; comments: Array<{ id: string; body: string; createdAt: string; authorId: string }> };

export default function SupportPage() {
  const { session } = useSession();
  const [tab, setTab] = useState("open");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, error, isLoading } = useApi<unknown>("/service/tickets");
  const all = rowsOf<Ticket>(data);
  const isOpen = (row: Ticket) => !["RESOLVED", "CLOSED"].includes(row.status);
  const rows = all.filter((row) => (tab === "open" ? isOpen(row) : tab === "closed" ? !isOpen(row) : true));
  const selected = all.find((row) => row.id === openId) || null;

  return (
    <ListPage
      title="Support"
      description="Raise a service request and follow it to resolution."
      actions={allowed(session, "service.create") ? <Button onClick={() => setCreating(true)}><Plus /> New ticket</Button> : null}
    >
      <Tabs
        variant="pill"
        items={[
          { key: "open", label: "Open", count: all.filter(isOpen).length },
          { key: "closed", label: "Resolved", count: all.filter((row) => !isOpen(row)).length },
          { key: "", label: "All", count: all.length },
        ]}
        value={tab}
        onChange={setTab}
      />
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          onRowClick={(row) => setOpenId(row.id)}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No tickets here.</p>}
          columns={[
            { key: "number", header: "Ticket", render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "subject", header: "Subject", render: (row) => row.subject },
            { key: "priority", header: "Priority", render: (row) => <StatusPill status={row.priority} /> },
            { key: "createdAt", header: "Raised", render: (row) => <DateText value={row.createdAt} /> },
            { key: "dueAt", header: "Response by", render: (row) => (isOpen(row) ? <DateText value={row.dueAt} /> : "—") },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
          ]}
        />
      </Card>
      <NewTicket open={creating} onOpenChange={setCreating} />
      <TicketDrawer ticket={selected} myId={session?.user.id} onClose={() => setOpenId(null)} />
    </ListPage>
  );
}

function NewTicket({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const action = useAction(["/service/tickets"]);
  const projects = useApi<Paged<{ id: string; name: string; code: string }>>(open ? "/projects?pageSize=100" : null);
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [projectId, setProjectId] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!(await action.submit({ path: "/service/tickets", body: { subject, description: description || undefined, priority, projectId: projectId || undefined } }))) return;
    setSubject("");
    setDescription("");
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title="New support ticket"
      description="Our service team responds within the SLA for the priority you choose."
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="submit" form="ticket-form" loading={action.isPending}>Raise ticket</Button>
        </>
      }
    >
      <form id="ticket-form" onSubmit={submit} className="space-y-4">
        <Field label="Subject">
          <TextInput value={subject} onChange={(event) => setSubject(event.target.value)} minLength={3} required />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Priority">
            <Select value={priority} onChange={(event) => setPriority(event.target.value)}>
              <option value="LOW">Low</option>
              <option value="MEDIUM">Medium</option>
              <option value="HIGH">High</option>
              <option value="CRITICAL">Critical</option>
            </Select>
          </Field>
          <Field label="Project">
            <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
              <option value="">None</option>
              {(projects.data?.items || []).map((project) => (
                <option key={project.id} value={project.id}>{project.code}</option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="What happened?">
          <TextArea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} />
        </Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

function TicketDrawer({ ticket, myId, onClose }: { ticket: Ticket | null; myId?: string; onClose: () => void }) {
  const action = useAction(["/service/tickets"]);
  const [body, setBody] = useState("");

  async function send(event: FormEvent) {
    event.preventDefault();
    if (!ticket || !body.trim()) return;
    if (await action.submit({ path: `/service/tickets/${ticket.id}/comments`, body: { body } })) setBody("");
  }

  return (
    <Drawer open={Boolean(ticket)} onOpenChange={(open) => (!open ? onClose() : undefined)} title={ticket ? `${ticket.number} · ${ticket.subject}` : ""} description={ticket ? `Raised ${formatDate(ticket.createdAt)}` : undefined}>
      {ticket ? (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <StatusPill status={ticket.status} />
            <StatusPill status={ticket.priority} />
            {ticket.assignee ? <span className="text-xs text-muted">Assigned to {ticket.assignee.name}</span> : null}
          </div>
          {ticket.description ? <p className="whitespace-pre-wrap text-sm">{ticket.description}</p> : null}
          <Card>
            <CardHeader icon={<MessageSquare />} title="Conversation" />
            <CardBody className="space-y-3">
              {ticket.comments.length ? (
                ticket.comments.map((comment) => (
                  <div key={comment.id} className={`rounded-lg px-3 py-2 text-sm ${comment.authorId === myId ? "ml-6 bg-accent/10" : "mr-6 bg-canvas"}`}>
                    <p className="whitespace-pre-wrap">{comment.body}</p>
                    <p className="mt-1 text-[11px] text-subtle">{comment.authorId === myId ? "You" : "Fixotec"} · {relativeTime(comment.createdAt)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted">No replies yet.</p>
              )}
              <form onSubmit={send} className="flex gap-2 pt-2">
                <TextInput value={body} onChange={(event) => setBody(event.target.value)} placeholder="Write a reply..." />
                <Button type="submit" size="icon" aria-label="Send" loading={action.isPending}><Send /></Button>
              </form>
              {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
            </CardBody>
          </Card>
        </div>
      ) : null}
    </Drawer>
  );
}
