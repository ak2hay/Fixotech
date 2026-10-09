"use client";

import { AlertTriangle, Compass } from "lucide-react";
import * as React from "react";
import { Button, EmptyState, Skeleton } from "./primitives";

/** Body of an app router `error.tsx`: friendly message, a reference for support, and a retry. */
export function RouteError({ error, reset, fullScreen }: { error: Error & { digest?: string }; reset: () => void; fullScreen?: boolean }) {
  React.useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className={fullScreen ? "flex min-h-screen items-center justify-center bg-canvas p-6" : "p-6"}>
      <EmptyState
        icon={<AlertTriangle />}
        title="Something went wrong"
        description={`This page could not be displayed. Try again, and contact support if it keeps happening.${error.digest ? ` Reference: ${error.digest}` : ""}`}
        action={
          <div className="flex gap-2">
            <Button onClick={reset}>Try again</Button>
            <Button variant="outline" onClick={() => (window.location.href = "/")}>Go to home</Button>
          </div>
        }
      />
    </div>
  );
}

export function RouteNotFound({ homeHref = "/" }: { homeHref?: string }) {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-6">
      <EmptyState
        icon={<Compass />}
        title="Page not found"
        description="The record may have been removed, or the link is wrong."
        action={<Button onClick={() => (window.location.href = homeHref)}>Go to home</Button>}
      />
    </div>
  );
}

export function RouteLoading() {
  return (
    <div className="space-y-4 p-6" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading…</span>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80" />
      <Skeleton className="h-64 w-full" />
    </div>
  );
}
