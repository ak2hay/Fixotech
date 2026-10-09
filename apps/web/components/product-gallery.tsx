"use client";

import Image from "next/image";
import { useState } from "react";

export function ProductGallery({ images, name }: { images: string[]; name: string }) {
  const [active, setActive] = useState(0);
  if (!images.length) return <div className="blueprint aspect-square border border-steel" />;
  return (
    <div>
      <div className="relative aspect-square overflow-hidden border border-steel bg-white">
        <Image src={images[active]} alt={name} fill priority sizes="(min-width: 1024px) 45vw, 100vw" className="object-contain p-8" />
      </div>
      {images.length > 1 ? (
        <div className="mt-3 grid grid-cols-5 gap-3">
          {images.map((src, i) => (
            <button key={src} type="button" onClick={() => setActive(i)} aria-label={`Show image ${i + 1}`} className={`relative aspect-square border bg-white transition-colors ${i === active ? "border-accent" : "border-steel hover:border-slate"}`}>
              <Image src={src} alt="" fill sizes="96px" className="object-contain p-2" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
