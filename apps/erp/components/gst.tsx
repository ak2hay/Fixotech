"use client";

import { Badge, Button, Card, CardBody, CardHeader, DataTable, ErrorNote, Field, MiniStat, Modal, Notice, Select, TextInput, formatDate, humanize, money } from "@fixotec/ui";
import { CheckCircle2, Download, FileCheck2, QrCode, RefreshCw, Truck, Upload, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { API_URL, download } from "../lib/api";
import { useAction, useApi } from "../lib/query";
import { allowed, useSession } from "../lib/session";
import { QueryError } from "./common";

type Heads = { taxable: number; igst: number; cgst: number; sgst: number };
type Filing = { id: string; period: string; returnType: string; arn: string | null; filedOn: string | null } | null;
type Settings = {
  settings: Record<string, string | number | boolean | undefined>;
  gstin: string | null;
  gstinValid: boolean;
  provider: string;
  configured: boolean;
  states: Record<string, string>;
  tdsSections: Record<string, { label: string }>;
  cancelReasons: Record<string, string>;
};

const monthNow = () => {
  const today = new Date();
  today.setUTCDate(1);
  today.setUTCMonth(today.getUTCMonth() - 1);
  return today.toISOString().slice(0, 7);
};
const quarterNow = () => {
  const today = new Date();
  const month = today.getUTCMonth();
  const fy = month >= 3 ? today.getUTCFullYear() : today.getUTCFullYear() - 1;
  return `${fy}-Q${month >= 3 ? Math.floor((month - 3) / 3) + 1 : 4}`;
};

function usePeriod() {
  const [period, setPeriod] = useState(monthNow);
  return { period, picker: <Field label="Return period"><TextInput type="month" value={period} onChange={(event) => event.target.value && setPeriod(event.target.value)} /></Field> };
}

const tone = (status: string | null | undefined) => (status === "GENERATED" || status === "ACTIVE" || status === "MATCHED" ? "good" : status === "FAILED" || status === "MISMATCH" || status === "MISSING_IN_BOOKS" || status === "MISSING_IN_2B" ? "bad" : status === "CANCELLED" ? "neutral" : status === "PROBABLE" ? "warn" : "info");

function HeadsTable({ rows }: { rows: Array<{ label: string; heads: Partial<Heads> }> }) {
  return (
    <DataTable
      rows={rows}
      rowKey={(row) => row.label}
      density="compact"
      columns={[
        { key: "label", header: "", render: (row) => row.label },
        { key: "taxable", header: "Taxable", align: "right", render: (row) => (row.heads.taxable === undefined ? "" : money(row.heads.taxable)) },
        { key: "igst", header: "IGST", align: "right", render: (row) => money(row.heads.igst || 0) },
        { key: "cgst", header: "CGST", align: "right", render: (row) => money(row.heads.cgst || 0) },
        { key: "sgst", header: "SGST", align: "right", render: (row) => money(row.heads.sgst || 0) },
      ]}
    />
  );
}

function MarkFiled({ period, returnType, filing }: { period: string; returnType: "GSTR1" | "GSTR3B"; filing: Filing }) {
  const { session } = useSession();
  const action = useAction(["/gst", "/accounting"]);
  const [arn, setArn] = useState("");
  if (filing) return <Notice tone="good">Filed on {formatDate(filing.filedOn)}{filing.arn ? ` · ARN ${filing.arn}` : ""}</Notice>;
  if (!allowed(session, "accounting.approve")) return null;
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Field label="ARN (optional)"><TextInput value={arn} onChange={(event) => setArn(event.target.value)} placeholder="AA270926123456X" /></Field>
      <Button variant="outline" loading={action.isPending} onClick={() => window.confirm(`Mark ${returnType} for ${period} as filed? The books are locked up to the end of the month.`) && action.submit({ path: "/gst/filings", body: { period, returnType, arn: arn || undefined, lockBooks: true } })}><FileCheck2 /> Mark filed and lock</Button>
      {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
    </div>
  );
}

// ---------- Settings ----------

export function GstSettings() {
  const { session } = useSession();
  const query = useApi<Settings>("/gst/settings");
  const save = useAction(["/gst/settings"]);
  const [form, setForm] = useState<Record<string, string | boolean>>({});
  useEffect(() => {
    if (query.data) setForm(Object.fromEntries(Object.entries(query.data.settings).map(([key, value]) => [key, typeof value === "boolean" ? value : String(value ?? "")])));
  }, [query.data]);
  const data = query.data;
  const text = (key: string, label: string, props: Record<string, unknown> = {}) => (
    <Field label={label}><TextInput value={String(form[key] ?? "")} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))} {...props} /></Field>
  );
  const flag = (key: string, label: string) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={Boolean(form[key])} onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.checked }))} /> {label}</label>
  );
  return (
    <div className="space-y-4">
      <QueryError error={query.error} />
      {data ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <MiniStat label="GSTIN" value={data.gstin || "Not set"} hint={data.gstin ? (data.gstinValid ? "Checksum valid" : "Checksum invalid") : "Set GSTIN in the API environment"} />
          <MiniStat label="GSP" value={humanize(data.provider)} hint={data.configured ? "Credentials configured" : "Sandbox: IRNs and e-way bills are simulated"} />
          <MiniStat label="State" value={data.states[String(form.stateCode || "")] || "—"} />
        </div>
      ) : null}
      <Card>
        <CardHeader title="Seller details" description="Printed on e-invoices and e-way bills. Must match the GST registration." />
        <CardBody className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {text("legalName", "Legal name")}
            {text("tradeName", "Trade name")}
            {text("address1", "Address line 1")}
            {text("address2", "Address line 2")}
            {text("city", "City")}
            {text("pincode", "PIN code", { inputMode: "numeric", maxLength: 6 })}
            <Field label="State">
              <Select value={String(form.stateCode || "")} onChange={(event) => setForm((current) => ({ ...current, stateCode: event.target.value }))}>
                <option value="">Choose…</option>
                {Object.entries(data?.states || {}).map(([code, name]) => <option key={code} value={code}>{code} · {name}</option>)}
              </Select>
            </Field>
            {text("email", "Email")}
            {text("phone", "Phone")}
            {text("lutNumber", "LUT number (exports without IGST)")}
            {text("ewayBillThreshold", "E-way bill threshold (₹)", { type: "number", min: 0 })}
          </div>
          <div className="flex flex-wrap gap-6">
            {flag("einvoiceEnabled", "E-invoicing applies to us (turnover above ₹5 crore)")}
            {flag("exportWithPayment", "Exports are made with payment of IGST")}
          </div>
          {save.error ? <ErrorNote>{save.error.message}</ErrorNote> : null}
          {allowed(session, "accounting.edit") ? <Button loading={save.isPending} onClick={() => save.submit({ path: "/gst/settings", method: "PUT", body: { ...form, ewayBillThreshold: Number(form.ewayBillThreshold || 50000) } })}>Save</Button> : null}
        </CardBody>
      </Card>
    </div>
  );
}

// ---------- e-invoice ----------

type QueueRow = { kind: "invoice" | "credit_note"; id: string; number: string; date: string; customer: string; gstin: string | null; total: number; irn: string | null; ackNo: string | null; ackDate: string | null; status: string; error: string | null; cancellable: boolean };

export function EInvoices() {
  const { session } = useSession();
  const query = useApi<QueueRow[]>("/gst/einvoice/queue");
  const settings = useApi<Settings>("/gst/settings");
  const generate = useAction(["/gst/einvoice"]);
  const [busy, setBusy] = useState("");
  const [cancelling, setCancelling] = useState<QueueRow | null>(null);
  const [qr, setQr] = useState<QueueRow | null>(null);
  const canEdit = allowed(session, "invoices.edit");
  return (
    <Card>
      <CardHeader title="E-invoices (IRN)" description="B2B, SEZ and export invoices and credit notes from the last 30 days. Generate the IRN before sending the invoice; it can be cancelled within 24 hours." />
      <QueryError error={query.error} />
      {generate.error ? <ErrorNote className="m-4">{generate.error.message}</ErrorNote> : null}
      <DataTable
        rows={query.data || []}
        rowKey={(row) => `${row.kind}:${row.id}`}
        loading={query.isLoading}
        empty={<p className="py-6 text-center text-sm text-muted">No B2B documents in the last 30 days.</p>}
        columns={[
          { key: "number", header: "Document", render: (row) => <div><div className="font-medium">{row.number}</div><div className="text-xs text-muted">{row.kind === "invoice" ? "Invoice" : "Credit note"} · {formatDate(row.date)}</div></div> },
          { key: "customer", header: "Customer", render: (row) => <div><div>{row.customer}</div><div className="text-xs text-muted">{row.gstin || "No GSTIN"}</div></div> },
          { key: "total", header: "Value", align: "right", render: (row) => money(row.total), sortValue: (row) => row.total },
          { key: "status", header: "Status", render: (row) => <div><Badge tone={tone(row.status)}>{humanize(row.status)}</Badge>{row.error ? <div className="mt-1 max-w-xs text-xs text-bad">{row.error}</div> : null}{row.ackNo ? <div className="mt-1 text-xs text-muted">Ack {row.ackNo}</div> : null}</div> },
          {
            key: "action",
            header: "",
            align: "right",
            render: (row) => (
              <div className="flex justify-end gap-2">
                {row.status !== "GENERATED" && row.status !== "CANCELLED" && canEdit ? (
                  <Button size="sm" loading={busy === row.id && generate.isPending} onClick={async () => { setBusy(row.id); await generate.submit({ path: `/gst/einvoice/${row.kind}/${row.id}` }); }}>Generate IRN</Button>
                ) : null}
                {row.irn && row.status === "GENERATED" ? <Button size="sm" variant="outline" onClick={() => setQr(row)}><QrCode /> QR</Button> : null}
                {row.cancellable && allowed(session, "invoices.approve") ? <Button size="sm" variant="danger" onClick={() => setCancelling(row)}>Cancel IRN</Button> : null}
              </div>
            ),
          },
        ]}
      />
      <Modal open={Boolean(qr)} onOpenChange={(open) => !open && setQr(null)} title={qr ? `Signed QR · ${qr.number}` : ""} description={qr?.irn ? `IRN ${qr.irn}` : undefined}>
        {qr ? (
          <div className="flex flex-col items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`${API_URL}/api/v1/gst/einvoice/${qr.kind}/${qr.id}/qr`} alt={`QR for ${qr.number}`} width={240} height={240} />
            <Button variant="outline" size="sm" onClick={() => download(`/gst/einvoice/${qr.kind}/${qr.id}/qr`, `${qr.number}-qr.png`)}><Download /> Download PNG</Button>
          </div>
        ) : null}
      </Modal>
      <ReasonModal
        open={Boolean(cancelling)}
        onClose={() => setCancelling(null)}
        title={cancelling ? `Cancel IRN for ${cancelling.number}` : ""}
        description="The invoice is cancelled and its journal reversed. After 24 hours, raise a credit note instead."
        reasons={settings.data?.cancelReasons || { "1": "Duplicate", "2": "Data entry mistake", "3": "Order cancelled", "4": "Other" }}
        path={cancelling ? `/gst/einvoice/${cancelling.kind}/${cancelling.id}/cancel` : ""}
        invalidate={["/gst/einvoice", "/invoices", "/accounting"]}
      />
    </Card>
  );
}

function ReasonModal({ open, onClose, title, description, reasons, path, invalidate }: { open: boolean; onClose: () => void; title: string; description: string; reasons: Record<string, string>; path: string; invalidate: string[] }) {
  const action = useAction(invalidate);
  const [reason, setReason] = useState("2");
  const [remark, setRemark] = useState("");
  return (
    <Modal
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title={title}
      description={description}
      footer={<Button variant="danger" disabled={remark.trim().length < 3} loading={action.isPending} onClick={async () => { if (await action.submit({ path, body: { reason, remark } })) { setRemark(""); onClose(); } }}>Cancel it</Button>}
    >
      <div className="space-y-3">
        <Field label="Reason"><Select value={reason} onChange={(event) => setReason(event.target.value)}>{Object.entries(reasons).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select></Field>
        <Field label="Remark"><TextInput value={remark} maxLength={50} onChange={(event) => setRemark(event.target.value)} /></Field>
        {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
      </div>
    </Modal>
  );
}

// ---------- e-way bills ----------

type EwbRow = { id: string; number: string; status: string; customer: string; order: string; invoice: { id: string; number: string; total: number } | null; ewayBill: string | null; ewbStatus: string | null; ewbDate: string | null; ewbValidUntil: string | null; ewbError: string | null; vehicleNo: string | null; transporter: string | null; distanceKm: number | null };
type EwbMode = "generate" | "partB" | "extend" | "cancel";

export function EwayBills() {
  const { session } = useSession();
  const query = useApi<EwbRow[]>("/gst/ewaybills");
  const [open, setOpen] = useState<{ row: EwbRow; mode: EwbMode } | null>(null);
  const canAct = allowed(session, "dispatch.approve");
  return (
    <Card>
      <CardHeader title="E-way bills" description="Dispatches from the last 60 days. Needed when the consignment value is above the threshold in GST settings." />
      <QueryError error={query.error} />
      <DataTable
        rows={query.data || []}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        columns={[
          { key: "number", header: "Dispatch", render: (row) => <div><div className="font-medium">{row.number}</div><div className="text-xs text-muted">{row.order} · {humanize(row.status)}</div></div> },
          { key: "customer", header: "Customer", render: (row) => row.customer },
          { key: "invoice", header: "Invoice", render: (row) => (row.invoice ? <div>{row.invoice.number}<div className="text-xs text-muted">{money(row.invoice.total)}</div></div> : <span className="text-xs text-muted">Not invoiced</span>) },
          { key: "ewb", header: "E-way bill", render: (row) => (row.ewayBill ? <div><div className="font-mono text-xs">{row.ewayBill}</div><Badge tone={tone(row.ewbStatus)}>{humanize(row.ewbStatus || "ACTIVE")}</Badge></div> : row.ewbError ? <div className="max-w-xs text-xs text-bad">{row.ewbError}</div> : <span className="text-xs text-muted">—</span>) },
          { key: "valid", header: "Valid until", render: (row) => (row.ewbValidUntil ? formatDate(row.ewbValidUntil) : row.ewayBill && row.ewbStatus === "ACTIVE" ? <Badge tone="warn">Part-B pending</Badge> : "") },
          { key: "vehicle", header: "Vehicle", render: (row) => row.vehicleNo || "" },
          {
            key: "action",
            header: "",
            align: "right",
            render: (row) =>
              !canAct ? null : row.ewayBill && row.ewbStatus === "ACTIVE" ? (
                <div className="flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setOpen({ row, mode: "partB" })}>Vehicle</Button>
                  <Button size="sm" variant="outline" onClick={() => setOpen({ row, mode: "extend" })}>Extend</Button>
                  <Button size="sm" variant="danger" onClick={() => setOpen({ row, mode: "cancel" })}>Cancel</Button>
                </div>
              ) : row.invoice ? (
                <Button size="sm" onClick={() => setOpen({ row, mode: "generate" })}><Truck /> Generate</Button>
              ) : null,
          },
        ]}
      />
      {open ? <EwbModal key={`${open.row.id}:${open.mode}`} row={open.row} mode={open.mode} onClose={() => setOpen(null)} /> : null}
    </Card>
  );
}

const EWB_TITLES: Record<EwbMode, string> = { generate: "Generate e-way bill", partB: "Update vehicle (Part-B)", extend: "Extend validity", cancel: "Cancel e-way bill" };
const EXTEND_REASONS: Record<string, string> = { "1": "Natural calamity", "2": "Law and order", "4": "Transshipment", "3": "Accident", "99": "Other" };
const PART_B_REASONS: Record<string, string> = { "1": "Due to break down", "2": "Due to transshipment", "3": "Others", "4": "First time" };
const EWB_CANCEL_REASONS: Record<string, string> = { "1": "Duplicate", "2": "Order cancelled", "3": "Data entry mistake", "4": "Others" };

function EwbModal({ row, mode, onClose }: { row: EwbRow; mode: EwbMode; onClose: () => void }) {
  const action = useAction(["/gst/ewaybills", "/dispatch"]);
  const [form, setForm] = useState<Record<string, string>>({ distanceKm: String(row.distanceKm ?? ""), transMode: "1", vehicleNo: row.vehicleNo || "", transporterName: row.transporter || "", reason: mode === "extend" ? "99" : mode === "partB" ? "1" : "3" });
  const set = (key: string) => (event: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm((current) => ({ ...current, [key]: event.target.value }));
  const input = (key: string, label: string, props: Record<string, unknown> = {}) => <Field label={label}><TextInput value={form[key] || ""} onChange={set(key)} {...props} /></Field>;
  const reasons = (options: Record<string, string>) => <Field label="Reason"><Select value={form.reason} onChange={set("reason")}>{Object.entries(options).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</Select></Field>;
  const clean = (body: Record<string, string>) => Object.fromEntries(Object.entries(body).filter(([, value]) => value !== ""));
  async function submit() {
    const base = `/gst/ewaybill/${row.id}`;
    const body =
      mode === "generate" ? clean({ distanceKm: form.distanceKm, transMode: form.transMode, vehicleNo: form.vehicleNo.replace(/\s/g, ""), transporterId: form.transporterId || "", transporterName: form.transporterName || "", transDocNo: form.transDocNo || "" })
      : mode === "partB" ? clean({ vehicleNo: form.vehicleNo.replace(/\s/g, ""), fromPlace: form.fromPlace || "", reason: form.reason, remark: form.remark || "" })
      : mode === "extend" ? clean({ remainingKm: form.remainingKm || "", fromPlace: form.fromPlace || "", fromPincode: form.fromPincode || "", reason: form.reason, remark: form.remark || "" })
      : { reason: form.reason, remark: form.remark || "" };
    const path = mode === "generate" ? base : `${base}/${mode === "partB" ? "part-b" : mode}`;
    if (await action.submit({ path, body })) onClose();
  }
  return (
    <Modal open onOpenChange={(next) => !next && onClose()} title={`${EWB_TITLES[mode]} · ${row.number}`} description={row.ewayBill ? `EWB ${row.ewayBill}` : row.invoice ? `Invoice ${row.invoice.number} · ${money(row.invoice.total)}` : undefined} footer={<Button variant={mode === "cancel" ? "danger" : "default"} loading={action.isPending} onClick={submit}>{mode === "cancel" ? "Cancel e-way bill" : "Submit"}</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {mode === "generate" ? (
          <>
            {input("distanceKm", "Distance (km)", { type: "number", min: 0, required: true })}
            <Field label="Mode"><Select value={form.transMode} onChange={set("transMode")}><option value="1">Road</option><option value="2">Rail</option><option value="3">Air</option><option value="4">Ship</option></Select></Field>
            {input("vehicleNo", "Vehicle number", { placeholder: "MH12AB1234" })}
            {input("transporterId", "Transporter GSTIN / ID")}
            {input("transporterName", "Transporter name")}
            {input("transDocNo", "LR / document number")}
          </>
        ) : null}
        {mode === "partB" ? (
          <>
            {input("vehicleNo", "New vehicle number")}
            {input("fromPlace", "From place")}
            {reasons(PART_B_REASONS)}
            {input("remark", "Remark")}
          </>
        ) : null}
        {mode === "extend" ? (
          <>
            {input("remainingKm", "Remaining distance (km)", { type: "number", min: 1 })}
            {input("fromPlace", "Current place")}
            {input("fromPincode", "Current PIN code", { maxLength: 6 })}
            {reasons(EXTEND_REASONS)}
            {input("remark", "Remark")}
          </>
        ) : null}
        {mode === "cancel" ? (
          <>
            {reasons(EWB_CANCEL_REASONS)}
            {input("remark", "Remark")}
          </>
        ) : null}
      </div>
      {action.error ? <ErrorNote className="mt-3">{action.error.message}</ErrorNote> : null}
    </Modal>
  );
}

// ---------- GSTR-1 ----------

type Section = { documents: number; taxable: number; igst: number; cgst: number; sgst: number };
type Gstr1 = { period: string; counts: Record<string, number>; sections: Record<"b2b" | "b2c" | "exports" | "creditNotes" | "total", Section>; hsn: Array<{ hsn: string; uqc: string; rate: number; qty: number; taxable: number; igst: number; cgst: number; sgst: number }>; warnings: string[]; filing: Filing };

export function Gstr1Report() {
  const { session } = useSession();
  const { period, picker } = usePeriod();
  const query = useApi<Gstr1>(`/gst/gstr1?period=${period}`, { keepPrevious: true });
  const [error, setError] = useState("");
  const data = query.data;
  const labels: Record<string, string> = { b2b: "B2B (registered)", b2c: "B2C (B2CL + B2CS)", exports: "Exports / SEZ", creditNotes: "Credit notes (CDNR / CDNUR)", total: "Net total" };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {picker}
        <Button variant="outline" disabled={!allowed(session, "accounting.export")} onClick={() => download(`/gst/gstr1/download?period=${period}`, `GSTR1-${period}.json`).catch((reason: Error) => setError(reason.message))}><Download /> Portal JSON</Button>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
      <QueryError error={query.error} />
      {data?.warnings.map((warning) => <Notice key={warning} tone="warn">{warning}</Notice>)}
      {data ? (
        <>
          <Card>
            <CardHeader title={`GSTR-1 · ${period}`} description={Object.entries(data.counts).filter(([, count]) => count).map(([key, count]) => `${key.toUpperCase()} ${count}`).join(" · ") || "No outward supplies"} />
            <DataTable
              rows={Object.entries(data.sections).map(([key, value]) => ({ key, ...value }))}
              rowKey={(row) => row.key}
              density="compact"
              columns={[
                { key: "label", header: "Section", render: (row) => (row.key === "total" ? <strong>{labels[row.key]}</strong> : labels[row.key]) },
                { key: "documents", header: "Docs", align: "right", render: (row) => row.documents },
                { key: "taxable", header: "Taxable", align: "right", render: (row) => money(row.taxable) },
                { key: "igst", header: "IGST", align: "right", render: (row) => money(row.igst) },
                { key: "cgst", header: "CGST", align: "right", render: (row) => money(row.cgst) },
                { key: "sgst", header: "SGST", align: "right", render: (row) => money(row.sgst) },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="HSN summary (Table 12)" />
            <DataTable
              rows={data.hsn}
              rowKey={(row) => `${row.hsn}|${row.rate}`}
              density="compact"
              columns={[
                { key: "hsn", header: "HSN", render: (row) => (row.hsn === "NA" ? <Badge tone="bad">Missing</Badge> : row.hsn) },
                { key: "uqc", header: "UQC", render: (row) => row.uqc },
                { key: "rate", header: "Rate", align: "right", render: (row) => `${row.rate}%` },
                { key: "qty", header: "Qty", align: "right", render: (row) => row.qty },
                { key: "taxable", header: "Taxable", align: "right", render: (row) => money(row.taxable) },
                { key: "tax", header: "Tax", align: "right", render: (row) => money(row.igst + row.cgst + row.sgst) },
              ]}
            />
          </Card>
          <MarkFiled period={period} returnType="GSTR1" filing={data.filing} />
        </>
      ) : null}
    </div>
  );
}

// ---------- GSTR-3B ----------

type Gstr3b = {
  period: string;
  basis: "2b" | "books";
  table31: Record<"a" | "b" | "c" | "d", Heads>;
  table4: { importedAndOther: Heads; reverseCharge: Heads; reversed: Heads; net: Omit<Heads, "taxable">; heldPending2b: Heads };
  liability: Omit<Heads, "taxable">;
  setOff: { utilised: Record<string, number> };
  cashPayable: Omit<Heads, "taxable"> & { total: number };
  filing: Filing;
};

export function Gstr3bReport() {
  const { period, picker } = usePeriod();
  const [basis, setBasis] = useState("2b");
  const query = useApi<Gstr3b>(`/gst/gstr3b?period=${period}&basis=${basis}`, { keepPrevious: true });
  const data = query.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {picker}
        <Field label="ITC basis"><Select value={basis} onChange={(event) => setBasis(event.target.value)}><option value="2b">GSTR-2B matched</option><option value="books">Purchase register</option></Select></Field>
      </div>
      <QueryError error={query.error} />
      {data ? (
        <>
          {data.basis !== basis ? <Notice tone="warn">No GSTR-2B imported for {period}; input tax credit is taken from the purchase register.</Notice> : null}
          <div className="grid gap-3 sm:grid-cols-4">
            <MiniStat label="IGST payable in cash" value={money(data.cashPayable.igst)} />
            <MiniStat label="CGST payable in cash" value={money(data.cashPayable.cgst)} />
            <MiniStat label="SGST payable in cash" value={money(data.cashPayable.sgst)} />
            <MiniStat label="Total cash" value={money(data.cashPayable.total)} />
          </div>
          <Card>
            <CardHeader title="3.1 Outward and reverse-charge inward supplies" />
            <HeadsTable rows={[{ label: "(a) Taxable outward supplies", heads: data.table31.a }, { label: "(b) Zero-rated (exports, SEZ)", heads: data.table31.b }, { label: "(c) Nil-rated / exempt", heads: data.table31.c }, { label: "(d) Inward supplies under reverse charge", heads: data.table31.d }]} />
          </Card>
          <Card>
            <CardHeader title="4. Eligible input tax credit" description={data.basis === "2b" ? "Only bills matched to the supplier's GSTR-1 (via 2B) are claimed." : "Every eligible bill in the purchase register is claimed."} />
            <HeadsTable rows={[{ label: "(A5) All other ITC", heads: data.table4.importedAndOther }, { label: "(A3) Reverse charge", heads: data.table4.reverseCharge }, { label: "(B) Reversed (debit notes)", heads: data.table4.reversed }, { label: "(C) Net ITC", heads: data.table4.net }, { label: "Held: not yet in 2B", heads: data.table4.heldPending2b }]} />
          </Card>
          <Card>
            <CardHeader title="Set-off (rule 88A order)" />
            <CardBody className="text-sm">
              <div className="flex flex-wrap gap-x-6 gap-y-1">
                {Object.entries(data.setOff.utilised).filter(([, value]) => value > 0).map(([key, value]) => <span key={key}>{humanize(key)}: {money(value)}</span>)}
                {Object.values(data.setOff.utilised).every((value) => !value) ? <span className="text-muted">No credit used.</span> : null}
              </div>
            </CardBody>
          </Card>
          <MarkFiled period={period} returnType="GSTR3B" filing={data.filing} />
        </>
      ) : null}
    </div>
  );
}

// ---------- GSTR-2B reconciliation ----------

type TwoBEntry = { id: string; supplierGstin: string; supplierName: string | null; docType: string; invoiceNo: string; invoiceDate: string; taxable: number; igst: number; cgst: number; sgst: number; invoiceValue: number; matchStatus: string | null; differences: string[]; action: string | null; notes: string | null; itcAvailable: boolean; bill: { id: string; number: string; vendorInvoiceNo: string | null } | null };
type TwoB = { period: string; totals: { tax: number; claimable: number; atRisk: number }; entries: TwoBEntry[]; missingIn2b: Array<{ id: string; number: string; vendorInvoiceNo: string | null; vendor: string; gstin: string | null; email: string | null; total: number; tax: number; billDate: string }> };

export function TwoBReconciliation() {
  const { session } = useSession();
  const { period, picker } = usePeriod();
  const query = useApi<TwoB>(`/gst/gstr2b?period=${period}`, { keepPrevious: true });
  const upload = useAction<FormData, { rows: number; created: number; counts: Record<string, number> }>(["/gst"]);
  const rerun = useAction(["/gst"]);
  const update = useAction(["/gst/gstr2b"]);
  const [filter, setFilter] = useState("");
  const [result, setResult] = useState("");
  const canEdit = allowed(session, "accounting.edit");
  const data = query.data;
  const rows = (data?.entries || []).filter((entry) => !filter || entry.matchStatus === filter);
  async function importFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await upload.submit({ path: "/gst/gstr2b/import", body: new FormData(event.currentTarget) });
    if (response) setResult(`${response.rows} rows read, ${response.created} new. ${Object.entries(response.counts).map(([key, count]) => `${humanize(key)} ${count}`).join(" · ")}`);
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        {picker}
        {canEdit ? (
          <>
            <form onSubmit={importFile} className="flex flex-wrap items-end gap-3">
              <Field label="GSTR-2B JSON (portal download)"><input type="file" name="file" accept=".json,application/json" required className="text-sm" /></Field>
              <Button type="submit" variant="outline" loading={upload.isPending}><Upload /> Import</Button>
            </form>
            <Button variant="ghost" loading={rerun.isPending} onClick={() => rerun.submit({ path: "/gst/gstr2b/reconcile", body: { period } })}><RefreshCw /> Re-match</Button>
          </>
        ) : null}
      </div>
      {upload.error ? <ErrorNote>{upload.error.message}</ErrorNote> : null}
      {rerun.error ? <ErrorNote>{rerun.error.message}</ErrorNote> : null}
      {update.error ? <ErrorNote>{update.error.message}</ErrorNote> : null}
      {result ? <Notice tone="good">{result}</Notice> : null}
      <QueryError error={query.error} />
      {data ? (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            <MiniStat label="Tax in 2B" value={money(data.totals.tax)} />
            <MiniStat label="Claimable" value={money(data.totals.claimable)} />
            <MiniStat label="At risk" value={money(data.totals.atRisk)} hint="Mismatched or not in books" />
            <MiniStat label="Bills missing from 2B" value={String(data.missingIn2b.length)} hint="Supplier has not filed" />
          </div>
          <Card>
            <CardHeader
              title="Supplier invoices in GSTR-2B"
              action={
                <Select value={filter} onChange={(event) => setFilter(event.target.value)}>
                  <option value="">All</option>
                  {["MATCHED", "PROBABLE", "MISMATCH", "MISSING_IN_BOOKS"].map((status) => <option key={status} value={status}>{humanize(status)}</option>)}
                </Select>
              }
            />
            <DataTable
              rows={rows}
              rowKey={(row) => row.id}
              density="compact"
              empty={<p className="py-6 text-center text-sm text-muted">Import the GSTR-2B JSON for {period}.</p>}
              columns={[
                { key: "supplier", header: "Supplier", render: (row) => <div><div>{row.supplierName || row.supplierGstin}</div><div className="font-mono text-xs text-muted">{row.supplierGstin}</div></div> },
                { key: "doc", header: "Document", render: (row) => <div>{row.invoiceNo}<div className="text-xs text-muted">{row.docType} · {formatDate(row.invoiceDate)}</div></div> },
                { key: "tax", header: "Tax", align: "right", render: (row) => money(row.igst + row.cgst + row.sgst), sortValue: (row) => row.igst + row.cgst + row.sgst },
                { key: "status", header: "Match", render: (row) => <div><Badge tone={tone(row.matchStatus)}>{humanize(row.matchStatus || "PENDING")}</Badge>{row.differences.length ? <div className="mt-1 text-xs text-muted">{row.differences.join(", ")}</div> : null}{!row.itcAvailable ? <div className="text-xs text-bad">ITC not available</div> : null}</div> },
                { key: "bill", header: "Our bill", render: (row) => (row.bill ? `${row.bill.number}${row.bill.vendorInvoiceNo ? ` (${row.bill.vendorInvoiceNo})` : ""}` : "") },
                {
                  key: "action",
                  header: "Action",
                  render: (row) =>
                    canEdit ? (
                      <Select value={row.action || ""} onChange={(event) => event.target.value && update.submit({ path: `/gst/gstr2b/${row.id}`, method: "PATCH", body: { action: event.target.value } })}>
                        <option value="">—</option>
                        <option value="ACCEPT">Accept</option>
                        <option value="PENDING">Keep pending</option>
                        <option value="FOLLOW_UP">Follow up</option>
                        <option value="REJECT">Reject</option>
                      </Select>
                    ) : humanize(row.action || ""),
                },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Our bills not in GSTR-2B" description="The supplier has not reported these in their GSTR-1. Follow up before claiming the credit." />
            <DataTable
              rows={data.missingIn2b}
              rowKey={(row) => row.id}
              density="compact"
              empty={<p className="py-6 text-center text-sm text-muted">Every bill of {period} appears in 2B.</p>}
              columns={[
                { key: "vendor", header: "Vendor", render: (row) => <div>{row.vendor}<div className="font-mono text-xs text-muted">{row.gstin || "No GSTIN"}</div></div> },
                { key: "bill", header: "Bill", render: (row) => `${row.number}${row.vendorInvoiceNo ? ` (${row.vendorInvoiceNo})` : ""}` },
                { key: "date", header: "Date", render: (row) => formatDate(row.billDate) },
                { key: "tax", header: "Tax at risk", align: "right", render: (row) => money(row.tax) },
                { key: "mail", header: "", align: "right", render: (row) => (row.email ? <a className="text-sm text-accent underline" href={`mailto:${row.email}?subject=${encodeURIComponent(`GSTR-1: invoice ${row.vendorInvoiceNo || row.number} missing`)}&body=${encodeURIComponent(`Your invoice ${row.vendorInvoiceNo || row.number} dated ${formatDate(row.billDate)} does not appear in our GSTR-2B for ${period}. Please report it in your GSTR-1 so that we can claim the credit.`)}`}>Email vendor</a> : null) },
              ]}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ---------- TDS ----------

type Tds = { quarter: string; rows: Array<{ paymentId: string; number: string; date: string; vendor: string; pan: string; section: string; amount: number; tds: number; rate: number }>; sections: Array<{ section: string; label: string; deductees: number; amount: number; tds: number }>; missingPan: number; payableBalance: number | null };

export function TdsReport() {
  const { session } = useSession();
  const [quarter, setQuarter] = useState(quarterNow);
  const query = useApi<Tds>(`/gst/tds?quarter=${quarter}`, { keepPrevious: true });
  const [error, setError] = useState("");
  const data = query.data;
  const fy = Number(quarter.slice(0, 4));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Quarter">
          <Select value={quarter} onChange={(event) => setQuarter(event.target.value)}>
            {[fy - 1, fy].flatMap((year) => [1, 2, 3, 4].map((q) => `${year}-Q${q}`)).map((value) => <option key={value} value={value}>FY {value.slice(0, 4)}-{String(Number(value.slice(0, 4)) + 1).slice(2)} {value.slice(5)}</option>)}
          </Select>
        </Field>
        <Button variant="outline" disabled={!allowed(session, "accounting.export")} onClick={() => download(`/gst/tds/26q?quarter=${quarter}`, `26Q-${quarter}.csv`).catch((reason: Error) => setError(reason.message))}><Download /> 26Q deductee CSV</Button>
        {error ? <ErrorNote>{error}</ErrorNote> : null}
      </div>
      <QueryError error={query.error} />
      {data ? (
        <>
          {data.missingPan ? <Notice tone="warn">{data.missingPan} payment(s) to vendors without a PAN. TDS applies at the higher no-PAN rate; add the PAN on the vendor.</Notice> : null}
          <div className="grid gap-3 sm:grid-cols-3">
            <MiniStat label="TDS deducted" value={money(data.sections.reduce((sum, row) => sum + row.tds, 0))} />
            <MiniStat label="Payments" value={String(data.rows.length)} />
            <MiniStat label="TDS payable balance" value={data.payableBalance === null ? "—" : money(data.payableBalance)} hint="Deposit by the 7th of next month" />
          </div>
          <Card>
            <CardHeader title="By section" />
            <DataTable rows={data.sections} rowKey={(row) => row.section} density="compact" columns={[{ key: "section", header: "Section", render: (row) => <div>{row.section}<div className="text-xs text-muted">{row.label}</div></div> }, { key: "deductees", header: "Deductees", align: "right", render: (row) => row.deductees }, { key: "amount", header: "Paid", align: "right", render: (row) => money(row.amount) }, { key: "tds", header: "TDS", align: "right", render: (row) => money(row.tds) }]} />
          </Card>
          <Card>
            <CardHeader title="Deductions" />
            <DataTable
              rows={data.rows}
              rowKey={(row) => row.paymentId}
              density="compact"
              columns={[
                { key: "date", header: "Date", render: (row) => formatDate(row.date) },
                { key: "number", header: "Payment", render: (row) => row.number },
                { key: "vendor", header: "Deductee", render: (row) => <div>{row.vendor}<div className="font-mono text-xs text-muted">{row.pan}</div></div> },
                { key: "section", header: "Section", render: (row) => row.section || <Badge tone="warn">Not set</Badge> },
                { key: "amount", header: "Amount", align: "right", render: (row) => money(row.amount) },
                { key: "rate", header: "Rate", align: "right", render: (row) => `${row.rate}%` },
                { key: "tds", header: "TDS", align: "right", render: (row) => money(row.tds) },
              ]}
            />
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ---------- Filings ----------

export function Filings() {
  const query = useApi<Array<{ id: string; period: string; returnType: string; arn: string | null; filedOn: string | null; createdAt: string }>>("/gst/filings");
  return (
    <Card>
      <CardHeader title="Filed returns" description="Marking a return as filed locks the books up to the end of that month." />
      <QueryError error={query.error} />
      <DataTable
        rows={query.data || []}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        empty={<p className="py-6 text-center text-sm text-muted">No returns marked as filed yet.</p>}
        columns={[
          { key: "period", header: "Period", render: (row) => row.period },
          { key: "type", header: "Return", render: (row) => (row.returnType === "GSTR1" ? "GSTR-1" : "GSTR-3B") },
          { key: "filed", header: "Filed on", render: (row) => <span className="inline-flex items-center gap-1"><CheckCircle2 className="size-4 text-good" /> {formatDate(row.filedOn)}</span> },
          { key: "arn", header: "ARN", render: (row) => row.arn || <span className="inline-flex items-center gap-1 text-muted"><XCircle className="size-4" /> Not recorded</span> },
        ]}
      />
    </Card>
  );
}
