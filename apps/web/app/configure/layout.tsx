import type { Metadata } from "next";

export const metadata: Metadata = { title: "System finder", description: "Find a standard Fixotec support assembly for pipes, cable trays, ducts and equipment." };

export default function ConfigureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
