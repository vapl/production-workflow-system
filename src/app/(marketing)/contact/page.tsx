import Link from "next/link";
import { getMarketingLocale, type MarketingLocale } from "@/components/marketing/content";

const copy: Record<MarketingLocale, { title: string; subtitle: string; email: string; faq: string }> = {
  lv: { title: "Kontakti un FAQ", subtitle: "Sazinies ar mums demo vai piedāvājuma saņemšanai.", email: "Rakstīt e-pastu", faq: "Biežāk uzdotie jautājumi" },
  en: { title: "Contact and FAQ", subtitle: "Reach out for a demo or detailed proposal.", email: "Send email", faq: "Frequently Asked Questions" },
  ru: { title: "Контакты и FAQ", subtitle: "Свяжитесь с нами для демо и коммерческого предложения.", email: "Написать email", faq: "Часто задаваемые вопросы" },
};

const faqs = [
  "Can PWS be implemented without replacing ERP?",
  "How long does onboarding take?",
  "Do you provide operator training?",
];

export default async function MarketingContactPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  const t = copy[locale];

  return (
    <main className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-16">
      <h1 className="text-4xl font-semibold text-slate-900 md:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-3xl text-slate-600">{t.subtitle}</p>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-7">
        <p className="text-slate-700">E-pasts: hello@domain.eu</p>
        <p className="mt-2 text-slate-700">Tālrunis: +371 20 000 000</p>
        <Link href="mailto:hello@domain.eu" className="mt-5 inline-flex rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white">{t.email}</Link>
      </section>
      <section className="mt-10">
        <h2 className="text-2xl font-semibold text-slate-900">{t.faq}</h2>
        <div className="mt-5 space-y-3">
          {faqs.map((item) => (
            <article key={item} className="rounded-xl border border-slate-200 bg-white p-5">
              <h3 className="font-medium text-slate-900">{item}</h3>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
