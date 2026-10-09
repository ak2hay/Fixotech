"use client";

import { Badge, Button, Card, CardBody, CardHeader, DataTable, ErrorNote, Field, MiniStat, Modal, Notice, Select, Tabs, TextInput, formatDate, humanize, money } from "@fixotec/ui";
import { ArrowLeft, Calculator, CheckCircle2, Download, FileText, Plus, RefreshCw, Send, Trash2, Wallet } from "lucide-react";
import { useEffect, useState } from "react";
import { download } from "../lib/api";
import { useAction, useApi } from "../lib/query";
import { allowed, useSession } from "../lib/session";
import { QueryError } from "./common";
import { StatusBadge, formValues, todayKey } from "./hr";

type Amount = number | string | null;
type Totals = { employees: number; gross: number; deductions: number; reimbursements: number; net: number; employerCost: number; pf: number; esi: number; pt: number; lwf: number; tds: number; cost: number; warnings?: string[] };
type Run = { id: string; number: string; kind: string; period: string; status: string; totals: Totals | null; notes: string | null; createdAt: string; approvedAt: string | null; paidAt: string | null; paymentRunId: string | null; _count?: { payslips: number } };
type SlipLine = { code: string; name: string; amount: number; rate?: number; taxable?: boolean; ledger?: string | null };
type Adjustment = { code: string; name: string; kind: "EARNING" | "DEDUCTION"; amount: number; taxable?: boolean; ledger?: "ADVANCE" | null };
type Payslip = {
  id: string;
  employeeId: string;
  status: string;
  monthDays: number;
  paidDays: Amount;
  lopDays: Amount;
  overtimeHours: Amount;
  gross: Amount;
  totalDeductions: Amount;
  reimbursements: Amount;
  net: Amount;
  employerCost: Amount;
  tds: Amount;
  tdsOverride: Amount;
  regime: string;
  state: string | null;
  earnings: SlipLine[];
  deductions: SlipLine[];
  adjustments: Adjustment[] | null;
  warnings: string[] | null;
  projection: Record<string, unknown> | null;
  employee: { id: string; code: string; name: string; designation: string | null; branch: { name: string } | null };
};
type RunDetail = Run & { payslips: Payslip[]; paymentRun: { id: string; number: string; status: string } | null };
type Component = { code: string; name: string; kind: "EARNING" | "DEDUCTION"; calc: string; value: number; formula?: string; taxable: boolean; pfWage: boolean; esiWage: boolean; prorate: boolean };
type Structure = { id: string; name: string; description: string | null; active: boolean; employerInCtc: boolean; components: Component[]; _count: { assignments: number } };
type SalaryRow = { id: string; code: string; name: string; designation: string | null; status: string; pfApplicable: boolean; esiApplicable: boolean; taxRegime: string; uan: string | null; bankAccountMasked: string | null; ifsc: string | null; branch: { name: string; state: string | null } | null; salary: { id: string; structure: string; structureId: string; annualCtc: number; effectiveFrom: string } | null };
type Breakdown = { lines: Array<{ code: string; name: string; kind: string; amount: number }>; gross: number; employerPf: number; employerEsi: number; ctc: number; warnings: string[]; annual?: { ctc: number; gross: number } };
type Account = { id: string; code: string; name: string };

const n = (value: Amount | undefined) => Number(value || 0);
const CALCS = ["PERCENT_CTC", "PERCENT_BASIC", "FIXED", "FORMULA", "BALANCE"];
const BANK_FORMATS = ["GENERIC", "HDFC", "ICICI", "SBI", "AXIS"];
const thisPeriod = () => todayKey().slice(0, 7);
export const currentFy = () => {
  const [y, m] = thisPeriod().split("-").map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
};
const monthName = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });

export const DECLARATION_FIELDS: Array<{ key: string; label: string; hint?: string; oldOnly?: boolean }> = [
  { key: "section80C", label: "80C investments", hint: "PPF, ELSS, LIC, tuition, home-loan principal (cap ₹1.5 lakh)", oldOnly: true },
  { key: "section80CCD1B", label: "80CCD(1B) NPS", hint: "Additional NPS (cap ₹50,000)", oldOnly: true },
  { key: "section80D", label: "80D medical insurance", hint: "Self, family and parents", oldOnly: true },
  { key: "section24B", label: "24(b) home-loan interest", hint: "Self-occupied (cap ₹2 lakh)", oldOnly: true },
  { key: "section80E", label: "80E education-loan interest", oldOnly: true },
  { key: "section80G", label: "80G donations (eligible amount)", oldOnly: true },
  { key: "section80TTA", label: "80TTA savings interest", oldOnly: true },
  { key: "otherDeductions", label: "Other Chapter VI-A", oldOnly: true },
  { key: "rentPaidMonthly", label: "Rent paid per month (HRA)", oldOnly: true },
  { key: "landlordPan", label: "Landlord PAN", hint: "Needed when rent exceeds ₹1 lakh a year", oldOnly: true },
  { key: "previousEmployerIncome", label: "Previous employer: taxable salary", hint: "If you joined mid-year" },
  { key: "previousEmployerTds", label: "Previous employer: TDS" },
  { key: "previousEmployerPt", label: "Previous employer: professional tax" },
  { key: "otherIncome", label: "Other income to be taxed through salary" },
];

/** Shared by employee self-service and payroll verification. */
export function DeclarationFields({ items, regime, disabled }: { items: Record<string, unknown>; regime: string; disabled?: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {DECLARATION_FIELDS.filter((field) => regime === "OLD" || !field.oldOnly).map((field) => (
        <Field key={field.key} label={field.label} hint={field.hint}>
          <TextInput name={field.key} type={field.key === "landlordPan" ? "text" : "number"} min={0} step="1" defaultValue={items[field.key] === undefined ? "" : String(items[field.key])} disabled={disabled} />
        </Field>
      ))}
      {regime === "OLD" ? (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="metro" defaultChecked={Boolean(items.metro)} disabled={disabled} /> I live in a metro (Delhi, Mumbai, Kolkata, Chennai): 50% HRA limit
        </label>
      ) : null}
    </div>
  );
}

export function declarationItems(form: HTMLFormElement) {
  const values = formValues(form, { booleans: ["metro"] });
  const items: Record<string, unknown> = {};
  for (const field of DECLARATION_FIELDS) if (values[field.key] !== undefined) items[field.key] = field.key === "landlordPan" ? values[field.key] : Number(values[field.key]);
  items.metro = values.metro;
  return items;
}

export function TaxProjection({ projection }: { projection: Record<string, unknown> | null | undefined }) {
  if (!projection || projection.taxableIncome === undefined) return null;
  const rows: Array<[string, unknown]> = [
    ["Projected gross for the year", projection.gross],
    ["HRA exemption", projection.hraExemption],
    ["Standard deduction", projection.standard],
    ["Professional tax", projection.professionalTax],
    ["Chapter VI-A", projection.chapterVIA],
    ["Taxable income", projection.taxableIncome],
    ["Tax for the year (incl. cess)", projection.total],
    ["TDS so far (incl. previous employer)", projection.paid],
  ];
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
      {rows.filter(([, value]) => value !== undefined).map(([label, value]) => (
        <div key={label} className="contents">
          <dt className="text-muted">{label}</dt>
          <dd className="text-right tabular-nums">{money(Number(value))}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Page ----------

const TABS = [
  { key: "runs", label: "Payroll runs" },
  { key: "salaries", label: "Salaries" },
  { key: "structures", label: "Structures" },
  { key: "declarations", label: "Tax declarations" },
  { key: "statutory", label: "Statutory" },
  { key: "reports", label: "Reports" },
  { key: "settings", label: "Settings" },
];

export function Payroll() {
  const [tab, setTab] = useState("runs");
  const [runId, setRunId] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Tabs items={TABS} value={tab} onChange={(next) => { setTab(next); setRunId(null); }} />
      {tab === "runs" ? runId ? <RunView id={runId} onBack={() => setRunId(null)} /> : <Runs onOpen={setRunId} /> : null}
      {tab === "salaries" ? <Salaries onOpenRun={(id) => { setTab("runs"); setRunId(id); }} /> : null}
      {tab === "structures" ? <Structures /> : null}
      {tab === "declarations" ? <Declarations /> : null}
      {tab === "statutory" ? <Statutory /> : null}
      {tab === "reports" ? <Reports /> : null}
      {tab === "settings" ? <Settings /> : null}
    </div>
  );
}

// ---------- Runs ----------

function Runs({ onOpen }: { onOpen: (id: string) => void }) {
  const { session } = useSession();
  const { data, error, isLoading } = useApi<Run[]>("/payroll/runs");
  const action = useAction<Record<string, unknown>, Run & { warnings: string[] }>(["/payroll"]);
  const [period, setPeriod] = useState(thisPeriod);
  return (
    <div className="space-y-4">
      {allowed(session, "payroll.create") ? (
        <Card>
          <CardHeader title="Start a payroll run" description="Pulls attendance (LOP), shop-floor overtime, approved expense claims, salary revisions and tax declarations for the month. Nothing posts until a second person approves." />
          <CardBody>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const body = formValues(event.currentTarget, { booleans: ["includeReimbursements", "includeOvertime"] });
                const run = await action.submit({ path: "/payroll/runs", body });
                if (run) onOpen(run.id);
              }}
            >
              <Field label="Month"><TextInput type="month" name="period" value={period} onChange={(event) => setPeriod(event.target.value)} required /></Field>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includeOvertime" defaultChecked /> Overtime</label>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="includeReimbursements" defaultChecked /> Reimburse approved expenses</label>
              <Field label="Notes"><TextInput name="notes" className="w-64" /></Field>
              <Button type="submit" loading={action.isPending}><Calculator /> Compute</Button>
            </form>
            {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <QueryError error={error} />
        <DataTable
          rows={data || []}
          loading={isLoading}
          rowKey={(row) => row.id}
          onRowClick={(row) => onOpen(row.id)}
          empty="No payroll runs yet."
          columns={[
            { key: "number", header: "Run", render: (row) => <span className="font-mono text-xs">{row.number}</span> },
            { key: "period", header: "Month", render: (row) => <span>{monthName(row.period)} {row.kind === "FNF" ? <Badge tone="warn">Full &amp; final</Badge> : null}</span>, sortValue: (row) => row.period },
            { key: "employees", header: "Employees", align: "right", render: (row) => row._count?.payslips ?? 0 },
            { key: "gross", header: "Gross", align: "right", render: (row) => money(row.totals?.gross || 0) },
            { key: "net", header: "Net pay", align: "right", render: (row) => money(row.totals?.net || 0) },
            { key: "cost", header: "Cost to company", align: "right", render: (row) => money(row.totals?.cost || 0) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
          ]}
        />
      </Card>
    </div>
  );
}

function RunView({ id, onBack }: { id: string; onBack: () => void }) {
  const { session } = useSession();
  const { data: run, error } = useApi<RunDetail>(`/payroll/runs/${id}`);
  const action = useAction<Record<string, unknown>, unknown>(["/payroll"]);
  const [editing, setEditing] = useState<Payslip | null>(null);
  const [paying, setPaying] = useState<"payout" | "mark" | null>(null);
  const summary = useApi<{ pf: Record<string, number>; esi: Record<string, number>; tds: number; states: Array<{ state: string; employees: number; pt: number; lwfEmployee: number; lwfEmployer: number }> }>(run ? `/payroll/runs/${id}/statutory-summary` : null);
  if (error) return <QueryError error={error} />;
  if (!run) return null;
  const t = run.totals;
  const draft = run.status === "DRAFT";
  const flagged = run.payslips.filter((slip) => slip.warnings?.length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" onClick={onBack}><ArrowLeft /> Runs</Button>
        <h2 className="text-lg font-semibold">{run.number} · {monthName(run.period)}{run.kind === "FNF" ? " · Full & final" : ""}</h2>
        <StatusBadge status={run.status} />
        <div className="ml-auto flex flex-wrap gap-2">
          {draft && allowed(session, "payroll.edit") ? <Button variant="outline" loading={action.isPending} onClick={() => action.submit({ path: `/payroll/runs/${id}/recompute`, body: {} })}><RefreshCw /> Recompute</Button> : null}
          {draft && allowed(session, "payroll.approve") ? <Button loading={action.isPending} onClick={() => window.confirm("Approve this payroll? It posts the salary journal, settles expense claims and locks attendance for the month.") && action.submit({ path: `/payroll/runs/${id}/approve`, body: {} })}><CheckCircle2 /> Approve</Button> : null}
          {draft && allowed(session, "payroll.edit") ? <Button variant="ghost" onClick={() => window.confirm("Cancel this draft run?") && action.submit({ path: `/payroll/runs/${id}/cancel`, body: {} })}>Cancel run</Button> : null}
          {run.status === "APPROVED" && allowed(session, "payroll.export") ? <Button onClick={() => setPaying("payout")}><Send /> Bank payout file</Button> : null}
          {run.status === "APPROVED" && allowed(session, "payroll.approve") ? <Button variant="outline" onClick={() => setPaying("mark")}><Wallet /> Mark paid</Button> : null}
        </div>
      </div>
      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      {run.paymentRun ? <Notice tone="info">Payment run {run.paymentRun.number} is {humanize(run.paymentRun.status).toLowerCase()} in Banking. Payslips turn paid when the bank run completes.</Notice> : null}
      {t?.warnings?.length ? <Notice tone="warn">{t.warnings.join(" · ")}</Notice> : null}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <MiniStat label="Employees" value={String(t?.employees ?? run.payslips.length)} />
        <MiniStat label="Gross" value={money(t?.gross || 0)} />
        <MiniStat label="Deductions" value={money(t?.deductions || 0)} />
        <MiniStat label="Net pay" value={money(t?.net || 0)} tone="good" />
        <MiniStat label="Employer cost" value={money(t?.employerCost || 0)} />
        <MiniStat label="TDS" value={money(t?.tds || 0)} />
      </div>
      <Card>
        <CardHeader
          title="Payslips"
          description={flagged.length ? `${flagged.length} payslip(s) have warnings: open them to review.` : "Click a payslip to review it or add an adjustment."}
          action={
            allowed(session, "payroll.export") ? (
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="outline" onClick={() => download(`/payroll/runs/${id}/register`, `Salary-register-${run.period}.csv`)}><Download /> Register</Button>
                <Button size="sm" variant="outline" onClick={() => download(`/payroll/runs/${id}/ecr`, `ECR-${run.period}.txt`)}><Download /> PF ECR</Button>
                <Button size="sm" variant="outline" onClick={() => download(`/payroll/runs/${id}/esi`, `ESI-${run.period}.csv`)}><Download /> ESI</Button>
              </div>
            ) : null
          }
        />
        <DataTable
          rows={run.payslips}
          rowKey={(row) => row.id}
          onRowClick={(row) => setEditing(row)}
          columns={[
            { key: "employee", header: "Employee", render: (row) => <div><p className="font-medium">{row.employee.name} {row.warnings?.length ? <Badge tone="warn">{row.warnings.length}</Badge> : null}</p><p className="text-2xs text-muted">{[row.employee.code, row.employee.designation, row.employee.branch?.name].filter(Boolean).join(" · ")}</p></div>, sortValue: (row) => row.employee.name },
            { key: "days", header: "Paid days", align: "right", render: (row) => `${n(row.paidDays)}/${row.monthDays}${n(row.lopDays) ? ` (LOP ${n(row.lopDays)})` : ""}` },
            { key: "ot", header: "OT h", align: "right", render: (row) => (n(row.overtimeHours) ? n(row.overtimeHours) : "—") },
            { key: "gross", header: "Gross", align: "right", render: (row) => money(row.gross), sortValue: (row) => n(row.gross) },
            { key: "ded", header: "Deductions", align: "right", render: (row) => money(row.totalDeductions) },
            { key: "tds", header: "TDS", align: "right", render: (row) => money(row.tds) },
            { key: "reimb", header: "Reimb.", align: "right", render: (row) => (n(row.reimbursements) ? money(row.reimbursements) : "—") },
            { key: "net", header: "Net", align: "right", render: (row) => <span className="font-semibold">{money(row.net)}</span>, sortValue: (row) => n(row.net) },
            { key: "status", header: "", render: (row) => <StatusBadge status={row.status} /> },
            { key: "pdf", header: "", align: "right", render: (row) => <Button size="icon-sm" variant="ghost" aria-label="Payslip PDF" onClick={(event) => { event.stopPropagation(); download(`/payroll/payslips/${row.id}/pdf`, `Payslip-${row.employee.code}-${run.period}.pdf`); }}><FileText /></Button> },
          ]}
        />
      </Card>
      {summary.data ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="PF and ESI" />
            <CardBody>
              <dl className="grid grid-cols-2 gap-1 text-sm">
                <dt className="text-muted">PF members</dt><dd className="text-right">{summary.data.pf.members}</dd>
                <dt className="text-muted">Employee share (A/c 1)</dt><dd className="text-right">{money(summary.data.pf.employee)}</dd>
                <dt className="text-muted">Employer EPF (A/c 1)</dt><dd className="text-right">{money(summary.data.pf.epf)}</dd>
                <dt className="text-muted">EPS (A/c 10)</dt><dd className="text-right">{money(summary.data.pf.eps)}</dd>
                <dt className="text-muted">Admin (A/c 2)</dt><dd className="text-right">{money(summary.data.pf.admin)}</dd>
                <dt className="text-muted">EDLI (A/c 21)</dt><dd className="text-right">{money(summary.data.pf.edli)}</dd>
                <dt className="text-muted">ESI members</dt><dd className="text-right">{summary.data.esi.members}</dd>
                <dt className="text-muted">ESI employee / employer</dt><dd className="text-right">{money(summary.data.esi.employee)} / {money(summary.data.esi.employer)}</dd>
              </dl>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Professional tax and LWF by state" />
            <DataTable
              rows={summary.data.states}
              rowKey={(row) => row.state}
              columns={[
                { key: "state", header: "State", render: (row) => row.state },
                { key: "employees", header: "Employees", align: "right", render: (row) => row.employees },
                { key: "pt", header: "PT", align: "right", render: (row) => money(row.pt) },
                { key: "lwf", header: "LWF (emp + empr)", align: "right", render: (row) => `${money(row.lwfEmployee)} + ${money(row.lwfEmployer)}` },
              ]}
            />
          </Card>
        </div>
      ) : null}
      {editing ? <PayslipModal slip={editing} editable={draft && allowed(session, "payroll.edit")} onClose={() => setEditing(null)} /> : null}
      {paying ? <PayModal runId={id} mode={paying} onClose={() => setPaying(null)} /> : null}
    </div>
  );
}

function PayslipModal({ slip, editable, onClose }: { slip: Payslip; editable: boolean; onClose: () => void }) {
  const action = useAction<Record<string, unknown>, unknown>(["/payroll"]);
  const overrides = ((slip.projection?.overrides as Record<string, number> | undefined) || {});
  const [adjustments, setAdjustments] = useState<Adjustment[]>(slip.adjustments || []);
  const update = (index: number, patch: Partial<Adjustment>) => setAdjustments((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={`${slip.employee.name} · payslip`} description={`${slip.regime} tax regime${slip.state ? ` · ${slip.state}` : ""}`} className="max-w-3xl">
      <div className="space-y-4">
        {slip.warnings?.length ? <Notice tone="warn"><ul className="list-disc pl-4">{slip.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></Notice> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <h4 className="mb-1 text-2xs font-semibold uppercase text-muted">Earnings</h4>
            <dl className="grid grid-cols-2 gap-1 text-sm">{slip.earnings.map((row, index) => <div key={`${row.code}${index}`} className="contents"><dt>{row.name}</dt><dd className="text-right tabular-nums">{money(row.amount)}</dd></div>)}<dt className="font-semibold">Gross</dt><dd className="text-right font-semibold">{money(slip.gross)}</dd></dl>
          </div>
          <div>
            <h4 className="mb-1 text-2xs font-semibold uppercase text-muted">Deductions</h4>
            <dl className="grid grid-cols-2 gap-1 text-sm">{slip.deductions.map((row, index) => <div key={`${row.code}${index}`} className="contents"><dt>{row.name}</dt><dd className="text-right tabular-nums">{money(row.amount)}</dd></div>)}<dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{money(slip.totalDeductions)}</dd></dl>
          </div>
        </div>
        <p className="text-sm">Reimbursements {money(slip.reimbursements)} · <span className="font-semibold">Net pay {money(slip.net)}</span> · Employer contributions {money(slip.employerCost)}</p>
        <details>
          <summary className="cursor-pointer text-sm text-muted">Tax projection for the year</summary>
          <div className="mt-2"><TaxProjection projection={slip.projection} /></div>
        </details>
        {editable ? (
          <form
            className="space-y-3 border-t border-border pt-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const values = formValues(event.currentTarget, { keepBlank: ["tdsOverride"] });
              const body: Record<string, unknown> = { adjustments: adjustments.filter((row) => row.code && row.name && row.amount > 0) };
              if (values.lopDays !== undefined) body.lopDays = Number(values.lopDays);
              if (values.overtimeHours !== undefined) body.overtimeHours = Number(values.overtimeHours);
              body.tdsOverride = values.tdsOverride === "" || values.tdsOverride === undefined ? null : Number(values.tdsOverride);
              if (await action.submit({ path: `/payroll/payslips/${slip.id}`, method: "PATCH", body })) onClose();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label="LOP days" hint="Override what attendance says"><TextInput type="number" step="0.5" min={0} name="lopDays" defaultValue={overrides.lopDays ?? ""} placeholder={String(n(slip.lopDays))} /></Field>
              <Field label="Overtime hours"><TextInput type="number" step="0.25" min={0} name="overtimeHours" defaultValue={overrides.overtimeHours ?? ""} placeholder={String(n(slip.overtimeHours))} /></Field>
              <Field label="TDS this month" hint="Blank = computed"><TextInput type="number" min={0} name="tdsOverride" defaultValue={slip.tdsOverride === null ? "" : n(slip.tdsOverride)} /></Field>
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-2xs font-semibold uppercase text-muted">One-time adjustments</h4>
                <Button type="button" size="sm" variant="outline" onClick={() => setAdjustments((rows) => [...rows, { code: "", name: "", kind: "EARNING", amount: 0, taxable: true }])}><Plus /> Add</Button>
              </div>
              {adjustments.map((row, index) => (
                <div key={index} className="flex flex-wrap items-end gap-2">
                  <TextInput aria-label="Code" placeholder="ARREAR" value={row.code} onChange={(event) => update(index, { code: event.target.value.toUpperCase() })} className="w-28" />
                  <TextInput aria-label="Name" placeholder="Salary arrears" value={row.name} onChange={(event) => update(index, { name: event.target.value })} className="w-48" />
                  <Select aria-label="Kind" value={row.kind} onChange={(event) => update(index, { kind: event.target.value as Adjustment["kind"], ledger: null })}><option value="EARNING">Earning</option><option value="DEDUCTION">Deduction</option></Select>
                  <TextInput aria-label="Amount" type="number" min={0} value={row.amount || ""} onChange={(event) => update(index, { amount: Number(event.target.value) })} className="w-28" />
                  {row.kind === "EARNING" ? (
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={row.taxable !== false} onChange={(event) => update(index, { taxable: event.target.checked })} /> Taxable</label>
                  ) : (
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={row.ledger === "ADVANCE"} onChange={(event) => update(index, { ledger: event.target.checked ? "ADVANCE" : null })} /> Recovers an advance</label>
                  )}
                  <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setAdjustments((rows) => rows.filter((_, i) => i !== index))}><Trash2 /></Button>
                </div>
              ))}
            </div>
            {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
            <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Close</Button><Button type="submit" loading={action.isPending}>Save and recompute</Button></div>
          </form>
        ) : null}
      </div>
    </Modal>
  );
}

function PayModal({ runId, mode, onClose }: { runId: string; mode: "payout" | "mark"; onClose: () => void }) {
  const { data } = useApi<{ settings: { payoutAccountId?: string; bankFormat?: string }; accounts: Account[] }>("/payroll/settings");
  const action = useAction<Record<string, unknown>, { number?: string }>(["/payroll", "/banking"]);
  const [done, setDone] = useState<string | null>(null);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={mode === "payout" ? "Create salary payment run" : "Mark salaries paid"} description={mode === "payout" ? "Creates a payment run in Banking with each employee's net pay. Approve it there and download the bank's bulk-upload file." : "Use when salaries were paid outside a bank file (cheque or manual transfer). Posts Salaries payable against the bank."}>
      {done ? (
        <div className="space-y-3"><Notice tone="good">{done}</Notice><div className="flex justify-end"><Button onClick={onClose}>Done</Button></div></div>
      ) : data ? (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const result = await action.submit({ path: `/payroll/runs/${runId}/${mode === "payout" ? "payout" : "mark-paid"}`, body: formValues(event.currentTarget) });
            if (result) setDone(mode === "payout" ? `Payment run ${result.number} created. Approve and export it from Banking → Payment runs.` : "Salaries marked paid.");
          }}
        >
          <Field label="Bank account"><Select name="accountId" required defaultValue={data.settings.payoutAccountId || ""}><option value="">Choose…</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.code} · {account.name}</option>)}</Select></Field>
          {mode === "payout" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="File format"><Select name="bankFormat" defaultValue={data.settings.bankFormat || "GENERIC"}>{BANK_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}</Select></Field>
              <Field label="Value date"><TextInput type="date" name="valueDate" defaultValue={todayKey()} required /></Field>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Paid on"><TextInput type="date" name="paidOn" defaultValue={todayKey()} required /></Field>
              <Field label="Reference"><TextInput name="reference" /></Field>
            </div>
          )}
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>{mode === "payout" ? "Create payment run" : "Mark paid"}</Button></div>
        </form>
      ) : null}
    </Modal>
  );
}

// ---------- Salaries & full and final ----------

function Salaries({ onOpenRun }: { onOpenRun: (id: string) => void }) {
  const { session } = useSession();
  const { data, error, isLoading } = useApi<SalaryRow[]>("/payroll/salaries");
  const [assigning, setAssigning] = useState<SalaryRow | null>(null);
  const [settling, setSettling] = useState<SalaryRow | null>(null);
  const [search, setSearch] = useState("");
  const rows = (data || []).filter((row) => !search || `${row.name} ${row.code}`.toLowerCase().includes(search.toLowerCase()));
  const missing = (data || []).filter((row) => !row.salary).length;
  return (
    <div className="space-y-4">
      {missing ? <Notice tone="warn">{missing} employee(s) have no salary assigned and will be skipped in payroll.</Notice> : null}
      <Card>
        <CardHeader title="Employee salaries" description="Revisions are effective-dated; payroll picks the one in force at month end." action={<TextInput placeholder="Search…" value={search} onChange={(event) => setSearch(event.target.value)} className="w-56" />} />
        <QueryError error={error} />
        <DataTable
          rows={rows}
          loading={isLoading}
          rowKey={(row) => row.id}
          columns={[
            { key: "name", header: "Employee", render: (row) => <div><p className="font-medium">{row.name}</p><p className="text-2xs text-muted">{[row.code, row.designation, row.branch?.name].filter(Boolean).join(" · ")}</p></div>, sortValue: (row) => row.name },
            { key: "structure", header: "Structure", render: (row) => row.salary?.structure || <span className="text-muted">Not set</span> },
            { key: "ctc", header: "Annual CTC", align: "right", render: (row) => (row.salary ? money(row.salary.annualCtc) : "—"), sortValue: (row) => row.salary?.annualCtc || 0 },
            { key: "from", header: "Since", render: (row) => (row.salary ? formatDate(row.salary.effectiveFrom) : "—") },
            { key: "stat", header: "Statutory", render: (row) => <span className="text-2xs">{[row.pfApplicable ? "PF" : null, row.esiApplicable ? "ESI" : null, row.taxRegime].filter(Boolean).join(" · ")}{row.pfApplicable && !row.uan ? <Badge tone="warn">No UAN</Badge> : null}{!row.bankAccountMasked ? <Badge tone="warn">No bank</Badge> : null}{!row.branch?.state ? <Badge tone="warn">No state</Badge> : null}</span> },
            { key: "status", header: "", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "actions",
              header: "",
              align: "right",
              render: (row) => (
                <div className="flex justify-end gap-1">
                  {allowed(session, "payroll.edit") ? <Button size="sm" variant="outline" onClick={() => setAssigning(row)}>{row.salary ? "Revise" : "Assign"}</Button> : null}
                  {row.status === "NOTICE" && allowed(session, "payroll.create") ? <Button size="sm" variant="outline" onClick={() => setSettling(row)}>Full &amp; final</Button> : null}
                </div>
              ),
            },
          ]}
        />
      </Card>
      {assigning ? <AssignSalaryModal employee={assigning} onClose={() => setAssigning(null)} /> : null}
      {settling ? <FnfModal employee={settling} onClose={() => setSettling(null)} onCreated={onOpenRun} /> : null}
    </div>
  );
}

function AssignSalaryModal({ employee, onClose }: { employee: SalaryRow; onClose: () => void }) {
  const structures = useApi<Structure[]>("/payroll/structures");
  const history = useApi<{ history: Array<{ id: string; annualCtc: Amount; effectiveFrom: string; structure: { name: string }; notes: string | null }> }>(`/payroll/employees/${employee.id}/salary`);
  const preview = useAction<Record<string, unknown>, Breakdown>([]);
  const action = useAction<Record<string, unknown>, unknown>(["/payroll"]);
  const [structureId, setStructureId] = useState(employee.salary?.structureId || "");
  const [ctc, setCtc] = useState(String(employee.salary?.annualCtc || ""));
  const [result, setResult] = useState<Breakdown | null>(null);
  useEffect(() => {
    if (!structureId || !Number(ctc)) return setResult(null);
    const timer = setTimeout(async () => setResult((await preview.submit({ path: "/payroll/structures/preview", body: { structureId, annualCtc: Number(ctc), pf: employee.pfApplicable, esi: employee.esiApplicable } })) || null), 350);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structureId, ctc]);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={`${employee.salary ? "Revise" : "Assign"} salary · ${employee.name}`} className="max-w-2xl">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = formValues(event.currentTarget);
          body.annualCtc = Number(body.annualCtc);
          if (await action.submit({ path: `/payroll/employees/${employee.id}/salary`, body })) onClose();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Structure"><Select name="structureId" required value={structureId} onChange={(event) => setStructureId(event.target.value)}><option value="">Choose…</option>{(structures.data || []).filter((row) => row.active).map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
          <Field label="Annual CTC (₹)"><TextInput type="number" min={0} name="annualCtc" required value={ctc} onChange={(event) => setCtc(event.target.value)} /></Field>
          <Field label="Effective from"><TextInput type="date" name="effectiveFrom" required defaultValue={`${thisPeriod()}-01`} /></Field>
        </div>
        <Field label="Notes"><TextInput name="notes" placeholder="Annual increment 2026" /></Field>
        {result ? (
          <div className="rounded-lg border border-border p-3">
            <dl className="grid grid-cols-2 gap-1 text-sm">
              {result.lines.map((line) => <div key={line.code} className="contents"><dt>{line.name}</dt><dd className="text-right tabular-nums">{money(line.amount)}/mo</dd></div>)}
              <dt className="font-semibold">Monthly gross</dt><dd className="text-right font-semibold">{money(result.gross)}</dd>
              <dt className="text-muted">Employer PF / ESI</dt><dd className="text-right text-muted">{money(result.employerPf)} / {money(result.employerEsi)}</dd>
            </dl>
            {result.warnings.length ? <Notice tone="warn">{result.warnings.join(" · ")}</Notice> : null}
          </div>
        ) : null}
        {preview.error ? <ErrorNote>{preview.error.message}</ErrorNote> : null}
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        {history.data?.history.length ? (
          <details>
            <summary className="cursor-pointer text-sm text-muted">Salary history</summary>
            <ul className="mt-1 text-sm">{history.data.history.map((row) => <li key={row.id}>{formatDate(row.effectiveFrom)} · {row.structure.name} · {money(row.annualCtc)} {row.notes ? <span className="text-muted">({row.notes})</span> : null}</li>)}</ul>
          </details>
        ) : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

type FnfPreview = { employee: { name: string; joiningDate: string | null; lastWorkingDay: string }; period: string; monthlyGross: number; basicDa: number; leaveDays: number; leaveEncashment: number; gratuity: { eligible: boolean; years: number; amount: number }; openAdvance: number; assetsNotReturned: number };

function FnfModal({ employee, onClose, onCreated }: { employee: SalaryRow; onClose: () => void; onCreated: (runId: string) => void }) {
  const { data, error } = useApi<FnfPreview>(`/payroll/fnf/${employee.id}`);
  const action = useAction<Record<string, unknown>, { id: string }>(["/payroll"]);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={`Full & final · ${employee.name}`} description="Creates a separate payroll run for the last month with settlement items. Review and approve it like any run." className="max-w-2xl">
      <QueryError error={error} />
      {data ? (
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const values = formValues(event.currentTarget, { booleans: ["waiveNotice"] });
            const body: Record<string, unknown> = { waiveNotice: values.waiveNotice, notes: values.notes };
            for (const key of ["leaveDays", "noticeShortDays", "bonus", "otherDeductions"]) if (values[key] !== undefined) body[key] = Number(values[key]);
            const run = await action.submit({ path: `/payroll/fnf/${employee.id}`, body });
            if (run) { onClose(); onCreated(run.id); }
          }}
        >
          <dl className="grid grid-cols-2 gap-1 text-sm">
            <dt className="text-muted">Last working day</dt><dd className="text-right">{formatDate(data.employee.lastWorkingDay)} ({monthName(data.period)})</dd>
            <dt className="text-muted">Monthly gross / Basic + DA</dt><dd className="text-right">{money(data.monthlyGross)} / {money(data.basicDa)}</dd>
            <dt className="text-muted">Gratuity</dt><dd className="text-right">{data.gratuity.eligible ? `${money(data.gratuity.amount)} (${data.gratuity.years} yrs)` : "Not eligible (under 5 years)"}</dd>
            <dt className="text-muted">Encashable leave</dt><dd className="text-right">{data.leaveDays} days = {money(data.leaveEncashment)}</dd>
            {data.openAdvance > 0 ? <><dt className="text-muted">Open advance</dt><dd className="text-right">{money(data.openAdvance)}</dd></> : null}
          </dl>
          {data.assetsNotReturned ? <Notice tone="warn">{data.assetsNotReturned} company asset(s) still assigned; recover them or deduct below.</Notice> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Leave days to encash"><TextInput type="number" step="0.5" min={0} name="leaveDays" defaultValue={data.leaveDays} /></Field>
            <Field label="Notice shortfall (days)"><TextInput type="number" min={0} name="noticeShortDays" defaultValue={0} /></Field>
            <Field label="Bonus / ex-gratia"><TextInput type="number" min={0} name="bonus" /></Field>
            <Field label="Other recoveries" hint={data.openAdvance > 0 ? `Includes the ${money(data.openAdvance)} advance?` : undefined}><TextInput type="number" min={0} name="otherDeductions" /></Field>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="waiveNotice" /> Waive notice-period recovery</label>
          <Field label="Notes"><TextInput name="notes" /></Field>
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Create settlement run</Button></div>
        </form>
      ) : null}
    </Modal>
  );
}

// ---------- Structures ----------

function Structures() {
  const { session } = useSession();
  const { data, error } = useApi<Structure[]>("/payroll/structures");
  const [editing, setEditing] = useState<Structure | "new" | null>(null);
  return (
    <div className="space-y-4">
      <QueryError error={error} />
      <div className="flex justify-end">{allowed(session, "payroll.edit") ? <Button onClick={() => setEditing("new")}><Plus /> New structure</Button> : null}</div>
      <div className="grid gap-4 lg:grid-cols-2">
        {(data || []).map((structure) => (
          <Card key={structure.id}>
            <CardHeader title={<span>{structure.name} {!structure.active ? <Badge>Inactive</Badge> : null}</span>} description={`${structure._count.assignments} assignment(s) · employer PF/ESI ${structure.employerInCtc ? "inside" : "on top of"} CTC`} action={allowed(session, "payroll.edit") ? <Button size="sm" variant="outline" onClick={() => setEditing(structure)}>Edit</Button> : null} />
            <CardBody>
              <ul className="space-y-1 text-sm">
                {structure.components.map((row) => (
                  <li key={row.code} className="flex justify-between gap-3">
                    <span>{row.name} <span className="font-mono text-2xs text-muted">{row.code}</span></span>
                    <span className="text-muted">{row.calc === "PERCENT_CTC" ? `${row.value}% of CTC` : row.calc === "PERCENT_BASIC" ? `${row.value}% of basic` : row.calc === "FIXED" ? money(row.value) : row.calc === "FORMULA" ? row.formula : "Balance"}</span>
                  </li>
                ))}
              </ul>
            </CardBody>
          </Card>
        ))}
      </div>
      {editing ? <StructureModal structure={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </div>
  );
}

const blankComponent = (): Component => ({ code: "", name: "", kind: "EARNING", calc: "FIXED", value: 0, taxable: true, pfWage: false, esiWage: true, prorate: true });

function StructureModal({ structure, onClose }: { structure: Structure | null; onClose: () => void }) {
  const action = useAction<Record<string, unknown>, unknown>(["/payroll"]);
  const [components, setComponents] = useState<Component[]>(structure?.components || [{ ...blankComponent(), code: "BASIC", name: "Basic", calc: "PERCENT_CTC", value: 50, pfWage: true }, { ...blankComponent(), code: "SPECIAL", name: "Special allowance", calc: "BALANCE" }]);
  const update = (index: number, patch: Partial<Component>) => setComponents((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={structure ? `Edit ${structure.name}` : "New salary structure"} description="Components are evaluated top to bottom. Formulas can use CTC and earlier codes, with MIN, MAX, ROUND and IF. The balance component takes what is left of CTC." className="max-w-5xl">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const values = formValues(event.currentTarget, { booleans: ["employerInCtc", "active"] });
          const body = { name: values.name, description: values.description, employerInCtc: values.employerInCtc, active: values.active, components };
          if (await action.submit({ path: structure ? `/payroll/structures/${structure.id}` : "/payroll/structures", method: structure ? "PATCH" : "POST", body })) onClose();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name"><TextInput name="name" required defaultValue={structure?.name} /></Field>
          <Field label="Description"><TextInput name="description" defaultValue={structure?.description || ""} /></Field>
        </div>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="employerInCtc" defaultChecked={structure?.employerInCtc ?? true} /> Employer PF/ESI is part of CTC</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={structure?.active ?? true} /> Active</label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-2xs uppercase text-muted"><tr><th className="text-left">Code</th><th className="text-left">Name</th><th className="text-left">Type</th><th className="text-left">Calculation</th><th className="text-left">Value / formula</th><th>Taxable</th><th>PF wage</th><th>ESI wage</th><th>Prorate</th><th /></tr></thead>
            <tbody>
              {components.map((row, index) => (
                <tr key={index}>
                  <td><TextInput aria-label="Code" value={row.code} onChange={(event) => update(index, { code: event.target.value.toUpperCase() })} className="w-24" /></td>
                  <td><TextInput aria-label="Name" value={row.name} onChange={(event) => update(index, { name: event.target.value })} className="w-40" /></td>
                  <td><Select aria-label="Type" value={row.kind} onChange={(event) => update(index, { kind: event.target.value as Component["kind"] })}><option value="EARNING">Earning</option><option value="DEDUCTION">Deduction</option></Select></td>
                  <td><Select aria-label="Calculation" value={row.calc} onChange={(event) => update(index, { calc: event.target.value })}>{CALCS.map((calc) => <option key={calc} value={calc}>{humanize(calc)}</option>)}</Select></td>
                  <td>{row.calc === "FORMULA" ? <TextInput aria-label="Formula" value={row.formula || ""} onChange={(event) => update(index, { formula: event.target.value })} placeholder="MIN(1600, BASIC*0.1)" className="w-52" /> : row.calc === "BALANCE" ? <span className="text-muted">Rest of CTC</span> : <TextInput aria-label="Value" type="number" min={0} step="0.01" value={row.value} onChange={(event) => update(index, { value: Number(event.target.value) })} className="w-24" />}</td>
                  {(["taxable", "pfWage", "esiWage", "prorate"] as const).map((flag) => <td key={flag} className="text-center"><input type="checkbox" aria-label={flag} checked={row[flag]} onChange={(event) => update(index, { [flag]: event.target.checked })} /></td>)}
                  <td><Button type="button" size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setComponents((rows) => rows.filter((_, i) => i !== index))}><Trash2 /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={() => setComponents((rows) => [...rows, blankComponent()])}><Plus /> Component</Button>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

// ---------- Declarations ----------

type DeclarationRow = { id: string; fy: string; regime: string; status: string; items: Record<string, unknown>; verified: Record<string, unknown> | null; submittedAt: string | null; verifiedAt: string | null; note: string | null; employee: { id: string; code: string; name: string } };

function Declarations() {
  const { session } = useSession();
  const [fy, setFy] = useState(currentFy);
  const { data, error, isLoading } = useApi<DeclarationRow[]>(`/payroll/declarations?fy=${fy}`, { keepPrevious: true });
  const [verifying, setVerifying] = useState<DeclarationRow | null>(null);
  return (
    <div className="space-y-4">
      <div className="flex items-end gap-3"><Field label="Financial year"><TextInput value={fy} onChange={(event) => setFy(event.target.value)} className="w-28" /></Field></div>
      <Notice tone="info">Employees declare from My HR. Payroll uses declared amounts for monthly TDS until you verify proofs; verified amounts then replace them.</Notice>
      <Card>
        <QueryError error={error} />
        <DataTable
          rows={data || []}
          loading={isLoading}
          rowKey={(row) => row.id}
          empty="No declarations for this year."
          columns={[
            { key: "employee", header: "Employee", render: (row) => `${row.employee.name} (${row.employee.code})` },
            { key: "regime", header: "Regime", render: (row) => <Badge tone={row.regime === "NEW" ? "info" : "accent"}>{row.regime}</Badge> },
            { key: "c", header: "80C", align: "right", render: (row) => money(Number(row.items.section80C || 0)) },
            { key: "rent", header: "Rent / mo", align: "right", render: (row) => money(Number(row.items.rentPaidMonthly || 0)) },
            { key: "submitted", header: "Submitted", render: (row) => (row.submittedAt ? formatDate(row.submittedAt) : "—") },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            { key: "actions", header: "", align: "right", render: (row) => (allowed(session, "payroll.approve") ? <Button size="sm" variant="outline" onClick={() => setVerifying(row)}>Verify proofs</Button> : null) },
          ]}
        />
      </Card>
      {verifying ? <VerifyModal row={verifying} onClose={() => setVerifying(null)} /> : null}
    </div>
  );
}

function VerifyModal({ row, onClose }: { row: DeclarationRow; onClose: () => void }) {
  const action = useAction<Record<string, unknown>, unknown>(["/payroll"]);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={`Verify · ${row.employee.name}`} description="Enter the amounts supported by proofs. These replace the declared figures in TDS from the next computation." className="max-w-3xl">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const note = (event.currentTarget.elements.namedItem("note") as HTMLInputElement).value;
          if (await action.submit({ path: `/payroll/declarations/${row.id}/verify`, body: { verified: declarationItems(event.currentTarget), note: note || undefined } })) onClose();
        }}
      >
        <DeclarationFields items={row.verified || row.items} regime={row.regime} />
        <Field label="Note to employee"><TextInput name="note" defaultValue={row.note || ""} /></Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Mark verified</Button></div>
      </form>
    </Modal>
  );
}

// ---------- Statutory ----------

type StatutoryPaymentRow = { id: string; kind: string; period: string; state: string | null; amount: Amount; paidOn: string; reference: string | null; bsrCode: string | null; challanSerial: string | null; journalEntryId: string | null };

function Statutory() {
  const { session } = useSession();
  const [fy, setFy] = useState(currentFy);
  const payments = useApi<StatutoryPaymentRow[]>(`/payroll/statutory-payments?fy=${fy}`, { keepPrevious: true });
  const settings = useApi<{ accounts: Account[] }>("/payroll/settings");
  const action = useAction<Record<string, unknown>, unknown>(["/payroll"]);
  const [kind, setKind] = useState("TDS");
  return (
    <div className="space-y-4">
      {allowed(session, "payroll.approve") ? (
        <Card>
          <CardHeader title="Record a statutory deposit" description="Clears the payable in the ledger. TDS challan details flow into Form 16 and 24Q." />
          <CardBody>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const body = formValues(form);
                body.amount = Number(body.amount);
                if (await action.submit({ path: "/payroll/statutory-payments", body })) form.reset();
              }}
            >
              <Field label="Type"><Select name="kind" value={kind} onChange={(event) => setKind(event.target.value)}>{["TDS", "PF", "ESI", "PT", "LWF"].map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
              <Field label="For month"><TextInput type="month" name="period" required defaultValue={thisPeriod()} /></Field>
              {kind === "PT" || kind === "LWF" ? <Field label="State"><TextInput name="state" maxLength={2} className="w-16" placeholder="MH" /></Field> : null}
              <Field label="Amount"><TextInput type="number" min={1} step="0.01" name="amount" required className="w-32" /></Field>
              <Field label="Paid on"><TextInput type="date" name="paidOn" required defaultValue={todayKey()} /></Field>
              <Field label="From bank"><Select name="accountId" required><option value="">Choose…</option>{(settings.data?.accounts || []).map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>
              {kind === "TDS" ? <><Field label="BSR code"><TextInput name="bsrCode" maxLength={7} className="w-24" /></Field><Field label="Challan serial"><TextInput name="challanSerial" maxLength={10} className="w-24" /></Field></> : null}
              <Field label={kind === "PF" ? "TRRN" : "Reference"}><TextInput name="reference" className="w-36" /></Field>
              <Button type="submit" loading={action.isPending}><Plus /> Record</Button>
            </form>
            {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          </CardBody>
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Deposits" action={<TextInput aria-label="Financial year" value={fy} onChange={(event) => setFy(event.target.value)} className="w-28" />} />
        <QueryError error={payments.error} />
        <DataTable
          rows={payments.data || []}
          loading={payments.isLoading}
          rowKey={(row) => row.id}
          empty="No deposits recorded."
          columns={[
            { key: "kind", header: "Type", render: (row) => <Badge>{row.kind}{row.state ? ` ${row.state}` : ""}</Badge> },
            { key: "period", header: "Month", render: (row) => monthName(row.period) },
            { key: "paidOn", header: "Paid on", render: (row) => formatDate(row.paidOn) },
            { key: "challan", header: "Challan", render: (row) => <span className="text-2xs">{[row.bsrCode, row.challanSerial, row.reference].filter(Boolean).join(" · ") || "—"}</span> },
            { key: "amount", header: "Amount", align: "right", render: (row) => money(row.amount) },
          ]}
        />
      </Card>
    </div>
  );
}

// ---------- Reports ----------

type CostRow = { id: string; hours: number; cost: number; people: number };

function Reports() {
  const { session } = useSession();
  const [fromDate, setFrom] = useState(`${thisPeriod()}-01`);
  const [toDate, setTo] = useState(todayKey);
  const cost = useApi<{ orders: Array<CostRow & { number: string; product: string; status: string }>; projects: Array<CostRow & { code: string; name: string }> }>(`/payroll/labour-cost?fromDate=${fromDate}&toDate=${toDate}`, { keepPrevious: true });
  const salaries = useApi<SalaryRow[]>("/payroll/salaries");
  const [fy, setFy] = useState(currentFy);
  const [quarter, setQuarter] = useState("1");
  const [employeeId, setEmployeeId] = useState("");
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Labour cost" description="Shop-floor job time and site check-ins, costed at each person's actual hourly cost (gross plus employer contributions over paid hours)." />
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From"><TextInput type="date" value={fromDate} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field label="To"><TextInput type="date" value={toDate} onChange={(event) => setTo(event.target.value)} /></Field>
          </div>
        </CardBody>
        <QueryError error={cost.error} />
        <div className="grid gap-4 p-4 pt-0 lg:grid-cols-2">
          <div>
            <h4 className="mb-1 text-sm font-semibold">Per production order</h4>
            <DataTable
              rows={cost.data?.orders || []}
              loading={cost.isLoading}
              rowKey={(row) => row.id}
              empty="No shop-floor time logged."
              columns={[
                { key: "order", header: "Order", render: (row) => <div><p className="font-mono text-xs">{row.number}</p><p className="text-2xs text-muted">{row.product}</p></div> },
                { key: "hours", header: "Hours", align: "right", render: (row) => row.hours, sortValue: (row) => row.hours },
                { key: "people", header: "People", align: "right", render: (row) => row.people },
                { key: "cost", header: "Labour cost", align: "right", render: (row) => money(row.cost), sortValue: (row) => row.cost },
              ]}
            />
          </div>
          <div>
            <h4 className="mb-1 text-sm font-semibold">Per project site</h4>
            <DataTable
              rows={cost.data?.projects || []}
              loading={cost.isLoading}
              rowKey={(row) => row.id}
              empty="No site check-ins."
              columns={[
                { key: "project", header: "Project", render: (row) => <div><p className="font-medium">{row.name}</p><p className="text-2xs text-muted">{row.code}</p></div> },
                { key: "hours", header: "Hours", align: "right", render: (row) => row.hours, sortValue: (row) => row.hours },
                { key: "people", header: "People", align: "right", render: (row) => row.people },
                { key: "cost", header: "Labour cost", align: "right", render: (row) => money(row.cost), sortValue: (row) => row.cost },
              ]}
            />
          </div>
        </div>
      </Card>
      {allowed(session, "payroll.export") ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader title="Form 24Q" description="Quarterly TDS on salary. Annexure II (full-year salary detail) is included in Q4. Import into the NSDL return preparation utility." />
            <CardBody>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Financial year"><TextInput value={fy} onChange={(event) => setFy(event.target.value)} className="w-28" /></Field>
                <Field label="Quarter"><Select value={quarter} onChange={(event) => setQuarter(event.target.value)}>{["1", "2", "3", "4"].map((value) => <option key={value} value={value}>Q{value}</option>)}</Select></Field>
                <Button variant="outline" onClick={() => download(`/payroll/24q?fy=${fy}&quarter=${quarter}`, `24Q-${fy}-Q${quarter}.csv`)}><Download /> Download</Button>
              </div>
            </CardBody>
          </Card>
          <Card>
            <CardHeader title="Form 16 Part B" description="Built from approved payslips and the year-end tax computation. Part A comes from TRACES." />
            <CardBody>
              <div className="flex flex-wrap items-end gap-3">
                <Field label="Employee"><Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Choose…</option>{(salaries.data || []).map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}</Select></Field>
                <Field label="Financial year"><TextInput value={fy} onChange={(event) => setFy(event.target.value)} className="w-28" /></Field>
                <Button variant="outline" disabled={!employeeId} onClick={() => download(`/payroll/form16/${employeeId}?fy=${fy}`, `Form16-${fy}.pdf`)}><Download /> Download</Button>
              </div>
            </CardBody>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

// ---------- Settings ----------

type Settings = { tan?: string; deductorName?: string; deductorPan?: string; deductorAddress?: string; responsiblePerson?: string; responsibleDesignation?: string; pfEstablishmentCode?: string; esiEmployerCode?: string; payoutAccountId?: string; bankFormat?: string };

function Settings() {
  const { session } = useSession();
  const { data } = useApi<{ settings: Settings; accounts: Account[] }>("/payroll/settings");
  const branches = useApi<Array<{ id: string; code: string; name: string; state: string | null; _count: { employees: number } }>>("/payroll/branches");
  const action = useAction<Record<string, unknown>, unknown>(["/payroll"]);
  const [saved, setSaved] = useState(false);
  const canEdit = allowed(session, "payroll.edit");
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Employer details" description="Printed on payslips, Form 16 and 24Q." />
          <CardBody>
            {data ? (
              <form
                className="space-y-3"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setSaved(false);
                  if (await action.submit({ path: "/payroll/settings", method: "PUT", body: formValues(event.currentTarget) })) setSaved(true);
                }}
              >
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Employer name"><TextInput name="deductorName" defaultValue={data.settings.deductorName} /></Field>
                  <Field label="TAN"><TextInput name="tan" defaultValue={data.settings.tan} maxLength={10} /></Field>
                  <Field label="Employer PAN"><TextInput name="deductorPan" defaultValue={data.settings.deductorPan} maxLength={10} /></Field>
                  <Field label="PF establishment code"><TextInput name="pfEstablishmentCode" defaultValue={data.settings.pfEstablishmentCode} /></Field>
                  <Field label="ESI employer code"><TextInput name="esiEmployerCode" defaultValue={data.settings.esiEmployerCode} /></Field>
                  <Field label="Responsible person"><TextInput name="responsiblePerson" defaultValue={data.settings.responsiblePerson} /></Field>
                  <Field label="Designation"><TextInput name="responsibleDesignation" defaultValue={data.settings.responsibleDesignation} /></Field>
                  <Field label="Salary bank account"><Select name="payoutAccountId" defaultValue={data.settings.payoutAccountId || ""}><option value="">—</option>{data.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</Select></Field>
                  <Field label="Bank file format"><Select name="bankFormat" defaultValue={data.settings.bankFormat || "GENERIC"}>{BANK_FORMATS.map((format) => <option key={format} value={format}>{format}</option>)}</Select></Field>
                </div>
                <Field label="Address"><TextInput name="deductorAddress" defaultValue={data.settings.deductorAddress} /></Field>
                {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
                {saved ? <Notice tone="good">Saved.</Notice> : null}
                {canEdit ? <Button type="submit" loading={action.isPending}>Save</Button> : null}
              </form>
            ) : null}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Branch states" description="Professional tax and LWF follow the state of the employee's branch (MH, DL, TN, KA…)." />
          <DataTable
            rows={branches.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "name", header: "Branch", render: (row) => `${row.name} (${row.code})` },
              { key: "employees", header: "Employees", align: "right", render: (row) => row._count.employees },
              {
                key: "state",
                header: "State",
                render: (row) => (
                  <TextInput
                    aria-label="State"
                    defaultValue={row.state || ""}
                    maxLength={2}
                    className="w-16 uppercase"
                    disabled={!canEdit}
                    onBlur={(event) => {
                      const value = event.target.value.trim().toUpperCase();
                      if (value !== (row.state || "")) action.submit({ path: `/payroll/branches/${row.id}/state`, method: "PUT", body: { state: value || null } });
                    }}
                  />
                ),
              },
            ]}
          />
        </Card>
      </div>
      <StatutoryRules />
    </div>
  );
}

function StatutoryRules() {
  const { session } = useSession();
  const [fy, setFy] = useState(currentFy);
  const { data, error } = useApi<{ fy: string; custom: boolean; rules: unknown; updatedAt: string | null }>(`/payroll/statutory?fy=${fy}`);
  const action = useAction<unknown, unknown>(["/payroll/statutory"]);
  const [text, setText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  useEffect(() => {
    if (data) setText(JSON.stringify(data.rules, null, 2));
  }, [data]);
  return (
    <Card>
      <CardHeader
        title="Statutory rules"
        description={data ? (data.custom ? `Custom rules for ${data.fy}${data.updatedAt ? `, updated ${formatDate(data.updatedAt)}` : ""}.` : `Built-in defaults for ${data.fy} (PF, ESI, PT for MH/TN/KA/DL, LWF, both tax regimes). Have your CA confirm before go-live; save to override for the year.`) : undefined}
        action={<TextInput aria-label="Financial year" value={fy} onChange={(event) => setFy(event.target.value)} className="w-28" />}
      />
      <CardBody>
        <QueryError error={error} />
        <textarea className="h-96 w-full rounded-md border border-border bg-transparent p-2 font-mono text-xs" value={text} onChange={(event) => setText(event.target.value)} readOnly={!allowed(session, "payroll.approve")} spellCheck={false} />
        {parseError ? <ErrorNote>{parseError}</ErrorNote> : null}
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        {allowed(session, "payroll.approve") ? (
          <Button
            className="mt-2"
            loading={action.isPending}
            onClick={() => {
              try {
                const rules = JSON.parse(text);
                setParseError(null);
                action.submit({ path: `/payroll/statutory/${fy}`, method: "PUT", body: rules });
              } catch (cause) {
                setParseError(`Not valid JSON: ${(cause as Error).message}`);
              }
            }}
          >
            Save rules for {fy}
          </Button>
        ) : null}
      </CardBody>
    </Card>
  );
}
