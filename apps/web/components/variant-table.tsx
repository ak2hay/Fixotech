"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import type { Variant } from "../lib/content";
import { addToRfq, useRfq } from "../lib/rfq";
import { Icon } from "./icons";

export function VariantTable({ variants, productSlug }: { variants: Variant[]; productSlug: string }) {
  const keys = useMemo(() => Array.from(new Set(variants.flatMap((v) => Object.keys(v.attributes || {})))), [variants]);
  const options = useMemo(
    () => Object.fromEntries(keys.map((k) => [k, Array.from(new Set(variants.map((v) => v.attributes?.[k]).filter(Boolean))) as string[]])),
    [keys, variants]
  );
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const basket = useRfq();
  const inBasket = new Set(basket.map((item) => item.articleNumber));

  const rows = variants.filter((v) => {
    if (query && !`${v.articleNumber} ${v.name}`.toLowerCase().includes(query.toLowerCase())) return false;
    return Object.entries(filters).every(([k, value]) => !value || v.attributes?.[k] === value);
  });

  return (
    <div>
      <div className="flex flex-wrap items-end gap-3 border border-b-0 border-steel bg-mist p-4">
        <label className="min-w-[200px] flex-1">
          <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-slate">Search</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Article number or description" className="field" />
        </label>
        {keys.filter((k) => options[k].length > 1).map((k) => (
          <label key={k} className="min-w-[140px]">
            <span className="mb-1 block font-mono text-[10px] uppercase tracking-[0.16em] text-slate">{k}</span>
            <select value={filters[k] || ""} onChange={(e) => setFilters({ ...filters, [k]: e.target.value })} className="field pr-8">
              <option value="">All</option>
              {options[k].map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </label>
        ))}
        <p className="ml-auto pb-3 font-mono text-xs text-slate">{rows.length} of {variants.length}</p>
      </div>
      <div className="max-h-[560px] overflow-auto border border-steel">
        <table className="w-full min-w-[640px] border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-graphite text-left text-white">
            <tr>
              <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">Article no.</th>
              <th className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">Description</th>
              {keys.map((k) => <th key={k} className="px-4 py-3 font-mono text-[11px] font-medium uppercase tracking-[0.14em]">{k}</th>)}
              <th className="w-[170px] px-4 py-3 text-right font-mono text-[11px] font-medium uppercase tracking-[0.14em]">RFQ</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v) => {
              const added = inBasket.has(v.articleNumber);
              return (
                <tr key={v.id} className="border-t border-steel odd:bg-white even:bg-mist/60 hover:bg-accent-soft/50">
                  <td className="whitespace-nowrap px-4 py-2.5 font-mono text-[13px] font-medium text-accent">{v.articleNumber}</td>
                  <td className="px-4 py-2.5 text-graphite">{v.name}</td>
                  {keys.map((k) => <td key={k} className="whitespace-nowrap px-4 py-2.5 text-slate">{v.attributes?.[k] || "–"}</td>)}
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <input type="number" min={1} value={qty[v.id] || 1} onChange={(e) => setQty({ ...qty, [v.id]: Math.max(1, Number(e.target.value) || 1) })} aria-label={`Quantity for ${v.articleNumber}`} className="h-8 w-16 border border-rule bg-white px-2 text-right font-mono text-xs" />
                      <button type="button" onClick={() => addToRfq({ variantId: v.id, articleNumber: v.articleNumber, name: v.name, productSlug, qty: qty[v.id] || 1 })} className={`flex h-8 items-center gap-1 px-2.5 text-xs font-semibold transition-colors ${added ? "bg-graphite text-white" : "bg-accent text-white hover:bg-accent-dark"}`}>
                        <Icon name={added ? "check" : "plus"} className="h-3.5 w-3.5" />
                        {added ? "Added" : "Add"}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!rows.length ? <tr><td colSpan={keys.length + 3} className="px-4 py-10 text-center text-slate">No variants match these filters.</td></tr> : null}
          </tbody>
        </table>
      </div>
      {basket.length ? (
        <div className="flex items-center justify-between gap-4 border border-t-0 border-steel bg-graphite px-4 py-3 text-sm text-white">
          <span>{basket.length} article{basket.length === 1 ? "" : "s"} in your RFQ basket</span>
          <Link href="/request-quote" className="inline-flex items-center gap-1.5 font-semibold hover:text-white/80">Review & send <Icon name="arrow" className="h-4 w-4" /></Link>
        </div>
      ) : null}
    </div>
  );
}
