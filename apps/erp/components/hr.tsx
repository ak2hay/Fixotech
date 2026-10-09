"use client";

import { Avatar, Badge, Button, Card, CardBody, CardHeader, DataTable, ErrorNote, Field, MiniStat, Modal, Notice, Select, Tabs, TextInput, formatDate, humanize, money } from "@fixotec/ui";
import { DOCUMENT_TYPES, EMPLOYMENT_TYPES, TASK_OWNERS } from "@fixotec/shared";
import { Download, Eye, Hammer, Lock, Plus, Search, Trash2, Upload } from "lucide-react";
import { useMemo, useState } from "react";
import { download } from "../lib/api";
import { useAction, useApi } from "../lib/query";
import { allowed, useSession } from "../lib/session";
import { QueryError } from "./common";

type Option = { id: string; code?: string; name: string };
export type Lookups = {
  branches: Option[];
  departments: Option[];
  shifts: Array<Option & { startTime: string; endTime: string }>;
  policies: Array<{ id: string; name: string; isDefault: boolean; types: Array<{ code: string; name: string }> }>;
  users: Array<{ id: string; name: string; email: string; linked: boolean }>;
  employees: Array<{ id: string; code: string; name: string }>;
  cycles: Array<{ id: string; name: string; status: string }>;
};
type Employee = {
  id: string;
  code: string;
  name: string;
  status: string;
  active: boolean;
  designation: string | null;
  employmentType: string;
  joiningDate: string | null;
  salary?: number | string | null;
  departmentId: string | null;
  branchId: string | null;
  managerId: string | null;
  userId: string | null;
  shiftId: string | null;
  leavePolicyId: string | null;
  department?: { name: string } | null;
  branch?: { name: string } | null;
  shift?: { code: string; name: string } | null;
  user?: { email: string } | null;
  dob: string | null;
  gender: string | null;
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
  pfApplicable: boolean;
  esiApplicable: boolean;
  ptApplicable: boolean;
  taxRegime: string;
  probationEndDate: string | null;
  confirmationDate: string | null;
  resignationDate: string | null;
  lastWorkingDay: string | null;
  exitReason: string | null;
};
type Doc = { id: string; type: string; name: string; fileName: string; size: number; expiresAt: string | null; createdAt: string };
type Task = { id: string; kind: string; title: string; owner: string; dueDate: string | null; status: string; notes: string | null; employee?: { id: string; name: string; code: string } };
type LeaveType = { code: string; name: string; paid: boolean; opening: number; accrued: number; adjusted: number; encashed: number; used: number; pending: number; balance: number; available: number };
type LeaveSummary = { employee: { id: string; code: string; name: string }; policy: { id: string; name: string } | null; types: LeaveType[] };
type EmployeeDetailData = Employee & { documents: Doc[]; tasks: Task[]; assets: Array<{ id: string; code: string; name: string }>; manager: { name: string } | null; reports: Array<{ id: string; name: string; designation: string | null }>; leave?: LeaveSummary };
type LeaveRow = { id: string; type: string; fromDate: string; toDate: string; days: number | string; halfDay: string | null; status: string; reason: string | null; decisionNote: string | null; createdAt: string; employee?: { id: string; name: string; code: string } };
type AttendanceRow = { id: string; day: string; status: string; checkIn: string | null; checkOut: string | null; workedMinutes: number; lateMinutes: number; overtimeMinutes: number; source: string; locked: boolean; notes: string | null; employee?: { id: string; name: string; code: string } };
type Correction = { id: string; day: string; checkIn: string | null; checkOut: string | null; reason: string; status: string; note: string | null; employee?: { id: string; name: string; code: string } };

export const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "info" | "neutral" | "accent"> = {
  ACTIVE: "good",
  ONBOARDING: "info",
  NOTICE: "warn",
  EXITED: "neutral",
  PENDING: "warn",
  APPROVED: "good",
  REJECTED: "bad",
  CANCELLED: "neutral",
  PRESENT: "good",
  HALF_DAY: "warn",
  ABSENT: "bad",
  LEAVE: "info",
  HOLIDAY: "accent",
  WEEKLY_OFF: "neutral",
  MISS_PUNCH: "warn",
  ON_DUTY: "info",
  DONE: "good",
  NA: "neutral",
  OPEN: "good",
  DRAFT: "neutral",
  CLOSED: "neutral",
  SELF: "info",
  MANAGER: "warn",
  ASSIGNED: "info",
  AVAILABLE: "good",
  PAID: "accent",
  SUBMITTED: "warn",
  VERIFIED: "good",
};
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const todayKey = () => {
  const now = new Date(Date.now() + 330 * 60_000);
  return now.toISOString().slice(0, 10);
};
export const monthStart = () => `${todayKey().slice(0, 8)}01`;
export const clock = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "—");
export const hours = (minutes: number) => (minutes ? `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m` : "—");
const dateOnly = (value: string | null | undefined) => (value ? value.slice(0, 10) : "");

/** Form values as an object. Blank fields are dropped unless listed in `keepBlank` (sent as "" so the API clears them). */
export function formValues(form: HTMLFormElement, options: { booleans?: string[]; keepBlank?: string[] } = {}) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (typeof value !== "string") continue;
    const text = value.trim();
    if (text || options.keepBlank?.includes(key)) out[key] = text;
  }
  for (const key of options.booleans || []) out[key] = (form.elements.namedItem(key) as HTMLInputElement | null)?.checked ?? false;
  return out;
}

export function useLookups() {
  return useApi<Lookups>("/hr/lookups");
}

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] || "neutral"}>{humanize(status)}</Badge>;
}

// ---------- Overview ----------

export function HrOverview() {
  const { data } = useApi<{ headcount: Record<string, number>; today: Record<string, number>; pending: { leave: number; corrections: number; tasks: number }; expiringDocuments: Array<{ id: string; name: string; expiresAt: string; employee: { name: string } }>; probationEnding: Array<{ id: string; name: string; probationEndDate: string }> }>("/hr/summary");
  if (!data) return null;
  const inService = (data.headcount.ACTIVE || 0) + (data.headcount.NOTICE || 0) + (data.headcount.ONBOARDING || 0);
  const present = (data.today.PRESENT || 0) + (data.today.HALF_DAY || 0) + (data.today.ON_DUTY || 0);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <MiniStat label="In service" value={inService} hint={`${data.headcount.ONBOARDING || 0} onboarding · ${data.headcount.NOTICE || 0} on notice`} />
        <MiniStat label="Present today" value={present} hint={`${data.today.ABSENT || 0} absent · ${data.today.LEAVE || 0} on leave`} tone="good" />
        <MiniStat label="Missed punches" value={data.today.MISS_PUNCH || 0} tone="warn" />
        <MiniStat label="Leave to approve" value={data.pending.leave} tone="warn" />
        <MiniStat label="Corrections to approve" value={data.pending.corrections} tone="warn" />
        <MiniStat label="Open checklist tasks" value={data.pending.tasks} tone="info" />
      </div>
      {data.expiringDocuments.length || data.probationEnding.length ? (
        <Notice tone="warn">
          {data.probationEnding.length ? <span>Probation ending in 30 days: {data.probationEnding.map((row) => `${row.name} (${formatDate(row.probationEndDate)})`).join(", ")}. </span> : null}
          {data.expiringDocuments.length ? <span>Documents expiring: {data.expiringDocuments.map((row) => `${row.employee.name} – ${row.name} (${formatDate(row.expiresAt)})`).join(", ")}.</span> : null}
        </Notice>
      ) : null}
    </div>
  );
}

// ---------- Employees ----------

export function Employees() {
  const { session } = useSession();
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, error, isLoading } = useApi<Employee[]>(`/hr/employees${status ? `?status=${status}` : ""}`, { keepPrevious: true });
  const rows = useMemo(() => {
    const term = q.toLowerCase();
    return (data || []).filter((row) => !term || [row.name, row.code, row.designation, row.department?.name, row.branch?.name].some((value) => value?.toLowerCase().includes(term)));
  }, [data, q]);
  const showSalary = allowed(session, "hr.view_salary");
  return (
    <Card>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
        <TextInput icon={<Search />} placeholder="Search people..." value={q} onChange={(event) => setQ(event.target.value)} className="w-72" />
        <Select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">All statuses</option>
          {["ONBOARDING", "ACTIVE", "NOTICE", "EXITED"].map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
        </Select>
        <span className="ml-auto text-xs text-muted">{rows.length} people</span>
        {allowed(session, "hr.create") ? <Button onClick={() => setCreating(true)}><Plus /> Add employee</Button> : null}
      </div>
      <QueryError error={error} />
      <DataTable
        rows={rows}
        loading={isLoading}
        rowKey={(row) => row.id}
        onRowClick={(row) => setOpenId(row.id)}
        empty="No employees."
        columns={[
          { key: "name", header: "Name", sortValue: (row) => row.name, render: (row) => <div className="flex items-center gap-3"><Avatar name={row.name} size="sm" /><div><p className="font-medium">{row.name}</p><p className="text-2xs text-muted">{row.designation || row.user?.email || ""}</p></div></div> },
          { key: "code", header: "Code", render: (row) => <span className="font-mono text-xs">{row.code}</span> },
          { key: "department", header: "Department", sortValue: (row) => row.department?.name || "", render: (row) => row.department?.name || "—" },
          { key: "branch", header: "Branch", render: (row) => <span className="text-muted">{row.branch?.name || "—"}</span> },
          { key: "shift", header: "Shift", render: (row) => row.shift?.code || "—" },
          { key: "joiningDate", header: "Joined", sortValue: (row) => row.joiningDate || "", render: (row) => (row.joiningDate ? formatDate(row.joiningDate) : "—") },
          ...(showSalary ? [{ key: "salary", header: "CTC / month", align: "right" as const, render: (row: Employee) => (row.salary ? money(row.salary) : "—") }] : []),
          { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
        ]}
      />
      {creating ? <EmployeeFormModal onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); setOpenId(id); }} /> : null}
      {openId ? <EmployeeDetail id={openId} onClose={() => setOpenId(null)} /> : null}
    </Card>
  );
}

function EmployeeFields({ initial, lookups, showSalary, create }: { initial?: Partial<Employee>; lookups?: Lookups; showSalary: boolean; create: boolean }) {
  const i = initial || {};
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        {create ? <Field label="Employee code"><TextInput name="code" required maxLength={30} /></Field> : null}
        <Field label="Full name"><TextInput name="name" required defaultValue={i.name} /></Field>
        <Field label="Designation"><TextInput name="designation" defaultValue={i.designation || ""} /></Field>
        <Field label="Employment type">
          <Select name="employmentType" defaultValue={i.employmentType || "PERMANENT"}>{EMPLOYMENT_TYPES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select>
        </Field>
        <Field label="Department">
          <Select name="departmentId" defaultValue={i.departmentId || ""}><option value="">—</option>{lookups?.departments.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
        </Field>
        <Field label="Branch">
          <Select name="branchId" defaultValue={i.branchId || ""}><option value="">—</option>{lookups?.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
        </Field>
        <Field label="Reports to">
          <Select name="managerId" defaultValue={i.managerId || ""}><option value="">—</option>{lookups?.employees.filter((row) => row.id !== i.id).map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}</Select>
        </Field>
        <Field label="ERP login">
          <Select name="userId" defaultValue={i.userId || ""}><option value="">Not linked</option>{lookups?.users.filter((row) => !row.linked || row.id === i.userId).map((row) => <option key={row.id} value={row.id}>{row.name} · {row.email}</option>)}</Select>
        </Field>
        <Field label="Joining date"><TextInput type="date" name="joiningDate" defaultValue={dateOnly(i.joiningDate)} /></Field>
        <Field label="Probation ends"><TextInput type="date" name="probationEndDate" defaultValue={dateOnly(i.probationEndDate)} /></Field>
        <Field label="Confirmed on"><TextInput type="date" name="confirmationDate" defaultValue={dateOnly(i.confirmationDate)} /></Field>
        <Field label="Shift">
          <Select name="shiftId" defaultValue={i.shiftId || ""}><option value="">Default</option>{lookups?.shifts.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.startTime}–{row.endTime}</option>)}</Select>
        </Field>
        <Field label="Leave policy">
          <Select name="leavePolicyId" defaultValue={i.leavePolicyId || ""}><option value="">Branch / company default</option>{lookups?.policies.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
        </Field>
        {showSalary ? <Field label="Monthly CTC (₹)"><TextInput type="number" min={0} step="0.01" name="salary" defaultValue={i.salary ? String(i.salary) : ""} /></Field> : null}
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Personal</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Date of birth"><TextInput type="date" name="dob" defaultValue={dateOnly(i.dob)} /></Field>
        <Field label="Gender">
          <Select name="gender" defaultValue={i.gender || ""}><option value="">—</option><option value="MALE">Male</option><option value="FEMALE">Female</option><option value="OTHER">Other</option></Select>
        </Field>
        <Field label="Mobile"><TextInput name="phone" defaultValue={i.phone || ""} /></Field>
        <Field label="Personal email"><TextInput type="email" name="personalEmail" defaultValue={i.personalEmail || ""} /></Field>
        <Field label="Emergency contact"><TextInput name="emergencyContact" defaultValue={i.emergencyContact || ""} /></Field>
        <Field label="Address"><TextInput name="address" defaultValue={i.address || ""} /></Field>
      </div>
      <p className="text-xs font-semibold uppercase tracking-wide text-muted">Statutory &amp; bank (stored encrypted; leave blank to keep)</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="PAN"><TextInput name="pan" placeholder={i.panMasked || "ABCDE1234F"} maxLength={10} /></Field>
        <Field label="Aadhaar"><TextInput name="aadhaar" placeholder={i.aadhaarMasked || "12 digits"} maxLength={14} /></Field>
        <Field label="UAN (PF)"><TextInput name="uan" defaultValue={i.uan || ""} maxLength={12} /></Field>
        <Field label="ESIC IP number"><TextInput name="esicNo" defaultValue={i.esicNo || ""} maxLength={17} /></Field>
        <Field label="Bank"><TextInput name="bankName" defaultValue={i.bankName || ""} /></Field>
        <Field label="Account number"><TextInput name="bankAccount" placeholder={i.bankAccountMasked || ""} maxLength={18} /></Field>
        <Field label="IFSC"><TextInput name="ifsc" defaultValue={i.ifsc || ""} maxLength={11} /></Field>
        <Field label="Tax regime">
          <Select name="taxRegime" defaultValue={i.taxRegime || "NEW"}><option value="NEW">New regime</option><option value="OLD">Old regime</option></Select>
        </Field>
        <div className="flex flex-wrap items-center gap-4 pt-6 text-sm">
          <label className="flex items-center gap-2"><input type="checkbox" name="pfApplicable" defaultChecked={i.pfApplicable ?? true} /> PF</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="esiApplicable" defaultChecked={i.esiApplicable ?? true} /> ESI</label>
          <label className="flex items-center gap-2"><input type="checkbox" name="ptApplicable" defaultChecked={i.ptApplicable ?? true} /> PT</label>
        </div>
      </div>
    </div>
  );
}

const PROFILE_BLANKS = ["designation", "departmentId", "branchId", "managerId", "userId", "joiningDate", "probationEndDate", "confirmationDate", "dob", "gender", "phone", "personalEmail", "address", "emergencyContact", "uan", "esicNo", "bankName", "ifsc", "shiftId", "leavePolicyId"];
const PROFILE_FLAGS = ["pfApplicable", "esiApplicable", "ptApplicable"];

function profileBody(form: HTMLFormElement, create: boolean) {
  const body = formValues(form, { booleans: PROFILE_FLAGS, keepBlank: create ? [] : PROFILE_BLANKS });
  if (body.salary !== undefined) body.salary = Number(body.salary);
  return body;
}

function EmployeeFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { session } = useSession();
  const lookups = useLookups();
  const action = useAction<Record<string, unknown>, { id: string }>(["/hr"]);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title="Add employee" description="The employee starts in onboarding with the onboarding checklist." className="max-w-4xl">
      <form
        className="space-y-4"
        onSubmit={async (event) => {
          event.preventDefault();
          const row = await action.submit({ path: "/hr/employees", body: profileBody(event.currentTarget, true) });
          if (row) onSaved(row.id);
        }}
      >
        <EmployeeFields lookups={lookups.data} showSalary={allowed(session, "hr.view_salary")} create />
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Create</Button></div>
      </form>
    </Modal>
  );
}

function EmployeeDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { session } = useSession();
  const [tab, setTab] = useState("profile");
  const { data, error } = useApi<EmployeeDetailData>(`/hr/employees/${id}`);
  const lookups = useLookups();
  const action = useAction<unknown, unknown>(["/hr"]);
  const reveal = useAction<unknown, { pan: string | null; aadhaar: string | null; bankAccount: string | null }>([]);
  const [revealed, setRevealed] = useState<{ pan: string | null; aadhaar: string | null; bankAccount: string | null } | null>(null);
  const [saved, setSaved] = useState(false);
  const canEdit = allowed(session, "hr.edit");
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={data ? `${data.name} · ${data.code}` : "Employee"} description={data ? [data.designation, data.department?.name, data.branch?.name].filter(Boolean).join(" · ") : undefined} className="max-w-5xl">
      <QueryError error={error} />
      {data ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={data.status} />
            {data.manager ? <span className="text-xs text-muted">Reports to {data.manager.name}</span> : null}
            {data.reports.length ? <span className="text-xs text-muted">· {data.reports.length} direct report(s)</span> : null}
            <div className="ml-auto flex gap-2">
              {canEdit && data.status === "ONBOARDING" ? <Button size="sm" onClick={() => action.submit({ path: `/hr/employees/${id}/activate` })}>Mark active</Button> : null}
              {allowed(session, "hr.override") ? (
                <Button size="sm" variant="outline" loading={reveal.isPending} onClick={async () => setRevealed((await reveal.submit({ path: `/hr/employees/${id}/reveal` })) || null)}><Eye /> Reveal IDs</Button>
              ) : null}
            </div>
          </div>
          {revealed ? <Notice tone="warn">PAN {revealed.pan || "—"} · Aadhaar {revealed.aadhaar || "—"} · Account {revealed.bankAccount || "—"} (this view was logged)</Notice> : null}
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          <Tabs
            items={[
              { key: "profile", label: "Profile" },
              { key: "documents", label: `Documents (${data.documents.length})` },
              { key: "tasks", label: `Checklist (${data.tasks.filter((task) => task.status === "PENDING").length})` },
              { key: "leave", label: "Leave" },
              { key: "exit", label: "Exit" },
            ]}
            value={tab}
            onChange={setTab}
          />
          {tab === "profile" ? (
            <form
              className="space-y-4"
              onSubmit={async (event) => {
                event.preventDefault();
                setSaved(false);
                const result = await action.submit({ path: `/hr/employees/${id}`, method: "PATCH", body: profileBody(event.currentTarget, false) });
                if (result) setSaved(true);
              }}
            >
              <EmployeeFields initial={data} lookups={lookups.data} showSalary={allowed(session, "hr.view_salary")} create={false} />
              {saved ? <Notice tone="good">Saved.</Notice> : null}
              {canEdit ? <div className="flex justify-end"><Button type="submit" loading={action.isPending}>Save profile</Button></div> : null}
            </form>
          ) : null}
          {tab === "documents" ? <EmployeeDocuments employeeId={id} documents={data.documents} canEdit={canEdit} canDelete={allowed(session, "hr.delete")} /> : null}
          {tab === "tasks" ? <TaskList tasks={data.tasks} canEdit={canEdit} /> : null}
          {tab === "leave" ? <BalanceTable types={data.leave?.types || []} policy={data.leave?.policy?.name} /> : null}
          {tab === "exit" ? <ExitPanel employee={data} /> : null}
        </div>
      ) : null}
    </Modal>
  );
}

function EmployeeDocuments({ employeeId, documents, canEdit, canDelete }: { employeeId: string; documents: Doc[]; canEdit: boolean; canDelete: boolean }) {
  const upload = useAction<FormData, unknown>(["/hr"]);
  const remove = useAction<unknown, unknown>(["/hr"]);
  return (
    <div className="space-y-3">
      {canEdit ? (
        <form
          className="flex flex-wrap items-end gap-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const form = event.currentTarget;
            if (await upload.submit({ path: `/hr/employees/${employeeId}/documents`, body: new FormData(form) })) form.reset();
          }}
        >
          <Field label="Type"><Select name="type" required>{DOCUMENT_TYPES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}</Select></Field>
          <Field label="Title"><TextInput name="name" required minLength={2} /></Field>
          <Field label="Expires"><TextInput type="date" name="expiresAt" /></Field>
          <Field label="File (PDF, image, DOCX · 10 MB)"><input type="file" name="file" required accept=".pdf,.png,.jpg,.jpeg,.webp,.docx" className="text-sm" /></Field>
          <Button type="submit" variant="outline" loading={upload.isPending}><Upload /> Upload</Button>
        </form>
      ) : null}
      {upload.error ? <ErrorNote>{upload.error.message}</ErrorNote> : null}
      {remove.error ? <ErrorNote>{remove.error.message}</ErrorNote> : null}
      <DataTable
        rows={documents}
        rowKey={(row) => row.id}
        empty="No documents uploaded."
        columns={[
          { key: "type", header: "Type", render: (row) => humanize(row.type) },
          { key: "name", header: "Title", render: (row) => <div><p className="font-medium">{row.name}</p><p className="text-2xs text-muted">{row.fileName} · {Math.round(row.size / 1024)} KB</p></div> },
          { key: "expiresAt", header: "Expires", render: (row) => (row.expiresAt ? formatDate(row.expiresAt) : "—") },
          { key: "createdAt", header: "Uploaded", render: (row) => formatDate(row.createdAt) },
          {
            key: "actions",
            header: "",
            align: "right",
            render: (row) => (
              <div className="flex justify-end gap-1">
                <Button size="icon-sm" variant="ghost" aria-label="Download" onClick={() => download(`/hr/documents/${row.id}/file`, row.fileName)}><Download /></Button>
                {canDelete ? <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => window.confirm(`Delete ${row.name}?`) && remove.submit({ path: `/hr/documents/${row.id}`, method: "DELETE" })}><Trash2 /></Button> : null}
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

export function TaskList({ tasks, canEdit, showEmployee }: { tasks: Task[]; canEdit: boolean; showEmployee?: boolean }) {
  const action = useAction<{ status: string }, unknown>(["/hr"]);
  return (
    <>
      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      <DataTable
        rows={tasks}
        rowKey={(row) => row.id}
        empty="No checklist tasks."
        columns={[
          ...(showEmployee ? [{ key: "employee", header: "Employee", render: (row: Task) => row.employee?.name || "—" }] : []),
          { key: "kind", header: "Checklist", render: (row) => humanize(row.kind) },
          { key: "title", header: "Task", render: (row) => row.title },
          { key: "owner", header: "Owner", render: (row) => humanize(row.owner) },
          { key: "dueDate", header: "Due", render: (row) => (row.dueDate ? formatDate(row.dueDate) : "—") },
          { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
          {
            key: "actions",
            header: "",
            align: "right",
            render: (row) =>
              canEdit ? (
                <div className="flex justify-end gap-1">
                  {row.status !== "DONE" ? <Button size="sm" variant="outline" onClick={() => action.submit({ path: `/hr/tasks/${row.id}`, method: "PATCH", body: { status: "DONE" } })}>Done</Button> : null}
                  {row.status === "PENDING" ? <Button size="sm" variant="ghost" onClick={() => action.submit({ path: `/hr/tasks/${row.id}`, method: "PATCH", body: { status: "NA" } })}>N/A</Button> : <Button size="sm" variant="ghost" onClick={() => action.submit({ path: `/hr/tasks/${row.id}`, method: "PATCH", body: { status: "PENDING" } })}>Reopen</Button>}
                </div>
              ) : null,
          },
        ]}
      />
    </>
  );
}

export function BalanceTable({ types, policy }: { types: LeaveType[]; policy?: string | null }) {
  return (
    <div className="space-y-2">
      {policy ? <p className="text-xs text-muted">Policy: {policy}</p> : null}
      <DataTable
        rows={types}
        rowKey={(row) => row.code}
        empty="No leave policy applies."
        columns={[
          { key: "name", header: "Leave", render: (row) => <span>{row.name} <span className="text-2xs text-muted">{row.code}{row.paid ? "" : " · unpaid"}</span></span> },
          { key: "opening", header: "Opening", align: "right", render: (row) => row.opening },
          { key: "accrued", header: "Accrued", align: "right", render: (row) => row.accrued },
          { key: "adjusted", header: "Adjusted", align: "right", render: (row) => row.adjusted },
          { key: "used", header: "Taken", align: "right", render: (row) => row.used },
          { key: "pending", header: "Pending", align: "right", render: (row) => row.pending },
          { key: "available", header: "Available", align: "right", render: (row) => <span className="font-semibold">{row.available}</span> },
        ]}
      />
    </div>
  );
}

function ExitPanel({ employee }: { employee: EmployeeDetailData }) {
  const { session } = useSession();
  const action = useAction<Record<string, unknown>, unknown>(["/hr"]);
  const openTasks = employee.tasks.filter((task) => task.kind === "EXIT" && task.status === "PENDING").length;
  if (employee.status === "EXITED") return <Notice tone="info">Exited{employee.lastWorkingDay ? ` on ${formatDate(employee.lastWorkingDay)}` : ""}. {employee.exitReason || ""}</Notice>;
  if (employee.status === "NOTICE")
    return (
      <div className="space-y-3">
        <Notice tone="warn">Resigned {employee.resignationDate ? formatDate(employee.resignationDate) : ""}; last working day {employee.lastWorkingDay ? formatDate(employee.lastWorkingDay) : "—"}. {openTasks} exit task(s) open, {employee.assets.length} asset(s) assigned.</Notice>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex flex-wrap gap-2">
          {allowed(session, "hr.approve") ? <Button onClick={() => window.confirm("Relieve this employee? Their ERP login is disabled.") && action.submit({ path: `/hr/employees/${employee.id}/relieve`, body: {} })}>Relieve</Button> : null}
          {allowed(session, "hr.override") && (openTasks || employee.assets.length) ? <Button variant="outline" onClick={() => window.confirm("Relieve with open tasks or assets?") && action.submit({ path: `/hr/employees/${employee.id}/relieve`, body: { force: true } })}>Relieve anyway</Button> : null}
          {allowed(session, "hr.edit") ? <Button variant="ghost" onClick={() => action.submit({ path: `/hr/employees/${employee.id}/withdraw-exit` })}>Withdraw resignation</Button> : null}
        </div>
      </div>
    );
  if (!allowed(session, "hr.edit")) return <p className="text-sm text-muted">No exit in progress.</p>;
  return (
    <form
      className="grid gap-3 sm:grid-cols-3"
      onSubmit={async (event) => {
        event.preventDefault();
        await action.submit({ path: `/hr/employees/${employee.id}/exit`, body: formValues(event.currentTarget) });
      }}
    >
      <Field label="Resignation date"><TextInput type="date" name="resignationDate" required defaultValue={todayKey()} /></Field>
      <Field label="Last working day"><TextInput type="date" name="lastWorkingDay" required /></Field>
      <Field label="Reason"><TextInput name="reason" required minLength={3} /></Field>
      {action.error ? <div className="sm:col-span-3"><ErrorNote>{action.error.message}</ErrorNote></div> : null}
      <div className="sm:col-span-3"><Button type="submit" loading={action.isPending}>Start exit</Button></div>
    </form>
  );
}

// ---------- Leave ----------

export function LeaveAdmin() {
  const { session } = useSession();
  const [status, setStatus] = useState("PENDING");
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [applying, setApplying] = useState(false);
  const requests = useApi<LeaveRow[]>(`/hr/leave${status ? `?status=${status}` : ""}`, { keepPrevious: true });
  const balances = useApi<LeaveSummary[]>(`/hr/leave/balances?year=${year}`, { keepPrevious: true });
  const action = useAction<Record<string, unknown>, { carried?: number; lapsed?: unknown[] }>(["/hr"]);
  const [message, setMessage] = useState("");
  const types = useMemo(() => [...new Set((balances.data || []).flatMap((row) => row.types.map((type) => type.code)))], [balances.data]);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader
          title="Leave requests"
          action={
            <div className="flex gap-2">
              <Select value={status} onChange={(event) => setStatus(event.target.value)}>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
                <option value="CANCELLED">Cancelled</option>
                <option value="">All</option>
              </Select>
              {allowed(session, "hr.create") ? <Button variant="outline" onClick={() => setApplying(true)}><Plus /> Record leave</Button> : null}
            </div>
          }
        />
        <QueryError error={requests.error} />
        {action.error ? <div className="px-4"><ErrorNote>{action.error.message}</ErrorNote></div> : null}
        <LeaveTable
          rows={requests.data || []}
          loading={requests.isLoading}
          showEmployee
          onDecide={allowed(session, "hr.approve") ? (row, decision) => action.submit({ path: `/hr/leave/${row.id}/decide`, body: { status: decision } }) : undefined}
          onCancel={allowed(session, "hr.edit") ? (row) => window.confirm("Cancel this leave?") && action.submit({ path: `/hr/leave/${row.id}/cancel`, body: {} }) : undefined}
        />
      </Card>
      <Card>
        <CardHeader
          title="Leave balances"
          action={
            <div className="flex gap-2">
              <TextInput type="number" value={year} onChange={(event) => setYear(event.target.value)} className="w-24" />
              {allowed(session, "hr.approve") ? (
                <Button
                  variant="outline"
                  onClick={async () => {
                    if (!window.confirm(`Carry ${year} closing balances into ${Number(year) + 1}?`)) return;
                    const result = await action.submit({ path: "/hr/leave/year-end", body: { year: Number(year) } });
                    if (result) setMessage(`Carried forward ${result.carried} balance(s); ${result.lapsed?.length || 0} lapsed beyond the carry-forward limit.`);
                  }}
                >
                  Year-end carry forward
                </Button>
              ) : null}
            </div>
          }
        />
        {message ? <div className="px-4"><Notice tone="good">{message}</Notice></div> : null}
        <QueryError error={balances.error} />
        <DataTable
          rows={balances.data || []}
          loading={balances.isLoading}
          rowKey={(row) => row.employee.id}
          empty="No employees."
          columns={[
            { key: "employee", header: "Employee", sortValue: (row) => row.employee.name, render: (row) => <div><p className="font-medium">{row.employee.name}</p><p className="text-2xs text-muted">{row.employee.code} · {row.policy?.name || "no policy"}</p></div> },
            ...types.map((code) => ({
              key: code,
              header: code,
              align: "right" as const,
              render: (row: LeaveSummary) => {
                const type = row.types.find((item) => item.code === code);
                return type ? <span title={`Opening ${type.opening} + accrued ${type.accrued} + adjusted ${type.adjusted} − taken ${type.used}; ${type.pending} pending`}>{type.available}</span> : "—";
              },
            })),
          ]}
        />
      </Card>
      {applying ? <ApplyLeaveModal onClose={() => setApplying(false)} path="/hr/leave" pickEmployee /> : null}
    </div>
  );
}

export function LeaveTable({ rows, loading, showEmployee, onDecide, onCancel }: { rows: LeaveRow[]; loading?: boolean; showEmployee?: boolean; onDecide?: (row: LeaveRow, decision: "APPROVED" | "REJECTED") => void; onCancel?: (row: LeaveRow) => void }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      rowKey={(row) => row.id}
      empty="No leave requests."
      columns={[
        ...(showEmployee ? [{ key: "employee", header: "Employee", render: (row: LeaveRow) => <div><p className="font-medium">{row.employee?.name}</p><p className="text-2xs text-muted">{row.employee?.code}</p></div> }] : []),
        { key: "type", header: "Type", render: (row) => row.type },
        { key: "dates", header: "Dates", render: (row) => `${formatDate(row.fromDate)}${row.toDate.slice(0, 10) !== row.fromDate.slice(0, 10) ? ` – ${formatDate(row.toDate)}` : ""}${row.halfDay ? ` (${humanize(row.halfDay)} half)` : ""}` },
        { key: "days", header: "Days", align: "right", render: (row) => Number(row.days) },
        { key: "reason", header: "Reason", render: (row) => <span className="text-muted">{row.reason || "—"}</span> },
        { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
        {
          key: "actions",
          header: "",
          align: "right",
          render: (row) => (
            <div className="flex justify-end gap-1">
              {onDecide && row.status === "PENDING" ? (
                <>
                  <Button size="sm" onClick={() => onDecide(row, "APPROVED")}>Approve</Button>
                  <Button size="sm" variant="ghost" onClick={() => onDecide(row, "REJECTED")}>Reject</Button>
                </>
              ) : null}
              {onCancel && ["PENDING", "APPROVED"].includes(row.status) ? <Button size="sm" variant="ghost" onClick={() => onCancel(row)}>Cancel</Button> : null}
            </div>
          ),
        },
      ]}
    />
  );
}

export function ApplyLeaveModal({ onClose, path, pickEmployee, types }: { onClose: () => void; path: string; pickEmployee?: boolean; types?: Array<{ code: string; name: string; available?: number }> }) {
  const lookups = useApi<Lookups>(pickEmployee ? "/hr/lookups" : null);
  const action = useAction<Record<string, unknown>, unknown>(["/hr", "/me"]);
  const [half, setHalf] = useState(false);
  const allTypes = types || [...new Map((lookups.data?.policies || []).flatMap((policy) => policy.types).map((type) => [type.code, type])).values()];
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={pickEmployee ? "Record leave" : "Apply for leave"}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = formValues(event.currentTarget);
          if (half) body.toDate = body.fromDate;
          if (await action.submit({ path, body })) onClose();
        }}
      >
        {pickEmployee ? (
          <Field label="Employee"><Select name="employeeId" required><option value="">Choose…</option>{lookups.data?.employees.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}</Select></Field>
        ) : null}
        <Field label="Leave type">
          <Select name="type" required>{allTypes.map((type) => <option key={type.code} value={type.code}>{type.name}{"available" in type && type.available !== undefined ? ` · ${type.available} available` : ""}</option>)}</Select>
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="From"><TextInput type="date" name="fromDate" required /></Field>
          {!half ? <Field label="To"><TextInput type="date" name="toDate" required /></Field> : null}
        </div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={half} onChange={(event) => setHalf(event.target.checked)} /> Half day</label>
        {half ? <Field label="Half"><Select name="halfDay"><option value="FIRST">First half</option><option value="SECOND">Second half</option></Select></Field> : null}
        <Field label="Reason"><TextInput name="reason" /></Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Submit</Button></div>
      </form>
    </Modal>
  );
}

// ---------- Attendance ----------

export function AttendanceTable({ rows, loading, showEmployee }: { rows: AttendanceRow[]; loading?: boolean; showEmployee?: boolean }) {
  return (
    <DataTable
      rows={rows}
      loading={loading}
      rowKey={(row) => row.id}
      empty="No attendance in this range."
      columns={[
        ...(showEmployee ? [{ key: "employee", header: "Employee", sortValue: (row: AttendanceRow) => row.employee?.name || "", render: (row: AttendanceRow) => <div><p className="font-medium">{row.employee?.name}</p><p className="text-2xs text-muted">{row.employee?.code}</p></div> }] : []),
        { key: "day", header: "Day", sortValue: (row) => row.day, render: (row) => `${WEEKDAYS[new Date(row.day).getUTCDay()]} ${formatDate(row.day)}` },
        { key: "status", header: "Status", render: (row) => <span className="flex items-center gap-1"><StatusBadge status={row.status} />{row.locked ? <Lock className="h-3 w-3 text-muted" /> : null}</span> },
        { key: "in", header: "In", render: (row) => clock(row.checkIn) },
        { key: "out", header: "Out", render: (row) => clock(row.checkOut) },
        { key: "worked", header: "Worked", align: "right", render: (row) => hours(row.workedMinutes) },
        { key: "late", header: "Late", align: "right", render: (row) => (row.lateMinutes ? `${row.lateMinutes}m` : "—") },
        { key: "ot", header: "OT", align: "right", render: (row) => hours(row.overtimeMinutes) },
        { key: "source", header: "Source", render: (row) => <span className="text-2xs text-muted">{humanize(row.source)}</span> },
      ]}
    />
  );
}

export function CorrectionTable({ rows, onDecide, showEmployee }: { rows: Correction[]; onDecide?: (row: Correction, decision: "APPROVED" | "REJECTED") => void; showEmployee?: boolean }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.id}
      empty="No corrections."
      columns={[
        ...(showEmployee ? [{ key: "employee", header: "Employee", render: (row: Correction) => row.employee?.name || "—" }] : []),
        { key: "day", header: "Day", render: (row) => formatDate(row.day) },
        { key: "in", header: "In", render: (row) => clock(row.checkIn) },
        { key: "out", header: "Out", render: (row) => clock(row.checkOut) },
        { key: "reason", header: "Reason", render: (row) => <span className="text-muted">{row.reason}</span> },
        { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
        {
          key: "actions",
          header: "",
          align: "right",
          render: (row) =>
            onDecide && row.status === "PENDING" ? (
              <div className="flex justify-end gap-1">
                <Button size="sm" onClick={() => onDecide(row, "APPROVED")}>Approve</Button>
                <Button size="sm" variant="ghost" onClick={() => onDecide(row, "REJECTED")}>Reject</Button>
              </div>
            ) : null,
        },
      ]}
    />
  );
}

export function AttendanceAdmin() {
  const { session } = useSession();
  const [fromDate, setFrom] = useState(monthStart);
  const [toDate, setTo] = useState(todayKey);
  const [employeeId, setEmployeeId] = useState("");
  const [manual, setManual] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "warn"; text: string } | null>(null);
  const lookups = useLookups();
  const rows = useApi<AttendanceRow[]>(`/hr/attendance?fromDate=${fromDate}&toDate=${toDate}${employeeId ? `&employeeId=${employeeId}` : ""}`, { keepPrevious: true });
  const corrections = useApi<Correction[]>("/hr/attendance/corrections");
  const upload = useAction<FormData, { written: number; employees: number; warnings: string[] }>(["/hr"]);
  const action = useAction<Record<string, unknown>, { days?: number; updated?: number; rows?: number }>(["/hr"]);
  const canEdit = allowed(session, "hr.edit");
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const row of rows.data || []) out[row.status] = (out[row.status] || 0) + 1;
    return out;
  }, [rows.data]);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="From"><TextInput type="date" value={fromDate} onChange={(event) => setFrom(event.target.value)} /></Field>
        <Field label="To"><TextInput type="date" value={toDate} onChange={(event) => setTo(event.target.value)} /></Field>
        <Field label="Employee">
          <Select value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}><option value="">Everyone</option>{lookups.data?.employees.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select>
        </Field>
        {canEdit ? (
          <>
            <form
              className="flex flex-wrap items-end gap-2"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                const result = await upload.submit({ path: "/hr/attendance/import", body: new FormData(form) });
                if (result) {
                  setMessage({ tone: result.warnings.length ? "warn" : "good", text: `Imported ${result.written} employee-day(s) for ${result.employees} employee(s). ${result.warnings.join(" ")}` });
                  form.reset();
                }
              }}
            >
              <Field label="Biometric export (CSV / Excel)"><input type="file" name="file" required accept=".csv,.txt,.xlsx" className="text-sm" /></Field>
              <Button type="submit" variant="outline" loading={upload.isPending}><Upload /> Import</Button>
            </form>
            <Button variant="ghost" loading={action.isPending} onClick={async () => { const result = await action.submit({ path: "/hr/attendance/build", body: { fromDate, toDate } }); if (result) setMessage({ tone: "good", text: `Rebuilt ${result.days} employee-day(s); ${result.updated} changed.` }); }}><Hammer /> Rebuild</Button>
            <Button variant="ghost" onClick={() => setManual(true)}><Plus /> Mark</Button>
          </>
        ) : null}
        {allowed(session, "hr.approve") ? <Button variant="ghost" onClick={async () => { if (!window.confirm(`Lock attendance ${fromDate} to ${toDate} for payroll?`)) return; const result = await action.submit({ path: "/hr/attendance/lock", body: { fromDate, toDate, locked: true } }); if (result) setMessage({ tone: "good", text: `Locked ${result.rows} row(s).` }); }}><Lock /> Lock</Button> : null}
      </div>
      {upload.error ? <ErrorNote>{upload.error.message}</ErrorNote> : null}
      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      {message ? <Notice tone={message.tone}>{message.text}</Notice> : null}
      <div className="flex flex-wrap gap-2">{Object.entries(counts).map(([key, value]) => <Badge key={key} tone={STATUS_TONE[key] || "neutral"}>{humanize(key)} {value}</Badge>)}</div>
      {corrections.data?.length ? (
        <Card>
          <CardHeader title="Regularization requests" description="Approved corrections overwrite the punches for that day." />
          <CorrectionTable rows={corrections.data} showEmployee onDecide={allowed(session, "hr.approve") ? (row, decision) => action.submit({ path: `/hr/attendance/corrections/${row.id}/decide`, body: { status: decision } }) : undefined} />
        </Card>
      ) : null}
      <Card>
        <QueryError error={rows.error} />
        <AttendanceTable rows={rows.data || []} loading={rows.isLoading} showEmployee />
      </Card>
      {manual ? <ManualAttendance employees={lookups.data?.employees || []} onClose={() => setManual(false)} /> : null}
    </div>
  );
}

function ManualAttendance({ employees, onClose }: { employees: Lookups["employees"]; onClose: () => void }) {
  const action = useAction<Record<string, unknown>, unknown>(["/hr"]);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title="Mark attendance">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          if (await action.submit({ path: "/hr/attendance", body: formValues(event.currentTarget) })) onClose();
        }}
      >
        <Field label="Employee"><Select name="employeeId" required><option value="">Choose…</option>{employees.map((row) => <option key={row.id} value={row.id}>{row.name} ({row.code})</option>)}</Select></Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Day"><TextInput type="date" name="day" required defaultValue={todayKey()} /></Field>
          <Field label="In"><TextInput type="time" name="checkIn" /></Field>
          <Field label="Out"><TextInput type="time" name="checkOut" /></Field>
        </div>
        <Field label="Note"><TextInput name="notes" /></Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

// ---------- Setup ----------

type Shift = { id: string; code: string; name: string; startTime: string; endTime: string; breakMinutes: number; graceMinutes: number; halfDayHours: string | number; fullDayHours: string | number; weeklyOffs: number[]; active: boolean; _count?: { employees: number } };
type Policy = { id: string; name: string; branchId: string | null; isDefault: boolean; active: boolean; weeklyOffs: number[]; branch: { name: string } | null; types: Array<{ code: string; name: string; annualQuota: string | number; accrual: string; carryForwardMax: string | number; encashable: boolean; paid: boolean; allowHalfDay: boolean; allowNegative: boolean; countOffs: boolean; minNoticeDays: number }>; _count?: { employees: number } };
type Template = { id: string; kind: string; name: string; active: boolean; items: Array<{ title: string; owner: string; dueDays: number }> };

export function HrSetup() {
  const [tab, setTab] = useState("shifts");
  return (
    <div className="space-y-4">
      <Tabs variant="pill" items={[{ key: "shifts", label: "Shifts" }, { key: "roster", label: "Roster" }, { key: "policies", label: "Leave policies" }, { key: "holidays", label: "Holidays" }, { key: "checklists", label: "Checklists" }, { key: "tasks", label: "Open tasks" }]} value={tab} onChange={setTab} />
      {tab === "shifts" ? <Shifts /> : null}
      {tab === "roster" ? <Roster /> : null}
      {tab === "policies" ? <Policies /> : null}
      {tab === "holidays" ? <Holidays /> : null}
      {tab === "checklists" ? <Checklists /> : null}
      {tab === "tasks" ? <OpenTasks /> : null}
    </div>
  );
}

function OffDays({ name, value }: { name: string; value: number[] }) {
  return (
    <div className="flex flex-wrap gap-3 text-sm">
      {WEEKDAYS.map((day, index) => <label key={day} className="flex items-center gap-1"><input type="checkbox" name={name} value={index} defaultChecked={value.includes(index)} /> {day}</label>)}
    </div>
  );
}
const offDays = (form: HTMLFormElement, name: string) => [...form.querySelectorAll<HTMLInputElement>(`input[name="${name}"]:checked`)].map((input) => Number(input.value));

function Shifts() {
  const { session } = useSession();
  const { data, error } = useApi<Shift[]>("/hr/shifts");
  const [editing, setEditing] = useState<Shift | "new" | null>(null);
  return (
    <Card>
      <CardHeader title="Shifts" description="Grace, half-day and full-day thresholds drive late marks, half days and overtime." action={allowed(session, "hr.edit") ? <Button variant="outline" onClick={() => setEditing("new")}><Plus /> Shift</Button> : null} />
      <QueryError error={error} />
      <DataTable
        rows={data || []}
        rowKey={(row) => row.id}
        onRowClick={allowed(session, "hr.edit") ? (row) => setEditing(row) : undefined}
        columns={[
          { key: "code", header: "Code", render: (row) => <span className="font-mono text-xs">{row.code}</span> },
          { key: "name", header: "Name", render: (row) => row.name },
          { key: "time", header: "Timing", render: (row) => `${row.startTime}–${row.endTime}` },
          { key: "rules", header: "Rules", render: (row) => <span className="text-muted">Break {row.breakMinutes}m · grace {row.graceMinutes}m · half {Number(row.halfDayHours)}h · full {Number(row.fullDayHours)}h</span> },
          { key: "off", header: "Weekly off", render: (row) => row.weeklyOffs.map((day) => WEEKDAYS[day]).join(", ") || "—" },
          { key: "employees", header: "People", align: "right", render: (row) => row._count?.employees ?? 0 },
          { key: "active", header: "", render: (row) => (row.active ? null : <Badge>Inactive</Badge>) },
        ]}
      />
      {editing ? <ShiftModal shift={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

function ShiftModal({ shift, onClose }: { shift: Shift | null; onClose: () => void }) {
  const action = useAction<Record<string, unknown>, unknown>(["/hr"]);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={shift ? `Edit ${shift.code}` : "New shift"}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const body = formValues(form, { booleans: ["active"] });
          body.weeklyOffs = offDays(form, "weeklyOffs");
          for (const key of ["breakMinutes", "graceMinutes", "halfDayHours", "fullDayHours"]) body[key] = Number(body[key]);
          if (await action.submit({ path: shift ? `/hr/shifts/${shift.id}` : "/hr/shifts", method: shift ? "PATCH" : "POST", body })) onClose();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Code"><TextInput name="code" required defaultValue={shift?.code} maxLength={10} /></Field>
          <Field label="Name"><TextInput name="name" required defaultValue={shift?.name} /></Field>
          <Field label="Starts"><TextInput type="time" name="startTime" required defaultValue={shift?.startTime || "09:30"} /></Field>
          <Field label="Ends"><TextInput type="time" name="endTime" required defaultValue={shift?.endTime || "18:30"} /></Field>
          <Field label="Break (minutes)"><TextInput type="number" name="breakMinutes" defaultValue={shift?.breakMinutes ?? 60} /></Field>
          <Field label="Grace (minutes)"><TextInput type="number" name="graceMinutes" defaultValue={shift?.graceMinutes ?? 15} /></Field>
          <Field label="Half day after (hours)"><TextInput type="number" step="0.5" name="halfDayHours" defaultValue={Number(shift?.halfDayHours ?? 4)} /></Field>
          <Field label="Full day after (hours)"><TextInput type="number" step="0.5" name="fullDayHours" defaultValue={Number(shift?.fullDayHours ?? 8)} /></Field>
        </div>
        <Field label="Weekly off"><OffDays name="weeklyOffs" value={shift?.weeklyOffs ?? [0]} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={shift?.active ?? true} /> Active</label>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

function Roster() {
  const lookups = useLookups();
  const [fromDate, setFrom] = useState(todayKey);
  const [toDate, setTo] = useState(todayKey);
  const [picked, setPicked] = useState<string[]>([]);
  const action = useAction<Record<string, unknown>, { entries: number }>(["/hr"]);
  const [message, setMessage] = useState("");
  const roster = useApi<Array<{ id: string; employeeId: string; day: string; off: boolean; shift: { code: string } | null }>>(fromDate && toDate ? `/hr/roster?fromDate=${fromDate}&toDate=${toDate}` : null, { keepPrevious: true });
  const employees = lookups.data?.employees || [];
  return (
    <Card>
      <CardHeader title="Roster" description="Override the default shift or weekly off for specific days (rotating shifts, compensatory offs)." />
      <CardBody>
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            const body = formValues(event.currentTarget, { booleans: ["off"] });
            const result = await action.submit({ path: "/hr/roster", body: { ...body, employeeIds: picked, fromDate, toDate } });
            if (result) setMessage(result.entries ? `Rostered ${result.entries} employee-day(s).` : "Cleared the roster for this range.");
          }}
        >
          <div className="flex flex-wrap items-end gap-3">
            <Field label="From"><TextInput type="date" value={fromDate} onChange={(event) => setFrom(event.target.value)} /></Field>
            <Field label="To"><TextInput type="date" value={toDate} onChange={(event) => setTo(event.target.value)} /></Field>
            <Field label="Shift"><Select name="shiftId"><option value="">Default shift</option>{lookups.data?.shifts.map((row) => <option key={row.id} value={row.id}>{row.code} · {row.startTime}–{row.endTime}</option>)}</Select></Field>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="off" /> Weekly off</label>
            <Button type="submit" loading={action.isPending} disabled={!picked.length}>Apply to {picked.length} employee(s)</Button>
          </div>
          <div className="max-h-56 overflow-auto rounded border border-line p-2">
            <label className="mb-1 flex items-center gap-2 text-xs text-muted"><input type="checkbox" checked={picked.length === employees.length && employees.length > 0} onChange={(event) => setPicked(event.target.checked ? employees.map((row) => row.id) : [])} /> Select all</label>
            <div className="grid gap-1 sm:grid-cols-3">
              {employees.map((row) => (
                <label key={row.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" checked={picked.includes(row.id)} onChange={(event) => setPicked((current) => (event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id)))} />
                  {row.name} <span className="text-2xs text-muted">{row.code}</span>
                </label>
              ))}
            </div>
          </div>
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
          {message ? <Notice tone="good">{message}</Notice> : null}
        </form>
        {roster.data?.length ? <p className="mt-3 text-xs text-muted">{roster.data.length} rostered employee-day(s) in this range ({roster.data.filter((row) => row.off).length} offs).</p> : null}
      </CardBody>
    </Card>
  );
}

function Policies() {
  const { session } = useSession();
  const { data, error } = useApi<Policy[]>("/hr/leave-policies");
  const [editing, setEditing] = useState<Policy | "new" | null>(null);
  return (
    <Card>
      <CardHeader title="Leave policies" description="Each employee follows their own policy, else their branch default, else the company default." action={allowed(session, "hr.edit") ? <Button variant="outline" onClick={() => setEditing("new")}><Plus /> Policy</Button> : null} />
      <QueryError error={error} />
      <DataTable
        rows={data || []}
        rowKey={(row) => row.id}
        onRowClick={allowed(session, "hr.edit") ? (row) => setEditing(row) : undefined}
        columns={[
          { key: "name", header: "Policy", render: (row) => <span className="font-medium">{row.name} {row.isDefault ? <Badge tone="info">Default</Badge> : null}</span> },
          { key: "branch", header: "Branch", render: (row) => row.branch?.name || "All" },
          { key: "types", header: "Leave types", render: (row) => <span className="text-muted">{row.types.map((type) => `${type.code} ${Number(type.annualQuota)}${type.accrual === "MONTHLY" ? "/yr monthly" : ""}`).join(" · ")}</span> },
          { key: "off", header: "Weekly off", render: (row) => row.weeklyOffs.map((day) => WEEKDAYS[day]).join(", ") },
          { key: "employees", header: "Assigned", align: "right", render: (row) => row._count?.employees ?? 0 },
        ]}
      />
      {editing ? <PolicyModal policy={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

type TypeDraft = { code: string; name: string; annualQuota: number; accrual: string; carryForwardMax: number; encashable: boolean; paid: boolean; allowHalfDay: boolean; allowNegative: boolean; countOffs: boolean; minNoticeDays: number };

function PolicyModal({ policy, onClose }: { policy: Policy | null; onClose: () => void }) {
  const lookups = useLookups();
  const action = useAction<Record<string, unknown>, unknown>(["/hr"]);
  const [types, setTypes] = useState<TypeDraft[]>(
    policy?.types.map((type) => ({ ...type, annualQuota: Number(type.annualQuota), carryForwardMax: Number(type.carryForwardMax) })) || [
      { code: "CL", name: "Casual leave", annualQuota: 8, accrual: "YEARLY", carryForwardMax: 0, encashable: false, paid: true, allowHalfDay: true, allowNegative: false, countOffs: false, minNoticeDays: 0 },
    ],
  );
  const patch = (index: number, value: Partial<TypeDraft>) => setTypes((current) => current.map((row, at) => (at === index ? { ...row, ...value } : row)));
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={policy ? `Edit ${policy.name}` : "New leave policy"} className="max-w-5xl">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const form = event.currentTarget;
          const body = formValues(form, { booleans: ["isDefault", "active"] });
          body.weeklyOffs = offDays(form, "weeklyOffs");
          body.types = types;
          if (await action.submit({ path: policy ? `/hr/leave-policies/${policy.id}` : "/hr/leave-policies", method: policy ? "PATCH" : "POST", body })) onClose();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name"><TextInput name="name" required defaultValue={policy?.name} /></Field>
          <Field label="Branch"><Select name="branchId" defaultValue={policy?.branchId || ""}><option value="">All branches</option>{lookups.data?.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
          <div className="flex items-center gap-4 pt-6 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="isDefault" defaultChecked={policy?.isDefault} /> Default</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="active" defaultChecked={policy?.active ?? true} /> Active</label>
          </div>
        </div>
        <Field label="Weekly off (for counting leave days)"><OffDays name="weeklyOffs" value={policy?.weeklyOffs ?? [0]} /></Field>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-left text-2xs uppercase text-muted">
              <tr><th className="p-1">Code</th><th className="p-1">Name</th><th className="p-1">Days/yr</th><th className="p-1">Accrual</th><th className="p-1">Carry max</th><th className="p-1">Notice</th><th className="p-1">Paid</th><th className="p-1">Half</th><th className="p-1">Negative</th><th className="p-1">Count offs</th><th className="p-1">Encash</th><th /></tr>
            </thead>
            <tbody>
              {types.map((type, index) => (
                <tr key={index} className="border-t border-line">
                  <td className="p-1"><TextInput value={type.code} onChange={(event) => patch(index, { code: event.target.value.toUpperCase() })} className="w-20" required /></td>
                  <td className="p-1"><TextInput value={type.name} onChange={(event) => patch(index, { name: event.target.value })} required /></td>
                  <td className="p-1"><TextInput type="number" step="0.5" value={type.annualQuota} onChange={(event) => patch(index, { annualQuota: Number(event.target.value) })} className="w-20" /></td>
                  <td className="p-1"><Select value={type.accrual} onChange={(event) => patch(index, { accrual: event.target.value })}><option value="YEARLY">Yearly</option><option value="MONTHLY">Monthly</option><option value="NONE">None</option></Select></td>
                  <td className="p-1"><TextInput type="number" step="0.5" value={type.carryForwardMax} onChange={(event) => patch(index, { carryForwardMax: Number(event.target.value) })} className="w-20" /></td>
                  <td className="p-1"><TextInput type="number" value={type.minNoticeDays} onChange={(event) => patch(index, { minNoticeDays: Number(event.target.value) })} className="w-16" /></td>
                  {(["paid", "allowHalfDay", "allowNegative", "countOffs", "encashable"] as const).map((key) => (
                    <td key={key} className="p-1 text-center"><input type="checkbox" checked={type[key]} onChange={(event) => patch(index, { [key]: event.target.checked })} /></td>
                  ))}
                  <td className="p-1"><Button type="button" size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setTypes((current) => current.filter((_, at) => at !== index))}><Trash2 /></Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Button type="button" size="sm" variant="ghost" onClick={() => setTypes((current) => [...current, { code: "", name: "", annualQuota: 0, accrual: "YEARLY", carryForwardMax: 0, encashable: false, paid: true, allowHalfDay: true, allowNegative: false, countOffs: false, minNoticeDays: 0 }])}><Plus /> Leave type</Button>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

function Holidays() {
  const { session } = useSession();
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const lookups = useLookups();
  const { data, error } = useApi<Array<{ id: string; date: string; name: string; optional: boolean; branch: { name: string } | null }>>(`/hr/holidays?year=${year}`, { keepPrevious: true });
  const action = useAction<Record<string, unknown>, unknown>(["/hr"]);
  const canEdit = allowed(session, "hr.edit");
  return (
    <Card>
      <CardHeader title="Holiday calendar" description="Company-wide holidays apply to every branch; branch holidays only to that branch." action={<TextInput type="number" value={year} onChange={(event) => setYear(event.target.value)} className="w-24" />} />
      {canEdit ? (
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              if (await action.submit({ path: "/hr/holidays", body: formValues(form, { booleans: ["optional"] }) })) form.reset();
            }}
          >
            <Field label="Date"><TextInput type="date" name="date" required /></Field>
            <Field label="Holiday"><TextInput name="name" required /></Field>
            <Field label="Branch"><Select name="branchId"><option value="">All branches</option>{lookups.data?.branches.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
            <label className="flex items-center gap-2 pb-2 text-sm"><input type="checkbox" name="optional" /> Optional (restricted)</label>
            <Button type="submit" variant="outline" loading={action.isPending}><Plus /> Add</Button>
          </form>
          {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        </CardBody>
      ) : null}
      <QueryError error={error} />
      <DataTable
        rows={data || []}
        rowKey={(row) => row.id}
        empty="No holidays for this year."
        columns={[
          { key: "date", header: "Date", render: (row) => `${WEEKDAYS[new Date(row.date).getUTCDay()]} ${formatDate(row.date)}` },
          { key: "name", header: "Holiday", render: (row) => <span>{row.name} {row.optional ? <Badge>Optional</Badge> : null}</span> },
          { key: "branch", header: "Branch", render: (row) => row.branch?.name || "All" },
          { key: "actions", header: "", align: "right", render: (row) => (canEdit ? <Button size="icon-sm" variant="ghost" aria-label="Delete" onClick={() => window.confirm(`Remove ${row.name}?`) && action.submit({ path: `/hr/holidays/${row.id}`, method: "DELETE" })}><Trash2 /></Button> : null) },
        ]}
      />
    </Card>
  );
}

function Checklists() {
  const { session } = useSession();
  const { data, error } = useApi<Template[]>("/hr/checklists");
  const [editing, setEditing] = useState<Template | "new" | null>(null);
  return (
    <Card>
      <CardHeader title="Onboarding & exit checklists" description="Tasks are created for each new joiner (due relative to joining) and each exit (relative to the last working day)." action={allowed(session, "hr.edit") ? <Button variant="outline" onClick={() => setEditing("new")}><Plus /> Checklist</Button> : null} />
      <QueryError error={error} />
      <DataTable
        rows={data || []}
        rowKey={(row) => row.id}
        onRowClick={allowed(session, "hr.edit") ? (row) => setEditing(row) : undefined}
        columns={[
          { key: "kind", header: "Kind", render: (row) => humanize(row.kind) },
          { key: "name", header: "Name", render: (row) => row.name },
          { key: "items", header: "Tasks", render: (row) => <span className="text-muted">{row.items.map((item) => item.title).join(" · ")}</span> },
          { key: "active", header: "", render: (row) => (row.active ? <Badge tone="good">Active</Badge> : <Badge>Inactive</Badge>) },
        ]}
      />
      {editing ? <ChecklistModal template={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
    </Card>
  );
}

function ChecklistModal({ template, onClose }: { template: Template | null; onClose: () => void }) {
  const action = useAction<Record<string, unknown>, unknown>(["/hr"]);
  const [items, setItems] = useState(template?.items || [{ title: "", owner: "HR", dueDays: 0 }]);
  const patch = (index: number, value: Partial<Template["items"][number]>) => setItems((current) => current.map((row, at) => (at === index ? { ...row, ...value } : row)));
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={template ? `Edit ${template.name}` : "New checklist"} className="max-w-3xl">
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = { ...formValues(event.currentTarget, { booleans: ["active"] }), items: items.filter((item) => item.title.trim()) };
          if (await action.submit({ path: template ? `/hr/checklists/${template.id}` : "/hr/checklists", method: template ? "PATCH" : "POST", body })) onClose();
        }}
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Kind"><Select name="kind" defaultValue={template?.kind || "ONBOARDING"}><option value="ONBOARDING">Onboarding</option><option value="EXIT">Exit</option></Select></Field>
          <Field label="Name"><TextInput name="name" required defaultValue={template?.name} /></Field>
          <label className="flex items-center gap-2 pt-6 text-sm"><input type="checkbox" name="active" defaultChecked={template?.active ?? true} /> Active</label>
        </div>
        {items.map((item, index) => (
          <div key={index} className="flex flex-wrap items-end gap-2">
            <Field label={index ? "" : "Task"}><TextInput value={item.title} onChange={(event) => patch(index, { title: event.target.value })} className="w-80" /></Field>
            <Field label={index ? "" : "Owner"}><Select value={item.owner} onChange={(event) => patch(index, { owner: event.target.value })}>{TASK_OWNERS.map((owner) => <option key={owner} value={owner}>{humanize(owner)}</option>)}</Select></Field>
            <Field label={index ? "" : "Due (days)"}><TextInput type="number" value={item.dueDays} onChange={(event) => patch(index, { dueDays: Number(event.target.value) })} className="w-20" /></Field>
            <Button type="button" size="icon-sm" variant="ghost" aria-label="Remove" onClick={() => setItems((current) => current.filter((_, at) => at !== index))}><Trash2 /></Button>
          </div>
        ))}
        <Button type="button" size="sm" variant="ghost" onClick={() => setItems((current) => [...current, { title: "", owner: "HR", dueDays: 0 }])}><Plus /> Task</Button>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Save</Button></div>
      </form>
    </Modal>
  );
}

function OpenTasks() {
  const { session } = useSession();
  const { data, error } = useApi<Task[]>("/hr/tasks");
  return (
    <Card>
      <CardHeader title="Open onboarding & exit tasks" />
      <QueryError error={error} />
      <TaskList tasks={data || []} canEdit={allowed(session, "hr.edit")} showEmployee />
    </Card>
  );
}

// ---------- Assets ----------

export function Assets() {
  const { session } = useSession();
  const lookups = useLookups();
  const { data, error } = useApi<Array<{ id: string; code: string; name: string; category: string | null; serialNo: string | null; status: string; assignedAt: string | null; employee: { id: string; name: string } | null }>>("/hr/assets");
  const action = useAction<Record<string, unknown>, unknown>(["/hr"]);
  const canEdit = allowed(session, "hr.edit");
  return (
    <Card>
      <CardHeader title="Company assets" description="Laptops, phones, tools and safety gear issued to employees; exits are blocked until they are returned." />
      {allowed(session, "hr.create") ? (
        <CardBody>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              if (await action.submit({ path: "/hr/assets", body: formValues(form) })) form.reset();
            }}
          >
            <Field label="Asset code"><TextInput name="code" required /></Field>
            <Field label="Name"><TextInput name="name" required /></Field>
            <Field label="Category"><TextInput name="category" placeholder="Laptop, tool, PPE…" /></Field>
            <Field label="Serial no."><TextInput name="serialNo" /></Field>
            <Field label="Assign to"><Select name="assignedEmployeeId"><option value="">In store</option>{lookups.data?.employees.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}</Select></Field>
            <Button type="submit" variant="outline" loading={action.isPending}><Plus /> Add</Button>
          </form>
        </CardBody>
      ) : null}
      {action.error ? <div className="px-4"><ErrorNote>{action.error.message}</ErrorNote></div> : null}
      <QueryError error={error} />
      <DataTable
        rows={data || []}
        rowKey={(row) => row.id}
        columns={[
          { key: "code", header: "Code", render: (row) => <span className="font-mono text-xs">{row.code}</span> },
          { key: "name", header: "Asset", render: (row) => <div><p>{row.name}</p><p className="text-2xs text-muted">{[row.category, row.serialNo].filter(Boolean).join(" · ")}</p></div> },
          { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
          { key: "employee", header: "With", render: (row) => (row.employee ? `${row.employee.name}${row.assignedAt ? ` since ${formatDate(row.assignedAt)}` : ""}` : "—") },
          {
            key: "assign",
            header: "",
            align: "right",
            render: (row) =>
              canEdit ? (
                <Select value={row.employee?.id || ""} onChange={(event) => action.submit({ path: `/hr/assets/${row.id}/assign`, body: { employeeId: event.target.value || null } })}>
                  <option value="">Returned / in store</option>
                  {lookups.data?.employees.map((employee) => <option key={employee.id} value={employee.id}>{employee.name}</option>)}
                </Select>
              ) : null,
          },
        ]}
      />
    </Card>
  );
}

// ---------- Performance ----------

export function Performance() {
  const { session } = useSession();
  const cycles = useApi<Array<{ id: string; name: string; startDate: string; endDate: string; status: string; _count: { appraisals: number; goals: number } }>>("/hr/appraisal-cycles");
  const [cycleId, setCycleId] = useState("");
  const appraisals = useApi<Array<{ id: string; status: string; selfRating: string | null; managerRating: string | null; managerComments: string | null; employee: { name: string; code: string } }>>(cycleId ? `/hr/appraisals?cycleId=${cycleId}` : null);
  const action = useAction<Record<string, unknown>, unknown>(["/hr"]);
  const [reviewing, setReviewing] = useState<string | null>(null);
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title="Appraisal cycles" />
        {allowed(session, "hr.edit") ? (
          <CardBody>
            <form
              className="flex flex-wrap items-end gap-3"
              onSubmit={async (event) => {
                event.preventDefault();
                const form = event.currentTarget;
                if (await action.submit({ path: "/hr/appraisal-cycles", body: formValues(form) })) form.reset();
              }}
            >
              <Field label="Name"><TextInput name="name" required placeholder="FY 2026-27 annual" /></Field>
              <Field label="Period from"><TextInput type="date" name="startDate" required /></Field>
              <Field label="to"><TextInput type="date" name="endDate" required /></Field>
              <Field label="Self review due"><TextInput type="date" name="selfDue" /></Field>
              <Field label="Manager review due"><TextInput type="date" name="managerDue" /></Field>
              <Button type="submit" variant="outline" loading={action.isPending}><Plus /> Cycle</Button>
            </form>
          </CardBody>
        ) : null}
        {action.error ? <div className="px-4"><ErrorNote>{action.error.message}</ErrorNote></div> : null}
        <DataTable
          rows={cycles.data || []}
          rowKey={(row) => row.id}
          onRowClick={(row) => setCycleId(row.id)}
          columns={[
            { key: "name", header: "Cycle", render: (row) => <span className={row.id === cycleId ? "font-semibold" : ""}>{row.name}</span> },
            { key: "period", header: "Period", render: (row) => `${formatDate(row.startDate)} – ${formatDate(row.endDate)}` },
            { key: "count", header: "Appraisals", align: "right", render: (row) => row._count.appraisals },
            { key: "status", header: "Status", render: (row) => <StatusBadge status={row.status} /> },
            {
              key: "actions",
              header: "",
              align: "right",
              render: (row) =>
                allowed(session, "hr.approve") ? (
                  <div className="flex justify-end gap-1">
                    {row.status !== "CLOSED" ? <Button size="sm" variant="outline" onClick={(event) => { event.stopPropagation(); void action.submit({ path: `/hr/appraisal-cycles/${row.id}/open` }); }}>{row.status === "OPEN" ? "Add new joiners" : "Open"}</Button> : null}
                    {row.status === "OPEN" ? <Button size="sm" variant="ghost" onClick={(event) => { event.stopPropagation(); void action.submit({ path: `/hr/appraisal-cycles/${row.id}/close` }); }}>Close</Button> : null}
                  </div>
                ) : null,
            },
          ]}
        />
      </Card>
      {cycleId ? (
        <Card>
          <CardHeader title="Appraisals" description="Employees rate themselves first; their manager (or HR) then gives the final rating." />
          <DataTable
            rows={appraisals.data || []}
            rowKey={(row) => row.id}
            columns={[
              { key: "employee", header: "Employee", render: (row) => `${row.employee.name} (${row.employee.code})` },
              { key: "status", header: "Stage", render: (row) => <StatusBadge status={row.status} /> },
              { key: "self", header: "Self", align: "right", render: (row) => (row.selfRating ? Number(row.selfRating) : "—") },
              { key: "manager", header: "Final", align: "right", render: (row) => (row.managerRating ? Number(row.managerRating) : "—") },
              { key: "actions", header: "", align: "right", render: (row) => (allowed(session, "hr.approve") && row.status !== "DONE" ? <Button size="sm" variant="outline" onClick={() => setReviewing(row.id)}>Review</Button> : null) },
            ]}
          />
        </Card>
      ) : null}
      {reviewing ? <ReviewModal path={`/appraisals/${reviewing}/review`} onClose={() => setReviewing(null)} /> : null}
    </div>
  );
}

export function ReviewModal({ path, onClose, title = "Final review" }: { path: string; onClose: () => void; title?: string }) {
  const action = useAction<Record<string, unknown>, unknown>(["/hr", "/me"]);
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={title}>
      <form
        className="space-y-3"
        onSubmit={async (event) => {
          event.preventDefault();
          const body = formValues(event.currentTarget);
          body.rating = Number(body.rating);
          if (await action.submit({ path, body })) onClose();
        }}
      >
        <Field label="Rating (1–5)"><Select name="rating" defaultValue="3">{["1", "2", "3", "3.5", "4", "4.5", "5"].map((value) => <option key={value} value={value}>{value}</option>)}</Select></Field>
        <Field label="Comments"><textarea name="comments" rows={5} className="w-full rounded border border-line bg-transparent p-2 text-sm" /></Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
        <div className="flex justify-end gap-2"><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" loading={action.isPending}>Submit</Button></div>
      </form>
    </Modal>
  );
}
