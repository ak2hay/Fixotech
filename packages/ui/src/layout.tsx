"use client";

import { Command } from "cmdk";
import { Bell, ChevronRight, HelpCircle, LogOut, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search, User, X } from "lucide-react";
import * as React from "react";
import { Logo, Mark } from "./brand";
import { DefaultLink, DropdownMenu, type LinkLike, type MenuItem } from "./overlays";
import { Avatar, Kbd } from "./primitives";
import { cn } from "./utils";

/* -------------------------------- Sidebar --------------------------------- */

export type NavItem = { href: string; label: string; icon?: React.ComponentType<{ className?: string }>; badge?: number | string | null; match?: string[] };
export type NavSection = { label: string; items: NavItem[] };

export function isActive(pathname: string, item: NavItem) {
  const paths = [item.href, ...(item.match || [])];
  return paths.some((path) => (path === "/" ? pathname === "/" : pathname === path || pathname.startsWith(`${path}/`)));
}

export function Sidebar({ sections, pathname, collapsed, LinkComponent, brandHref = "/", subtitle, footer, onNavigate }: { sections: NavSection[]; pathname: string; collapsed?: boolean; LinkComponent?: LinkLike; brandHref?: string; subtitle?: string; footer?: React.ReactNode; onNavigate?: () => void }) {
  const Anchor = LinkComponent || DefaultLink;
  return (
    <aside className={cn("flex h-full flex-col bg-sidebar text-sidebar-fg", collapsed ? "w-[68px]" : "w-[232px]")}>
      <Anchor href={brandHref} className={cn("flex h-16 shrink-0 items-center border-b border-white/5", collapsed ? "justify-center" : "px-5")}>
        {collapsed ? <Mark className="h-8 w-8 text-white/10" /> : <Logo subtitle={subtitle} />}
      </Anchor>
      <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
        {sections.map((section) =>
          section.items.length ? (
            <div key={section.label}>
              {!collapsed ? <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-muted/80">{section.label}</p> : <div className="mx-auto mb-2 h-px w-6 bg-white/10" />}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(pathname, item);
                  const Icon = item.icon;
                  return (
                    <li key={item.href}>
                      <Anchor
                        href={item.href}
                        title={collapsed ? item.label : undefined}
                        onClick={onNavigate}
                        className={cn(
                          "group flex items-center gap-2.5 rounded-md px-2.5 py-[7px] text-[13px] font-medium transition-colors",
                          collapsed && "justify-center px-0",
                          active ? "bg-accent text-white shadow-sm" : "text-sidebar-fg/75 hover:bg-sidebar-hover hover:text-white",
                        )}
                      >
                        {Icon ? <Icon className={cn("h-4 w-4 shrink-0", active ? "text-white" : "text-sidebar-muted group-hover:text-white")} /> : null}
                        {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                        {!collapsed && item.badge ? <span className={cn("rounded-full px-1.5 text-[10px] font-semibold leading-[18px] tabular", active ? "bg-white/20 text-white" : "bg-accent text-white")}>{item.badge}</span> : null}
                      </Anchor>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null,
        )}
      </nav>
      {footer ? <div className="border-t border-white/5 p-3">{footer}</div> : null}
    </aside>
  );
}

/* --------------------------------- Topbar --------------------------------- */

export function Topbar({ user, onSearch, notifications, onNotifications, menu, onToggleSidebar, collapsed, onMobileMenu, searchPlaceholder = "Search projects, RFQs, products, customers...", extra }: { user: { name: string; subtitle?: string }; onSearch?: () => void; notifications?: number; onNotifications?: () => void; menu: MenuItem[]; onToggleSidebar?: () => void; collapsed?: boolean; onMobileMenu?: () => void; searchPlaceholder?: string; extra?: React.ReactNode }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-6">
      <button type="button" className="rounded-md p-2 text-muted hover:bg-canvas lg:hidden" onClick={onMobileMenu} aria-label="Open menu">
        <MenuIcon className="h-5 w-5" />
      </button>
      {onToggleSidebar ? (
        <button type="button" className="hidden rounded-md p-2 text-muted hover:bg-canvas hover:text-fg lg:inline-flex" onClick={onToggleSidebar} aria-label="Toggle sidebar">
          {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
        </button>
      ) : null}
      <button type="button" onClick={onSearch} className="flex h-9 w-full max-w-md items-center gap-2 rounded-md border border-line bg-canvas/70 px-3 text-sm text-subtle transition hover:border-subtle/60">
        <Search className="h-4 w-4" />
        <span className="flex-1 truncate text-left">{searchPlaceholder}</span>
        <span className="hidden items-center gap-0.5 sm:flex">
          <Kbd>Ctrl</Kbd>
          <Kbd>K</Kbd>
        </span>
      </button>
      <div className="ml-auto flex items-center gap-1">
        {extra}
        <button type="button" className="hidden rounded-md p-2 text-muted hover:bg-canvas hover:text-fg sm:inline-flex" aria-label="Help">
          <HelpCircle className="h-[18px] w-[18px]" />
        </button>
        <button type="button" onClick={onNotifications} className="relative rounded-md p-2 text-muted hover:bg-canvas hover:text-fg" aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" />
          {notifications ? <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-accent px-1 text-[9px] font-bold text-white">{notifications > 9 ? "9+" : notifications}</span> : null}
        </button>
        <DropdownMenu
          trigger={
            <button type="button" className="ml-1 flex items-center gap-2.5 rounded-md py-1 pl-1 pr-2 hover:bg-canvas">
              <Avatar name={user.name} size="md" className="bg-sidebar text-white" />
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-sm font-semibold text-fg">{user.name}</span>
                {user.subtitle ? <span className="block text-[11px] text-muted">{user.subtitle}</span> : null}
              </span>
            </button>
          }
          header={
            <div>
              <p className="text-sm font-semibold">{user.name}</p>
              {user.subtitle ? <p className="text-xs text-muted">{user.subtitle}</p> : null}
            </div>
          }
          items={menu}
        />
      </div>
    </header>
  );
}

export const defaultUserMenu = (signOut: () => void, profileHref?: string): MenuItem[] => [
  ...(profileHref ? [{ label: "Profile", icon: <User />, href: profileHref }] : []),
  { label: "Sign out", icon: <LogOut />, onSelect: signOut, danger: true },
];

/* ---------------------------- Command palette ----------------------------- */

export type SearchResult = { id: string; label: string; sublabel?: string; href: string; group: string; icon?: React.ReactNode };

export function CommandPalette({ open, onOpenChange, onNavigate, search, quickLinks }: { open: boolean; onOpenChange: (open: boolean) => void; onNavigate: (href: string) => void; search: (query: string) => Promise<SearchResult[]>; quickLinks: SearchResult[] }) {
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<SearchResult[]>([]);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        onOpenChange(!open);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  React.useEffect(() => {
    const term = query.trim();
    if (term.length < 2) {
      setResults([]);
      return;
    }
    setLoading(true);
    const handle = window.setTimeout(() => {
      search(term)
        .then(setResults)
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, search]);

  const quick = quickLinks.filter((item) => !query || item.label.toLowerCase().includes(query.toLowerCase()));
  const groups = results.reduce<Record<string, SearchResult[]>>((acc, item) => {
    (acc[item.group] ||= []).push(item);
    return acc;
  }, {});

  function go(href: string) {
    onOpenChange(false);
    onNavigate(href);
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      shouldFilter={false}
      label="Search"
      overlayClassName="fixed inset-0 z-50 bg-sidebar/40 backdrop-blur-[1px]"
      contentClassName="fixed left-1/2 top-[12vh] z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border border-line bg-surface shadow-pop"
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search className="h-4 w-4 text-muted" />
        <Command.Input value={query} onValueChange={setQuery} placeholder="Search or jump to..." className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle" />
        <button type="button" onClick={() => onOpenChange(false)} className="rounded p-1 text-muted hover:bg-canvas" aria-label="Close">
          <X className="h-4 w-4" />
        </button>
      </div>
      <Command.List className="max-h-[56vh] overflow-y-auto p-2">
        {loading ? <Command.Loading><p className="px-3 py-2 text-xs text-muted">Searching...</p></Command.Loading> : null}
        {query.trim().length >= 2 && !loading && !results.length && !quick.length ? <Command.Empty className="px-3 py-8 text-center text-sm text-muted">No matches for "{query}".</Command.Empty> : null}
        {Object.entries(groups).map(([group, items]) => (
          <Command.Group key={group} heading={group} className="mb-1 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted">
            {items.map((item) => (
              <PaletteItem key={`${group}-${item.id}`} item={item} onSelect={() => go(item.href)} />
            ))}
          </Command.Group>
        ))}
        {quick.length ? (
          <Command.Group heading="Go to" className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-muted">
            {quick.slice(0, 12).map((item) => (
              <PaletteItem key={`quick-${item.id}`} item={item} onSelect={() => go(item.href)} />
            ))}
          </Command.Group>
        ) : null}
      </Command.List>
    </Command.Dialog>
  );
}

function PaletteItem({ item, onSelect }: { item: SearchResult; onSelect: () => void }) {
  return (
    <Command.Item value={`${item.group}-${item.id}-${item.label}`} onSelect={onSelect} className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm aria-selected:bg-canvas">
      {item.icon ? <span className="text-muted [&_svg]:h-4 [&_svg]:w-4">{item.icon}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-fg">{item.label}</span>
        {item.sublabel ? <span className="block truncate text-xs text-muted">{item.sublabel}</span> : null}
      </span>
      <ChevronRight className="h-3.5 w-3.5 text-subtle" />
    </Command.Item>
  );
}

/* -------------------------------- AppShell -------------------------------- */

export function AppShell({ sidebar, topbar, children }: { sidebar: (state: { collapsed: boolean; closeMobile: () => void }) => React.ReactNode; topbar: (state: { collapsed: boolean; toggle: () => void; openMobile: () => void }) => React.ReactNode; children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState(false);
  const [mobile, setMobile] = React.useState(false);

  React.useEffect(() => {
    setCollapsed(window.localStorage.getItem("fixotec_sidebar") === "collapsed");
  }, []);

  function toggle() {
    setCollapsed((value) => {
      window.localStorage.setItem("fixotec_sidebar", value ? "open" : "collapsed");
      return !value;
    });
  }

  return (
    <div className="flex min-h-screen bg-canvas">
      <div className="sticky top-0 hidden h-screen shrink-0 lg:block">{sidebar({ collapsed, closeMobile: () => setMobile(false) })}</div>
      {mobile ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-sidebar/50" onClick={() => setMobile(false)} />
          <div className="relative h-full w-fit animate-fade-in">{sidebar({ collapsed: false, closeMobile: () => setMobile(false) })}</div>
        </div>
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar({ collapsed, toggle, openMobile: () => setMobile(true) })}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

/* ------------------------------ Page headers ------------------------------ */

export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items, LinkComponent }: { items: Crumb[]; LinkComponent?: LinkLike }) {
  const Anchor = LinkComponent || DefaultLink;
  return (
    <nav className="flex items-center gap-1 text-xs text-muted">
      {items.map((item, index) => (
        <React.Fragment key={`${item.label}-${index}`}>
          {index > 0 ? <ChevronRight className="h-3 w-3 text-subtle" /> : null}
          {item.href ? <Anchor href={item.href} className="hover:text-fg">{item.label}</Anchor> : <span className="text-fg">{item.label}</span>}
        </React.Fragment>
      ))}
    </nav>
  );
}

export function Page({ children, className, width = "full" }: { children: React.ReactNode; className?: string; width?: "full" | "narrow" }) {
  return <div className={cn("mx-auto space-y-5 px-4 py-5 lg:px-6 lg:py-6", width === "narrow" ? "max-w-4xl" : "max-w-[1600px]", className)}>{children}</div>;
}

export function PageHeader({ title, description, actions, breadcrumbs, LinkComponent, children }: { title: React.ReactNode; description?: React.ReactNode; actions?: React.ReactNode; breadcrumbs?: Crumb[]; LinkComponent?: LinkLike; children?: React.ReactNode }) {
  return (
    <div className="space-y-4">
      {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} LinkComponent={LinkComponent} /> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-bold tracking-tight text-fg">{title}</h1>
          {description ? <p className="mt-0.5 text-sm text-muted">{description}</p> : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export function DetailHeader({ breadcrumbs, title, code, pills, meta, value, actions, image, LinkComponent, children }: { breadcrumbs?: Crumb[]; title: React.ReactNode; code?: React.ReactNode; pills?: React.ReactNode; meta?: Array<{ icon?: React.ReactNode; label: React.ReactNode }>; value?: { label: string; amount: React.ReactNode }; actions?: React.ReactNode; image?: string | null; LinkComponent?: LinkLike; children?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-line bg-surface shadow-card">
      <div className="space-y-3 px-5 pb-4 pt-4">
        {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} LinkComponent={LinkComponent} /> : null}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-4">
            {image ? <img src={image} alt="" className="hidden h-14 w-14 shrink-0 rounded-lg object-cover sm:block" /> : null}
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-xl font-bold tracking-tight text-fg">{title}</h1>
                {code ? <span className="rounded-md bg-canvas px-2 py-0.5 font-mono text-xs text-muted ring-1 ring-inset ring-line">{code}</span> : null}
                {pills}
              </div>
              {meta?.length ? (
                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                  {meta.map((item, index) => (
                    <span key={index} className="inline-flex items-center gap-1.5 [&_svg]:h-3.5 [&_svg]:w-3.5">
                      {item.icon}
                      {item.label}
                    </span>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
          <div className="flex items-center gap-4">
            {value ? (
              <div className="text-right">
                <p className="text-xl font-bold tabular text-fg">{value.amount}</p>
                <p className="text-xs text-muted">{value.label}</p>
              </div>
            ) : null}
            {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
          </div>
        </div>
      </div>
      {children ? <div className="px-5">{children}</div> : null}
    </div>
  );
}
