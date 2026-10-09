"use client";

import { Button, TextInput, cn } from "@fixotec/ui";
import { Plus, Search, Trash2 } from "lucide-react";
import { useState } from "react";
import { useApi, type Paged } from "../lib/query";

export type Line = { variantId?: string; description: string; qty: number; unit: string; specification?: string };

type ProductHit = { id: string; name: string; variants: Array<{ id: string; articleNumber: string; name?: string | null }> };

export function emptyLine(): Line {
  return { description: "", qty: 1, unit: "NOS" };
}

export function LineEditor({ lines, onChange }: { lines: Line[]; onChange: (lines: Line[]) => void }) {
  const update = (index: number, patch: Partial<Line>) => onChange(lines.map((line, at) => (at === index ? { ...line, ...patch } : line)));
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-[1fr_80px_72px_32px] gap-2 text-2xs font-medium uppercase tracking-wide text-muted">
        <span>Item</span>
        <span>Qty</span>
        <span>Unit</span>
        <span />
      </div>
      {lines.map((line, index) => (
        <div key={index} className="grid grid-cols-[1fr_80px_72px_32px] items-start gap-2">
          <VariantPicker line={line} onPick={(patch) => update(index, patch)} />
          <TextInput type="number" min={0.001} step="any" value={line.qty} onChange={(event) => update(index, { qty: Number(event.target.value) })} />
          <TextInput value={line.unit} onChange={(event) => update(index, { unit: event.target.value })} />
          <Button type="button" variant="ghost" size="icon-sm" aria-label="Remove line" disabled={lines.length === 1} onClick={() => onChange(lines.filter((_, at) => at !== index))}>
            <Trash2 />
          </Button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyLine()])}>
        <Plus /> Add line
      </Button>
    </div>
  );
}

function VariantPicker({ line, onPick }: { line: Line; onPick: (patch: Partial<Line>) => void }) {
  const [open, setOpen] = useState(false);
  const term = line.description.trim();
  const { data } = useApi<Paged<ProductHit>>(open && term.length >= 2 ? `/products?pageSize=8&q=${encodeURIComponent(term)}` : null, { keepPrevious: true });
  const hits = (data?.items || []).flatMap((product) => product.variants.map((variant) => ({ product, variant })));
  return (
    <div className="relative">
      <TextInput
        icon={<Search />}
        placeholder="Search product or type a description"
        value={line.description}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(event) => onPick({ description: event.target.value, variantId: undefined })}
      />
      {line.variantId ? <span className="absolute right-2 top-2 rounded bg-success-soft px-1.5 text-2xs font-medium text-success">Catalogue</span> : null}
      {open && hits.length ? (
        <div className="absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-md border border-line bg-surface py-1 shadow-pop scrollbar-thin">
          {hits.map(({ product, variant }) => (
            <button
              key={variant.id}
              type="button"
              className={cn("flex w-full flex-col px-3 py-1.5 text-left hover:bg-canvas")}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                onPick({ variantId: variant.id, description: `${product.name}${variant.name ? ` - ${variant.name}` : ""}` });
                setOpen(false);
              }}
            >
              <span className="text-sm font-medium">{product.name}{variant.name ? ` - ${variant.name}` : ""}</span>
              <span className="font-mono text-2xs text-muted">{variant.articleNumber}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
