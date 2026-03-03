"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { getMarketingLocale, marketingCopy } from "@/components/marketing/content";

function withLang(path: string, lang: string) {
  return `${path}?lang=${lang}`;
}

export function MarketingFooter() {
  const searchParams = useSearchParams();
  const lang = getMarketingLocale(searchParams.get("lang") ?? undefined);
  const copy = marketingCopy[lang];

  return (
    <footer className="border-t border-slate-200 bg-white px-6 py-8 md:px-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 text-sm text-slate-500 md:flex-row md:items-center md:justify-between">
        <p>© {new Date().getFullYear()} Production Workflow System</p>
        <div className="flex flex-wrap gap-2">
          {[
            ["/features", copy.nav.features],
            ["/pricing", copy.nav.pricing],
            ["/about", copy.nav.about],
            ["/contact", copy.nav.contact],
          ].map(([href, label]) => (
            <Link key={href} href={withLang(href, lang)} className="rounded-full px-3 py-1.5 transition hover:bg-slate-100 hover:text-slate-900">
              {label}
            </Link>
          ))}
        </div>
      </div>
    </footer>
  );
}
