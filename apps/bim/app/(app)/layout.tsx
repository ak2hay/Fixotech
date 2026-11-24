"use client";

import { BimShell } from "../../components/bim-shell";
import { QueryProvider } from "../../lib/query";
import { SessionProvider } from "../../lib/session";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider>
        <BimShell>{children}</BimShell>
      </SessionProvider>
    </QueryProvider>
  );
}
