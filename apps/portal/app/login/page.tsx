"use client";

import { Button, ErrorNote, Field, PasswordInput, TextInput } from "@fixotec/ui";
import { CheckCircle2, KeyRound, Lock, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useState } from "react";
import { BrandMark } from "../../components/portal-nav";
import { api } from "../../lib/api";
import { DEMO_MODE } from "../../lib/demo";

const HIGHLIGHTS = ["Track projects, quotations and deliveries live", "Order from the catalogue at your own prices", "Download CAD, BIM and submittals in one place"];

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
    <main className="grid min-h-screen bg-canvas lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative m-4 hidden overflow-hidden rounded-3xl bg-gradient-to-br from-accent via-blue-600 to-indigo-700 text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="pointer-events-none absolute -right-24 -top-24 h-96 w-96 rounded-full bg-white/10 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-32 -left-10 h-80 w-80 rounded-full bg-indigo-300/20 blur-3xl" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.06)_1px,transparent_1px)] bg-[size:48px_48px]" />
        <div className="relative flex items-center gap-3">
          <BrandMark className="bg-none bg-white text-accent shadow-none" />
          <span className="leading-tight">
            <span className="block text-lg font-extrabold tracking-[0.06em]">FIXOTEC</span>
            <span className="block text-xs text-white/70">Partner Portal</span>
          </span>
        </div>
        <div className="relative">
          <p className="max-w-md text-4xl font-bold leading-tight tracking-tight">Engineered support for a stronger tomorrow.</p>
          <ul className="mt-8 space-y-3">
            {HIGHLIGHTS.map((item) => (
              <li key={item} className="flex items-center gap-3 rounded-xl bg-white/10 px-4 py-3 text-sm text-white/90 ring-1 ring-inset ring-white/15 backdrop-blur">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                {item}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-xs text-white/60">© {new Date().getFullYear()} Fixotec. For contractors, distributors and consultants.</p>
      </section>
      <section className="flex items-center justify-center p-6 sm:p-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <BrandMark />
            <span className="leading-tight">
              <span className="block text-lg font-extrabold tracking-[0.06em] text-fg">FIXOTEC</span>
              <span className="block text-xs text-muted">Partner Portal</span>
            </span>
          </div>
          <div className="rounded-2xl border border-line/70 bg-surface p-8 shadow-card-hover">
            <div className="mb-7">
              <h1 className="text-2xl font-bold tracking-tight">{ticket ? "Two-step verification" : "Welcome back"}</h1>
              <p className="mt-1 text-sm text-muted">{ticket ? "Enter the 6-digit code from your authenticator app, or a recovery code." : "Use the account Fixotec created for your organisation."}</p>
            </div>
            <form onSubmit={submit} className="space-y-4">
              {ticket ? (
                <Field label="Authenticator code">
                  <TextInput icon={<KeyRound />} value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" placeholder="123 456" maxLength={20} autoFocus required />
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
              <Button type="submit" size="lg" className="h-11 w-full rounded-xl font-semibold shadow-md shadow-accent/25" loading={busy}>
                {ticket ? <><ShieldCheck /> Verify</> : "Sign in"}
              </Button>
              {ticket ? (
                <button type="button" className="w-full text-center text-sm text-muted hover:text-fg" onClick={() => { setTicket(""); setCode(""); }}>
                  Use a different account
                </button>
              ) : null}
            </form>
          </div>
          {DEMO_MODE ? <p role="note" className="mt-4 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">Concept demo prepared for Fixotec. All data in this environment is sample data.</p> : null}
        </div>
      </section>
    </main>
  );
}
