"use client";

import { Card, DataTable, MiniStat, StatusPill, Tabs, compactMoney, money } from "@fixotec/ui";
import { AlertTriangle, Receipt, Wallet } from "lucide-react";
import { useState } from "react";
import { DateText, ListPage, QueryError, SearchBox, matches } from "../../../components/common";
import { rowsOf } from "../../../lib/api";
import { useApi } from "../../../lib/query";

type Invoice = { id: string; number: string; status: string; issueDate: string; dueDate?: string | null; total: number | string; payments: Array<{ amount: number | string }> };

export default function InvoicesPage() {
  const [tab, setTab] = useState("");
  const [q, setQ] = useState("");
  const { data, error, isLoading } = useApi<unknown>("/invoices");
  const all = rowsOf<Invoice>(data).map((row) => {
    const paid = row.payments.reduce((sum, payment) => sum + Number(payment.amount), 0);
    const balance = Math.max(0, Number(row.total) - paid);
    const overdue = balance > 0 && row.dueDate ? new Date(row.dueDate) < new Date() : false;
    return { ...row, paid, balance, overdue };
  });
  const rows = all.filter((row) => (tab === "open" ? row.balance > 0 : tab === "overdue" ? row.overdue : tab === "paid" ? row.balance === 0 : true) && matches(row, q));
  const outstanding = all.reduce((sum, row) => sum + row.balance, 0);
  const overdue = all.filter((row) => row.overdue).reduce((sum, row) => sum + row.balance, 0);

  return (
    <ListPage title="Invoices" description="Tax invoices raised against your shipments and their payment status.">
      <section className="grid gap-4 sm:grid-cols-3">
        <MiniStat label="Invoiced" value={compactMoney(all.reduce((sum, row) => sum + Number(row.total), 0))} icon={<Receipt />} tone="accent" />
        <MiniStat label="Outstanding" value={compactMoney(outstanding)} icon={<Wallet />} tone="warn" />
        <MiniStat label="Overdue" value={compactMoney(overdue)} icon={<AlertTriangle />} tone={overdue ? "bad" : "good"} />
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Tabs
          variant="pill"
          items={[
            { key: "", label: "All", count: all.length },
            { key: "open", label: "Open", count: all.filter((row) => row.balance > 0).length },
            { key: "overdue", label: "Overdue", count: all.filter((row) => row.overdue).length },
            { key: "paid", label: "Paid", count: all.filter((row) => row.balance === 0).length },
          ]}
          value={tab}
          onChange={setTab}
        />
        <SearchBox value={q} onChange={setQ} placeholder="Search invoices..." />
      </div>
      <QueryError error={error} />
      <Card>
        <DataTable
          rows={rows}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={<p className="px-4 py-10 text-center text-sm text-muted">No invoices.</p>}
          columns={[
            { key: "number", header: "Invoice", render: (row) => <span className="font-medium">{row.number}</span> },
            { key: "issueDate", header: "Issued", render: (row) => <DateText value={row.issueDate} /> },
            { key: "dueDate", header: "Due", render: (row) => <span className={row.overdue ? "font-medium text-danger" : ""}><DateText value={row.dueDate} /></span> },
            { key: "total", header: "Total", align: "right", render: (row) => money(row.total) },
            { key: "balance", header: "Balance", align: "right", sortValue: (row) => row.balance, render: (row) => <span className={row.balance ? "font-semibold" : "text-muted"}>{money(row.balance)}</span> },
            { key: "status", header: "Status", render: (row) => <StatusPill status={row.overdue ? "OVERDUE" : row.status} /> },
          ]}
        />
      </Card>
    </ListPage>
  );
}
