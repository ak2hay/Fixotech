"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

export type PortalRole = "customer" | "distributor" | "consultant";

export type Session = {
  user: { id: string; email: string; name: string; kind: string; customer?: { name: string; priceList?: string } | null };
  permissions: string[];
  roleKeys: string[];
  sessionExpiresAt?: string | null;
};

type SessionState = { session: Session | null; role: PortalRole; loading: boolean; blocked: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> };

const SessionContext = createContext<SessionState>({ session: null, role: "customer", loading: true, blocked: false, refresh: async () => undefined, signOut: async () => undefined });

/** Contractors use the customer menus; dealers use the distributor menus. */
export function portalRole(roleKeys: string[] = []): PortalRole {
  if (roleKeys.includes("distributor") || roleKeys.includes("dealer")) return "distributor";
  if (roleKeys.includes("consultant")) return "consultant";
  return "customer";
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api<Session>("/auth/me");
      if (me.user.kind !== "EXTERNAL") setBlocked(true);
      else setSession(me);
    } catch {
      setSession(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const signOut = useCallback(async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    window.location.href = "/login";
  }, []);

  return <SessionContext.Provider value={{ session, role: portalRole(session?.roleKeys), loading, blocked, refresh, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function allowed(session: Session | null, permission: string) {
  return Boolean(session?.permissions.includes(permission));
}
