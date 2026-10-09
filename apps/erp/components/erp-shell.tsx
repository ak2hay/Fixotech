"use client";

import { AccessDenied, AppShell, Button, CommandPalette, Drawer, Logo, SessionExpiryNotice, Sidebar, Topbar, defaultUserMenu, humanize, redirectToLogin, relativeTime, type NavSection, type SearchResult } from "@fixotec/ui";
import { Bell, Building2, CheckCheck, ClipboardList, Contact, FileText, Library, ShieldAlert, ShoppingCart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { NAV } from "../config/nav";
import { api } from "../lib/api";
import { DEMO_MODE } from "../lib/demo";
import { useAction, useApi } from "../lib/query";
import { allowed, useSession } from "../lib/session";
import { Link } from "./link";

const RESULT_ICONS: Record<string, React.ReactNode> = {
  project: <Building2 />,
  rfq: <ClipboardList />,
  quotation: <FileText />,
  sales_order: <ShoppingCart />,
  customer: <Contact />,
  product: <Library />,
  document: <FileText />,
};

/** The permission of the most specific nav entry covering this path; "" means any signed-in staff user. */
function routePermission(pathname: string) {
  let match: { href: string; permission: string } | undefined;
  for (const section of NAV) {
    for (const item of section.items) {
      if (item.href === "/" || !(pathname === item.href || pathname.startsWith(`${item.href}/`))) continue;
      if (!match || item.href.length > match.href.length) match = item;
    }
  }
  return match?.permission || "";
}

type Notification = { id: string; title: string; body: string; createdAt: string; readAt: string | null; entityType?: string | null; entityId?: string | null };

export function ErpShell({ children }: { children: React.ReactNode }) {
  const { session, loading, blocked, refresh, signOut } = useSession();
  const pathname = usePathname();
  const router = useRouter();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const queues = useApi<Record<string, number>>(session ? "/reports/queues" : null);
  const notifications = useApi<{ items: Notification[]; unreadCount: number }>(session ? "/notifications" : null);

  useEffect(() => {
    if (!loading && !session && !blocked) redirectToLogin("signin");
  }, [loading, session, blocked]);

  const sections: NavSection[] = useMemo(() => {
    if (!session) return [];
    const badges: Record<string, number | undefined> = { ...(queues.data || {}), notifications: notifications.data?.unreadCount };
    return NAV.map((section) => ({
      label: section.label,
      items: section.items.filter((item) => !item.permission || allowed(session, item.permission)).map((item) => ({ ...item, badge: item.badgeKey ? badges[item.badgeKey] || null : null })),
    }));
  }, [session, queues.data, notifications.data]);

  const quickLinks: SearchResult[] = useMemo(() => sections.flatMap((section) => section.items.map((item) => ({ id: item.href, label: item.label, sublabel: section.label, href: item.href, group: "Go to" }))), [sections]);

  const search = useCallback(async (query: string) => {
    const result = await api<{ items: Array<SearchResult & { type: string }> }>(`/search?q=${encodeURIComponent(query)}`);
    return result.items.map((item) => ({ ...item, icon: RESULT_ICONS[item.type] }));
  }, []);

  if (blocked) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
        <div className="max-w-sm rounded-xl border border-line bg-surface p-7 text-center shadow-pop">
          <ShieldAlert className="mx-auto h-8 w-8 text-warning" />
          <h1 className="mt-3 text-lg font-semibold">Customer accounts use the portal</h1>
          <p className="mt-1 text-sm text-muted">This entrance is for Fixotec staff.</p>
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
          <span className="text-xs">Opening your workspace...</span>
        </div>
      </div>
    );
  }

  const role = session.user.jobTitle || humanize(session.roleKeys[0] || "Staff");
  const permission = routePermission(pathname);
  const permitted = !permission || allowed(session, permission);

  return (
    <>
      <AppShell
        sidebar={({ collapsed, closeMobile }) => <Sidebar sections={sections} pathname={pathname} collapsed={collapsed} LinkComponent={Link} onNavigate={closeMobile} />}
        topbar={({ collapsed, toggle, openMobile }) => (
          <Topbar
            user={{ name: session.user.name, subtitle: role }}
            onSearch={() => setPaletteOpen(true)}
            notifications={notifications.data?.unreadCount}
            onNotifications={() => setNotificationsOpen(true)}
            menu={defaultUserMenu(signOut)}
            onToggleSidebar={toggle}
            collapsed={collapsed}
            onMobileMenu={openMobile}
          />
        )}
      >
        {DEMO_MODE ? (
          <div role="note" className="mb-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
            Demo environment. Prices, stock, customers and orders are sample data.
          </div>
        ) : null}
        {permitted ? children : <AccessDenied />}
      </AppShell>
      <SessionExpiryNotice expiresAt={session.sessionExpiresAt} onRecheck={refresh} onSignInAgain={() => void api("/auth/logout", { method: "POST" }).catch(() => undefined).then(() => redirectToLogin("signin"))} />
      <CommandPalette open={paletteOpen} onOpenChange={setPaletteOpen} onNavigate={(href) => router.push(href)} search={search} quickLinks={quickLinks} />
      <NotificationsDrawer open={notificationsOpen} onOpenChange={setNotificationsOpen} items={notifications.data?.items || []} onOpen={(href) => { setNotificationsOpen(false); router.push(href); }} />
    </>
  );
}

const ENTITY_ROUTES: Record<string, string> = { quotation: "/quotations", project: "/projects", rfq: "/rfqs", sales_order: "/sales-orders", lead: "/leads", customer: "/customers" };

function NotificationsDrawer({ open, onOpenChange, items, onOpen }: { open: boolean; onOpenChange: (open: boolean) => void; items: Notification[]; onOpen: (href: string) => void }) {
  const action = useAction(["/notifications"]);
  return (
    <Drawer
      open={open}
      onOpenChange={onOpenChange}
      title="Notifications"
      description={`${items.filter((item) => !item.readAt).length} unread`}
      footer={
        <Button variant="outline" size="sm" onClick={() => action.mutate({ path: "/notifications/read-all" })} loading={action.isPending}>
          <CheckCheck /> Mark all read
        </Button>
      }
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center py-16 text-center text-muted">
          <Bell className="mb-2 h-6 w-6" />
          <p className="text-sm">You are all caught up.</p>
        </div>
      ) : (
        <ul className="-mx-2 space-y-1">
          {items.map((item) => {
            const route = item.entityType && item.entityId && ENTITY_ROUTES[item.entityType] ? `${ENTITY_ROUTES[item.entityType]}/${item.entityId}` : null;
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full gap-3 rounded-md px-2 py-2.5 text-left hover:bg-canvas"
                  onClick={() => {
                    if (!item.readAt) action.mutate({ path: `/notifications/${item.id}/read` });
                    if (route) onOpen(route);
                  }}
                >
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.readAt ? "bg-line" : "bg-accent"}`} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-fg">{item.title}</span>
                    <span className="mt-0.5 block text-xs text-muted">{item.body}</span>
                    <span className="mt-1 block text-[11px] text-subtle">{relativeTime(item.createdAt)}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Drawer>
  );
}
