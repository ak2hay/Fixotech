"use client";

import { Page, PageHeader } from "@fixotec/ui";
import { MyHr } from "../../../components/my-hr";

export default function MyHrPage() {
  return (
    <Page>
      <PageHeader title="My HR" description="Punch in and out, leave, attendance corrections, expense claims and goals." />
      <MyHr />
    </Page>
  );
}