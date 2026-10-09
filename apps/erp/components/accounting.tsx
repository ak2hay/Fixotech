"use client";

import { Badge, Button, Card, CardBody, CardHeader, DataTable, ErrorNote, Field, MiniStat, Modal, Notice, Select, TextInput, formatDate, humanize, money } from "@fixotec/ui";
import { ACCOUNT_TYPES } from "@fixotec/shared";
import { ArrowDownRight, ArrowUpRight, Download, Landmark, Plus, RefreshCw, Scale, Trash2, Upload, Wallet } from "lucide-react";
import { useMemo, useState } from "react";
import { download } from "../lib/api";
import { useAction, useApi } from "../lib/query";
import { allowed, useSession } from "../lib/session";
import { QueryError } from "./common";

export type Account = { id: string; code: string; name: string; type: string; subtype?: string | null; systemKey?: string | null; parentId?: string | null; isGroup: boolean; active: boolean; balance: number; bankAccount?: { bankName: string; last4: string } | null };
type JournalLine = { id: string; accountId: string; debit: number; credit: number; description?: string | null; partyType?: string | null; partyName?: string | null; account: { code: string; name: string } };
type Journal = { id: string; number: string; date: string; narration: string; reference?: string | null; sourceType?: string | null; total: number; reversalOfId?: string | null; reversedBy?: { number: string } | null; lines: JournalLine[] };
type StatementLine = { id: string; date: string; debit: number; credit: number; balance: number; description?: string | null; entry: { number: string; narration: string; reference?: string | null }; account?: { code: string; name: string } };
type Statement = { opening: number; debit: number; credit: number; closing: number; lines: StatementLine[] };

const today = () => new Date().toISOString().slice(0, 10);
const fyStart = () => {
  const now = new Date();
  const year = now.getUTCMonth() >= 3 ? now.getUTCFullYear() : now.getUTCFullYear() - 1;
  return `${year}-04-01`;
};
const amount = (value: number) => (value ? money(value) : "—");

export function useRange() {
  const [from, setFrom] = useState(fyStart());
  const [to, setTo] = useState(today());
  const picker = (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="From"><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field>
      <Field label="To"><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field>
    </div>
  );
  return { from, to, query: `from=${from}&to=${to}`, picker };
}

export function AccountingOverview() {
  const { session } = useSession();
  const range = useRange();
  const pl = useApi<{ revenue: number; grossProfit: number; profit: number; totalExpense: number }>(`/accounting/profit-loss?${range.query}`, { keepPrevious: true });
  const ar = useApi<{ totals: Record<string, number> }>("/accounting/ageing?side=AR");
  const ap = useApi<{ totals: Record<string, number> }>("/accounting/ageing?side=AP");
  const cash = useApi<{ closing: number; net: number }>(`/accounting/cash-flow?${range.query}`, { keepPrevious: true });
  const sync = useAction<unknown, Record<string, number>>(["/accounting"]);
  const [result, setResult] = useState<Record<string, number> | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        {range.picker}
        {allowed(session, "accounting.edit") ? (
          <Button variant="outline" loading={sync.isPending} onClick={async () => setResult((await sync.submit({ path: "/accounting/sync" })) || null)}>
            <RefreshCw /> Post pending documents
          </Button>
        ) : null}
      </div>
      {result ? <Notice tone={result.failed ? "warn" : "good"}>Posted {Object.entries(result).filter(([key, value]) => key !== "failed" && value).map(([key, value]) => `${value} ${humanize(key).toLowerCase()}`).join(", ") || "nothing new"}{result.failed ? `; ${result.failed} could not be posted (see the API log)` : ""}.</Notice> : null}
      <QueryError error={pl.error || ar.error || ap.error || cash.error} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <MiniStat label="Revenue" value={money(pl.data?.revenue || 0)} icon={<ArrowUpRight />} tone="good" />
        <MiniStat label="Gross profit" value={money(pl.data?.grossProfit || 0)} icon={<Scale />} tone="info" />
        <MiniStat label="Net profit" value={money(pl.data?.profit || 0)} icon={<Landmark />} tone={(pl.data?.profit || 0) >= 0 ? "good" : "bad"} />
        <MiniStat label="Receivables" value={money(ar.data?.totals.outstanding || 0)} icon={<ArrowDownRight />} tone="warn" hint={ar.data ? `${money((ar.data.totals.d90 || 0) + (ar.data.totals.d180 || 0) + (ar.data.totals.older || 0))} over 90 days` : undefined} />
        <MiniStat label="Payables" value={money(ap.data?.totals.outstanding || 0)} icon={<ArrowUpRight />} tone="neutral" />
        <MiniStat label="Cash and bank" value={money(cash.data?.closing || 0)} icon={<Wallet />} tone="accent" hint={cash.data ? `${cash.data.net >= 0 ? "+" : ""}${money(cash.data.net)} in the period` : undefined} />
      </div>
    </div>
  );
}

export function ChartOfAccounts() {
  const { session } = useSession();
  const accounts = useApi<Account[]>("/accounting/accounts");
  const [type, setType] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [ledgerOf, setLedgerOf] = useState<Account | null>(null);
  const byId = useMemo(() => new Map((accounts.data || []).map((account) => [account.id, account])), [accounts.data]);
  const rows = (accounts.data || []).filter((account) => (!type || account.type === type) && (!q || `${account.code} ${account.name}`.toLowerCase().includes(q.toLowerCase())));
  const depth = (account: Account) => {
    let level = 0;
    let parent = account.parentId ? byId.get(account.parentId) : undefined;
    while (parent && level < 6) {
      level += 1;
      parent = parent.parentId ? byId.get(parent.parentId) : undefined;
    }
    return level;
  };
  return (
    <Card>
      <CardHeader
        title="Chart of accounts"
        description="Ledgers marked System are used by automatic postings."
        action={allowed(session, "accounting.create") ? <Button size="sm" onClick={() => setCreating(true)}><Plus /> Account</Button> : null}
      />
      <CardBody className="flex flex-wrap gap-3">
        <TextInput placeholder="Search code or name" value={q} onChange={(event) => setQ(event.target.value)} className="w-64" />
        <Select value={type} onChange={(event) => setType(event.target.value)} className="w-44">
          <option value="">All types</option>
          {ACCOUNT_TYPES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
        </Select>
      </CardBody>
      <QueryError error={accounts.error} />
      <DataTable
        rows={rows}
        loading={accounts.isLoading}
        rowKey={(row) => row.id}
        density="compact"
        onRowClick={(row) => (row.isGroup ? undefined : setLedgerOf(row))}
        columns={[
          { key: "code", header: "Code", render: (row) => <span className="font-mono text-xs">{row.code}</span> },
          { key: "name", header: "Name", render: (row) => <span style={{ paddingLeft: depth(row) * 16 }} className={row.isGroup ? "font-semibold" : undefined}>{row.name}{row.bankAccount ? <span className="ml-2 text-xs text-muted">{row.bankAccount.bankName} ••{row.bankAccount.last4}</span> : null}</span> },
          { key: "type", header: "Type", render: (row) => humanize(row.type) },
          { key: "subtype", header: "Group", render: (row) => (row.subtype ? humanize(row.subtype) : "—") },
          { key: "flags", header: "", render: (row) => <span className="flex gap-1">{row.systemKey ? <Badge tone="info">System</Badge> : null}{!row.active ? <Badge tone="warn">Inactive</Badge> : null}</span> },
          { key: "balance", header: "Balance", align: "right", sortValue: (row) => row.balance, render: (row) => (row.isGroup ? "" : <span className={row.balance < 0 ? "text-danger" : undefined}>{money(row.balance)}</span>) },
        ]}
      />
      {creating ? <AccountForm accounts={accounts.data || []} onClose={() => setCreating(false)} /> : null}
      {ledgerOf ? <LedgerModal title={`${ledgerOf.code} · ${ledgerOf.name}`} path={`/accounting/ledger/${ledgerOf.id}`} onClose={() => setLedgerOf(null)} /> : null}
    </Card>
  );
}

function AccountForm({ accounts, onClose }: { accounts: Account[]; onClose: () => void }) {
  const action = useAction(["/accounting/accounts"]);
  const [type, setType] = useState<string>("EXPENSE");
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = await action.submit({
      path: "/accounting/accounts",
      body: { code: String(form.get("code")), name: String(form.get("name")), type, subtype: String(form.get("subtype") || "") || undefined, parentId: String(form.get("parentId") || "") || undefined, isGroup: form.get("isGroup") === "on" },
    });
    if (result) onClose();
  }
  return (
    <Modal open onOpenChange={(value) => !value && onClose()} title="New ledger account" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button type="submit" form="account-form" loading={action.isPending}>Create</Button></>}>
      <form id="account-form" onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
        <Field label="Code"><TextInput name="code" required maxLength={20} pattern="[A-Za-z0-9.\-]+" placeholder="5395" /></Field>
        <Field label="Type">
          <Select value={type} onChange={(event) => setType(event.target.value)}>{ACCOUNT_TYPES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select>
        </Field>
        <Field label="Name" className="sm:col-span-2"><TextInput name="name" required minLength={2} maxLength={120} /></Field>
        <Field label="Parent group">
          <Select name="parentId" defaultValue="">
            <option value="">None</option>
            {accounts.filter((account) => account.isGroup && account.type === type).map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
          </Select>
        </Field>
        <Field label="Subtype" hint="BANK, CASH, FIXED_ASSET, TAX, DIRECT_EXPENSE…"><TextInput name="subtype" maxLength={40} /></Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="isGroup" /> This is a group (holds sub-accounts, no postings)</label>
        {action.error ? <ErrorNote className="sm:col-span-2">{action.error.message}</ErrorNote> : null}
      </form>
    </Modal>
  );
}

export function LedgerModal({ title, path, onClose }: { title: string; path: string; onClose: () => void }) {
  const range = useRange();
  const statement = useApi<Statement>(`${path}?${range.query}`, { keepPrevious: true });
  const data = statement.data;
  return (
    <Modal open onOpenChange={(value) => !value && onClose()} title={title} className="max-w-5xl">
      <div className="space-y-3">
        {range.picker}
        <QueryError error={statement.error} />
        {data ? (
          <div className="flex flex-wrap gap-4 text-sm">
            <span>Opening <strong>{money(data.opening)}</strong></span>
            <span>Debits <strong>{money(data.debit)}</strong></span>
            <span>Credits <strong>{money(data.credit)}</strong></span>
            <span>Closing <strong>{money(data.closing)}</strong></span>
          </div>
        ) : null}
        <DataTable
          rows={data?.lines || []}
          loading={statement.isLoading}
          rowKey={(row) => row.id}
          density="compact"
          empty={<p className="py-6 text-center text-sm text-muted">No postings in this period.</p>}
          columns={[
            { key: "date", header: "Date", render: (row) => formatDate(row.date) },
            { key: "entry", header: "Voucher", render: (row) => <span className="font-mono text-xs">{row.entry.number}</span> },
            { key: "narration", header: "Particulars", render: (row) => <span className="line-clamp-2">{row.account ? `${row.account.name} · ` : ""}{row.description || row.entry.narration}</span> },
            { key: "debit", header: "Debit", align: "right", render: (row) => amount(row.debit) },
            { key: "credit", header: "Credit", align: "right", render: (row) => amount(row.credit) },
            { key: "balance", header: "Balance", align: "right", render: (row) => money(row.balance) },
          ]}
        />
      </div>
    </Modal>
  );
}

export function Journals() {
  const { session } = useSession();
  const range = useRange();
  const [q, setQ] = useState("");
  const [source, setSource] = useState("");
  const journals = useApi<Journal[]>(`/accounting/journals?${range.query}&q=${encodeURIComponent(q)}&sourceType=${source}`, { keepPrevious: true });
  const [open, setOpen] = useState<Journal | null>(null);
  const [creating, setCreating] = useState(false);
  return (
    <Card>
      <CardHeader title="Day book" description="Every journal, automatic and manual. Posted journals never change; corrections are reversals." action={allowed(session, "accounting.create") ? <Button size="sm" onClick={() => setCreating(true)}><Plus /> Manual journal</Button> : null} />
      <CardBody className="flex flex-wrap items-end gap-3">
        {range.picker}
        <Field label="Search"><TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder="Number, narration, reference" /></Field>
        <Field label="Source">
          <Select value={source} onChange={(event) => setSource(event.target.value)}>
            <option value="">All</option>
            {["invoice", "payment_in", "payment_out", "vendor_bill", "expense", "credit_note", "debit_note", "stock", "payroll", "opening", "year_close", "manual"].map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
          </Select>
        </Field>
      </CardBody>
      <QueryError error={journals.error} />
      <DataTable
        rows={journals.data || []}
        loading={journals.isLoading}
        rowKey={(row) => row.id}
        density="compact"
        onRowClick={setOpen}
        columns={[
          { key: "date", header: "Date", render: (row) => formatDate(row.date) },
          { key: "number", header: "Voucher", render: (row) => <span className="font-mono text-xs">{row.number}</span> },
          { key: "source", header: "Type", render: (row) => <span className="flex gap-1"><Badge tone={row.sourceType ? "neutral" : "accent"}>{humanize((row.sourceType || "manual").split(":")[0])}</Badge>{row.reversedBy ? <Badge tone="warn">Reversed</Badge> : null}{row.reversalOfId ? <Badge tone="warn">Reversal</Badge> : null}</span> },
          { key: "narration", header: "Narration", render: (row) => <span className="line-clamp-1">{row.narration}</span> },
          { key: "total", header: "Amount", align: "right", sortValue: (row) => row.total, render: (row) => money(row.total) },
        ]}
      />
      {open ? <JournalModal journal={open} onClose={() => setOpen(null)} /> : null}
      {creating ? <JournalForm onClose={() => setCreating(false)} /> : null}
    </Card>
  );
}

function JournalModal({ journal, onClose }: { journal: Journal; onClose: () => void }) {
  const { session } = useSession();
  const reverse = useAction(["/accounting"]);
  const [reason, setReason] = useState("");
  const canReverse = allowed(session, "accounting.approve") && !journal.reversedBy && !journal.reversalOfId;
  return (
    <Modal open onOpenChange={(value) => !value && onClose()} title={`${journal.number} · ${formatDate(journal.date)}`} description={journal.narration} className="max-w-3xl">
      <DataTable
        rows={journal.lines}
        rowKey={(row) => row.id}
        density="compact"
        columns={[
          { key: "account", header: "Account", render: (row) => <span>{row.account.code} · {row.account.name}{row.partyName ? <span className="block text-xs text-muted">{humanize(row.partyType || "")}: {row.partyName}</span> : null}</span> },
          { key: "description", header: "Note", render: (row) => row.description || "" },
          { key: "debit", header: "Debit", align: "right", render: (row) => amount(row.debit) },
          { key: "credit", header: "Credit", align: "right", render: (row) => amount(row.credit) },
        ]}
      />
      {canReverse ? (
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <Field label="Reason for reversal" className="flex-1"><TextInput value={reason} onChange={(event) => setReason(event.target.value)} minLength={3} /></Field>
          <Button variant="danger" disabled={reason.trim().length < 3} loading={reverse.isPending} onClick={async () => (await reverse.submit({ path: `/accounting/journals/${journal.id}/reverse`, body: { reason } })) && onClose()}>Reverse</Button>
        </div>
      ) : null}
      {reverse.error ? <ErrorNote className="mt-3">{reverse.error.message}</ErrorNote> : null}
    </Modal>
  );
}

type DraftLine = { accountId: string; debit: string; credit: string; description: string };

function JournalForm({ onClose }: { onClose: () => void }) {
  const accounts = useApi<Account[]>("/accounting/accounts");
  const action = useAction(["/accounting"]);
  const [date, setDate] = useState(today());
  const [narration, setNarration] = useState("");
  const [reference, setReference] = useState("");
  const [lines, setLines] = useState<DraftLine[]>([{ accountId: "", debit: "", credit: "", description: "" }, { accountId: "", debit: "", credit: "", description: "" }]);
  const postable = (accounts.data || []).filter((account) => !account.isGroup && account.active);
  const debit = lines.reduce((sum, line) => sum + (Number(line.debit) || 0), 0);
  const credit = lines.reduce((sum, line) => sum + (Number(line.credit) || 0), 0);
  const balanced = Math.abs(debit - credit) < 0.005 && debit > 0;
  const update = (index: number, patch: Partial<DraftLine>) => setLines((current) => current.map((line, i) => (i === index ? { ...line, ...patch } : line)));
  async function submit() {
    const result = await action.submit({
      path: "/accounting/journals",
      body: { date, narration, reference: reference || undefined, lines: lines.filter((line) => line.accountId).map((line) => ({ accountId: line.accountId, debit: Number(line.debit) || 0, credit: Number(line.credit) || 0, description: line.description || undefined })) },
    });
    if (result) onClose();
  }
  return (
    <Modal open onOpenChange={(value) => !value && onClose()} title="Manual journal" className="max-w-4xl" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!balanced || narration.trim().length < 3} loading={action.isPending} onClick={submit}>Post journal</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Date"><TextInput type="date" value={date} onChange={(event) => setDate(event.target.value)} /></Field>
          <Field label="Reference"><TextInput value={reference} onChange={(event) => setReference(event.target.value)} maxLength={100} /></Field>
          <Field label="Narration" className="sm:col-span-3"><TextInput value={narration} onChange={(event) => setNarration(event.target.value)} maxLength={1000} placeholder="Depreciation for Q2 on plant and machinery" /></Field>
        </div>
        <div className="space-y-2">
          {lines.map((line, index) => (
            <div key={index} className="grid grid-cols-[1fr_120px_120px_1fr_auto] items-center gap-2">
              <Select value={line.accountId} onChange={(event) => update(index, { accountId: event.target.value })}>
                <option value="">Account…</option>
                {postable.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}
              </Select>
              <TextInput type="number" min="0" step="0.01" placeholder="Debit" value={line.debit} onChange={(event) => update(index, { debit: event.target.value, credit: event.target.value ? "" : line.credit })} />
              <TextInput type="number" min="0" step="0.01" placeholder="Credit" value={line.credit} onChange={(event) => update(index, { credit: event.target.value, debit: event.target.value ? "" : line.debit })} />
              <TextInput placeholder="Line note" value={line.description} onChange={(event) => update(index, { description: event.target.value })} maxLength={300} />
              <Button variant="ghost" size="icon-sm" aria-label="Remove line" disabled={lines.length <= 2} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>
            </div>
          ))}
          <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, { accountId: "", debit: "", credit: "", description: "" }])}><Plus /> Line</Button>
        </div>
        <div className={`flex justify-end gap-6 text-sm ${balanced ? "text-fg" : "text-danger"}`}>
          <span>Debits {money(debit)}</span>
          <span>Credits {money(credit)}</span>
          {!balanced ? <span>Difference {money(debit - credit)}</span> : null}
        </div>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </div>
    </Modal>
  );
}

type TbRow = { id: string; code: string; name: string; type: string; opening: number; debit: number; credit: number; closing: number };

export function TrialBalance() {
  const range = useRange();
  const tb = useApi<{ rows: TbRow[]; totals: { opening: number; debit: number; credit: number; closing: number } }>(`/accounting/trial-balance?${range.query}`, { keepPrevious: true });
  const [ledgerOf, setLedgerOf] = useState<TbRow | null>(null);
  const totals = tb.data?.totals;
  return (
    <Card>
      <CardHeader title="Trial balance" description="Debit-positive balances. Click an account for its ledger." action={<ExportCsv rows={tb.data?.rows || []} name="trial-balance" />} />
      <CardBody>{range.picker}</CardBody>
      <QueryError error={tb.error} />
      {totals && Math.abs(totals.closing) > 0.01 ? <Notice tone="bad">The trial balance is out by {money(totals.closing)}. Check for postings made outside the ledger.</Notice> : null}
      <DataTable
        rows={tb.data?.rows || []}
        loading={tb.isLoading}
        rowKey={(row) => row.id}
        density="compact"
        onRowClick={setLedgerOf}
        columns={[
          { key: "code", header: "Code", render: (row) => <span className="font-mono text-xs">{row.code}</span> },
          { key: "name", header: "Account", render: (row) => row.name },
          { key: "opening", header: "Opening", align: "right", render: (row) => money(row.opening) },
          { key: "debit", header: "Debit", align: "right", render: (row) => amount(row.debit) },
          { key: "credit", header: "Credit", align: "right", render: (row) => amount(row.credit) },
          { key: "closing", header: "Closing", align: "right", sortValue: (row) => row.closing, render: (row) => <span className={row.closing < 0 ? "text-muted" : undefined}>{row.closing < 0 ? `${money(-row.closing)} Cr` : `${money(row.closing)} Dr`}</span> },
        ]}
      />
      {totals ? (
        <div className="flex justify-end gap-8 border-t border-line px-4 py-3 text-sm font-semibold">
          <span>Debits {money(totals.debit)}</span>
          <span>Credits {money(totals.credit)}</span>
        </div>
      ) : null}
      {ledgerOf ? <LedgerModal title={`${ledgerOf.code} · ${ledgerOf.name}`} path={`/accounting/ledger/${ledgerOf.id}`} onClose={() => setLedgerOf(null)} /> : null}
    </Card>
  );
}

type PlLine = { id: string; code: string; name: string; amount: number };

export function ProfitLoss() {
  const range = useRange();
  const pl = useApi<{ income: PlLine[]; expenses: PlLine[]; revenue: number; grossProfit: number; totalIncome: number; totalExpense: number; profit: number }>(`/accounting/profit-loss?${range.query}`, { keepPrevious: true });
  const data = pl.data;
  return (
    <div className="space-y-4">
      {range.picker}
      <QueryError error={pl.error} />
      <div className="grid gap-4 xl:grid-cols-2">
        <Statement title="Income" lines={data?.income || []} total={data?.totalIncome || 0} />
        <Statement title="Expenses" lines={data?.expenses || []} total={data?.totalExpense || 0} />
      </div>
      <Card>
        <CardBody className="flex flex-wrap justify-end gap-8 text-sm">
          <span>Revenue <strong>{money(data?.revenue || 0)}</strong></span>
          <span>Gross profit <strong>{money(data?.grossProfit || 0)}</strong></span>
          <span className={(data?.profit || 0) < 0 ? "text-danger" : "text-success"}>Net {(data?.profit || 0) < 0 ? "loss" : "profit"} <strong>{money(Math.abs(data?.profit || 0))}</strong></span>
        </CardBody>
      </Card>
    </div>
  );
}

function Statement({ title, lines, total }: { title: string; lines: Array<{ id: string; code: string; name: string; amount: number }>; total: number }) {
  return (
    <Card>
      <CardHeader title={title} action={<span className="text-sm font-semibold">{money(total)}</span>} />
      <DataTable
        rows={lines}
        rowKey={(row) => row.id}
        density="compact"
        empty={<p className="py-6 text-center text-sm text-muted">Nothing posted.</p>}
        columns={[
          { key: "name", header: "Account", render: (row) => <span>{row.code ? <span className="mr-2 font-mono text-xs text-muted">{row.code}</span> : null}{row.name}</span> },
          { key: "amount", header: "Amount", align: "right", sortValue: (row) => row.amount, render: (row) => <span className={row.amount < 0 ? "text-danger" : undefined}>{money(row.amount)}</span> },
        ]}
      />
    </Card>
  );
}

export function BalanceSheet() {
  const [asOf, setAsOf] = useState(today());
  const bs = useApi<{ assets: PlLine[]; liabilities: PlLine[]; equity: PlLine[]; totalAssets: number; totalLiabilitiesAndEquity: number; difference: number }>(`/accounting/balance-sheet?asOf=${asOf}`, { keepPrevious: true });
  const data = bs.data;
  const sum = (lines: PlLine[] = []) => lines.reduce((total, line) => total + line.amount, 0);
  return (
    <div className="space-y-4">
      <Field label="As of" className="w-48"><TextInput type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></Field>
      <QueryError error={bs.error} />
      {data && Math.abs(data.difference) > 0.01 ? <Notice tone="bad">Assets and liabilities differ by {money(data.difference)}.</Notice> : null}
      <div className="grid gap-4 xl:grid-cols-2">
        <Statement title="Assets" lines={data?.assets || []} total={data?.totalAssets || 0} />
        <div className="space-y-4">
          <Statement title="Liabilities" lines={data?.liabilities || []} total={sum(data?.liabilities)} />
          <Statement title="Equity" lines={data?.equity || []} total={sum(data?.equity)} />
        </div>
      </div>
    </div>
  );
}

export function CashFlow() {
  const range = useRange();
  const cf = useApi<{ operating: Array<{ name: string; amount: number }>; investing: Array<{ name: string; amount: number }>; financing: Array<{ name: string; amount: number }>; totals: Record<string, number>; opening: number; net: number; closing: number }>(`/accounting/cash-flow?${range.query}`, { keepPrevious: true });
  const data = cf.data;
  const section = (title: string, key: "operating" | "investing" | "financing") => <Statement title={title} lines={(data?.[key] || []).map((row) => ({ id: row.name, code: "", name: row.name, amount: row.amount }))} total={data?.totals[key] || 0} />;
  return (
    <div className="space-y-4">
      {range.picker}
      <QueryError error={cf.error} />
      <div className="grid gap-4 xl:grid-cols-3">
        {section("Operating activities", "operating")}
        {section("Investing activities", "investing")}
        {section("Financing activities", "financing")}
      </div>
      <Card>
        <CardBody className="flex flex-wrap justify-end gap-8 text-sm">
          <span>Opening cash <strong>{money(data?.opening || 0)}</strong></span>
          <span>Net change <strong>{money(data?.net || 0)}</strong></span>
          <span>Closing cash <strong>{money(data?.closing || 0)}</strong></span>
        </CardBody>
      </Card>
    </div>
  );
}

type AgeingRow = { partyId: string; partyType: string; name: string; code?: string; current: number; d30: number; d60: number; d90: number; d180: number; older: number; outstanding: number; advance: number };

export function Ageing() {
  const [side, setSide] = useState<"AR" | "AP">("AR");
  const [asOf, setAsOf] = useState(today());
  const ageing = useApi<{ labels: Record<string, string>; rows: AgeingRow[]; totals: Record<string, number> }>(`/accounting/ageing?side=${side}&asOf=${asOf}`, { keepPrevious: true });
  const [party, setParty] = useState<AgeingRow | null>(null);
  const labels = ageing.data?.labels || {};
  const buckets = ["current", "d30", "d60", "d90", "d180", "older"] as const;
  return (
    <Card>
      <CardHeader title={side === "AR" ? "Receivables ageing" : "Payables ageing"} description="First-in, first-out against due dates. Click a party for its statement." action={<ExportCsv rows={ageing.data?.rows || []} name={`${side.toLowerCase()}-ageing`} />} />
      <CardBody className="flex flex-wrap items-end gap-3">
        <Field label="Side">
          <Select value={side} onChange={(event) => setSide(event.target.value as "AR" | "AP")}>
            <option value="AR">Customers (receivable)</option>
            <option value="AP">Vendors (payable)</option>
          </Select>
        </Field>
        <Field label="As of"><TextInput type="date" value={asOf} onChange={(event) => setAsOf(event.target.value)} /></Field>
      </CardBody>
      <QueryError error={ageing.error} />
      <DataTable
        rows={ageing.data?.rows || []}
        loading={ageing.isLoading}
        rowKey={(row) => row.partyId}
        density="compact"
        onRowClick={setParty}
        columns={[
          { key: "name", header: side === "AR" ? "Customer" : "Vendor", render: (row) => <span className="font-medium">{row.name}{row.code ? <span className="ml-2 text-xs text-muted">{row.code}</span> : null}</span> },
          ...buckets.map((bucket) => ({ key: bucket, header: labels[bucket] || bucket, align: "right" as const, sortValue: (row: AgeingRow) => row[bucket], render: (row: AgeingRow) => <span className={["d90", "d180", "older"].includes(bucket) && row[bucket] ? "font-medium text-danger" : undefined}>{amount(row[bucket])}</span> })),
          { key: "outstanding", header: "Outstanding", align: "right", sortValue: (row) => row.outstanding, render: (row) => <strong>{money(row.outstanding)}</strong> },
        ]}
      />
      {ageing.data ? <div className="flex justify-end border-t border-line px-4 py-3 text-sm font-semibold">Total {money(ageing.data.totals.outstanding || 0)}</div> : null}
      {party ? <LedgerModal title={`Statement · ${party.name}`} path={`/accounting/party-ledger/${party.partyType}/${party.partyId}`} onClose={() => setParty(null)} /> : null}
    </Card>
  );
}

function ExportCsv<T extends Record<string, unknown>>({ rows, name }: { rows: T[]; name: string }) {
  if (!rows.length) return null;
  function exportCsv() {
    const keys = Object.keys(rows[0]).filter((key) => typeof rows[0][key] !== "object");
    const escape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;
    const text = [keys.join(","), ...rows.map((row) => keys.map((key) => escape(row[key])).join(","))].join("\n");
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}-${today()}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }
  return <Button variant="outline" size="sm" onClick={exportCsv}><Download /> CSV</Button>;
}

type Party = { id: string; name: string; code?: string };

export function PartyPicker({ kind, value, onChange }: { kind: "customers" | "vendors"; value: Party | null; onChange: (party: Party | null) => void }) {
  const [q, setQ] = useState("");
  const list = useApi<{ items: Party[] }>(q.length >= 2 ? `/${kind}?q=${encodeURIComponent(q)}&pageSize=20` : null);
  if (value) return <div className="flex items-center gap-2 text-sm"><Badge tone="info">{value.name}</Badge><Button variant="link" size="sm" onClick={() => onChange(null)}>Change</Button></div>;
  return (
    <div className="space-y-1">
      <TextInput value={q} onChange={(event) => setQ(event.target.value)} placeholder={`Search ${kind}`} />
      {(list.data?.items || []).slice(0, 8).map((party) => (
        <button key={party.id} type="button" className="block w-full rounded px-2 py-1 text-left text-sm hover:bg-canvas" onClick={() => onChange(party)}>{party.name}{party.code ? <span className="ml-2 text-xs text-muted">{party.code}</span> : null}</button>
      ))}
    </div>
  );
}

type NoteRow = { id: string; number: string; date: string; reason: string; subtotal: number; tax: number; total: number; status: string; customer?: { name: string }; vendor?: { name: string }; invoice?: { number: string } | null; vendorBill?: { number: string } | null };

export function Notes() {
  const { session } = useSession();
  const [kind, setKind] = useState<"credit" | "debit">("credit");
  const notes = useApi<NoteRow[]>(`/accounting/${kind}-notes`);
  const [creating, setCreating] = useState(false);
  return (
    <Card>
      <CardHeader
        title={kind === "credit" ? "Credit notes (to customers)" : "Debit notes (to vendors)"}
        description="Returns, price corrections and discounts after invoicing. Posted to the ledger when issued."
        action={allowed(session, "accounting.create") ? <Button size="sm" onClick={() => setCreating(true)}><Plus /> {kind === "credit" ? "Credit note" : "Debit note"}</Button> : null}
      />
      <CardBody>
        <Select value={kind} onChange={(event) => setKind(event.target.value as "credit" | "debit")} className="w-56">
          <option value="credit">Credit notes</option>
          <option value="debit">Debit notes</option>
        </Select>
      </CardBody>
      <QueryError error={notes.error} />
      <DataTable
        rows={notes.data || []}
        loading={notes.isLoading}
        rowKey={(row) => row.id}
        density="compact"
        columns={[
          { key: "number", header: "Number", render: (row) => <span className="font-mono text-xs">{row.number}</span> },
          { key: "date", header: "Date", render: (row) => formatDate(row.date) },
          { key: "party", header: kind === "credit" ? "Customer" : "Vendor", render: (row) => row.customer?.name || row.vendor?.name },
          { key: "against", header: "Against", render: (row) => row.invoice?.number || row.vendorBill?.number || "—" },
          { key: "reason", header: "Reason", render: (row) => humanize(row.reason) },
          { key: "total", header: "Total", align: "right", render: (row) => money(row.total) },
        ]}
      />
      {creating ? <NoteForm kind={kind} onClose={() => setCreating(false)} /> : null}
    </Card>
  );
}

function NoteForm({ kind, onClose }: { kind: "credit" | "debit"; onClose: () => void }) {
  const action = useAction(["/accounting"]);
  const [party, setParty] = useState<Party | null>(null);
  const [reason, setReason] = useState(kind === "credit" ? "RETURN" : "RETURN");
  const [against, setAgainst] = useState("");
  const [lines, setLines] = useState([{ description: "", amount: "", taxRate: "18" }]);
  const invoices = useApi<Array<{ id: string; number: string; customerId: string; total: number }>>(kind === "credit" && party ? "/invoices" : null);
  const bills = useApi<Array<{ id: string; number: string; vendorId: string; total: number }>>(kind === "debit" && party ? "/finance/payables" : null);
  const options = kind === "credit" ? (invoices.data || []).filter((row) => row.customerId === party?.id) : (bills.data || []).filter((row) => row.vendorId === party?.id);
  const subtotal = lines.reduce((sum, line) => sum + (Number(line.amount) || 0), 0);
  const tax = lines.reduce((sum, line) => sum + ((Number(line.amount) || 0) * (Number(line.taxRate) || 0)) / 100, 0);
  const reasons = kind === "credit" ? ["RETURN", "PRICE_ADJUSTMENT", "DISCOUNT", "DEFICIENCY", "OTHER"] : ["RETURN", "PRICE_ADJUSTMENT", "SHORT_SUPPLY", "QUALITY", "OTHER"];
  async function submit() {
    if (!party) return;
    const body = {
      [kind === "credit" ? "customerId" : "vendorId"]: party.id,
      [kind === "credit" ? "invoiceId" : "vendorBillId"]: against || undefined,
      reason,
      lines: lines.filter((line) => Number(line.amount) > 0).map((line) => ({ description: line.description || "Adjustment", amount: Number(line.amount), taxRate: Number(line.taxRate) || 0 })),
    };
    if (await action.submit({ path: `/accounting/${kind}-notes`, body })) onClose();
  }
  return (
    <Modal open onOpenChange={(value) => !value && onClose()} title={kind === "credit" ? "New credit note" : "New debit note"} className="max-w-3xl" footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!party || subtotal <= 0} loading={action.isPending} onClick={submit}>Issue</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={kind === "credit" ? "Customer" : "Vendor"}><PartyPicker kind={kind === "credit" ? "customers" : "vendors"} value={party} onChange={(value) => { setParty(value); setAgainst(""); }} /></Field>
          <Field label="Reason"><Select value={reason} onChange={(event) => setReason(event.target.value)}>{reasons.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}</Select></Field>
          <Field label={kind === "credit" ? "Against invoice" : "Against bill"} className="sm:col-span-2">
            <Select value={against} onChange={(event) => setAgainst(event.target.value)} disabled={!party}>
              <option value="">Not linked</option>
              {options.map((row) => <option key={row.id} value={row.id}>{row.number} · {money(row.total)}</option>)}
            </Select>
          </Field>
        </div>
        {lines.map((line, index) => (
          <div key={index} className="grid grid-cols-[1fr_140px_100px_auto] gap-2">
            <TextInput placeholder="Description" value={line.description} onChange={(event) => setLines((current) => current.map((row, i) => (i === index ? { ...row, description: event.target.value } : row)))} />
            <TextInput type="number" min="0" step="0.01" placeholder="Taxable value" value={line.amount} onChange={(event) => setLines((current) => current.map((row, i) => (i === index ? { ...row, amount: event.target.value } : row)))} />
            <Select value={line.taxRate} onChange={(event) => setLines((current) => current.map((row, i) => (i === index ? { ...row, taxRate: event.target.value } : row)))}>{["0", "5", "12", "18", "28"].map((rate) => <option key={rate} value={rate}>GST {rate}%</option>)}</Select>
            <Button variant="ghost" size="icon-sm" aria-label="Remove line" disabled={lines.length <= 1} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 /></Button>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setLines((current) => [...current, { description: "", amount: "", taxRate: "18" }])}><Plus /> Line</Button>
        <div className="flex justify-end gap-6 text-sm">
          <span>Taxable {money(subtotal)}</span>
          <span>GST {money(tax)}</span>
          <strong>Total {money(subtotal + tax)}</strong>
        </div>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </div>
    </Modal>
  );
}

export function PeriodClose() {
  const { session } = useSession();
  const locks = useApi<Array<{ id: string; lockedUntil: string; reason: string; createdAt: string }>>("/accounting/locks");
  const years = useApi<Array<{ id: string; label: string; startDate: string; endDate: string; closedBy?: { number: string } | null }>>("/accounting/financial-years");
  const lock = useAction(["/accounting"]);
  const close = useAction(["/accounting"]);
  const [until, setUntil] = useState("");
  const [reason, setReason] = useState("");
  const current = locks.data?.[0];
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card>
        <CardHeader title="Period lock" description="Nobody can post a manual journal on or before the lock date. Automatic postings for late documents land on the first open day." />
        <CardBody className="space-y-3">
          <p className="text-sm">{current ? <>Books locked up to <strong>{formatDate(current.lockedUntil)}</strong> ({current.reason})</> : "No period is locked."}</p>
          {allowed(session, "accounting.approve") ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Lock up to"><TextInput type="date" value={until} onChange={(event) => setUntil(event.target.value)} /></Field>
              <Field label="Reason" className="flex-1"><TextInput value={reason} onChange={(event) => setReason(event.target.value)} placeholder="GSTR-3B filed for September" /></Field>
              <Button disabled={!until || reason.trim().length < 3} loading={lock.isPending} onClick={async () => (await lock.submit({ path: "/accounting/locks", body: { lockedUntil: until, reason } })) && setReason("")}>Lock</Button>
            </div>
          ) : null}
          {lock.error ? <ErrorNote>{lock.error.message}</ErrorNote> : null}
          <DataTable rows={locks.data || []} rowKey={(row) => row.id} density="compact" columns={[{ key: "until", header: "Locked up to", render: (row) => formatDate(row.lockedUntil) }, { key: "reason", header: "Reason", render: (row) => row.reason }, { key: "at", header: "Set", render: (row) => formatDate(row.createdAt) }]} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Year-end close" description="Moves the year's profit or loss to retained earnings and locks the year." />
        <QueryError error={years.error} />
        <DataTable
          rows={years.data || []}
          rowKey={(row) => row.id}
          density="compact"
          empty={<p className="py-6 text-center text-sm text-muted">Add financial years under Organization.</p>}
          columns={[
            { key: "label", header: "Year", render: (row) => row.label },
            { key: "range", header: "Period", render: (row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}` },
            {
              key: "action",
              header: "",
              align: "right",
              render: (row) =>
                row.closedBy ? <Badge tone="good">Closed · {row.closedBy.number}</Badge> : allowed(session, "accounting.approve") && new Date(row.endDate) < new Date() ? (
                  <Button size="sm" variant="outline" loading={close.isPending} onClick={() => window.confirm(`Close ${row.label}? Its income and expense balances move to retained earnings and the year is locked.`) && close.submit({ path: "/accounting/year-close", body: { financialYearId: row.id } })}>Close year</Button>
                ) : <span className="text-xs text-muted">Open</span>,
            },
          ]}
        />
        {close.error ? <ErrorNote className="m-4">{close.error.message}</ErrorNote> : null}
      </Card>
    </div>
  );
}

function FileImport({ title, description, path, fields, onDone }: { title: string; description: string; path: string; fields?: React.ReactNode; onDone?: (result: Record<string, unknown>) => void }) {
  const action = useAction<FormData, Record<string, unknown>>(["/accounting"]);
  const [result, setResult] = useState<Record<string, unknown> | null>(null);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await action.submit({ path, body: new FormData(event.currentTarget) });
    if (response) {
      setResult(response);
      onDone?.(response);
    }
  }
  const summary = result
    ? Object.entries(result)
        .filter(([, value]) => typeof value === "number")
        .map(([key, value]) => `${humanize(key)}: ${value}`)
        .join(" · ")
    : "";
  const skipped = (result?.skipped as string[] | undefined) || [];
  return (
    <Card>
      <CardHeader title={title} description={description} />
      <CardBody>
        <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
          {fields}
          <Field label="CSV file"><input type="file" name="file" accept=".csv,text/csv" required className="text-sm" /></Field>
          <Button type="submit" variant="outline" loading={action.isPending}><Upload /> Import</Button>
        </form>
        {action.error ? <ErrorNote className="mt-3">{action.error.message}</ErrorNote> : null}
        {result ? <Notice tone={skipped.length ? "warn" : "good"} className="mt-3">{summary || "Imported."}{skipped.length ? ` Skipped: ${skipped.slice(0, 5).join("; ")}${skipped.length > 5 ? "…" : ""}` : ""}</Notice> : null}
      </CardBody>
    </Card>
  );
}

export function ImportExport() {
  const { session } = useSession();
  const range = useRange();
  const [error, setError] = useState("");
  const opening = useApi<{ startDate: string | null }>("/accounting/opening-balances");
  const asOfField = <Field label="Balances as of"><TextInput type="date" name="asOf" required /></Field>;
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Export to Tally" description="Ledger masters and vouchers as Tally XML (Gateway of Tally → Import Data → Vouchers)." />
        <CardBody className="flex flex-wrap items-end gap-3">
          {range.picker}
          <Button variant="outline" disabled={!allowed(session, "accounting.export")} onClick={() => download(`/accounting/export/tally?${range.query}`, `tally-${range.from}-${range.to}.xml`).catch((reason: Error) => setError(reason.message))}><Download /> Tally XML</Button>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </CardBody>
      </Card>
      {allowed(session, "accounting.override") ? (
        <>
          <Notice tone="info">
            Moving from Zoho Books: import in this order — chart of accounts, trial balance on the cut-over date, customer and vendor balances, then invoice history.
            {opening.data?.startDate ? ` The ledger starts on ${formatDate(opening.data.startDate)}; documents dated earlier are not posted again.` : " The first opening import sets the ledger start date to the day after the cut-over."}
          </Notice>
          <div className="grid gap-4 xl:grid-cols-2">
            <FileImport title="1. Chart of accounts" description="Zoho Books → Accountant → Chart of Accounts → Export (CSV)." path="/accounting/import/zoho/accounts" />
            <FileImport title="2. Opening trial balance" description="Zoho Books → Reports → Trial Balance as of the cut-over date → Export CSV." path="/accounting/import/zoho/trial-balance" fields={asOfField} />
            <FileImport
              title="3. Customer / vendor balances"
              description="Customer Balances or Vendor Balances report on the same date. Splits the receivable or payable total by party."
              path="/accounting/import/zoho/party-balances"
              fields={<>{asOfField}<Field label="Parties"><Select name="kind" defaultValue="CUSTOMER"><option value="CUSTOMER">Customers</option><option value="VENDOR">Vendors</option></Select></Field></>}
            />
            <FileImport title="4. Invoice history" description="Sales → Invoices → Export. Kept for statements and CRM history; not posted again." path="/accounting/import/zoho/invoices" />
          </div>
        </>
      ) : null}
    </div>
  );
}
