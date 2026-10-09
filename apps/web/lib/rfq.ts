"use client";

import { useEffect, useState } from "react";

export type RfqItem = { variantId?: string; articleNumber: string; name: string; productSlug: string; qty: number };

const KEY = "fixotec.rfq";
const EVENT = "fixotec-rfq";

export function readRfq(): RfqItem[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeRfq(items: RfqItem[]) {
  window.localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function addToRfq(item: RfqItem) {
  const items = readRfq();
  const existing = items.find((row) => row.articleNumber === item.articleNumber);
  if (existing) existing.qty += item.qty;
  else items.push(item);
  writeRfq(items);
}

export function useRfq() {
  const [items, setItems] = useState<RfqItem[]>([]);
  useEffect(() => {
    const sync = () => setItems(readRfq());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
}
