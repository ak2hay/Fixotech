"use client";

import { Badge, Button, Card, CardBody, CardHeader, DataTable, ErrorNote, Field, MiniStat, Modal, Notice, Select, TextInput, formatDate, humanize, money } from "@fixotec/ui";
import { BANKS } from "@fixotec/shared";
import { Copy, Download, Plus, Trash2, Upload, Wand2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { download } from "../lib/api";
import { useAction, useApi } from "../lib/query";
import { allowed, useSession } from "../lib/session";
import { QueryError } from "./common";

type BankAccountRow = { id: string; code: string; name: string; subtype: string; systemKey: string | null; bank: { name: string; last4: string; ifsc: string | null } | null; bookBalance: number; unreconciled: number; statement: { toDate: string | null; closingBalance: number | null } | null };
type Ledger = { id: string; code: string; name: string; type: string; isGroup: boolean; active: boolean };
type Match = { id: string; amount: number; payment: { id: string; number: string; customer: { name: string } | null; vendor: { name: string } | null } | null; journalEntry: { id: string; number: string; narration: string } | null };
type Line = { id: string; date: string; description: string; reference: string | null; utr: string | null; debit: number; credit: number; balance: number | null; status: string; suggestion: { kind?: string; label?: string; score?: number; auto?: boolean } | null; notes: string | null; matches: Match[] };

const STATUS_TONE: Record<string, "good" | "warn" | "neutral" | "info"> = { MATCHED: "good", SUGGESTED: "warn", IGNORED: "neutral", UNMATCHED: "info" };
const today = () => new Date().toISOString().slice(0, 10);

function useBankAccounts() {
  const query = useApi<BankAccountRow[]>("/banking/accounts");
  const [accountId, setAccountId] = useState("");
  useEffect(() => {
    if (!accountId && query.data?.length) setAccountId((query.data.find((row) => row.systemKey === "BANK") || query.data[0]).id);
  }, [query.data, accountId]);
  const picker = (
    <Field label="Account">
      <Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>
        {(query.data || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}{row.bank ? ` (${row.bank.name} ···${row.bank.last4})` : ""}</option>)}
      </Select>
    </Field>
  );
  return { query, accountId, account: query.data?.find((row) => row.id === accountId), picker };
}

function usePostingLedgers() {
  const query = useApi<Ledger[]>("/accounting/accounts");
  return useMemo(() => (query.data || []).filter((row) => !row.isGroup && row.active), [query.data]);
}

// ---------- Reconcile ----------

export function Reconcile() {
  const { session } = useSession();
  const { query: accounts, accountId, account, picker } = useBankAccounts();
  const [view, setView] = useState("UNMATCHED,SUGGESTED");
  const [search, setSearch] = useState("");
  const [asOf, setAsOf] = useState(today);
  const [open, setOpen] = useState<Line | null>(null);
  const lines = useApi<Line[]>(accountId ? `/banking/transactions?accountId=${accountId}&status=${view}&q=${encodeURIComponent(search)}` : null, { keepPrevious: true });
  const summary = useApi<{ bookBalance: number; depositsInTransit: number; chequesNotCleared: number; bankOnlyCredits: number; bankOnlyDebits: number; expectedBank: number; bankBalance: number | null; statementDate: string | null; difference: number | null }>(accountId ? `/banking/summary?accountId=${accountId}&asOf=${asOf}` : null, { keepPrevious: true });
  const upload = useAction<FormData, { lines: number; created: number; duplicates: number; matched: number; suggested: number; posted: number; warnings: string[]; bank: string; format: string }>(["/banking"]);
  const auto = useAction<unknown, { matched: number; suggested: number; posted: number }>(["/banking"]);
  const [message, setMessage] = useState<{ tone: "good" | "warn"; text: string } | null>(null);
  const canCreate = allowed(session, "banking.create");

  async function importFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    form.set("accountId", accountId);
    const result = await upload.submit({ path: "/banking/statements/import", body: form });
    if (result) {
      setMessage({ tone: result.warnings.length ? "warn" : "good", text: `${result.format}${result.bank && result.bank !== "GENERIC" ? ` (${result.bank})` : ""}: ${result.created} new line(s), ${result.duplicates} already imported. Auto-matched ${result.matched}, posted by rules ${result.posted}, ${result.suggested} suggestion(s).${result.warnings.length ? ` ${result.warnings.join(" ")}` : ""}` });
      (event.target as HTMLFormElement).reset();
    }
  }

  const s = summary.data;
  return (
    <div className="space-y-4">
      <QueryError error={accounts.error} />
      {accounts.data && !accounts.data.length ? <Notice tone="info">Add a bank ledger under Accounting → Chart of accounts and link it to a bank account first.</Notice> : null}
      <div className="flex flex-wrap items-end gap-3">
        {picker}
        <Field label="As of"><TextInput type="date" value={asOf} onChange={(event) => setAsOf(event.target.value || today())} /></Field>
        {canCreate && accountId ? (
          <>
            <form onSubmit={importFile} className="flex flex-wrap items-end gap-3">
              <Field label="Statement (CSV, Excel, MT940, PDF)"><input type="file" name="file" accept=".csv,.txt,.xlsx,.sta,.mt940,.940,.pdf" required className="text-sm" /></Field>
              <Button type="submit" variant="outline" loading={upload.isPending}><Upload /> Import</Button>
            </form>
            <Button variant="ghost" loading={auto.isPending} onClick={async () => { const result = await auto.submit({ path: "/banking/reconcile/auto", body: { accountId } }); if (result) setMessage({ tone: "good", text: `Matched ${result.matched}, posted by rules ${result.posted}, ${result.suggested} suggestion(s).` }); }}><Wand2 /> Auto-match</Button>
          </>
        ) : null}
      </div>
      {upload.error ? <ErrorNote>{upload.error.message}</ErrorNote> : null}
      {auto.error ? <ErrorNote>{auto.error.message}</ErrorNote> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      {s && account ? (
        <Card>
          <CardHeader title={`Bank reconciliation · ${account.name}`} description={s.statementDate ? `Last statement to ${formatDate(s.statementDate)}` : "No statement imported yet"} />
          <CardBody>
            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
              <MiniStat label="Balance per books" value={money(s.bookBalance)} />
              <MiniStat label="Less: deposits not yet credited" value={money(s.depositsInTransit)} />
              <MiniStat label="Add: payments not yet debited" value={money(s.chequesNotCleared)} />
              <MiniStat label="Bank-only credits / debits" value={`${money(s.bankOnlyCredits)} / ${money(s.bankOnlyDebits)}`} hint="Not yet in the books" />
              <MiniStat label="Expected bank balance" value={money(s.expectedBank)} />
              <MiniStat label="Balance per bank" value={s.bankBalance === null ? "—" : money(s.bankBalance)} hint={s.difference === null ? undefined : Math.abs(s.difference) < 0.01 ? "Reconciled" : `Difference ${money(s.difference)}`} />
            </div>
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader
          title="Statement lines"
          action={
            <div className="flex flex-wrap gap-2">
              <TextInput placeholder="Search narration, UTR" value={search} onChange={(event) => setSearch(event.target.value)} />
              <Select value={view} onChange={(event) => setView(event.target.value)}>
                <option value="UNMATCHED,SUGGESTED">To reconcile</option>
                <option value="SUGGESTED">Suggested</option>
                <option value="MATCHED">Reconciled</option>
                <option value="IGNORED">Ignored</option>
                <option value="">All</option>
              </Select>
            </div>
          }
        />
        <QueryError error={lines.error} />
        <DataTable
          rows={lines.data || []}
          rowKey={(row) => row.id}
          loading={lines.isLoading}
          onRowClick={(row) => setOpen(row)}
          empty={<p className="py-6 text-center text-sm text-muted">{view.startsWith("UNMATCHED") ? "Nothing left to reconcile." : "No lines."}</p>}
          columns={[
            { key: "date", header: "Date", render: (row) => formatDate(row.date), sortValue: (row) => row.date },
            { key: "description", header: "Narration", render: (row) => <div className="max-w-md"><div className="truncate">{row.description}</div><div className="font-mono text-xs text-muted">{row.utr || row.reference || ""}</div></div> },
            { key: "debit", header: "Withdrawal", align: "right", render: (row) => (row.debit ? money(row.debit) : ""), sortValue: (row) => row.debit },
            { key: "credit", header: "Deposit", align: "right", render: (row) => (row.credit ? money(row.credit) : ""), sortValue: (row) => row.credit },
            { key: "balance", header: "Balance", align: "right", render: (row) => (row.balance === null ? "" : money(row.balance)) },
            {
              key: "status",
              header: "Status",
              render: (row) => (
                <div>
                  <Badge tone={STATUS_TONE[row.status] || "neutral"}>{humanize(row.status)}</Badge>
                  {row.status === "MATCHED" ? <div className="text-xs text-muted">{row.matches.map((match) => match.payment?.number || match.journalEntry?.number).join(", ")}</div> : row.suggestion?.label ? <div className="max-w-xs truncate text-xs text-muted">{row.suggestion.label}</div> : null}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {open ? <LineModal key={open.id} line={open} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

type Candidates = {
  line: Line & { amount: number };
  entries: Array<{ kind: "PAYMENT" | "JOURNAL"; id: string; label: string; date: string; amount: number; score: number }>;
  documents: Array<{ kind: "INVOICE" | "BILL"; id: string; number: string; party: string; partyId: string; date: string; balance: number; score: number }>;
};

function LineModal({ line, onClose }: { line: Line; onClose: () => void }) {
  const { session } = useSession();
  const reconcilable = line.status === "UNMATCHED" || line.status === "SUGGESTED";
  const query = useApi<Candidates>(reconcilable ? `/banking/transactions/${line.id}/candidates` : null);
  const ledgers = usePostingLedgers();
  const action = useAction(["/banking", "/payments", "/invoices", "/accounting"]);
  const [picked, setPicked] = useState<Record<string, "PAYMENT" | "JOURNAL">>({});
  const [doc, setDoc] = useState("");
  const [tds, setTds] = useState("");
  const [counter, setCounter] = useState("");
  const [narration, setNarration] = useState("");
  const [note, setNote] = useState("");
  const amount = line.credit - line.debit;
  const data = query.data;
  useEffect(() => {
    if (!data) return;
    const top = data.entries[0];
    if (top && top.score >= 60 && Math.abs(top.amount - amount) <= 1) setPicked({ [top.id]: top.kind });
    if (data.documents[0]?.score >= 50) setDoc(data.documents[0].id);
    if (line.suggestion?.kind === "RULE" && (line.suggestion as { id?: string }).id) setCounter((line.suggestion as { id: string }).id);
  }, [data, amount, line.suggestion]);
  const selectedTotal = (data?.entries || []).filter((entry) => picked[entry.id]).reduce((sum, entry) => sum + entry.amount, 0);
  const done = async (input: Parameters<typeof action.submit>[0]) => {
    if (await action.submit(input)) onClose();
  };
  const document = data?.documents.find((row) => row.id === doc);
  const canEdit = allowed(session, "banking.edit");
  const canCreate = allowed(session, "banking.create");
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={`${amount > 0 ? "Deposit" : "Withdrawal"} ${money(Math.abs(amount))} · ${formatDate(line.date)}`} description={line.description} className="max-w-4xl">
      <div className="space-y-5">
        {line.utr || line.reference ? <p className="font-mono text-xs text-muted">{[line.utr, line.reference].filter(Boolean).join(" · ")}</p> : null}
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        {line.status === "MATCHED" ? (
          <div className="space-y-3">
            <DataTable rows={line.matches} rowKey={(row) => row.id} density="compact" columns={[{ key: "entry", header: "Reconciled with", render: (row) => (row.payment ? `${row.payment.number} · ${row.payment.customer?.name || row.payment.vendor?.name || ""}` : `${row.journalEntry?.number} · ${row.journalEntry?.narration}`) }, { key: "amount", header: "Amount", align: "right", render: (row) => money(row.amount) }]} />
            {canEdit ? <Button variant="outline" loading={action.isPending} onClick={() => window.confirm("Unreconcile this line? A journal posted from it is reversed; payments stay recorded.") && done({ path: `/banking/transactions/${line.id}/unmatch` })}>Unreconcile</Button> : null}
          </div>
        ) : null}
        {line.status === "IGNORED" ? (
          <div className="space-y-3">
            <p className="text-sm">Ignored{line.notes ? `: ${line.notes}` : ""}.</p>
            {canEdit ? <Button variant="outline" onClick={() => done({ path: `/banking/transactions/${line.id}/restore` })}>Restore</Button> : null}
          </div>
        ) : null}
        {reconcilable ? (
          <>
            <QueryError error={query.error} />
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">1. Match entries already in the books</h3>
              <DataTable
                rows={data?.entries || []}
                rowKey={(row) => row.id}
                density="compact"
                loading={query.isLoading}
                empty={<p className="py-3 text-center text-sm text-muted">No unreconciled {amount > 0 ? "receipts" : "payments"} of this direction.</p>}
                columns={[
                  { key: "pick", header: "", render: (row) => <input type="checkbox" checked={Boolean(picked[row.id])} onChange={(event) => setPicked((current) => { const next = { ...current }; if (event.target.checked) next[row.id] = row.kind; else delete next[row.id]; return next; })} /> },
                  { key: "label", header: "Entry", render: (row) => <div className="max-w-md truncate">{row.label}</div> },
                  { key: "date", header: "Date", render: (row) => formatDate(row.date) },
                  { key: "amount", header: "Amount", align: "right", render: (row) => money(Math.abs(row.amount)) },
                  { key: "score", header: "Fit", align: "right", render: (row) => <Badge tone={row.score >= 70 ? "good" : row.score >= 40 ? "warn" : "neutral"}>{row.score}</Badge> },
                ]}
              />
              <div className="flex items-center justify-between gap-3 text-sm">
                <span className={Math.abs(selectedTotal - amount) <= 1 ? "text-good" : "text-muted"}>Selected {money(Math.abs(selectedTotal))} of {money(Math.abs(amount))}</span>
                <Button size="sm" disabled={!canCreate || !Object.keys(picked).length || Math.abs(selectedTotal - amount) > 1} loading={action.isPending} onClick={() => done({ path: `/banking/transactions/${line.id}/match`, body: { paymentIds: Object.entries(picked).filter(([, kind]) => kind === "PAYMENT").map(([id]) => id), journalEntryId: Object.entries(picked).find(([, kind]) => kind === "JOURNAL")?.[0] } })}>Match</Button>
              </div>
            </section>
            {allowed(session, "payments.create") ? (
              <section className="space-y-2">
                <h3 className="text-sm font-semibold">2. Record {amount > 0 ? "a customer receipt against an invoice" : "a vendor payment against a bill"}</h3>
                <div className="flex flex-wrap items-end gap-3">
                  <Field label={amount > 0 ? "Invoice" : "Bill"} className="min-w-80 flex-1">
                    <Select value={doc} onChange={(event) => setDoc(event.target.value)}>
                      <option value="">Choose…</option>
                      {(data?.documents || []).map((row) => <option key={row.id} value={row.id}>{row.number} · {row.party} · due {money(row.balance)}{row.score >= 50 ? " ★" : ""}</option>)}
                    </Select>
                  </Field>
                  <Field label={amount > 0 ? "TDS deducted by customer" : "TDS we deducted"}><TextInput type="number" min="0" step="0.01" value={tds} onChange={(event) => setTds(event.target.value)} /></Field>
                  <Button
                    size="sm"
                    disabled={!document}
                    loading={action.isPending}
                    onClick={() => document && done({ path: `/banking/transactions/${line.id}/post`, body: amount > 0 ? { kind: "RECEIPT", invoiceId: document.id, tdsAmount: Number(tds) || 0 } : { kind: "PAYMENT", vendorBillId: document.id, tdsAmount: Number(tds) || 0 } })}
                  >
                    Record and match
                  </Button>
                </div>
                {document ? <p className="text-xs text-muted">Settles {money(Math.abs(amount) + (Number(tds) || 0))} of {document.number}; remaining {money(Math.max(0, document.balance - Math.abs(amount) - (Number(tds) || 0)))}.</p> : null}
              </section>
            ) : null}
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">3. Post directly to a ledger (charges, interest, transfers, taxes paid)</h3>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Ledger" className="min-w-72 flex-1">
                  <Select value={counter} onChange={(event) => setCounter(event.target.value)}>
                    <option value="">Choose…</option>
                    {ledgers.filter((row) => row.id !== line.id).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
                  </Select>
                </Field>
                <Field label="Narration" className="flex-1"><TextInput value={narration} onChange={(event) => setNarration(event.target.value)} placeholder={line.description.slice(0, 60)} /></Field>
                <Button size="sm" disabled={!counter || !canCreate} loading={action.isPending} onClick={() => done({ path: `/banking/transactions/${line.id}/post`, body: { kind: "ACCOUNT", counterAccountId: counter, narration: narration || undefined } })}>Post</Button>
              </div>
            </section>
            {canEdit ? (
              <section className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
                <Field label="Ignore with a note" className="flex-1"><TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="Duplicate row in bank file" /></Field>
                <Button size="sm" variant="ghost" onClick={() => done({ path: `/banking/transactions/${line.id}/ignore`, body: { notes: note || undefined } })}>Ignore</Button>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </Modal>
  );
}

// ---------- Statements ----------

export function Statements() {
  const { session } = useSession();
  const { accountId, picker } = useBankAccounts();
  const query = useApi<Array<{ id: string; fileName: string; format: string; bank: string | null; fromDate: string | null; toDate: string | null; openingBalance: string | null; closingBalance: string | null; lineCount: number; duplicates: number; warnings: string[]; createdAt: string }>>(accountId ? `/banking/statements?accountId=${accountId}` : null);
  const remove = useAction(["/banking"]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">{picker}</div>
      {remove.error ? <ErrorNote>{remove.error.message}</ErrorNote> : null}
      <Card>
        <CardHeader title="Imported statements" description="Overlapping files are safe: lines already imported are skipped." />
        <QueryError error={query.error} />
        <DataTable
          rows={query.data || []}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          columns={[
            { key: "file", header: "File", render: (row) => <div><div>{row.fileName}</div><div className="text-xs text-muted">{row.format}{row.bank ? ` · ${row.bank}` : ""} · {formatDate(row.createdAt)}</div></div> },
            { key: "period", header: "Period", render: (row) => (row.fromDate ? `${formatDate(row.fromDate)} – ${formatDate(row.toDate)}` : "") },
            { key: "lines", header: "Lines", align: "right", render: (row) => `${row.lineCount}${row.duplicates ? ` (+${row.duplicates} dup)` : ""}` },
            { key: "closing", header: "Closing balance", align: "right", render: (row) => (row.closingBalance === null ? "" : money(Number(row.closingBalance))) },
            { key: "warnings", header: "", render: (row) => (row.warnings.length ? <Badge tone="warn">{row.warnings.length} warning(s)</Badge> : null) },
            { key: "delete", header: "", align: "right", render: (row) => (allowed(session, "banking.delete") ? <Button size="icon-sm" variant="ghost" aria-label="Delete statement" onClick={() => window.confirm(`Delete ${row.fileName} and its unreconciled lines?`) && remove.submit({ path: `/banking/statements/${row.id}`, method: "DELETE" })}><Trash2 /></Button> : null) },
          ]}
        />
      </Card>
    </div>
  );
}

// ---------- Rules ----------

type Rule = { id: string; name: string; contains: string; direction: string; bankAccountId: string | null; counterAccountId: string; counterAccount: { code: string; name: string }; minAmount: string | null; maxAmount: string | null; narration: string | null; autoPost: boolean; priority: number; active: boolean };

export function Rules() {
  const { session } = useSession();
  const query = useApi<Rule[]>("/banking/rules");
  const [editing, setEditing] = useState<Rule | "new" | null>(null);
  const canEdit = allowed(session, "banking.edit");
  return (
    <Card>
      <CardHeader title="Bank rules" description="Narration keywords that post a line straight to a ledger (auto) or suggest it. Checked in priority order after payment matching." action={canEdit ? <Button size="sm" onClick={() => setEditing("new")}><Plus /> Rule</Button> : null} />
      <QueryError error={query.error} />
      <DataTable
        rows={query.data || []}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        onRowClick={canEdit ? (row) => setEditing(row) : undefined}
        columns={[
          { key: "priority", header: "#", render: (row) => row.priority },
          { key: "name", header: "Rule", render: (row) => <div><div>{row.name}</div><div className="font-mono text-xs text-muted">{row.contains}</div></div> },
          { key: "direction", header: "Applies to", render: (row) => (row.direction === "IN" ? "Deposits" : row.direction === "OUT" ? "Withdrawals" : "Both") },
          { key: "counter", header: "Posts to", render: (row) => `${row.counterAccount.code} · ${row.counterAccount.name}` },
          { key: "mode", header: "Mode", render: (row) => (!row.active ? <Badge tone="neutral">Off</Badge> : row.autoPost ? <Badge tone="good">Auto-post</Badge> : <Badge tone="info">Suggest</Badge>) },
        ]}
      />
      {editing ? <RuleModal rule={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

function RuleModal({ rule, onClose }: { rule: Rule | null; onClose: () => void }) {
  const ledgers = usePostingLedgers();
  const accounts = useApi<BankAccountRow[]>("/banking/accounts");
  const action = useAction(["/banking/rules"]);
  const [form, setForm] = useState({ name: rule?.name || "", contains: rule?.contains || "", direction: rule?.direction || "ANY", bankAccountId: rule?.bankAccountId || "", counterAccountId: rule?.counterAccountId || "", minAmount: rule?.minAmount || "", maxAmount: rule?.maxAmount || "", narration: rule?.narration || "", autoPost: rule?.autoPost ?? false, priority: String(rule?.priority ?? 100), active: rule?.active ?? true });
  const set = (key: keyof typeof form) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.type === "checkbox" ? (event.target as HTMLInputElement).checked : event.target.value }));
  async function save() {
    const body = { ...form, minAmount: form.minAmount === "" ? undefined : Number(form.minAmount), maxAmount: form.maxAmount === "" ? undefined : Number(form.maxAmount), priority: Number(form.priority) || 100, narration: form.narration || undefined };
    if (await action.submit({ path: rule ? `/banking/rules/${rule.id}` : "/banking/rules", method: rule ? "PATCH" : "POST", body })) onClose();
  }
  return (
    <Modal
      open
      onOpenChange={(next) => !next && onClose()}
      title={rule ? `Edit rule · ${rule.name}` : "New bank rule"}
      footer={
        <div className="flex w-full justify-between gap-2">
          {rule ? <Button variant="danger" onClick={async () => window.confirm("Delete this rule?") && (await action.submit({ path: `/banking/rules/${rule.id}`, method: "DELETE" })) && onClose()}>Delete</Button> : <span />}
          <Button loading={action.isPending} onClick={save}>Save</Button>
        </div>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><TextInput value={form.name} onChange={set("name")} /></Field>
        <Field label="Priority (lower runs first)"><TextInput type="number" min="1" max="999" value={form.priority} onChange={set("priority")} /></Field>
        <Field label="Narration contains (separate with |)" className="sm:col-span-2"><TextInput value={form.contains} onChange={set("contains")} placeholder="CHGS|CHARGES|SMS CHG" /></Field>
        <Field label="Applies to"><Select value={form.direction} onChange={set("direction")}><option value="ANY">Deposits and withdrawals</option><option value="IN">Deposits</option><option value="OUT">Withdrawals</option></Select></Field>
        <Field label="Only for account"><Select value={form.bankAccountId} onChange={set("bankAccountId")}><option value="">Any bank account</option>{(accounts.data || []).map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</Select></Field>
        <Field label="Post to ledger" className="sm:col-span-2"><Select value={form.counterAccountId} onChange={set("counterAccountId")}><option value="">Choose…</option>{ledgers.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</Select></Field>
        <Field label="Minimum amount"><TextInput type="number" min="0" value={form.minAmount} onChange={set("minAmount")} /></Field>
        <Field label="Maximum amount"><TextInput type="number" min="0" value={form.maxAmount} onChange={set("maxAmount")} /></Field>
        <Field label="Journal narration" className="sm:col-span-2"><TextInput value={form.narration} onChange={set("narration")} placeholder="Defaults to the bank narration" /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.autoPost} onChange={set("autoPost")} /> Post automatically</label>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.active} onChange={set("active")} /> Active</label>
      </div>
      {action.error ? <ErrorNote className="mt-3">{action.error.message}</ErrorNote> : null}
    </Modal>
  );
}

// ---------- Payment runs ----------

type RunRow = { id: string; number: string; kind: string; status: string; bankFormat: string; valueDate: string; total: string; account: { code: string; name: string }; _count: { items: number }; createdAt: string };
type RunDetail = { id: string; number: string; kind: string; status: string; bankFormat: string; valueDate: string; total: number; notes: string | null; createdById: string | null; account: { code: string; name: string }; items: Array<{ id: string; payeeName: string; accountNo: string; ifsc: string; amount: number; tdsAmount: number; payout: number; mode: string | null; reference: string; status: string; error: string | null; payment: { number: string } | null }> };
const RUN_TONE: Record<string, "neutral" | "info" | "warn" | "good" | "bad"> = { DRAFT: "neutral", APPROVED: "info", EXPORTED: "warn", COMPLETED: "good", CANCELLED: "bad" };

export function PaymentRuns() {
  const { session } = useSession();
  const query = useApi<RunRow[]>("/banking/runs");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <Card>
      <CardHeader title="Payment runs" description="Pick due bills, approve (a second person), download the bank's bulk upload file, then mark the run paid to record the payments." action={allowed(session, "banking.create") && allowed(session, "payments.create") ? <Button size="sm" onClick={() => setCreating(true)}><Plus /> New run</Button> : null} />
      <QueryError error={query.error} />
      <DataTable
        rows={query.data || []}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        onRowClick={(row) => setOpenId(row.id)}
        columns={[
          { key: "number", header: "Run", render: (row) => <div><div className="font-medium">{row.number}</div><div className="text-xs text-muted">{humanize(row.kind)} · {row._count.items} payee(s)</div></div> },
          { key: "account", header: "From", render: (row) => `${row.account.code} · ${row.account.name}` },
          { key: "format", header: "Bank file", render: (row) => row.bankFormat },
          { key: "date", header: "Value date", render: (row) => formatDate(row.valueDate) },
          { key: "total", header: "Total", align: "right", render: (row) => money(Number(row.total)) },
          { key: "status", header: "Status", render: (row) => <Badge tone={RUN_TONE[row.status] || "neutral"}>{humanize(row.status)}</Badge> },
        ]}
      />
      {creating ? <NewRunModal onClose={() => setCreating(false)} onCreated={(id) => { setCreating(false); setOpenId(id); }} /> : null}
      {openId ? <RunModal id={openId} onClose={() => setOpenId(null)} /> : null}
    </Card>
  );
}

type Payable = { id: string; number: string; vendorInvoiceNo: string | null; vendor: { id: string; name: string; tdsSection: string | null; bankReady: boolean }; billDate: string; dueDate: string | null; total: number; balance: number; inRun: string | null };

function NewRunModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const accounts = useApi<BankAccountRow[]>("/banking/accounts");
  const payables = useApi<Payable[]>("/banking/payables");
  const action = useAction<unknown, { id: string }>(["/banking"]);
  const banks = (accounts.data || []).filter((row) => row.subtype === "BANK" && row.bank);
  const [accountId, setAccountId] = useState("");
  const [format, setFormat] = useState<string>("GENERIC");
  const [valueDate, setValueDate] = useState(today);
  const [dueBy, setDueBy] = useState("");
  const [rows, setRows] = useState<Record<string, { amount: string; tds: string }>>({});
  useEffect(() => {
    if (!accountId && banks.length) {
      setAccountId(banks[0].id);
      const guess = BANKS.find((code) => banks[0].bank?.name.toUpperCase().includes(code === "SBI" ? "STATE BANK" : code));
      if (guess) setFormat(guess);
    }
  }, [banks, accountId]);
  const visible = (payables.data || []).filter((row) => !dueBy || !row.dueDate || row.dueDate.slice(0, 10) <= dueBy);
  const chosen = visible.filter((row) => rows[row.id]);
  const total = chosen.reduce((sum, row) => sum + (Number(rows[row.id].amount) || 0) - (Number(rows[row.id].tds) || 0), 0);
  async function create() {
    const result = await action.submit({ path: "/banking/runs", body: { kind: "VENDOR", accountId, bankFormat: format, valueDate, items: chosen.map((row) => ({ vendorBillId: row.id, amount: Number(rows[row.id].amount), tdsAmount: Number(rows[row.id].tds) || 0 })) } });
    if (result) onCreated(result.id);
  }
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title="New vendor payment run" className="max-w-5xl" footer={<Button disabled={!chosen.length || !accountId} loading={action.isPending} onClick={create}>Create run · {money(total)}</Button>}>
      <div className="space-y-4">
        {accounts.data && !banks.length ? <Notice tone="warn">No bank ledger is linked to a bank account. Link one under Accounting → Chart of accounts.</Notice> : null}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Pay from"><Select value={accountId} onChange={(event) => setAccountId(event.target.value)}>{banks.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.bank?.name} ···{row.bank?.last4})</option>)}</Select></Field>
          <Field label="Bank file format"><Select value={format} onChange={(event) => setFormat(event.target.value)}>{BANKS.map((code) => <option key={code} value={code}>{code === "GENERIC" ? "Generic CSV" : code}</option>)}</Select></Field>
          <Field label="Value date"><TextInput type="date" value={valueDate} onChange={(event) => setValueDate(event.target.value)} /></Field>
          <Field label="Bills due by"><TextInput type="date" value={dueBy} onChange={(event) => setDueBy(event.target.value)} /></Field>
        </div>
        <QueryError error={payables.error} />
        <DataTable
          rows={visible}
          rowKey={(row) => row.id}
          density="compact"
          loading={payables.isLoading}
          empty={<p className="py-6 text-center text-sm text-muted">No open bills.</p>}
          columns={[
            { key: "pick", header: "", render: (row) => <input type="checkbox" disabled={Boolean(row.inRun) || !row.vendor.bankReady} checked={Boolean(rows[row.id])} onChange={(event) => setRows((current) => { const next = { ...current }; if (event.target.checked) next[row.id] = { amount: String(row.balance), tds: "" }; else delete next[row.id]; return next; })} /> },
            { key: "vendor", header: "Vendor", render: (row) => <div><div>{row.vendor.name}</div>{!row.vendor.bankReady ? <div className="text-xs text-bad">No bank details</div> : row.inRun ? <div className="text-xs text-muted">In {row.inRun}</div> : row.vendor.tdsSection ? <div className="text-xs text-muted">TDS {row.vendor.tdsSection}</div> : null}</div> },
            { key: "bill", header: "Bill", render: (row) => <div>{row.vendorInvoiceNo || row.number}<div className="text-xs text-muted">{formatDate(row.billDate)}</div></div> },
            { key: "due", header: "Due", render: (row) => (row.dueDate ? <span className={row.dueDate.slice(0, 10) < today() ? "text-bad" : ""}>{formatDate(row.dueDate)}</span> : "") },
            { key: "balance", header: "Balance", align: "right", render: (row) => money(row.balance) },
            { key: "amount", header: "Settle", align: "right", render: (row) => (rows[row.id] ? <TextInput className="w-28 text-right" type="number" min="0" step="0.01" value={rows[row.id].amount} onChange={(event) => setRows((current) => ({ ...current, [row.id]: { ...current[row.id], amount: event.target.value } }))} /> : null) },
            { key: "tds", header: "TDS", align: "right", render: (row) => (rows[row.id] ? <TextInput className="w-24 text-right" type="number" min="0" step="0.01" value={rows[row.id].tds} onChange={(event) => setRows((current) => ({ ...current, [row.id]: { ...current[row.id], tds: event.target.value } }))} /> : null) },
          ]}
        />
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </div>
    </Modal>
  );
}

function RunModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { session } = useSession();
  const query = useApi<RunDetail>(`/banking/runs/${id}`);
  const action = useAction(["/banking", "/payments", "/accounting"]);
  const [failed, setFailed] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const run = query.data;
  const canApprove = allowed(session, "banking.approve");
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={run ? `${run.number} · ${money(run.total)}` : "Payment run"} description={run ? `${humanize(run.kind)} · ${run.account.name} · value date ${formatDate(run.valueDate)} · ${run.bankFormat}` : undefined} className="max-w-4xl">
      <QueryError error={query.error} />
      {run ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={RUN_TONE[run.status] || "neutral"}>{humanize(run.status)}</Badge>
            {run.status === "DRAFT" && canApprove ? <Button size="sm" loading={action.isPending} onClick={() => action.submit({ path: `/banking/runs/${id}/approve` })}>Approve</Button> : null}
            {["APPROVED", "EXPORTED"].includes(run.status) && allowed(session, "banking.export") ? <Button size="sm" variant="outline" onClick={() => download(`/banking/runs/${id}/file`, `${run.number}-${run.bankFormat}.${run.bankFormat === "HDFC" || run.bankFormat === "SBI" ? "txt" : "csv"}`).then(() => query.refetch()).catch((reason: Error) => setError(reason.message))}><Download /> Bank file</Button> : null}
            {["APPROVED", "EXPORTED"].includes(run.status) && canApprove ? <Button size="sm" loading={action.isPending} onClick={() => window.confirm(`Mark the run paid${Object.keys(failed).length ? ` except ${Object.keys(failed).length} rejected row(s)` : ""}? Payments are recorded against the bills.`) && action.submit({ path: `/banking/runs/${id}/complete`, body: { failed } })}>Mark paid</Button> : null}
            {["DRAFT", "APPROVED", "EXPORTED"].includes(run.status) && canApprove ? <Button size="sm" variant="ghost" onClick={() => window.confirm(run.status === "EXPORTED" ? "The file was already downloaded. Cancel only if it was not uploaded to the bank. Continue?" : "Cancel this run?") && action.submit({ path: `/banking/runs/${id}/cancel` })}>Cancel run</Button> : null}
          </div>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          {run.status === "EXPORTED" ? <Notice tone="info">After the bank processes the file, tick any rows it rejected, then Mark paid.</Notice> : null}
          <DataTable
            rows={run.items}
            rowKey={(row) => row.id}
            density="compact"
            columns={[
              ...(run.status === "EXPORTED" || run.status === "APPROVED" ? [{ key: "failed", header: "Rejected", render: (row: RunDetail["items"][number]) => (row.status === "PENDING" ? <input type="checkbox" checked={failed[row.id] !== undefined} onChange={(event) => setFailed((current) => { const next = { ...current }; if (event.target.checked) next[row.id] = ""; else delete next[row.id]; return next; })} /> : null) }] : []),
              { key: "payee", header: "Payee", render: (row) => <div><div>{row.payeeName}</div><div className="font-mono text-xs text-muted">{row.accountNo} · {row.ifsc}</div></div> },
              { key: "reference", header: "Reference", render: (row) => row.reference },
              { key: "mode", header: "Mode", render: (row) => row.mode || "" },
              { key: "amount", header: "Settles", align: "right", render: (row) => money(row.amount) },
              { key: "tds", header: "TDS", align: "right", render: (row) => (row.tdsAmount ? money(row.tdsAmount) : "") },
              { key: "payout", header: "Paid out", align: "right", render: (row) => money(row.payout) },
              { key: "status", header: "", render: (row) => <div><Badge tone={row.status === "PAID" ? "good" : row.status === "FAILED" ? "bad" : "neutral"}>{humanize(row.status)}</Badge>{row.payment ? <div className="text-xs text-muted">{row.payment.number}</div> : null}</div> },
            ]}
          />
        </div>
      ) : null}
    </Modal>
  );
}

// ---------- Payment links ----------

type LinkRow = { id: string; providerId: string; shortUrl: string; amount: number; currency: string; status: string; fee: number | null; expiresAt: string | null; paidAt: string | null; createdAt: string; invoice: { number: string; customer: { name: string } }; payment: { number: string } | null };

export function PaymentLinks() {
  const { session } = useSession();
  const query = useApi<{ configured: boolean; webhook: boolean; links: LinkRow[] }>("/banking/payment-links");
  const cancel = useAction(["/banking/payment-links"]);
  const [copied, setCopied] = useState("");
  const data = query.data;
  return (
    <div className="space-y-4">
      {data && !data.configured ? <Notice tone="info">Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the API environment to send payment links from invoices.</Notice> : null}
      {data?.configured && !data.webhook ? <Notice tone="warn">RAZORPAY_WEBHOOK_SECRET is not set, so paid links will not be recorded automatically.</Notice> : null}
      <Card>
        <CardHeader title="Payment links" description="Created from an invoice (Invoices → Payment link). Paid links post a receipt to Payment Gateway Clearing; the Razorpay settlement on the bank statement clears it." />
        <QueryError error={query.error} />
        {cancel.error ? <ErrorNote className="m-4">{cancel.error.message}</ErrorNote> : null}
        <DataTable
          rows={data?.links || []}
          rowKey={(row) => row.id}
          loading={query.isLoading}
          columns={[
            { key: "invoice", header: "Invoice", render: (row) => <div><div className="font-medium">{row.invoice.number}</div><div className="text-xs text-muted">{row.invoice.customer.name}</div></div> },
            { key: "amount", header: "Amount", align: "right", render: (row) => money(row.amount) },
            { key: "status", header: "Status", render: (row) => <div><Badge tone={row.status === "PAID" ? "good" : row.status === "CREATED" ? "info" : "neutral"}>{humanize(row.status)}</Badge>{row.payment ? <div className="text-xs text-muted">{row.payment.number}{row.fee ? ` · fee ${money(row.fee)}` : ""}</div> : null}</div> },
            { key: "dates", header: "Created / paid", render: (row) => <div>{formatDate(row.createdAt)}<div className="text-xs text-muted">{row.paidAt ? `Paid ${formatDate(row.paidAt)}` : row.expiresAt ? `Expires ${formatDate(row.expiresAt)}` : ""}</div></div> },
            {
              key: "link",
              header: "",
              align: "right",
              render: (row) =>
                row.status === "CREATED" ? (
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(row.shortUrl).then(() => setCopied(row.id))}><Copy /> {copied === row.id ? "Copied" : "Copy link"}</Button>
                    {allowed(session, "invoices.edit") ? <Button size="sm" variant="ghost" onClick={() => window.confirm("Cancel this payment link?") && cancel.submit({ path: `/banking/payment-links/${row.id}/cancel` })}>Cancel</Button> : null}
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>
    </div>
  );
}

export function BankOverview() {
  const query = useApi<BankAccountRow[]>("/banking/accounts");
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <QueryError error={query.error} />
      {(query.data || []).map((row) => (
        <MiniStat key={row.id} label={`${row.name}${row.bank ? ` ···${row.bank.last4}` : ""}`} value={money(row.bookBalance)} hint={`${row.unreconciled ? `${row.unreconciled} to reconcile` : "Reconciled"}${row.statement?.toDate ? ` · statement to ${formatDate(row.statement.toDate)}` : ""}`} />
      ))}
      {query.data && !query.data.length ? <p className="text-sm text-muted">No bank or cash ledgers yet.</p> : null}
    </div>
  );
}
