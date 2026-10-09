import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const sans = Inter({ subsets: ["latin"], variable: "--font-sans" });

export const metadata: Metadata = { title: "Fixotec Portal", description: "Customer, distributor, and consultant access", icons: { icon: "/icon.svg" }, robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} font-sans text-sm antialiased`}>{children}</body>
    </html>
  );
}
