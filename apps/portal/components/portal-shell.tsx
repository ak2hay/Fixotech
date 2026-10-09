"use client";

import { AccessDenied, AppShell, Button, CommandPalette, SessionExpiryNotice, defaultUserMenu, redirectToLogin, type NavSection, type SearchResult } from "@fixotec/ui";
import { Building2, ClipboardList, FileText, Library, ShieldAlert, ShoppingCart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { MENUS, ROLE_LABEL } from "../config/nav";
import { api } from "../lib/api";
import { DEMO_MODE } from "../lib/demo";
import { useApi } from "../lib/query";
import { useSession } from "../lib/session";
import { BrandMark, PortalSidebar, PortalTopbar } from "./portal-nav";

const RESULT_ICONS: Record<string, React.ReactNode> = {
  project: <Building2 />,
  rfq: <ClipboardList />,
  quotation: <FileText />,
  sales_order: <ShoppingCart />,
  product: <Library />,
  document: <FileText />,
};

/** ERP search hrefs mapped onto portal routes; anything else is dropped. */
function portalHref(href: string) {
  if (/^\/(projects|rfqs|quotations)\//.test(href)) return href;
  if (href.startsWith("/sales-orders/")) return href.replace("/sales-orders/", "/orders/");
  if (href.startsWith("/products/")) return href.replace("/products/", "/catalogue/");
  if (href.startsWith("/documents")) return "/downloads";
  return null;
}

/** Portal routes are role-specific: only paths under the role's own menu (and the home page) are reachable. */
function routeAllowed(sections: NavSection[], pathname: string) {
  if (pathname === "/") return true;
  return sections.some((section) => section.items.some((item) => item.href !== "/" && (pathname === item.href || pathname.startsWith(`${item.href}/`))));
}

export function PortalShell({ children }: { children: React.ReactNode }) {
  const { session, role, loading, blocked, refresh, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const { data: unread } = useApi<{ unreadCount: number }>(session ? "/notifications?unread=1" : null);

  useEffect(() => {
    if (!loading && !session && !blocked) redirectToLogin("signin");
  }, [loading, session, blocked]);

  const sections = MENUS[role];
  const quickLinks: SearchResult[] = useMemo(() => sections.flatMap((section) => section.items.map((item) => ({ id: item.href, label: item.label, sublabel: section.label, href: item.href, group: "Go to" }))), [sections]);

  const search = useCallback(async (query: string) => {
    const result = await api<{ items: Array<SearchResult & { type: string }> }>(`/search?q=${encodeURIComponent(query)}`);
    return result.items.flatMap((item) => {
      const href = portalHref(item.href);
      return href ? [{ ...item, href, icon: RESULT_ICONS[item.type] }] : [];
    });
  }, []);

  if (blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="max-w-sm rounded-xl border border-line bg-surface p-7 text-center shadow-pop">
          <ShieldAlert className="mx-auto h-8 w-8 text-warning" />
          <h1 className="mt-3 text-lg font-semibold">Staff accounts use the ERP</h1>
          <p className="mt-1 text-sm text-muted">This entrance is for customers, distributors and consultants.</p>
          <Button className="mt-5 w-full" variant="outline" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    );
  }

  if (loading || !session) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas">
        <div className="flex flex-col items-center gap-3 text-muted">
          <div className="flex items-center gap-3">
            <BrandMark className="animate-pulse" />
            <span className="text-lg font-extrabold tracking-[0.06em] text-fg">FIXOTEC</span>
          </div>
          <span className="text-xs">Opening your portal...</span>
        </div>
      </div>
    );
  }

  const organisation = session.user.customer?.name;

  return (
    <>
      <AppShell
        sidebar={({ collapsed, closeMobile }) => <PortalSidebar sections={sections} pathname={pathname} collapsed={collapsed} organisation={organisation} onNavigate={closeMobile} onSignOut={signOut} />}
        topbar={({ collapsed, toggle, openMobile }) => (
          <PortalTopbar
            user={{ name: session.user.name, subtitle: ROLE_LABEL[role] }}
            onSearch={() => setPaletteOpen(true)}
            notifications={unread?.unreadCount}
            menu={defaultUserMenu(signOut)}
            onToggleSidebar={toggle}
            collapsed={collapsed}
            onMobileMenu={openMobile}
            searchPlaceholder={role === "distributor" ? "Search products, orders..." : "Search projects, RFQs, orders..."}
          />
        )}
      >
        {DEMO_MODE ? (
          <div role="note" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Demo environment. Prices, stock, customers and orders are sample data.
          </div>
        ) : null}
        {routeAllowed(sections, pathname) ? children : <AccessDenied />}
      </AppShell>
      <SessionExpiryNotice expiresAt={session.sessionExpiresAt} onRecheck={refresh} onSignInAgain={() => void api("/auth/logout", { method: "POST" }).catch(() => undefined).then(() => redirectToLogin("signin"))} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={(href) => router.push(href)} search={search} quickLinks={quickLinks} />
    </>
  );
}
