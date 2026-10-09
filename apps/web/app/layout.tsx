import type { Metadata } from "next";
import { Barlow_Condensed, IBM_Plex_Mono, Source_Sans_3 } from "next/font/google";
import "./globals.css";
import { Shell } from "../components/shell";
import { loadSite, mediaUrl } from "../lib/content";
import { DEMO_MODE } from "../lib/demo";

const sans = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans" });
const display = Barlow_Condensed({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-display" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-mono" });

export async function generateMetadata(): Promise<Metadata> {
  const site = await loadSite();
  const favicon = mediaUrl(site?.brand?.faviconKey);
  const logo = mediaUrl(site?.brand?.logoKey);
  return {
    metadataBase: new URL(process.env.WEB_ORIGIN || "http://localhost:3010"),
    title: { default: "Fixotec | German-Engineered Installation & Support Systems", template: "%s | Fixotec" },
    description: "German-engineered modular MEP support systems, pipe clamps, mounting rails, channels and fixings by Fixotec Pipe Supports Pvt. Ltd., Thane.",
    icons: favicon ? { icon: favicon, apple: favicon } : undefined,
    openGraph: { siteName: "Fixotec", type: "website", images: logo ? [logo] : undefined },
    ...(DEMO_MODE ? { robots: { index: false, follow: false } } : {}),
  };
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${sans.variable} ${display.variable} ${mono.variable} font-sans`}>
        <Shell>{children}</Shell>
      </body>
    </html>
  );
}
