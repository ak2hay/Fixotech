"use client";

import { Button, ErrorNote, Field, Logo, PasswordInput, TextInput } from "@fixotec/ui";
import { KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { api } from "../../lib/api";
import { DEMO_MODE } from "../../lib/demo";

const HIGHLIGHTS = [
  "Revit Library with large preview tiles and company folders",
  "Version history, Public or Draft status, and downloads",
  "In-browser 3D preview when an IFC is attached",
];

/** Only same-site relative paths, so the login page can't be used as an open redirect. */
function nextPath() {
  const next = new URLSearchParams(window.location.search).get("next") || "/";
  return next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\") && !next.startsWith("/login") ? next : "/";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [ticket, setTicket] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("reason") === "expired") setError("Your session has expired. Please sign in again.");
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setBusy(true);
    try {
      if (ticket) {
        await api("/auth/mfa/verify", { method: "POST", body: JSON.stringify({ ticket, code }) });
        window.location.href = nextPath();
        return;
      }
      const result = await api<{ signedIn?: boolean; mfaRequired?: boolean; ticket?: string }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
      if (result.mfaRequired && result.ticket) {
        setTicket(result.ticket);
        setPassword("");
        return;
      }
      if (result.signedIn) window.location.href = nextPath();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[1.1fr_0.9fr]">
      <section className="relative hidden overflow-hidden bg-sidebar text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-accent/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 left-10 h-80 w-80 rounded-full bg-accent/10 blur-3xl" />
        <Logo tone="light" subtitle="BIM" />
        <div className="relative">
          <p className="max-w-md text-4xl font-semibold leading-tight tracking-tight">The staff library for Revit and BIM files.</p>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-3 text-sm text-white/70">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} Fixotec. Internal system — access is logged.</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="mb-8 lg:hidden">
            <Logo tone="dark" subtitle="BIM" />
          </div>
          <div className="rounded-xl border border-line bg-surface p-7 shadow-pop">
            <div className="mb-6">
              <h1 className="text-xl font-semibold tracking-tight">{ticket ? "Two-step verification" : "Sign in to Fixotec BIM"}</h1>
              <p className="mt-1 text-sm text-muted">{ticket ? "Enter the 6-digit code from your authenticator app." : "Use your Fixotec staff account."}</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
              {ticket ? (
                <Field label="Authenticator code">
                  <TextInput icon={<KeyRound />} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" placeholder="123 456 or recovery code" maxLength={20} autoFocus required />
                </Field>
              ) : (
                <>
                  <Field label="Email">
                    <TextInput icon={<Mail />} value={email} onChange={(event) => setEmail(event.target.value)} type="email" autoComplete="username" required />
                  </Field>
                  <Field label="Password">
                    <PasswordInput icon={<Lock />} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
                  </Field>
                </>
              )}
              {error ? <ErrorNote>{error}</ErrorNote> : null}
              <Button type="submit" size="lg" className="w-full" loading={busy}>
                {ticket ? <><ShieldCheck /> Verify</> : "Sign in"}
              </Button>
              {ticket ? (
                <button type="button" className="w-full text-center text-sm text-muted hover:text-fg" onClick={() => { setTicket(""); setCode(""); }}>
                  Use a different account
                </button>
              ) : null}
            </form>
          </div>
          {DEMO_MODE ? <p role="note" className="mt-4 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Concept demo prepared for Fixotec. All data in this environment is sample data.</p> : null}
        </div>
      </section>
    </main>
  );
}
