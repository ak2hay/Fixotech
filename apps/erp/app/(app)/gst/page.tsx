"use client";

import { Page, PageHeader, Tabs } from "@fixotec/ui";
import { useState } from "react";
import { EInvoices, EwayBills, Filings, GstSettings, Gstr1Report, Gstr3bReport, TdsReport, TwoBReconciliation } from "../../../components/gst";

const TABS = [
  { key: "einvoice", label: "E-invoices" },
  { key: "ewb", label: "E-way bills" },
  { key: "gstr1", label: "GSTR-1" },
  { key: "gstr3b", label: "GSTR-3B" },
  { key: "2b", label: "2B reconciliation" },
  { key: "tds", label: "TDS" },
  { key: "filings", label: "Filings" },
  { key: "settings", label: "Settings" },
];

export default function GstPage() {
  const [tab, setTab] = useState("einvoice");
  return (
    <Page>
      <PageHeader title="GST & TDS" description="E-invoices, e-way bills, returns, input tax credit matching and TDS, built from the books." />
      <Tabs items={TABS} value={tab} onChange={setTab} />
      {tab === "einvoice" ? <EInvoices /> : null}
      {tab === "ewb" ? <EwayBills /> : null}
      {tab === "gstr1" ? <Gstr1Report /> : null}
      {tab === "gstr3b" ? <Gstr3bReport /> : null}
      {tab === "2b" ? <TwoBReconciliation /> : null}
      {tab === "tds" ? <TdsReport /> : null}
      {tab === "filings" ? <Filings /> : null}
      {tab === "settings" ? <GstSettings /> : null}
    </Page>
  );
}
