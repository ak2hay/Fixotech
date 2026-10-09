"use client";

import { DropdownMenu, cn, initials, isActive, type MenuItem, type NavSection } from "@fixotec/ui";
import { Bell, Building2, ChevronDown, LogOut, Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search } from "lucide-react";
import { Link } from "./link";

export function BrandMark({ className }: { className?: string }) {
  return (
    <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent-strong text-white shadow-sm shadow-accent/30", className)}>
      <Building2 className="h-5 w-5" />
    </span>
  );
}

export function PortalSidebar({ sections, pathname, collapsed, organisation, onNavigate, onSignOut }: { sections: NavSection[]; pathname: string; collapsed?: boolean; organisation?: string | null; onNavigate?: () => void; onSignOut: () => void }) {
  const items = sections.flatMap((section) => section.items);
  return (
    <aside className={cn("flex h-full flex-col border-r border-line bg-surface", collapsed ? "w-[76px]" : "w-[248px]")}>
      <Link href="/" onClick={onNavigate} className={cn("flex h-[72px] shrink-0 items-center gap-3", collapsed ? "justify-center" : "px-5")}>
        <BrandMark />
        {!collapsed ? (
          <span className="min-w-0 leading-tight">
            <span className="block text-[17px] font-extrabold tracking-[0.06em] text-fg">FIXOTEC</span>
            {organisation ? <span className="block truncate text-[11px] text-muted">{organisation}</span> : null}
          </span>
        ) : null}
      </Link>
      <nav className="scrollbar-thin flex-1 overflow-y-auto px-3 py-3">
        <ul className="space-y-1">
          {items.map((item) => {
            const active = isActive(pathname, item);
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  title={collapsed ? item.label : undefined}
                  onClick={onNavigate}
                  className={cn(
                    "group relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    collapsed && "justify-center px-0",
                    active ? "bg-accent-soft text-accent" : "text-fg/70 hover:bg-canvas hover:text-fg",
                  )}
                >
                  {active ? <span className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-accent" /> : null}
                  {Icon ? <Icon className={cn("h-[18px] w-[18px] shrink-0", active ? "text-accent" : "text-muted group-hover:text-fg")} /> : null}
                  {!collapsed ? <span className="flex-1 truncate">{item.label}</span> : null}
                  {!collapsed && item.badge ? <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold leading-[18px] text-white tabular">{item.badge}</span> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-3 pb-4">
        <div className="mb-3 h-px bg-line" />
        <button type="button" onClick={onSignOut} title={collapsed ? "Sign out" : undefined} className={cn("flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-fg/70 transition-colors hover:bg-danger-soft hover:text-danger", collapsed && "justify-center px-0")}>
          <LogOut className="h-[18px] w-[18px] shrink-0" />
          {!collapsed ? <span>Sign out</span> : null}
        </button>
      </div>
    </aside>
  );
}

export function PortalTopbar({ user, searchPlaceholder, onSearch, notifications, menu, collapsed, onToggleSidebar, onMobileMenu }: { user: { name: string; subtitle?: string }; searchPlaceholder: string; onSearch: () => void; notifications?: number; menu: MenuItem[]; collapsed?: boolean; onToggleSidebar?: () => void; onMobileMenu?: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-[72px] shrink-0 items-center gap-3 border-b border-line/70 bg-surface/80 px-4 backdrop-blur-md lg:px-8">
      <button type="button" className="rounded-lg p-2 text-muted hover:bg-canvas lg:hidden" onClick={onMobileMenu} aria-label="Open menu">
        <MenuIcon className="h-5 w-5" />
      </button>
      <button type="button" className="hidden rounded-lg p-2 text-muted hover:bg-canvas hover:text-fg lg:inline-flex" onClick={onToggleSidebar} aria-label="Toggle sidebar">
        {collapsed ? <PanelLeftOpen className="h-[18px] w-[18px]" /> : <PanelLeftClose className="h-[18px] w-[18px]" />}
      </button>
      <div className="ml-auto flex items-center gap-2 sm:gap-4">
        <button type="button" onClick={onSearch} className="flex h-10 w-10 items-center gap-2.5 rounded-xl border border-line bg-canvas/80 px-3 text-sm text-subtle transition hover:border-subtle/50 sm:w-72 lg:w-80">
          <Search className="h-4 w-4 shrink-0" />
          <span className="hidden flex-1 truncate text-left sm:block">{searchPlaceholder}</span>
        </button>
        <span className="relative inline-flex rounded-lg p-2 text-accent" aria-label={notifications ? `${notifications} unread notifications` : "Notifications"}>
          <Bell className="h-5 w-5" />
          {notifications ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-danger ring-2 ring-surface" /> : null}
        </span>
        <DropdownMenu
          trigger={
            <button type="button" className="flex items-center gap-3 rounded-xl py-1 pl-1 pr-2 transition hover:bg-canvas">
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-accent to-accent-strong text-sm font-semibold text-white">{initials(user.name)}</span>
              <span className="hidden text-left leading-tight md:block">
                <span className="block text-sm font-semibold text-fg">{user.name}</span>
                {user.subtitle ? <span className="block max-w-[180px] truncate text-xs text-muted">{user.subtitle}</span> : null}
              </span>
              <ChevronDown className="hidden h-4 w-4 text-muted md:block" />
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
