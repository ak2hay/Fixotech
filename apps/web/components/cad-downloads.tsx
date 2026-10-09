"use client";

import Script from "next/script";
import { FormEvent, useEffect, useState } from "react";
import { browserApi } from "../lib/browser-api";
import { downloadUrl, formatBytes, type DocumentRef } from "../lib/content";
import { Icon } from "./icons";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const STORAGE_KEY = "fixotec-cad-access";

type Access = { token: string; expiresAt: string };

function readAccess(): Access | null {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null") as Access | null;
    return value && new Date(value.expiresAt).getTime() > Date.now() ? value : null;
  } catch {
    return null;
  }
}

/** CAD/BIM models behind a one-time contact form; the visitor becomes a CAD_DOWNLOAD lead for the sales team. */
export function CadDownloads({ documents, productSlug, productName }: { documents: Array<DocumentRef & { variant?: string | null }>; productSlug: string; productName: string }) {
  const [access, setAccess] = useState<Access | null>(null);
  const [asking, setAsking] = useState(false);
  const [state, setState] = useState<{ status: "idle" | "sending" | "error"; message?: string }>({ status: "idle" });

  useEffect(() => setAccess(readAccess()), []);

  const link = (id: string) => `${downloadUrl(id)}${access ? `?access=${encodeURIComponent(access.token)}` : ""}`;
  const bundle = browserApi(`/public/products/${productSlug}/files.zip?category=CAD,BIM,DRAWING${access ? `&access=${encodeURIComponent(access.token)}` : ""}`);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "sending" });
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) || "").trim() || undefined;
    try {
      const response = await fetch(browserApi("/public/cad-access"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: text("name"), company: text("company"), email: text("email"), phone: text("phone"), productSlug, website: text("website"), captchaToken: text("cf-turnstile-response") }),
      });
      if (response.status === 429) return setState({ status: "error", message: "Too many requests from your network. Please wait a few minutes." });
      if (!response.ok) throw new Error();
      const data = (await response.json()) as { token: string | null; expiresAt?: string };
      if (data.token && data.expiresAt) {
        const value = { token: data.token, expiresAt: data.expiresAt };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
        setAccess(value);
      }
      setAsking(false);
      setState({ status: "idle" });
    } catch {
      setState({ status: "error", message: "We couldn't unlock the downloads. Please check your details and try again." });
    }
  }

  return (
    <div>
      <div className="mt-6 border-x border-t border-steel">
        {documents.map((doc) => (
          <div key={doc.id} className="flex items-center gap-4 border-b border-steel bg-white px-4 py-3.5">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center bg-accent-soft font-mono text-[10px] font-semibold uppercase text-accent">{(doc.fileName || "").split(".").pop()?.slice(0, 4) || "CAD"}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-graphite">{doc.title}</span>
              <span className="block truncate font-mono text-[11px] uppercase tracking-[0.12em] text-slate">
                {doc.category} · {doc.fileName}{doc.sizeBytes ? ` · ${formatBytes(doc.sizeBytes)}` : ""}{doc.variant ? ` · ${doc.variant}` : ""}
              </span>
            </span>
            {access ? (
              <a href={link(doc.id)} rel="noreferrer" className="flex items-center gap-2 text-sm font-semibold text-accent hover:underline"><Icon name="download" className="h-5 w-5" />Download</a>
            ) : (
              <button type="button" onClick={() => setAsking(true)} className="flex items-center gap-2 text-sm font-semibold text-slate hover:text-accent"><Icon name="download" className="h-5 w-5" />Download</button>
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        {access ? (
          <a href={bundle} className="btn-outline"><Icon name="download" className="h-4 w-4" />Download all models (.zip)</a>
        ) : (
          <button type="button" onClick={() => setAsking(true)} className="btn-primary"><Icon name="download" className="h-4 w-4" />Get the CAD / BIM files</button>
        )}
        <p className="text-xs text-slate">Revit families, DWG and IFC models for {productName}, free for consultants, contractors and BIM teams.</p>
      </div>

      {asking && !access ? (
        <form onSubmit={submit} className="mt-6 border border-steel bg-mist p-6">
          <p className="font-display text-xl font-semibold uppercase text-graphite">Tell us who you are</p>
          <p className="mt-1 text-sm text-slate">Leave your details once and every CAD/BIM file on the site unlocks for 30 days. Our engineers can also help with your model.</p>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Full name" name="name" required />
            <Field label="Company" name="company" required />
            <Field label="Email" name="email" type="email" required />
            <Field label="Phone" name="phone" type="tel" />
          </div>
          <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
            <label>Website<input name="website" type="text" tabIndex={-1} autoComplete="off" /></label>
          </div>
          {TURNSTILE_SITE_KEY ? (
            <>
              <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
              <div className="cf-turnstile mt-5" data-sitekey={TURNSTILE_SITE_KEY} />
            </>
          ) : null}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="submit" disabled={state.status === "sending"} className="btn-primary disabled:opacity-60">{state.status === "sending" ? "Unlocking…" : "Unlock downloads"}</button>
            <button type="button" onClick={() => setAsking(false)} className="btn-outline">Cancel</button>
            {state.status === "error" ? <p className="text-sm text-accent">{state.message}</p> : null}
          </div>
        </form>
      ) : null}
    </div>
  );
}

function Field({ label, name, type = "text", required }: { label: string; name: string; type?: string; required?: boolean }) {
  return (
    <label>
      <span className="mb-1.5 block text-sm font-semibold text-graphite">{label}{required ? <span className="text-accent"> *</span> : null}</span>
      <input name={name} type={type} required={required} className="field" />
    </label>
  );
}
