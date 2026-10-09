"use client";

import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useRef, useState } from "react";
import { api } from "./api";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: false } } }));
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/** GET an API path; pass null to skip. The path is the cache key. */
export function useApi<T>(path: string | null, options: { enabled?: boolean; keepPrevious?: boolean } = {}) {
  return useQuery<T>({
    queryKey: [path],
    queryFn: () => api<T>(path as string),
    enabled: Boolean(path) && options.enabled !== false,
    placeholderData: options.keepPrevious ? (previous) => previous : undefined,
  });
}

/** POST/PATCH helper that refreshes every query whose path starts with one of `invalidate`. */
export function useAction<TBody = unknown, TResult = unknown>(invalidate: string[] = []) {
  const client = useQueryClient();
  const mutation = useMutation<TResult, Error, ActionInput<TBody>>({
    mutationFn: ({ path, method = "POST", body }) => api<TResult>(path, { method, body: body instanceof FormData ? body : JSON.stringify(body ?? {}) }),
    onSuccess: () => {
      client.invalidateQueries({ predicate: (query) => invalidate.some((prefix) => String(query.queryKey[0] || "").startsWith(prefix)) });
    },
  });
  const inFlight = useRef(false);
  const { mutateAsync } = mutation;
  /** Ignores repeat submits while a request is running; failures resolve to undefined and show via `error`. */
  const submit = useCallback(
    async (input: ActionInput<TBody>): Promise<TResult | undefined> => {
      if (inFlight.current) return undefined;
      inFlight.current = true;
      try {
        return await mutateAsync(input);
      } catch {
        return undefined;
      } finally {
        inFlight.current = false;
      }
    },
    [mutateAsync],
  );
  return Object.assign(mutation, { submit });
}

type ActionInput<TBody> = { path: string; method?: string; body?: TBody | FormData };

export type Paged<T> = { items: T[]; total: number; page: number; pageSize: number };
