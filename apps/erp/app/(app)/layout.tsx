"use client";

import { ErpShell } from "../../components/erp-shell";
import { QueryProvider } from "../../lib/query";
import { SessionProvider } from "../../lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider>
        <ErpShell>{children}</ErpShell>
      </SessionProvider>
    </QueryProvider>
  );
}
