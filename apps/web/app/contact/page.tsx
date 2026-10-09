import type { Metadata } from "next";
import { EnquiryForm } from "../../components/enquiry-form";
import { Icon } from "../../components/icons";
import { Social } from "../../components/shell";
import { PageHero } from "../../components/ui";
import { FALLBACK_CONTACT, loadSite } from "../../lib/content";

export const metadata: Metadata = { title: "Contact", description: "Contact Fixotec Pipe Supports Pvt. Ltd., Coral Plaza, Wagle Industrial Estate, Thane. Phone +91 8692004400, info@in.fixotec.global." };

export default async function ContactPage({ searchParams }: { searchParams: Promise<{ topic?: string }> }) {
  const { topic } = await searchParams;
  const site = await loadSite();
  const contact = { ...FALLBACK_CONTACT, ...(site?.contact || {}) };
  const mapUrl = site?.contact?.mapUrl || `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(contact.address)}`;
  const embed = `https://www.google.com/maps?q=${encodeURIComponent(contact.address)}&output=embed`;

  return (
    <main>
      <PageHero kicker="Contact" title="Talk to our engineers" lead="Questions about a product, a project or a technical submittal? Reach the Fixotec team directly." crumbs={[{ label: "Contact" }]} />
      <section className="wrap grid gap-10 py-16 lg:grid-cols-[1fr_1.4fr]">
        <div className="space-y-6">
          <div className="border border-steel bg-mist p-6">
            <p className="kicker">Head office</p>
            <h2 className="mt-2 font-display text-2xl font-semibold uppercase text-graphite">{contact.company}</h2>
            <p className="mt-3 flex gap-3 leading-relaxed text-slate"><Icon name="pin" className="mt-1 h-5 w-5 shrink-0 text-accent" />{contact.address}</p>
            <a href={mapUrl} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-graphite hover:text-accent">Open in Google Maps <Icon name="arrow" className="h-4 w-4" /></a>
          </div>
          <div className="grid gap-px border border-steel bg-steel sm:grid-cols-2 lg:grid-cols-1">
            {contact.phones.map((phone) => (
              <a key={phone} href={`tel:${phone.replace(/\s/g, "")}`} className="flex items-center gap-4 bg-white p-5 hover:bg-mist">
                <span className="flex h-10 w-10 items-center justify-center bg-accent-soft text-accent"><Icon name="phone" className="h-5 w-5" /></span>
                <span><span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-slate">Phone</span><span className="font-semibold text-graphite">{phone}</span></span>
              </a>
            ))}
            <a href={`mailto:${contact.email}`} className="flex items-center gap-4 bg-white p-5 hover:bg-mist">
              <span className="flex h-10 w-10 items-center justify-center bg-accent-soft text-accent"><Icon name="mail" className="h-5 w-5" /></span>
              <span><span className="block font-mono text-[10px] uppercase tracking-[0.16em] text-slate">Email</span><span className="font-semibold text-graphite">{contact.email}</span></span>
            </a>
          </div>
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-graphite">Follow us</span>
            <Social site={site} className="text-slate [&_a:hover]:text-accent" />
          </div>
        </div>
        <EnquiryForm mode="contact" topic={topic} />
      </section>
      <section className="border-t border-steel">
        <iframe title="Fixotec office location" src={embed} className="h-[380px] w-full grayscale" loading="lazy" referrerPolicy="no-referrer-when-downgrade" />
      </section>
    </main>
  );
}
