"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { Icon } from "../../components/icons";
import { browserApi } from "../../lib/browser-api";
import { addToRfq } from "../../lib/rfq";

const INSTALLING = [
  ["PIPE", "Pipes"],
  ["CABLE_TRAY", "Cable trays"],
  ["DUCT", "Ducts"],
  ["EQUIPMENT", "Equipment"],
  ["AHU", "Air handling units"],
  ["ODU", "Outdoor units"],
] as const;

type Result = { label: string; products: Array<{ articleNumber: string; name: string; slug: string }> };

export default function ConfigurePage() {
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [added, setAdded] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setAdded(false);
    const form = new FormData(event.currentTarget);
    const value = (key: string) => String(form.get(key) || "").trim() || undefined;
    try {
      const response = await fetch(browserApi("/public/configure"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ installing: value("installing"), pipeSizeMm: value("pipeSizeMm") ? Number(value("pipeSizeMm")) : undefined, application: value("application"), installation: value("installation"), environment: value("environment") }),
      });
      setResult(response.ok ? await response.json() : { label: "No standard system", products: [] });
    } finally {
      setBusy(false);
    }
  }

  function addAll() {
    for (const p of result?.products || []) addToRfq({ articleNumber: p.articleNumber, name: p.name, productSlug: p.slug, qty: 1 });
    setAdded(true);
  }

  return (
    <main>
      <section className="blueprint border-b border-steel">
        <div className="wrap py-12 md:py-16">
          <p className="kicker">System finder</p>
          <h1 className="h-display mt-3 text-4xl md:text-6xl">Find your support system</h1>
          <p className="mt-4 max-w-2xl text-lg text-slate">Tell us what you are installing and we&apos;ll suggest a standard Fixotec assembly to start from.</p>
        </div>
      </section>
      <section className="wrap grid gap-10 py-14 lg:grid-cols-[1.2fr_1fr]">
        <form onSubmit={submit} className="border border-steel bg-white p-6 md:p-8">
          <p className="mb-3 text-sm font-semibold text-graphite">What are you installing?</p>
          <fieldset className="grid gap-2 sm:grid-cols-3">
            {INSTALLING.map(([value, label]) => (
              <label key={value} className="cursor-pointer">
                <input className="peer sr-only" type="radio" name="installing" value={value} required />
                <span className="flex h-full items-center justify-center border border-rule px-3 py-3 text-center text-sm font-semibold text-graphite transition-colors peer-checked:border-accent peer-checked:bg-accent-soft peer-checked:text-accent peer-focus-visible:ring-2 peer-focus-visible:ring-accent">{label}</span>
              </label>
            ))}
          </fieldset>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <label><span className="mb-1.5 block text-sm font-semibold text-graphite">Pipe size (mm)</span><input name="pipeSizeMm" inputMode="numeric" placeholder="e.g. 100" className="field" /></label>
            <label><span className="mb-1.5 block text-sm font-semibold text-graphite">Application</span><input name="application" placeholder="e.g. HVAC" className="field" /></label>
            <label><span className="mb-1.5 block text-sm font-semibold text-graphite">Installation</span><input name="installation" placeholder="e.g. Ceiling" className="field" /></label>
            <label><span className="mb-1.5 block text-sm font-semibold text-graphite">Environment</span><input name="environment" placeholder="e.g. Indoor, coastal" className="field" /></label>
          </div>
          <button className="btn-primary mt-6" type="submit" disabled={busy}>{busy ? "Finding…" : "Find system"}<Icon name="arrow" className="h-4 w-4" /></button>
        </form>
        <div>
          {result ? (
            <div className="border-t-4 border-accent bg-mist p-6">
              <p className="kicker">Recommended system</p>
              <h2 className="h-display mt-2 text-3xl">{result.label}</h2>
              {result.products.length ? (
                <>
                  <ul className="mt-5 border-x border-t border-steel bg-white">
                    {result.products.map((p) => (
                      <li key={p.articleNumber} className="flex items-center justify-between gap-3 border-b border-steel px-4 py-3">
                        <Link href={`/products/${p.slug}`} className="text-sm font-semibold text-graphite hover:text-accent">{p.name}</Link>
                        <span className="font-mono text-xs text-accent">{p.articleNumber}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <button type="button" onClick={addAll} className="btn-dark">{added ? <><Icon name="check" className="h-4 w-4" />Added to RFQ</> : "Add all to RFQ"}</button>
                    <Link href="/request-quote" className="btn-outline">Review RFQ</Link>
                  </div>
                </>
              ) : (
                <p className="mt-3 text-slate">No standard assembly matches. Our engineers will design one for you. <Link href="/contact" className="font-semibold text-accent">Contact engineering</Link></p>
              )}
            </div>
          ) : (
            <div className="flex h-full min-h-[240px] items-center justify-center border border-dashed border-rule p-8 text-center text-slate">Your recommended assembly will appear here.</div>
          )}
        </div>
      </section>
    </main>
  );
}
