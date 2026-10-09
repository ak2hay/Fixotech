"use client";

import { Page, PageHeader } from "@fixotec/ui";
import { Payroll } from "../../../components/payroll";

export default function PayrollPage() {
  return (
    <Page>
      <PageHeader title="Payroll" description="Salary structures, monthly runs with attendance-based LOP and shop-floor overtime, PF, ESI, PT, LWF and TDS, bank payout, Form 16 and 24Q, full and final, and labour cost per order and site." />
      <Payroll />
    </Page>
  );
}
