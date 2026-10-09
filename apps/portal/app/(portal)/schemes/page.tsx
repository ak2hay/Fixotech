"use client";

import { Button, Card, CardBody, CardHeader, DataTable, EmptyState, ErrorNote, Field, Modal, Notice, StatusPill, TextArea, TextInput, formatDate, money } from "@fixotec/ui";
import { CalendarDays, Gift } from "lucide-react";
import { FormEvent, useState } from "react";
import { DateText, ListPage, PageSkeleton, QueryError } from "../../../components/common";
import { useAction, useApi } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Claim = { id: string; amount: number | string; status: string; notes?: string | null; createdAt: string };
type Scheme = { id: string; name: string; description?: string | null; validFrom?: string | null; validTo?: string | null; claims: Claim[] };

export default function SchemesPage() {
  const { session } = useSession();
  const { data, error, isLoading } = useApi<Scheme[]>("/distributor/schemes");
  const [claiming, setClaiming] = useState<Scheme | null>(null);
  const [done, setDone] = useState("");
  if (isLoading) return <PageSkeleton />;
  const schemes = data || [];
  const myClaims = schemes.flatMap((scheme) => scheme.claims.map((claim) => ({ ...claim, scheme: scheme.name })));
  const canClaim = allowed(session, "sales_orders.create");

  return (
    <ListPage title="Schemes" description="Active trade schemes and the claims you have submitted.">
      <QueryError error={error} />
      {done ? <Notice tone="good">{done}</Notice> : null}
      {schemes.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {schemes.map((scheme) => (
            <Card key={scheme.id} className="flex flex-col">
              <CardHeader icon={<Gift />} title={scheme.name} />
              <CardBody className="flex flex-1 flex-col gap-3">
                <p className="flex-1 text-sm text-muted">{scheme.description || "No description."}</p>
                <p className="flex items-center gap-1.5 text-xs text-subtle">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {scheme.validFrom || scheme.validTo ? `${formatDate(scheme.validFrom) || "Now"} to ${formatDate(scheme.validTo) || "until withdrawn"}` : "Open-ended"}
                </p>
                {canClaim ? (
                  <Button variant="outline" size="sm" onClick={() => setClaiming(scheme)}>
                    Submit claim
                  </Button>
                ) : null}
              </CardBody>
            </Card>
          ))}
        </div>
      ) : (
        <EmptyState icon={<Gift />} title="No active schemes" description="New trade schemes will appear here." />
      )}
      <Card>
        <CardHeader title="Your claims" />
        <DataTable
          rows={myClaims}
          rowKey={(row) => row.id}
          empty={<p className="px-4 py-8 text-center text-sm text-muted">No claims submitted yet.</p>}
          columns={[
            { key: "scheme", header: "Scheme", render: (row) => <span className="font-medium">{row.scheme}</span> },
            { key: "createdAt", header: "Submitted", render: (row) => <DateText value={row.createdAt} /> },
            { key: "notes", header: "Notes", render: (row) => <span className="text-muted">{row.notes || "—"}</span> },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.status} /> },
            { key: "amount", header: "Amount", align: "right", render: (row) => money(row.amount) },
          ]}
        />
      </Card>
      <ClaimModal scheme={claiming} onClose={() => setClaiming(null)} onDone={(text) => { setClaiming(null); setDone(text); }} />
    </ListPage>
  );
}

function ClaimModal({ scheme, onClose, onDone }: { scheme: Scheme | null; onClose: () => void; onDone: (text: string) => void }) {
  const action = useAction(["/distributor/schemes"]);
  const [amount, setAmount] = useState("");
  const [notes, setNotes] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!scheme) return;
    if (!(await action.submit({ path: "/distributor/claims", body: { schemeId: scheme.id, amount: Number(amount), notes: notes || undefined } }))) return;
    setAmount("");
    setNotes("");
    onDone(`Claim submitted for ${scheme.name}.`);
  }

  return (
    <Modal
      open={Boolean(scheme)}
      onOpenChange={(open) => (!open ? onClose() : undefined)}
      title={`Claim: ${scheme?.name || ""}`}
      description="Fixotec reviews claims against your invoiced sales."
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="claim-form" loading={action.isPending}>Submit claim</Button>
        </>
      }
    >
      <form id="claim-form" onSubmit={submit} className="space-y-4">
        <Field label="Claim amount">
          <TextInput type="number" min="1" step="any" value={amount} onChange={(event) => setAmount(event.target.value)} required />
        </Field>
        <Field label="Notes" hint="Invoice numbers or period covered">
          <TextArea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}
