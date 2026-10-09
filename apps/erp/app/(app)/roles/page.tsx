"use client";

import { Badge, Button, Card, CardBody, CardHeader, Checkbox, ErrorNote, Notice, Page, PageHeader, TextInput, cn, humanize } from "@fixotec/ui";
import { Search, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { PageSkeleton, QueryError } from "../../../components/common";
import { useAction, useApi } from "../../../lib/query";
import { allowed, useSession } from "../../../lib/session";

type Role = { id: string; key: string; name: string; description?: string | null; kind: string; permissions: Array<{ permission: { key: string } }>; _count: { users: number } };
type Permission = { id: string; key: string; resource: string; action: string };

export default function RolesPage() {
  const { session } = useSession();
  const roles = useApi<Role[]>("/roles");
  const permissions = useApi<Permission[]>("/permissions");
  const [selected, setSelected] = useState<string>("");
  const [granted, setGranted] = useState<Set<string>>(new Set());
  const [q, setQ] = useState("");
  const action = useAction(["/roles"]);
  const canEdit = allowed(session, "roles.edit");

  const role = (roles.data || []).find((item) => item.key === selected) || roles.data?.[0];
  useEffect(() => {
    if (role) setGranted(new Set(role.permissions.map((item) => item.permission.key)));
  }, [role]);

  const grouped = useMemo(() => {
    const map = new Map<string, Permission[]>();
    for (const permission of permissions.data || []) {
      if (q && !permission.key.includes(q.toLowerCase())) continue;
      map.set(permission.resource, [...(map.get(permission.resource) || []), permission]);
    }
    return [...map.entries()];
  }, [permissions.data, q]);

  if (roles.isLoading || permissions.isLoading) return <PageSkeleton />;
  if (roles.error || permissions.error) return <Page><QueryError error={roles.error || permissions.error} /></Page>;
  const locked = role?.key === "super_admin" || !canEdit;
  const dirty = role ? role.permissions.length !== granted.size || role.permissions.some((item) => !granted.has(item.permission.key)) : false;

  const toggle = (key: string) => setGranted((current) => {
    const next = new Set(current);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    return next;
  });

  return (
    <Page>
      <PageHeader title="Roles & permissions" description="What each role can see and do. Cost visibility and overrides are separate permissions." />
      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <Card className="h-fit">
          <CardBody className="space-y-1 p-2">
            {(roles.data || []).map((item) => (
              <button key={item.key} type="button" onClick={() => setSelected(item.key)} className={cn("flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm", item.key === role?.key ? "bg-accent-soft text-accent" : "hover:bg-canvas")}>
                <span>
                  <span className="block font-medium">{item.name}</span>
                  <span className="text-2xs text-muted">{item._count.users} user{item._count.users === 1 ? "" : "s"} · {item.permissions.length} permissions</span>
                </span>
                {item.kind === "EXTERNAL" ? <Badge tone="info">Portal</Badge> : null}
              </button>
            ))}
          </CardBody>
        </Card>
        {role ? (
          <Card>
            <CardHeader
              title={role.name}
              icon={<ShieldCheck />}
              description={role.description || role.key}
              action={canEdit && role.key !== "super_admin" ? <Button size="sm" disabled={!dirty} loading={action.isPending} onClick={() => action.mutate({ path: `/roles/${role.key}`, method: "PATCH", body: { permissionKeys: [...granted] } })}>Save changes</Button> : null}
            />
            <CardBody className="space-y-4">
              {role.key === "super_admin" ? <Notice tone="info">The super admin role always keeps every permission.</Notice> : null}
              {action.error ? <ErrorNote>{action.error.message}</ErrorNote> : null}
              <TextInput icon={<Search />} placeholder="Filter permissions..." value={q} onChange={(event) => setQ(event.target.value)} className="w-64" />
              <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
                {grouped.map(([resource, items]) => (
                  <div key={resource} className="rounded-md border border-line p-3">
                    <p className="mb-2 text-sm font-semibold">{humanize(resource)}</p>
                    <div className="space-y-1.5">
                      {items.map((permission) => (
                        <label key={permission.key} className={cn("flex items-center gap-2 text-sm", locked && "opacity-70")}>
                          <Checkbox checked={granted.has(permission.key)} disabled={locked} onChange={() => toggle(permission.key)} />
                          {humanize(permission.action)}
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardBody>
          </Card>
        ) : null}
      </div>
    </Page>
  );
}
