"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getMarketingLocale, marketingCopy, marketingLocales } from "@/components/marketing/content";

function withLang(path: string, lang: string) {
  return `${path}?lang=${lang}`;
}

export function MarketingHeader() {
  const searchParams = useSearchParams();
  const lang = getMarketingLocale(searchParams.get("lang") ?? undefined);
  const copy = marketingCopy[lang];

  return (
    <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4 md:px-10">
        <Link href={withLang("/", lang)} className="text-sm font-bold tracking-[0.22em] text-blue-700">
          PWS
        </Link>
        <nav className="hidden items-center gap-1 md:flex">
          {[
            ["/", copy.nav.home],
            ["/features", copy.nav.features],
            ["/pricing", copy.nav.pricing],
            ["/about", copy.nav.about],
            ["/contact", copy.nav.contact],
          ].map(([href, label]) => (
            <Link key={href} href={withLang(href, lang)} className="rounded-full px-4 py-2 text-sm text-slate-700 transition hover:bg-slate-100">
              {label}
            </Link>
          ))}
        </nav>
        <div className="flex items-center gap-2">
          <div className="hidden items-center rounded-full border border-slate-200 p-1 sm:flex">
            {marketingLocales.map((locale) => (
              <Link
                key={locale}
                href={withLang("/", locale)}
                className={`rounded-full px-2 py-1 text-xs ${lang === locale ? "bg-blue-600 text-white" : "text-slate-600"}`}
              >
                {locale.toUpperCase()}
              </Link>
            ))}
          </div>
          <Link href="/auth" className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-500">
            {copy.nav.login}
          </Link>
        </div>
      </div>
    </header>
  );
}
