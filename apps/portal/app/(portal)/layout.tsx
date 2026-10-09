"use client";

import { PortalShell } from "../../components/portal-shell";
import { QueryProvider } from "../../lib/query";
import { SessionProvider } from "../../lib/session";

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      <SessionProvider>
        <PortalShell>{children}</PortalShell>
      </SessionProvider>
    </QueryProvider>
  );
}
