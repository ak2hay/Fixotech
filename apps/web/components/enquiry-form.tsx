"use client";

import Link from "next/link";
import Script from "next/script";
import { FormEvent, useState } from "react";
import { browserApi } from "../lib/browser-api";
import { DEMO_MODE } from "../lib/demo";
import { useRfq, writeRfq } from "../lib/rfq";
import { Icon } from "./icons";

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

const APPLICATIONS = ["HVAC", "Plumbing", "Electrical", "Fire Fighting", "Multiple Services", "Equipment / AHU supports", "Other"];

export function EnquiryForm({ mode, topic }: { mode: "contact" | "rfq"; topic?: string }) {
  const basket = useRfq();
  const [state, setState] = useState<{ status: "idle" | "sending" | "done" | "error"; message?: string }>({ status: "idle" });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ status: "sending" });
    const element = event.currentTarget;
    const form = new FormData(element);
    const text = (key: string) => String(form.get(key) || "").trim() || undefined;
    const items = mode === "rfq" && basket.length
      ? basket.map((item) => ({ variantId: item.variantId, description: `${item.articleNumber} ${item.name}`, qty: item.qty, unit: "NOS" }))
      : mode === "rfq"
        ? [{ description: text("application") || "Website RFQ", qty: 1, unit: "SET" }]
        : undefined;
    try {
      const response = await fetch(browserApi("/public/enquiries"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: text("name"),
          company: text("company"),
          email: text("email"),
          phone: text("phone"),
          project: text("project"),
          application: text("application") || (mode === "contact" ? "General" : undefined),
          message: text("message"),
          items,
          website: text("website"),
          captchaToken: text("cf-turnstile-response"),
        }),
      });
      if (response.status === 429) {
        setState({ status: "error", message: "Too many requests from your network. Please wait a few minutes and try again." });
        return;
      }
      if (!response.ok) throw new Error();
      if (mode === "rfq") writeRfq([]);
      element.reset();
      if (DEMO_MODE) setState({ status: "done", message: `Demo: your ${mode === "rfq" ? "RFQ" : "message"} was recorded in this demo's ERP only. It has not been sent to Fixotec.` });
      else setState({ status: "done", message: mode === "rfq" ? "Thank you. Your RFQ has been received and our sales engineers will respond shortly." : "Thank you. Our team will get back to you shortly." });
    } catch {
      setState({ status: "error", message: "We couldn't send that. Please try again or email info@in.fixotec.global." });
    }
  }

  const update = (articleNumber: string, qty: number) => writeRfq(basket.map((item) => (item.articleNumber === articleNumber ? { ...item, qty: Math.max(1, qty) } : item)));
  const remove = (articleNumber: string) => writeRfq(basket.filter((item) => item.articleNumber !== articleNumber));

  if (state.status === "done") {
    return (
      <div className="border border-steel bg-white p-8">
        <span className="flex h-12 w-12 items-center justify-center bg-accent text-white"><Icon name="check" className="h-6 w-6" /></span>
        <h2 className="mt-5 font-display text-3xl font-semibold uppercase text-graphite">Request received</h2>
        <p className="mt-2 text-slate">{state.message}</p>
        <div className="mt-6 flex gap-3"><Link href="/products" className="btn-dark">Continue browsing</Link><button type="button" onClick={() => setState({ status: "idle" })} className="btn-outline">Send another</button></div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="border border-steel bg-white p-6 md:p-8">
      {mode === "rfq" ? (
        <div className="mb-8">
          <p className="kicker mb-3">Your RFQ basket</p>
          {basket.length ? (
            <div className="border border-steel">
              {basket.map((item) => (
                <div key={item.articleNumber} className="flex items-center gap-3 border-b border-steel px-4 py-3 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <Link href={`/products/${item.productSlug}`} className="block truncate text-sm font-semibold text-graphite hover:text-accent">{item.name}</Link>
                    <p className="font-mono text-xs text-accent">{item.articleNumber}</p>
                  </div>
                  <input type="number" min={1} value={item.qty} onChange={(e) => update(item.articleNumber, Number(e.target.value) || 1)} aria-label={`Quantity for ${item.articleNumber}`} className="h-9 w-20 border border-rule px-2 text-right font-mono text-sm" />
                  <button type="button" onClick={() => remove(item.articleNumber)} aria-label={`Remove ${item.articleNumber}`} className="flex h-9 w-9 items-center justify-center text-slate hover:text-accent"><Icon name="close" className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          ) : (
            <p className="border border-dashed border-rule p-5 text-sm text-slate">Your basket is empty. Add article numbers from any <Link href="/products" className="font-semibold text-accent">product page</Link>, or describe your requirement below.</p>
          )}
        </div>
      ) : null}
      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Full name" name="name" required />
        <Field label="Company" name="company" required />
        <Field label="Email" name="email" type="email" required />
        <Field label="Phone" name="phone" type="tel" />
        {mode === "rfq" ? <Field label="Project name" name="project" /> : null}
        <label className={mode === "rfq" ? "" : "md:col-span-2"}>
          <span className="mb-1.5 block text-sm font-semibold text-graphite">Application</span>
          <select name="application" defaultValue="" className="field">
            <option value="">Select…</option>
            {APPLICATIONS.map((a) => <option key={a}>{a}</option>)}
          </select>
        </label>
        <label className="md:col-span-2">
          <span className="mb-1.5 block text-sm font-semibold text-graphite">{mode === "rfq" ? "Requirements" : "Message"}</span>
          <textarea name="message" defaultValue={topic ? `Enquiry about ${topic}: ` : ""} placeholder={mode === "rfq" ? "Quantities, drawing or BOQ reference, delivery location" : "How can we help?"} className="field min-h-32 py-2" />
        </label>
      </div>
      <div aria-hidden="true" className="absolute -left-[10000px] h-px w-px overflow-hidden">
        <label>
          Website
          <input name="website" type="text" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {TURNSTILE_SITE_KEY ? (
        <>
          <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js" strategy="afterInteractive" />
          <div className="cf-turnstile mt-6" data-sitekey={TURNSTILE_SITE_KEY} />
        </>
      ) : null}
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
        <button type="submit" disabled={state.status === "sending"} className="btn-primary disabled:opacity-60">{state.status === "sending" ? "Sending…" : mode === "rfq" ? "Submit RFQ" : "Send message"}<Icon name="arrow" className="h-4 w-4" /></button>
        {state.status === "error" ? <p className="text-sm text-accent">{state.message}</p> : <p className="text-xs text-slate">{DEMO_MODE ? "Demo: submissions stay in this demo and are not sent to Fixotec." : "We reply within one working day."}</p>}
      </div>
    </form>
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
