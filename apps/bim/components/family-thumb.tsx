"use client";

import { useEffect, useState } from "react";
import { blobUrl } from "../lib/api";

export function FamilyThumb({
  documentId,
  version,
  alt,
  className,
  size = "tile",
}: {
  documentId: string;
  version?: number;
  alt: string;
  className?: string;
  size?: "tile" | "row" | "hero";
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let url: string | null = null;
    const path = version ? `/documents/${documentId}/thumbnail?version=${version}` : `/documents/${documentId}/thumbnail`;
    blobUrl(path)
      .then((next) => {
        if (cancelled) {
          URL.revokeObjectURL(next);
          return;
        }
        url = next;
        setSrc(next);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [documentId, version]);

  if (failed || (!src && failed)) {
    return <Placeholder size={size} className={className} label={alt} />;
  }
  if (!src) {
    return <div className={["animate-pulse bg-canvas", className].filter(Boolean).join(" ")} aria-hidden />;
  }
  return {/* Authenticated blob preview; next/image cannot send the session cookie. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} className={className} onError={() => setFailed(true)} />;
}

function Placeholder({ size, className, label }: { size: "tile" | "row" | "hero"; className?: string; label: string }) {
  const letter = (label || "?").trim().charAt(0).toUpperCase();
  return (
    <div className={["flex items-center justify-center bg-[#eceff3] text-muted", className].filter(Boolean).join(" ")} aria-label={`No preview for ${label}`}>
      <span className={size === "row" ? "text-sm font-semibold" : "text-4xl font-semibold tracking-tight"}>{letter}</span>
    </div>
  );
}
