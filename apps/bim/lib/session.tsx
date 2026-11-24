"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { api } from "./api";

export type SessionUser = {
  user: { id: string; email: string; name: string; kind: string; jobTitle?: string; customer?: { name: string } | null };
  permissions: string[];
  roleKeys: string[];
  sessionExpiresAt?: string | null;
};

const SessionContext = createContext<{ session: SessionUser | null; loading: boolean; blocked: boolean; refresh: () => Promise<void>; signOut: () => Promise<void> }>({
  session: null,
  loading: true,
  blocked: false,
  refresh: async () => undefined,
  signOut: async () => undefined,
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [blocked, setBlocked] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const me = await api<SessionUser>("/auth/me");
      if (me.user.kind === "EXTERNAL") setBlocked(true);
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

  return <SessionContext.Provider value={{ session, loading, blocked, refresh, signOut }}>{children}</SessionContext.Provider>;
}

export function useSession() {
  return useContext(SessionContext);
}

export function allowed(session: SessionUser | null, permission: string) {
  return Boolean(session?.permissions.includes(permission));
}
