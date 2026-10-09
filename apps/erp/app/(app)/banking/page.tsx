"use client";

import { Page, PageHeader, Tabs } from "@fixotec/ui";
import { useState } from "react";
import { BankOverview, PaymentLinks, PaymentRuns, Reconcile, Rules, Statements } from "../../../components/banking";

const TABS = [
  { key: "reconcile", label: "Reconcile" },
  { key: "runs", label: "Payment runs" },
  { key: "links", label: "Payment links" },
  { key: "rules", label: "Rules" },
  { key: "statements", label: "Statements" },
];

export default function BankingPage() {
  const [tab, setTab] = useState("reconcile");
  return (
    <Page>
      <PageHeader title="Banking" description="Statement import and reconciliation, bulk vendor payouts and online payment links." />
      <BankOverview />
      <Tabs items={TABS} value={tab} onChange={setTab} />
      {tab === "reconcile" ? <Reconcile /> : null}
      {tab === "runs" ? <PaymentRuns /> : null}
      {tab === "links" ? <PaymentLinks /> : null}
      {tab === "rules" ? <Rules /> : null}
      {tab === "statements" ? <Statements /> : null}
    </Page>
  );
}
