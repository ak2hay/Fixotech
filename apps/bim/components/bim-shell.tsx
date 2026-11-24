"use client";

import { AccessDenied, AppShell, Button, Logo, SessionExpiryNotice, Sidebar, Topbar, defaultUserMenu, humanize, redirectToLogin } from "@fixotec/ui";
import { ShieldAlert } from "lucide-react";
import { usePathname } from "next/navigation";
import { useEffect, useMemo } from "react";
import { NAV } from "../config/nav";
import { api } from "../lib/api";
import { DEMO_MODE } from "../lib/demo";
import { allowed, useSession } from "../lib/session";
import { Link } from "./link";

export function BimShell({ children }: { children: React.ReactNode }) {
  const { session, loading, blocked, refresh, signOut } = useSession();
  const pathname = usePathname();

  useEffect(() => {
    if (!loading && !session && !blocked) redirectToLogin("signin");
  }, [loading, session, blocked]);

  const sections = useMemo(() => {
    if (!session) return [];
    return NAV.map((section) => ({
      label: section.label,
      items: section.items.filter((item) => !item.permission || allowed(session, item.permission)),
    }));
  }, [session]);

  if (blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="max-w-sm rounded-xl border border-line bg-surface p-7 text-center shadow-pop">
          <ShieldAlert className="mx-auto h-8 w-8 text-warning" />
          <h1 className="mt-3 text-lg font-semibold">Customer accounts use the partner portal</h1>
          <p className="mt-1 text-sm text-muted">This entrance is for Fixotec staff who manage Revit and CAD files.</p>
          <Button className="mt-5 w-full" variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="rounded-lg bg-sidebar px-4 py-3">
            <Logo subtitle={null} />
          </div>
          <span className="text-xs">Opening the Revit Library...</span>
        </div>
      </div>
    );
  }

  const role = session.user.jobTitle || humanize(session.roleKeys[0] || "Staff");
  const permitted = allowed(session, "documents.view");

  return (
    <>
      <AppShell
        sidebar={({ collapsed, closeMobile }) => <Sidebar sections={sections} pathname={pathname} collapsed={collapsed} LinkComponent={Link} onNavigate={closeMobile} />}
        topbar={({ collapsed, toggle, openMobile }) => (
          <Topbar
            user={{ name: session.user.name, subtitle: role }}
            menu={defaultUserMenu(signOut)}
            onToggleSidebar={toggle}
            collapsed={collapsed}
            onMobileMenu={openMobile}
          />
        )}
      >
        {DEMO_MODE ? (
          <div role="note" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Demo environment. Files and projects in this workspace may be sample data.
          </div>
        ) : null}
        {permitted ? children : <AccessDenied />}
      </AppShell>
      <SessionExpiryNotice expiresAt={session.sessionExpiresAt} onRecheck={refresh} onSignInAgain={() => void api("/auth/logout", { method: "POST" }).catch(() => undefined).then(() => redirectToLogin("signin"))} />
    </>
  );
}
