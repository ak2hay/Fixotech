"use client";

import { ShieldAlert } from "lucide-react";
import * as React from "react";
import { Button, EmptyState } from "./primitives";

const WARN_BEFORE_MS = 10 * 60 * 1000;

/** Sends the user to the login page with a reason and a same-site `next` so they land back where they were. */
export function redirectToLogin(reason: "expired" | "signin" = "expired") {
  if (typeof window === "undefined" || window.location.pathname.startsWith("/login")) return;
  const next = `${window.location.pathname}${window.location.search}`;
  window.location.href = `/login?reason=${reason}&next=${encodeURIComponent(next)}`;
}

/**
 * Warns ten minutes before the session ends and redirects when it does, so unsaved work is not lost to a
 * surprise 401. `onRecheck` lets the app re-validate the session when the tab regains focus (revoked sessions).
 */
export function SessionExpiryNotice({ expiresAt, onSignInAgain, onRecheck }: { expiresAt?: string | null; onSignInAgain: () => void; onRecheck?: () => void }) {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    let lastCheck = Date.now();
    const onFocus = () => {
      setNow(Date.now());
      if (onRecheck && Date.now() - lastCheck > 60_000) {
        lastCheck = Date.now();
        onRecheck();
      }
    };
    window.addEventListener("focus", onFocus);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [onRecheck]);

  const end = expiresAt ? new Date(expiresAt).getTime() : NaN;
  const remaining = end - now;

  React.useEffect(() => {
    if (Number.isFinite(remaining) && remaining <= 0) redirectToLogin("expired");
  }, [remaining]);

  if (!Number.isFinite(remaining) || remaining > WARN_BEFORE_MS || remaining <= 0) return null;
  const minutes = Math.max(1, Math.ceil(remaining / 60_000));
  return (
    <div role="status" aria-live="polite" className="fixed inset-x-0 bottom-4 z-50 mx-auto flex w-fit max-w-[calc(100%-2rem)] items-center gap-3 rounded-lg border border-warning/30 bg-surface px-4 py-3 text-sm shadow-pop">
      <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <span>
        Your session ends in {minutes} minute{minutes === 1 ? "" : "s"}. Save your work, then sign in again to continue.
      </span>
      <Button size="sm" variant="outline" onClick={onSignInAgain}>Sign in again</Button>
    </div>
  );
}

/** Rendered in place of a page the signed-in user has no permission for. */
export function AccessDenied({ action }: { action?: React.ReactNode }) {
  return (
    <EmptyState
      icon={<ShieldAlert />}
      title="You do not have access to this page"
      description="Ask an administrator to grant the required role if you need it."
      action={action}
      className="min-h-[50vh]"
    />
  );
}
