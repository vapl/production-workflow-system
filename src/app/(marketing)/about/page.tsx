import { getMarketingLocale, type MarketingLocale } from "@/components/marketing/content";

const copy: Record<MarketingLocale, { title: string; subtitle: string; section: string }> = {
  lv: { title: "Par mums", subtitle: "Veidojam digitālu operāciju sistēmu praktiskām ražošanas komandām.", section: "Strādā ar jūsu esošo sistēmu" },
  en: { title: "About", subtitle: "We build an operations platform for practical manufacturing teams.", section: "Works with your existing setup" },
  ru: { title: "О нас", subtitle: "Мы создаем операционную платформу для производственных команд.", section: "Работает с вашей текущей инфраструктурой" },
};

const milestones = [["2019", "Started as an internal manufacturing tool"], ["2022", "Added multi-tenant architecture"], ["2024", "Expanded into full workflow platform"]];

export default async function MarketingAboutPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  const t = copy[locale];

  return (
    <main className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-16">
      <h1 className="text-4xl font-semibold text-slate-900 md:text-5xl">{t.title}</h1>
      <p className="mt-4 max-w-3xl text-slate-600">{t.subtitle}</p>
      <section className="mt-10 rounded-2xl border border-slate-200 bg-white p-7">
        <h2 className="text-2xl font-semibold text-slate-900">{t.section}</h2>
        <p className="mt-3 max-w-3xl text-slate-600">ERP, Excel un noliktavas plūsmas var pieslēgt pakāpeniski bez dārga “big-bang” ieviešanas modeļa.</p>
      </section>
      <section className="mt-8 grid gap-4 md:grid-cols-3">
        {milestones.map(([year, description]) => (
          <article key={year} className="rounded-xl border border-slate-200 bg-white p-5">
            <p className="text-2xl font-semibold text-blue-700">{year}</p>
            <p className="mt-2 text-sm text-slate-600">{description}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
