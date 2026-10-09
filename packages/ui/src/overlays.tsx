"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import * as Menu from "@radix-ui/react-dropdown-menu";
import { X } from "lucide-react";
import * as React from "react";
import { cn } from "./utils";

type OverlayProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function Modal({ open, onOpenChange, title, description, children, footer, className }: OverlayProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-sidebar/40 backdrop-blur-[1px]" />
        <DialogPrimitive.Content className={cn("fixed left-1/2 top-[12vh] z-50 flex max-h-[76vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 animate-fade-in flex-col rounded-xl border border-line bg-surface shadow-pop focus:outline-none", className)}>
          <OverlayHeader title={title} description={description} />
          <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function Drawer({ open, onOpenChange, title, description, children, footer, className }: OverlayProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 animate-fade-in bg-sidebar/30" />
        <DialogPrimitive.Content className={cn("fixed inset-y-0 right-0 z-50 flex w-full max-w-md animate-slide-in flex-col border-l border-line bg-surface shadow-pop focus:outline-none", className)}>
          <OverlayHeader title={title} description={description} />
          <div className="flex-1 overflow-auto px-5 py-4">{children}</div>
          {footer ? <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function OverlayHeader({ title, description }: { title: React.ReactNode; description?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
      <div>
        <DialogPrimitive.Title className="text-base font-semibold text-fg">{title}</DialogPrimitive.Title>
        {description ? <DialogPrimitive.Description className="mt-0.5 text-sm text-muted">{description}</DialogPrimitive.Description> : <DialogPrimitive.Description className="sr-only">{String(title)}</DialogPrimitive.Description>}
      </div>
      <DialogPrimitive.Close className="rounded-md p-1 text-muted hover:bg-canvas hover:text-fg" aria-label="Close">
        <X className="h-4 w-4" />
      </DialogPrimitive.Close>
    </div>
  );
}

export type MenuItem = { label: string; icon?: React.ReactNode; onSelect?: () => void; href?: string; danger?: boolean; separator?: boolean };

export function DropdownMenu({ trigger, items, align = "end", header }: { trigger: React.ReactNode; items: MenuItem[]; align?: "start" | "end"; header?: React.ReactNode }) {
  return (
    <Menu.Root>
      <Menu.Trigger asChild>{trigger}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Content align={align} sideOffset={6} className="z-50 min-w-48 animate-fade-in rounded-lg border border-line bg-surface p-1 shadow-pop">
          {header ? <div className="px-2.5 py-2">{header}</div> : null}
          {header ? <Menu.Separator className="my-1 h-px bg-line" /> : null}
          {items.map((item, index) =>
            item.separator ? (
              <Menu.Separator key={`sep-${index}`} className="my-1 h-px bg-line" />
            ) : (
              <Menu.Item
                key={item.label}
                onSelect={() => {
                  if (item.href) window.location.href = item.href;
                  item.onSelect?.();
                }}
                className={cn("flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none data-[highlighted]:bg-canvas [&_svg]:h-4 [&_svg]:w-4", item.danger ? "text-danger" : "text-fg")}
              >
                {item.icon}
                {item.label}
              </Menu.Item>
            ),
          )}
        </Menu.Content>
      </Menu.Portal>
    </Menu.Root>
  );
}

export type TabItem = { key: string; label: string; count?: number | null; href?: string };

export function Tabs({ items, value, onChange, className, LinkComponent, variant = "underline" }: { items: TabItem[]; value: string; onChange?: (key: string) => void; className?: string; LinkComponent?: LinkLike; variant?: "underline" | "pill" }) {
  const Anchor = LinkComponent || DefaultLink;
  return (
    <div className={cn(variant === "underline" ? "flex gap-5 overflow-x-auto border-b border-line" : "inline-flex gap-1 rounded-lg bg-canvas p-1", className)} role="tablist">
      {items.map((item) => {
        const active = item.key === value;
        const classes =
          variant === "underline"
            ? cn("-mb-px flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 px-0.5 pb-2.5 pt-1 text-sm font-medium transition-colors", active ? "border-accent text-fg" : "border-transparent text-muted hover:text-fg")
            : cn("flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition", active ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg");
        const content = (
          <>
            {item.label}
            {item.count != null ? <span className={cn("rounded-full px-1.5 py-px text-[10px] font-semibold tabular", active ? "bg-accent text-white" : "bg-canvas text-muted ring-1 ring-line")}>{item.count}</span> : null}
          </>
        );
        if (item.href) return <Anchor key={item.key} href={item.href} className={classes}>{content}</Anchor>;
        return (
          <button key={item.key} type="button" role="tab" aria-selected={active} className={classes} onClick={() => onChange?.(item.key)}>
            {content}
          </button>
        );
      })}
    </div>
  );
}

export type LinkLike = React.ComponentType<{ href: string; className?: string; children?: React.ReactNode; title?: string; onClick?: () => void }>;

export function DefaultLink({ href, className, children, title, onClick }: { href: string; className?: string; children?: React.ReactNode; title?: string; onClick?: () => void }) {
  return <a href={href} className={className} title={title} onClick={onClick}>{children}</a>;
}
