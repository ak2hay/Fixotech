"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo } from "react";

export type LibraryView = "tiles" | "list";
const STORAGE_KEY = "fixotec.bim.view";

export function readStoredView(): LibraryView {
  if (typeof window === "undefined") return "tiles";
  return window.localStorage.getItem(STORAGE_KEY) === "list" ? "list" : "tiles";
}

export function useLibraryView() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view: LibraryView = useMemo(() => {
    const fromUrl = params.get("view");
    if (fromUrl === "list" || fromUrl === "tiles") return fromUrl;
    return readStoredView();
  }, [params]);

  const setView = useCallback(
    (next: LibraryView) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, next);
      } catch {
        // ignore quota / private-mode failures
      }
      const query = new URLSearchParams(params.toString());
      if (next === "tiles") query.delete("view");
      else query.set("view", next);
      const suffix = query.toString();
      router.replace(suffix ? `${pathname}?${suffix}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  return { view, setView };
}
