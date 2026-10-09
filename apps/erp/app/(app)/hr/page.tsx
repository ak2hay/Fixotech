"use client";

import { Page, PageHeader, Tabs } from "@fixotec/ui";
import { useState } from "react";
import { Assets, AttendanceAdmin, Employees, HrOverview, HrSetup, LeaveAdmin, Performance } from "../../../components/hr";

const TABS = [
  { key: "people", label: "Employees" },
  { key: "attendance", label: "Attendance" },
  { key: "leave", label: "Leave" },
  { key: "assets", label: "Assets" },
  { key: "performance", label: "Performance" },
  { key: "setup", label: "Setup" },
];

export default function PeoplePage() {
  const [tab, setTab] = useState("people");
  return (
    <Page>
      <PageHeader title="People" description="Employee records, onboarding and exits, attendance from biometric, shop floor and site, leave and performance." />
      <HrOverview />
      <Tabs items={TABS} value={tab} onChange={setTab} />
      {tab === "people" ? <Employees /> : null}
      {tab === "attendance" ? <AttendanceAdmin /> : null}
      {tab === "leave" ? <LeaveAdmin /> : null}
      {tab === "assets" ? <Assets /> : null}
      {tab === "performance" ? <Performance /> : null}
      {tab === "setup" ? <HrSetup /> : null}
    </Page>
  );
}
