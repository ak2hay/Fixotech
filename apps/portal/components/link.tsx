"use client";

import NextLink from "next/link";

export function Link({ href, className, children, title, onClick }: { href: string; className?: string; children?: React.ReactNode; title?: string; onClick?: () => void }) {
  return (
    <NextLink href={href} className={className} title={title} onClick={onClick}>
      {children}
    </NextLink>
  );
}
