"use client";

import { Badge, Button, Card, CardBody, CardHeader, DataTable, ErrorNote, Field, MiniStat, Modal, Notice, Select, Tabs, TextInput, formatDate, humanize, money } from "@fixotec/ui";
import { EXPENSE_CATEGORIES } from "@fixotec/shared";
import { Download, LogIn, LogOut, Plus } from "lucide-react";
import { useState } from "react";
import { download } from "../lib/api";
import { useAction, useApi } from "../lib/query";
import { QueryError } from "./common";
import { DeclarationFields, TaxProjection, currentFy, declarationItems } from "./payroll";
import { ApplyLeaveModal, AttendanceTable, BalanceTable, CorrectionTable, LeaveTable, ReviewModal, StatusBadge, clock, formValues, hours, monthStart, todayKey } from "./hr";

type Profile = {
  id: string;
  code: string;
  name: string;
  designation: string | null;
  status: string;
  joiningDate: string | null;
  phone: string | null;
  personalEmail: string | null;
  address: string | null;
  emergencyContact: string | null;
  panMasked: string | null;
  aadhaarMasked: string | null;
  bankAccountMasked: string | null;
  bankName: string | null;
  ifsc: string | null;
  uan: string | null;
  esicNo: string | null;
  department: { name: string } | null;
  branch: { name: string } | null;
  shift: { code: string; name: string; startTime: string; endTime: string } | null;
  manager: { name: string } | null;
  documents: Array<{ id: string; type: string; name: string; fileName: string; expiresAt: string | null }>;
  assets: Array<{ id: string; code: string; name: string }>;
};
type LeaveData = { requests: Parameters<typeof LeaveTable>[0]["rows"]; balances: Parameters<typeof BalanceTable>[0]["types"]; policy: { name: string } | null; holidays: Array<{ id: string; date: string; name: string; optional: boolean }> };
type AttendanceData = { rows: Parameters<typeof AttendanceTable>[0]["rows"]; corrections: Parameters<typeof CorrectionTable>[0]["rows"] };

export function MyHr() {
  const profile = useApi<Profile>("/me/employee");
  const team = useApi<{ reports: unknown[] }>(profile.data ? "/me/team" : null);
  const [tab, setTab] = useState("today");
  if (profile.error) return <Notice tone="info">{profile.error.message}</Notice>;
  if (!profile.data) return null;
  const tabs = [
    { key: "today", label: "Today" },
    { key: "attendance", label: "Attendance" },
    { key: "leave", label: "Leave" },
    { key: "expenses", label: "Expenses" },
    { key: "pay", label: "Payslips" },
    { key: "tax", label: "Tax" },
    { key: "goals", label: "Goals" },
    { key: "profile", label: "Profile" },
    ...(team.data?.reports.length ? [{ key: "team", label: `My team (${team.data.reports.length})` }] : []),
  ];
  return (
    <div className="space-y-4">
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === "today" ? <Today profile={profile.data} /> : null}
      {tab === "attendance" ? <MyAttendance /> : null}
      {tab === "leave" ? <MyLeave /> : null}
      {tab === "expenses" ? <MyExpenses /> : null}
      {tab === "pay" ? <MyPay /> : null}
      {tab === "tax" ? <MyTax /> : null}
      {tab === "goals" ? <MyGoals /> : null}
      {tab === "profile" ? <MyProfile profile={profile.data} /> : null}
      {tab === "team" ? <MyTeam /> : null}
    </div>
  );
}

function Today({ profile }: { profile: Profile }) {
  const day = todayKey();
  const attendance = useApi<AttendanceData>(`/me/attendance?fromDate=${day}&toDate=${day}`);
  const leave = useApi<LeaveData>("/me/leave");
  const punch = useAction<Record<string, unknown>, unknown>(["/me"]);
  const [locating, setLocating] = useState(false);
  const row = attendance.data?.rows[0];
  async function doPunch() {
    setLocating(true);
    const position = await new Promise<GeolocationPosition | null>((resolve) => {
      if (!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(resolve, () => resolve(null), { timeout: 8000, maximumAge: 60_000 });
    });
    setLocating(false);
    await punch.submit({ path: "/me/attendance/punch", body: position ? { latitude: position.coords.latitude, longitude: position.coords.longitude } : {} });
  }
  const upcoming = (leave.data?.holidays || []).filter((holiday) => holiday.date.slice(0, 10) >= day).slice(0, 4);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={`Good day, ${profile.name.split(" ")[0]}`} description={profile.shift ? `${profile.shift.name} shift ${profile.shift.startTime}–${profile.shift.endTime}` : undefined} />
        <CardBody>
          <div className="flex flex-wrap items-center gap-4">
            <MiniStat label="Checked in" value={clock(row?.checkIn)} />
            <MiniStat label="Checked out" value={clock(row?.checkOut)} />
            <MiniStat label="Worked" value={hours(row?.workedMinutes || 0)} />
            <div className="ml-auto flex items-center gap-2">
              {row ? <StatusBadge status={row.status} /> : null}
              <Button size="lg" loading={punch.isPending || locating} onClick={doPunch}>{row?.checkIn ? <><LogOut /> Punch out</> : <><LogIn /> Punch in</>}</Button>
            </div>
          </div>
          {punch.error ? <ErrorNote>{punch.error.message}</ErrorNote> : null}
        </CardBody>
      </Card>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Leave balance" />
          <BalanceTable types={leave.data?.balances || []} />
        </Card>
        <Card>
          <CardHeader title="Upcoming holidays" />
          <CardBody>
            {upcoming.length ? (
              <ul className="space-y-1 text-sm">{upcoming.map((holiday) => <li key={holiday.id}>{formatDate(holiday.date)} · {holiday.name} {holiday.optional ? <Badge>Optional</Badge> : null}</li>)}</ul>
            ) : (
              <p className="text-sm text-muted">No more holidays this year.</p>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

function MyAttendance() {
  const [fromDate, setFrom] = useState(monthStart);
  const [toDate, setTo] = useState(todayKey);
  const [correcting, setCorrecting] = useState(false);
  const { data, error, isLoading } = useApi<AttendanceData>(`/me/attendance?fromDate=${fromDate}&toDate=${toDate}`, { keepPrevious: true });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><TextInput type="date" value={fromDate} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={toDate} onChange={(event) => setTo(event.target.value)} /></Field>
        <Button variant="outline" onClick={() => setCorrecting(true)}><Plus /> Regularize a day</Button>
      </div>
      <QueryError error={error} />
      {data?.corrections.length ? (
        <Card>
          <CardHeader title="My regularization requests" />
          <CorrectionTable rows={data.corrections} />
        </Card>
      ) : null}
      <Card><AttendanceTable rows={data?.rows || []} loading={isLoading} /></Card>
      {correcting ? <CorrectionModal onClose={() => setCorrecting(false)} /> : null}
    </div>
  );
}

function CorrectionModal({ onClose }: { onClose: () => void }) {
  const action = useAction<Record<string, unknown>, unknown>(["/me"]);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title="Regularize attendance" description="Your manager approves; the corrected times replace that day's punches.">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await action.submit({ path: "/me/attendance/corrections", body: formValues(event.currentTarget) })) onClose();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Day"><TextInput type="date" name="day" required max={todayKey()} /></Field>
          <Field label="Actual in"><TextInput type="time" name="checkIn" /></Field>
          <Field label="Actual out"><TextInput type="time" name="checkOut" /></Field>
        </div>
        <Field label="Reason"><TextInput name="reason" required minLength={5} placeholder="Forgot to punch, on client site…" /></Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Submit</Button></div>
      </form>
    </Modal>
  );
}

function MyLeave() {
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const { data, error, isLoading } = useApi<LeaveData>(`/me/leave?year=${year}`, { keepPrevious: true });
  const action = useAction<Record<string, unknown>, unknown>(["/me"]);
  const [applying, setApplying] = useState(false);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Year"><TextInput type="number" value={year} onChange={(event) => setYear(event.target.value)} className="w-24" /></Field>
        <Button onClick={() => setApplying(true)}><Plus /> Apply for leave</Button>
      </div>
      <QueryError error={error} />
      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      <Card>
        <CardHeader title="Balance" description={data?.policy ? `Policy: ${data.policy.name}` : undefined} />
        <BalanceTable types={data?.balances || []} />
      </Card>
      <Card>
        <CardHeader title="My requests" />
        <LeaveTable rows={data?.requests || []} loading={isLoading} onCancel={(row) => window.confirm("Cancel this leave request?") && action.submit({ path: `/me/leave/${row.id}/cancel`, body: {} })} />
      </Card>
      {applying ? <ApplyLeaveModal onClose={() => setApplying(false)} path="/me/leave" types={(data?.balances || []).map((type) => ({ code: type.code, name: type.name, available: type.available }))} /> : null}
    </div>
  );
}

function MyExpenses() {
  const { data, error, isLoading } = useApi<Array<{ id: string; number: string; category: string; amount: string | number; description: string | null; spentOn: string | null; status: string; createdAt: string }>>("/me/expenses");
  const action = useAction<Record<string, unknown>, unknown>(["/me", "/expenses"]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Claim an expense" description="Goes to your manager, then finance for reimbursement." />
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const body = formValues(form);
              body.amount = Number(body.amount);
              if (await action.submit({ path: "/me/expenses", body })) form.reset();
            }}
          >
            <Field label="Category"><Select name="category" required>{EXPENSE_CATEGORIES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select></Field>
            <Field label="Amount (₹)"><TextInput type="number" min={1} step="0.01" name="amount" required /></Field>
            <Field label="Spent on"><TextInput type="date" name="spentOn" max={todayKey()} /></Field>
            <Field label="Description"><TextInput name="description" className="w-72" /></Field>
            <Button type="submit" loading={action.isPending}><Plus /> Submit</Button>
          </form>
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        </CardBody>
      </Card>
      <Card>
        <QueryError error={error} />
        <DataTable
          rows={data || []}
          loading={isLoading}
          rowKey={(row) => row.id}
          empty="No expense claims."
          columns={[
            { key: "number", header: "Claim", render: (row) => <span className="font-mono text-xs">{row.number}</span> },
            { key: "category", header: "Category", render: (row) => humanize(row.category) },
            { key: "spentOn", header: "Spent on", render: (row) => (row.spentOn ? formatDate(row.spentOn) : "—") },
            { key: "description", header: "Description", render: (row) => <span className="text-muted">{row.description || "—"}</span> },
            { key: "amount", header: "Amount", align: "right", render: (row) => money(row.amount) },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
          ]}
        />
      </Card>
    </div>
  );
}

type Goal = { id: string; title: string; description: string | null; weight: number; target: string | null; progress: number; status: string; cycle: { name: string } | null };
type Appraisal = { id: string; status: string; selfRating: string | null; managerRating: string | null; managerComments: string | null; cycle: { id: string; name: string; status: string; selfDue: string | null } };

function MyGoals() {
  const { data, error } = useApi<{ goals: Goal[]; appraisals: Appraisal[] }>("/me/goals");
  const action = useAction<Record<string, unknown>, unknown>(["/me"]);
  const [selfReview, setSelfReview] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <QueryError error={error} />
      {data?.appraisals.filter((row) => row.status === "SELF" && row.cycle.status === "OPEN").map((row) => (
        <Notice key={row.id} tone="warn">
          Self review for {row.cycle.name} is open{row.cycle.selfDue ? ` (due ${formatDate(row.cycle.selfDue)})` : ""}. <Button size="sm" variant="outline" onClick={() => setSelfReview(row.id)}>Write self review</Button>
        </Notice>
      ))}
      <Card>
        <CardHeader title="Add a goal" />
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const body = formValues(form);
              if (body.weight) body.weight = Number(body.weight);
              if (await action.submit({ path: "/me/goals", body })) form.reset();
            }}
          >
            <Field label="Goal"><TextInput name="title" required minLength={3} className="w-80" /></Field>
            <Field label="Target / measure"><TextInput name="target" /></Field>
            <Field label="Weight %"><TextInput type="number" name="weight" min={0} max={100} className="w-20" /></Field>
            <Button type="submit" variant="outline" loading={action.isPending}><Plus /> Add</Button>
          </form>
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        </CardBody>
      </Card>
      <Card>
        <DataTable
          rows={data?.goals || []}
          rowKey={(row) => row.id}
          empty="No goals yet."
          columns={[
            { key: "title", header: "Goal", render: (row) => <div><p className="font-medium">{row.title}</p><p className="text-2xs text-muted">{[row.target, row.cycle?.name].filter(Boolean).join(" · ")}</p></div> },
            { key: "weight", header: "Weight", align: "right", render: (row) => (row.weight ? `${row.weight}%` : "—") },
            {
              key: "progress",
              header: "Progress",
              render: (row) => (
                <Select value={String(row.progress)} onChange={(event) => action.submit({ path: `/me/goals/${row.id}`, method: "PATCH", body: { progress: Number(event.target.value), status: Number(event.target.value) === 100 ? "DONE" : "ACTIVE" } })}>
                  {[0, 10, 25, 50, 75, 90, 100].map((value) => <option key={value} value={value}>{value}%</option>)}
                </Select>
              ),
            },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
          ]}
        />
      </Card>
      {data?.appraisals.length ? (
        <Card>
          <CardHeader title="Appraisals" />
          <DataTable
            rows={data.appraisals}
            rowKey={(row) => row.id}
            columns={[
              { key: "cycle", header: "Cycle", render: (row) => row.cycle.name },
              { key: "status", header: "Stage", render: (row) => <StatusBadge status={row.status} /> },
              { key: "self", header: "Self", align: "right", render: (row) => (row.selfRating ? Number(row.selfRating) : "—") },
              { key: "final", header: "Final", align: "right", render: (row) => (row.status === "DONE" && row.managerRating ? Number(row.managerRating) : "—") },
              { key: "comments", header: "Manager comments", render: (row) => <span className="text-muted">{row.status === "DONE" ? row.managerComments || "—" : "—"}</span> },
            ]}
          />
        </Card>
      ) : null}
      {selfReview ? <ReviewModal path={`/me/appraisals/${selfReview}/self`} title="Self review" onClose={() => setSelfReview(null)} /> : null}
    </div>
  );
}

function MyProfile({ profile }: { profile: Profile }) {
  const action = useAction<Record<string, unknown>, unknown>(["/me"]);
  const [saved, setSaved] = useState(false);
  const facts: Array<[string, string | null | undefined]> = [
    ["Employee code", profile.code],
    ["Designation", profile.designation],
    ["Department", profile.department?.name],
    ["Branch", profile.branch?.name],
    ["Reports to", profile.manager?.name],
    ["Joined", profile.joiningDate ? formatDate(profile.joiningDate) : null],
    ["PAN", profile.panMasked],
    ["Aadhaar", profile.aadhaarMasked],
    ["UAN", profile.uan],
    ["ESIC", profile.esicNo],
    ["Bank", profile.bankName ? `${profile.bankName} ${profile.bankAccountMasked || ""} ${profile.ifsc || ""}` : null],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader title="Employment" description="Ask HR to correct anything here." />
        <CardBody>
          <dl className="grid grid-cols-2 gap-2 text-sm">{facts.map(([label, value]) => <div key={label}><dt className="text-2xs uppercase text-muted">{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="Contact details" />
        <CardBody>
          <form
            className="space-y-3"
            onSubmit={async (event) => {
              event.preventDefault();
              setSaved(false);
              if (await action.submit({ path: "/me/employee", method: "PATCH", body: formValues(event.currentTarget, { keepBlank: ["phone", "personalEmail", "address", "emergencyContact"] }) })) setSaved(true);
            }}
          >
            <Field label="Mobile"><TextInput name="phone" defaultValue={profile.phone || ""} /></Field>
            <Field label="Personal email"><TextInput type="email" name="personalEmail" defaultValue={profile.personalEmail || ""} /></Field>
            <Field label="Address"><TextInput name="address" defaultValue={profile.address || ""} /></Field>
            <Field label="Emergency contact"><TextInput name="emergencyContact" defaultValue={profile.emergencyContact || ""} /></Field>
            {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
            {saved ? <Notice tone="good">Saved.</Notice> : null}
            <Button type="submit" loading={action.isPending}>Save</Button>
          </form>
        </CardBody>
      </Card>
      <Card>
        <CardHeader title="My documents" />
        <DataTable
          rows={profile.documents}
          rowKey={(row) => row.id}
          empty="No documents on file."
          columns={[
            { key: "type", header: "Type", render: (row) => humanize(row.type) },
            { key: "name", header: "Title", render: (row) => row.name },
            { key: "expires", header: "Expires", render: (row) => (row.expiresAt ? formatDate(row.expiresAt) : "—") },
            { key: "file", header: "", align: "right", render: (row) => <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={() => download(`/me/documents/${row.id}/file`, row.fileName)}><Download /></Button> },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Assets with me" />
        <CardBody>{profile.assets.length ? <ul className="text-sm">{profile.assets.map((asset) => <li key={asset.id}>{asset.code} · {asset.name}</li>)}</ul> : <p className="text-sm text-muted">None.</p>}</CardBody>
      </Card>
    </div>
  );
}

type TeamData = {
  reports: Array<{ id: string; code: string; name: string; designation: string | null; today: { status: string; checkIn: string | null } | null }>;
  leave: Parameters<typeof LeaveTable>[0]["rows"];
  corrections: Parameters<typeof CorrectionTable>[0]["rows"];
  appraisals: Array<{ id: string; employee: { name: string }; cycle: { name: string }; selfRating: string | null }>;
};

function MyTeam() {
  const { data, error } = useApi<TeamData>("/me/team");
  const action = useAction<Record<string, unknown>, unknown>(["/me"]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <QueryError error={error} />
      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      <Card>
        <CardHeader title="Leave to approve" />
        <LeaveTable rows={data?.leave || []} showEmployee onDecide={(row, decision) => action.submit({ path: `/me/team/leave/${row.id}/decide`, body: { status: decision } })} />
      </Card>
      {data?.corrections.length ? (
        <Card>
          <CardHeader title="Attendance corrections to approve" />
          <CorrectionTable rows={data.corrections} showEmployee onDecide={(row, decision) => action.submit({ path: `/me/team/corrections/${row.id}/decide`, body: { status: decision } })} />
        </Card>
      ) : null}
      {data?.appraisals.length ? (
        <Card>
          <CardHeader title="Appraisals awaiting your review" />
          <DataTable
            rows={data.appraisals}
            rowKey={(row) => row.id}
            columns={[
              { key: "employee", header: "Employee", render: (row) => row.employee.name },
              { key: "cycle", header: "Cycle", render: (row) => row.cycle.name },
              { key: "self", header: "Self rating", align: "right", render: (row) => (row.selfRating ? Number(row.selfRating) : "—") },
              { key: "actions", header: "", align: "right", render: (row) => <Button size="sm" variant="outline" onClick={() => setReviewing(row.id)}>Review</Button> },
            ]}
          />
        </Card>
      ) : null}
      <Card>
        <CardHeader title="Team today" />
        <DataTable
          rows={data?.reports || []}
          rowKey={(row) => row.id}
          columns={[
            { key: "name", header: "Name", render: (row) => <div><p className="font-medium">{row.name}</p><p className="text-2xs text-muted">{row.designation || row.code}</p></div> },
            { key: "status", header: "Today", render: (row) => (row.today ? <StatusBadge status={row.today.status} /> : <span className="text-muted">Not marked</span>) },
            { key: "in", header: "In", render: (row) => clock(row.today?.checkIn) },
          ]}
        />
      </Card>
      {reviewing ? <ReviewModal path={`/me/team/appraisals/${reviewing}/review`} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}

type MyPayslip = { id: string; period: string; status: string; gross: string | number; totalDeductions: string | number; reimbursements: string | number; net: string | number; paidDays: string | number; lopDays: string | number; tds: string | number; paidAt: string | null; run: { kind: string; number: string } };
type MySalary = { structure: string; annualCtc: number; effectiveFrom: string; breakdown: { lines: Array<{ code: string; name: string; kind: string; amount: number }>; gross: number; employerPf: number; employerEsi: number; ctc: number } } | null;

function MyPay() {
  const slips = useApi<MyPayslip[]>("/me/payslips");
  const salary = useApi<MySalary>("/me/salary");
  const month = (period: string) => new Date(`${period}-01T00:00:00Z`).toLocaleDateString("en-IN", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Payslips" />
        <QueryError error={slips.error} />
        <DataTable
          rows={slips.data || []}
          loading={slips.isLoading}
          rowKey={(row) => row.id}
          empty="No payslips yet."
          columns={[
            { key: "period", header: "Month", render: (row) => <span>{month(row.period)} {row.run.kind === "FNF" ? <Badge tone="warn">Full &amp; final</Badge> : null}</span> },
            { key: "days", header: "Paid days", align: "right", render: (row) => `${Number(row.paidDays)}${Number(row.lopDays) ? ` (LOP ${Number(row.lopDays)})` : ""}` },
            { key: "gross", header: "Gross", align: "right", render: (row) => money(row.gross) },
            { key: "ded", header: "Deductions", align: "right", render: (row) => money(row.totalDeductions) },
            { key: "net", header: "Net pay", align: "right", render: (row) => <span className="font-semibold">{money(Number(row.net))}</span> },
            { key: "status", header: "", render: (row) => <StatusBadge status={row.status} /> },
            { key: "pdf", header: "", align: "right", render: (row) => <Button size="icon-sm" variant="ghost" aria-label="Download payslip" onClick={() => download(`/me/payslips/${row.id}/pdf`, `Payslip-${row.period}.pdf`)}><Download /></Button> },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="My salary" description={salary.data ? `${salary.data.structure} · since ${formatDate(salary.data.effectiveFrom)}` : undefined} />
        <CardBody>
          {salary.data ? (
            <dl className="grid grid-cols-2 gap-1 text-sm">
              <dt className="font-semibold">Annual CTC</dt><dd className="text-right font-semibold">{money(salary.data.annualCtc)}</dd>
              {salary.data.breakdown.lines.map((line) => <div key={line.code} className="contents"><dt>{line.name}</dt><dd className="text-right tabular-nums">{money(line.amount)}/mo</dd></div>)}
              <dt className="text-muted">Monthly gross</dt><dd className="text-right">{money(salary.data.breakdown.gross)}</dd>
              <dt className="text-muted">Employer PF / ESI</dt><dd className="text-right">{money(salary.data.breakdown.employerPf)} / {money(salary.data.breakdown.employerEsi)}</dd>
            </dl>
          ) : (
            <p className="text-sm text-muted">Not set up yet.</p>
          )}
        </CardBody>
      </Card>
    </div>
  );
}

type MyDeclaration = { fy: string; regime: string; projection: Record<string, unknown> | null; declaration: { status: string; items: Record<string, unknown>; verified: Record<string, unknown> | null; note: string | null; submittedAt: string | null } | null };

function MyTax() {
  const [fy, setFy] = useState(currentFy);
  const { data, error } = useApi<MyDeclaration>(`/me/tax-declaration?fy=${fy}`, { keepPrevious: true });
  const action = useAction<Record<string, unknown>, unknown>(["/me"]);
  const [regime, setRegime] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const activeRegime = regime || data?.regime || "NEW";
  const locked = data?.declaration?.status === "VERIFIED";
  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Card className="lg:col-span-2">
        <CardHeader title="Investment declaration" description="Payroll uses this to work out monthly TDS. Submit proofs to HR by January; verified amounts then apply." action={<TextInput aria-label="Financial year" value={fy} onChange={(event) => { setFy(event.target.value); setRegime(null); }} className="w-28" />} />
        <CardBody>
          <QueryError error={error} />
          {data ? (
            <form
              key={`${fy}-${data.declaration?.status || "new"}`}
              className="space-y-3"
              onSubmit={async (event) => {
                event.preventDefault();
                setSaved(null);
                const submit = (event.nativeEvent as SubmitEvent).submitter?.getAttribute("value") === "submit";
                if (await action.submit({ path: "/me/tax-declaration", method: "PUT", body: { fy, regime: activeRegime, items: declarationItems(event.currentTarget), submit } })) setSaved(submit ? "Submitted to payroll." : "Saved as draft.");
              }}
            >
              <div className="flex flex-wrap items-center gap-3">
                <Field label="Tax regime">
                  <Select value={activeRegime} onChange={(event) => setRegime(event.target.value)} disabled={locked}>
                    <option value="NEW">New regime (default, lower rates, few deductions)</option>
                    <option value="OLD">Old regime (HRA, 80C, 80D and other deductions)</option>
                  </Select>
                </Field>
                {data.declaration ? <StatusBadge status={data.declaration.status} /> : null}
              </div>
              {data.declaration?.note ? <Notice tone="info">Payroll: {data.declaration.note}</Notice> : null}
              <DeclarationFields items={data.declaration?.items || {}} regime={activeRegime} disabled={locked} />
              {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
              {saved ? <Notice tone="good">{saved}</Notice> : null}
              {!locked ? (
                <div className="flex gap-2">
                  <Button type="submit" variant="outline" value="draft" loading={action.isPending}>Save draft</Button>
                  <Button type="submit" value="submit" loading={action.isPending}>Submit</Button>
                </div>
              ) : null}
            </form>
          ) : null}
        </CardBody>
      </Card>
      <div className="space-y-4">
        <Card>
          <CardHeader title="Tax this year" description="From your latest payslip." />
          <CardBody>{data?.projection ? <TaxProjection projection={data.projection} /> : <p className="text-sm text-muted">Appears after your first payslip.</p>}</CardBody>
        </Card>
        <Card>
          <CardHeader title="Form 16" />
          <CardBody>
            <Button variant="outline" onClick={() => download(`/me/form16?fy=${fy}`, `Form16-${fy}.pdf`)}><Download /> Part B for {fy}</Button>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}