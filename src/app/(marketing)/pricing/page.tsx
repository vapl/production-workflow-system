import Link from "next/link";
import { getMarketingLocale, type MarketingLocale } from "@/components/marketing/content";

const copy: Record<MarketingLocale, { title: string; subtitle: string; cta: string }> = {
  lv: { title: "Vienkāršas cenas", subtitle: "Caurspīdīgas cenas bez slēptām izmaksām.", cta: "Pieprasīt piedāvājumu" },
  en: { title: "Simple pricing", subtitle: "Transparent pricing with no hidden fees.", cta: "Request quote" },
  ru: { title: "Простые цены", subtitle: "Прозрачные тарифы без скрытых платежей.", cta: "Запросить предложение" },
};

const plans = [
  { name: "Starter", price: "€299", features: ["10 users", "Order + Batch", "Basic reports"] },
  { name: "Growth", price: "€799", features: ["50 users", "QR + bottleneck", "ERP API"], highlight: true },
  { name: "Enterprise", price: "Custom", features: ["Unlimited users", "SSO", "Dedicated onboarding"] },
];

export default async function MarketingPricingPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  const t = copy[locale];

  return (
    <main className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-16">
      <h1 className="text-4xl font-semibold text-slate-900 md:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-3xl text-slate-600">{t.subtitle}</p>
      <section className="mt-10 grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.name} className={`rounded-2xl border p-6 ${plan.highlight ? "border-blue-300 bg-blue-50" : "border-slate-200 bg-white"}`}>
            <h2 className="text-2xl font-semibold text-slate-900">{plan.name}</h2>
            <p className="mt-2 text-3xl font-bold text-blue-700">{plan.price}</p>
            <ul className="mt-6 space-y-2 text-sm text-slate-700">{plan.features.map((feature) => <li key={feature}>• {feature}</li>)}</ul>
          </article>
        ))}
      </section>
      <Link href={`/contact?lang=${locale}`} className="mt-8 inline-flex rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white">{t.cta}</Link>
    </main>
  );
}
