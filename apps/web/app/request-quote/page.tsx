import type { Metadata } from "next";
import { EnquiryForm } from "../../components/enquiry-form";
import { Icon } from "../../components/icons";
import { PageHero } from "../../components/ui";

export const metadata: Metadata = { title: "Request a quote", description: "Send your RFQ for Fixotec modular support systems, pipe clamps, channels and fixings." };

const STEPS = [
  ["Add articles", "Pick sizes from any product page or describe your requirement."],
  ["Send your RFQ", "Include project, drawings or BOQ reference so we can check the system."],
  ["Get a quotation", "Our sales engineers respond with pricing, lead time and technical notes."],
];

export default function QuotePage() {
  return (
    <main>
      <PageHero kicker="Request a quote" title="Tell us what you're building" lead="We'll recommend the right support system and send a project quotation." crumbs={[{ label: "Request a quote" }]} />
      <section className="wrap grid gap-10 py-16 lg:grid-cols-[1.5fr_1fr]">
        <EnquiryForm mode="rfq" />
        <aside className="space-y-4 lg:sticky lg:top-28 lg:self-start">
          {STEPS.map(([title, text], i) => (
            <div key={title} className="flex gap-4 border border-steel bg-mist p-5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center bg-graphite font-mono text-sm text-white">{i + 1}</span>
              <div><h2 className="font-display text-lg font-semibold uppercase text-graphite">{title}</h2><p className="mt-1 text-sm text-slate">{text}</p></div>
            </div>
          ))}
          <a href="tel:+918692004400" className="flex items-center gap-3 bg-accent p-5 text-white hover:bg-accent-dark">
            <Icon name="phone" className="h-5 w-5" /><span><span className="block text-xs text-white/75">Prefer to talk?</span><span className="font-semibold">+91 8692004400</span></span>
          </a>
        </aside>
      </section>
    </main>
  );
}
