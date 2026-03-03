"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { marketingCopy, type MarketingLocale } from "@/components/marketing/content";

function withLang(path: string, lang: string) {
  return `${path}?lang=${lang}`;
}

function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out ${
        visible ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      }`}
    >
      {children}
    </div>
  );
}

export function LandingPage({ locale }: { locale: MarketingLocale }) {
  const copy = marketingCopy[locale].home;

  return (
    <main className="overflow-x-clip">
      <section className="relative border-b border-slate-200 bg-gradient-to-b from-blue-50 via-white to-white">
        <div className="pointer-events-none absolute -left-12 top-20 h-60 w-60 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-14 md:grid-cols-[1.08fr_1fr] md:px-10 md:pt-20">
          <Reveal>
            <div>
              <p className="mb-4 inline-flex rounded-full border border-blue-200 bg-white px-3 py-1 text-xs font-medium text-blue-700">
                {copy.badge}
              </p>
              <h1 className="text-4xl font-semibold leading-tight text-slate-900 md:text-6xl">{copy.title}</h1>
              <p className="mt-5 max-w-xl text-base text-slate-600 md:text-lg">{copy.subtitle}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  href={withLang("/contact", locale)}
                  className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-500"
                >
                  {copy.ctaPrimary}
                </Link>
                <Link
                  href={withLang("/features", locale)}
                  className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm text-slate-700 transition hover:border-slate-400"
                >
                  {copy.ctaSecondary}
                </Link>
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
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
                      <div
                        className={`h-full rounded-full ${
                          index === 0 ? "w-3/4 bg-blue-500" : index === 1 ? "w-1/2 bg-amber-500" : "w-5/6 bg-emerald-500"
                        }`}
                      />
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <Reveal>
          <h2 className="text-center text-3xl font-semibold text-slate-900">Production Teams Need More Than Spreadsheets</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-4">
          {["Planning", "Execution", "Visibility", "Decision"].map((item, i) => (
            <Reveal key={item} delay={i * 80}>
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-blue-700">0{i + 1}</p>
                <h3 className="mt-2 text-lg font-medium text-slate-900">{item}</h3>
                <p className="mt-2 text-sm text-slate-600">One connected flow from order intake to delivery with full accountability.</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold text-slate-900">{copy.visibilityTitle}</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-2">
            {copy.visibilityPoints.map((point, index) => (
              <Reveal key={point} delay={index * 90}>
                <article className="rounded-xl border border-slate-200 bg-slate-50 p-5 text-slate-700">
                  {point}
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 py-16 md:px-10">
        <Reveal>
          <h2 className="text-center text-3xl font-semibold text-slate-900">{copy.workflowTitle}</h2>
        </Reveal>
        <div className="mt-10 grid gap-4 md:grid-cols-3">
          {copy.workflow.map((item, index) => (
            <Reveal key={item.number} delay={index * 100}>
              <article className="rounded-xl border border-slate-200 bg-white p-5">
                <p className="text-2xl font-semibold text-slate-400">{item.number}</p>
                <h3 className="mt-2 text-lg font-medium text-slate-900">{item.title}</h3>
                <p className="mt-3 text-sm text-slate-600">{item.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-slate-50 px-6 py-16 md:px-10">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <h2 className="text-center text-3xl font-semibold text-slate-900">Designed for Real Manufacturing Teams</h2>
          </Reveal>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {[
              "Production managers",
              "Operators and line leaders",
              "Warehouse and partner teams",
            ].map((persona, index) => (
              <Reveal key={persona} delay={index * 100}>
                <article className="rounded-xl border border-slate-200 bg-white p-6">
                  <h3 className="text-lg font-semibold text-slate-900">{persona}</h3>
                  <p className="mt-3 text-sm text-slate-600">
                    Focused workflows, role-based visibility, and fewer handoffs between departments.
                  </p>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 py-16 md:px-10">
        <Reveal>
          <div className="mx-auto max-w-5xl rounded-2xl border border-blue-200 bg-blue-50 p-8 text-center">
            <h2 className="text-3xl font-semibold text-slate-900">{copy.finalTitle}</h2>
            <p className="mx-auto mt-4 max-w-2xl text-slate-600">{copy.finalText}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Link href={withLang("/pricing", locale)} className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white">
                Pricing
              </Link>
              <Link href={withLang("/about", locale)} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm">
                About
              </Link>
              <Link href={withLang("/contact", locale)} className="rounded-full border border-slate-300 bg-white px-5 py-3 text-sm">
                Contact
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  );
}
