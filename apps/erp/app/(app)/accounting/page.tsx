"use client";

import { Page, PageHeader, Tabs } from "@fixotec/ui";
import { useState } from "react";
import { AccountingOverview, Ageing, BalanceSheet, CashFlow, ChartOfAccounts, ImportExport, Journals, Notes, PeriodClose, ProfitLoss, TrialBalance } from "../../../components/accounting";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "journals", label: "Day book" },
  { key: "accounts", label: "Chart of accounts" },
  { key: "tb", label: "Trial balance" },
  { key: "pl", label: "Profit & loss" },
  { key: "bs", label: "Balance sheet" },
  { key: "cf", label: "Cash flow" },
  { key: "ageing", label: "Ageing" },
  { key: "notes", label: "Credit / debit notes" },
  { key: "close", label: "Period close" },
  { key: "io", label: "Import / export" },
];

export default function AccountingPage() {
  const [tab, setTab] = useState("overview");
  return (
    <Page>
      <PageHeader title="Accounting" description="Double-entry books posted automatically from invoices, bills, payments, stock and payroll." />
      <Tabs items={TABS} value={tab} onChange={setTab} />
      {tab === "overview" ? <AccountingOverview /> : null}
      {tab === "journals" ? <Journals /> : null}
      {tab === "accounts" ? <ChartOfAccounts /> : null}
      {tab === "tb" ? <TrialBalance /> : null}
      {tab === "pl" ? <ProfitLoss /> : null}
      {tab === "bs" ? <BalanceSheet /> : null}
      {tab === "cf" ? <CashFlow /> : null}
      {tab === "ageing" ? <Ageing /> : null}
      {tab === "notes" ? <Notes /> : null}
      {tab === "close" ? <PeriodClose /> : null}
      {tab === "io" ? <ImportExport /> : null}
    </Page>
  );
}
