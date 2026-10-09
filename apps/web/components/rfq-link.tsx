"use client";

import Link from "next/link";
import { useRfq } from "../lib/rfq";
import { Icon } from "./icons";

export function RfqLink() {
  const count = useRfq().length;
  return (
    <Link href="/request-quote" aria-label={`RFQ basket, ${count} items`} className="relative hidden h-10 w-10 items-center justify-center text-white/80 transition-colors hover:text-cyan md:flex">
      <Icon name="cart" className="h-5 w-5" />
      {count ? <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-accent px-1 font-mono text-[10px] text-white">{count}</span> : null}
    </Link>
  );
}
