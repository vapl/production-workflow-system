import Link from "next/link";
import { marketingCopy, type MarketingLocale } from "@/components/marketing/content";

function withLang(path: string, lang: string) {
  return `${path}?lang=${lang}`;
}

export function LandingPage({ locale }: { locale: MarketingLocale }) {
  const copy = marketingCopy[locale].home;

  return (
    <main>
      <section className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-14 md:grid-cols-[1.08fr_1fr] md:px-10 md:pt-20">
        <div>
          <p className="mb-4 inline-flex rounded-full border border-slate-300 bg-white px-3 py-1 text-xs text-slate-600">
            {copy.badge}
          </p>
          <h1 className="text-4xl font-semibold leading-tight text-slate-900 md:text-6xl">{copy.title}</h1>
          <p className="mt-5 max-w-xl text-base text-slate-600 md:text-lg">{copy.subtitle}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={withLang("/contact", locale)} className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500">
              {copy.ctaPrimary}
            </Link>
            <Link href={withLang("/features", locale)} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm text-slate-700 transition hover:border-slate-400">
              {copy.ctaSecondary}
            </Link>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/70">
          <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-3">
            <p className="text-sm font-medium text-slate-800">{copy.boardTitle}</p>
            <span className="text-xs text-emerald-600">{copy.updated}</span>
          </div>
          <div className="space-y-4">
            {["Order #3246", "Order #3241", "Order #3216"].map((label, index) => (
              <article key={label} className="rounded-xl bg-slate-50 p-4">
                <div className="flex items-center justify-between text-sm text-slate-700">
                  <p>{label}</p>
                  <span>{copy.statuses[index]}</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-slate-200">
                  <div className={`h-full rounded-full ${index === 0 ? "w-3/4 bg-blue-500" : index === 1 ? "w-1/2 bg-amber-500" : "w-5/6 bg-emerald-500"}`} />
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-semibold text-slate-900">{copy.visibilityTitle}</h2>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {copy.visibilityPoints.map((point) => (
              <article key={point} className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-700">
                {point}
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <h2 className="text-center text-3xl font-semibold text-slate-900">{copy.workflowTitle}</h2>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {copy.workflow.map((item) => (
            <article key={item.number} className="rounded-xl border border-slate-200 bg-white p-5">
              <p className="text-2xl font-semibold text-slate-400">{item.number}</p>
              <h3 className="mt-2 text-lg font-medium text-slate-900">{item.title}</h3>
              <p className="mt-3 text-sm text-slate-600">{item.text}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="px-6 pb-16 md:px-10">
        <div className="mx-auto max-w-5xl rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center">
          <h2 className="text-3xl font-semibold text-slate-900">{copy.finalTitle}</h2>
          <p className="mx-auto mt-4 max-w-2xl text-slate-600">{copy.finalText}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link href={withLang("/pricing", locale)} className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white">Pricing</Link>
            <Link href={withLang("/about", locale)} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm">About</Link>
            <Link href={withLang("/contact", locale)} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm">Contact</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
