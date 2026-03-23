"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";

import { cn } from "@/components/ui/utils";
import { useI18n } from "@/lib/i18n/useI18n";

const LOCALE_MAP = {
  lv: "lv-LV",
  en: "en-US",
  ru: "ru-RU",
} as const;

type AuthShellProps = {
  currentView: "auth" | "operator";
  children: React.ReactNode;
};

export function AuthShell({ currentView, children }: AuthShellProps) {
  const { t, locale } = useI18n();
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => window.clearInterval(timer);
  }, []);

  const localeCode = LOCALE_MAP[locale] ?? "lv-LV";
  const timeLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        hour: "2-digit",
        minute: "2-digit",
      }).format(now),
    [localeCode, now],
  );
  const dateLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(localeCode, {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now),
    [localeCode, now],
  );

  const navItems = [
    { href: "/auth", key: "auth" as const, label: t("authPage.signIn") },
    {
      href: "/operator-login",
      key: "operator" as const,
      label: t("production.main.operators.pinLoginTitle"),
    },
  ];

  const renderNav = ({
    className,
    mobile = false,
  }: {
    className?: string;
    mobile?: boolean;
  }) => (
    <div
      className={cn(
        "inline-flex w-fit rounded-full border border-white/20 bg-white/10 p-1 backdrop-blur-sm",
        className,
      )}
    >
      {navItems.map((item) => {
        const isActive = item.key === currentView;
        return (
          <Link
            key={item.key}
            href={item.href}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-semibold transition",
              isActive
                ? "bg-white text-sky-700 shadow-sm"
                : mobile
                  ? "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                  : "text-white/85 hover:bg-white/10 hover:text-white",
            )}
          >
            {item.label}
          </Link>
        );
      })}
    </div>
  );

  return (
    <main className="h-screen overflow-hidden bg-slate-100 md:grid md:grid-cols-[minmax(320px,1.2fr)_minmax(420px,0.8fr)]">
      <section className="relative hidden overflow-hidden bg-[linear-gradient(160deg,#1767c7_0%,#1f77d5_55%,#1558ae_100%)] px-8 py-10 text-white md:block">
        <div className="relative flex h-full flex-col">
          {renderNav({})}

          <div className="flex flex-1 items-center">
            <div>
              <div className="text-[clamp(5rem,10vw,9rem)] font-semibold leading-none tracking-[-0.07em]">
                {timeLabel}
              </div>
              <div className="mt-3 text-2xl font-semibold uppercase tracking-[0.18em] text-white/95">
                {dateLabel}
              </div>
            </div>
          </div>

          <div className="rounded-2xl bg-white/10 px-4 py-2 text-sm font-medium text-white/90 backdrop-blur-sm">
            {t("header.appName")}
          </div>
        </div>
      </section>

      <section className="h-screen overflow-y-auto bg-slate-50 px-4 py-8 md:px-8 md:py-6">
        <div className="flex min-h-full flex-col items-center justify-center gap-6">
          {renderNav({
            className:
              "w-full max-w-md justify-center border-slate-200 bg-white p-1 shadow-sm backdrop-blur-none md:hidden",
            mobile: true,
          })}
          <div className="flex w-full items-center justify-center">{children}</div>
        </div>
      </section>
    </main>
  );
}
