"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIcon,
  ArrowRightIcon,
  CheckCircle2Icon,
  Clock3Icon,
  QrCodeIcon,
  TruckIcon,
} from "lucide-react";
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
  const heroOrders = [
    {
      id: "ORD-3246",
      client: "SIA Norddeck",
      progress: 82,
      status: copy.statuses[0],
      tone: "bg-blue-600",
      eta: "Šodien 16:30",
    },
    {
      id: "ORD-3241",
      client: "Baltic Facades",
      progress: 54,
      status: copy.statuses[1],
      tone: "bg-amber-500",
      eta: "Rīt 09:00",
    },
    {
      id: "ORD-3216",
      client: "Modulor",
      progress: 91,
      status: copy.statuses[2],
      tone: "bg-emerald-500",
      eta: "Nokrāsots",
    },
  ];
  const heroStats = [
    { label: "Aktīvie pasūtījumi", value: "24", icon: ActivityIcon },
    { label: "QR skenējumi šodien", value: "186", icon: QrCodeIcon },
    { label: "Izsūtīšanai gatavs", value: "7", icon: TruckIcon },
  ];

  return (
    <main className="overflow-x-clip">
      <section className="relative border-b border-slate-200 bg-gradient-to-b from-blue-50 via-white to-white">
        <div className="pointer-events-none absolute -left-12 top-20 h-60 w-60 rounded-full bg-blue-200/40 blur-3xl" />
        <div className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-sky-200/30 blur-3xl" />
        <div className="mx-auto grid max-w-6xl gap-10 px-6 pb-16 pt-8 md:grid-cols-[1.02fr_1.08fr] md:px-10 md:pt-16">
          <Reveal>
            <div className="pt-2 md:pt-8">
              <p className="mb-4 inline-flex rounded-full border border-blue-200 bg-white/90 px-3 py-1 text-xs font-medium text-blue-700 shadow-sm">
                {copy.badge}
              </p>
              <h1 className="max-w-2xl text-4xl font-semibold leading-tight text-slate-900 md:text-6xl">{copy.title}</h1>
              <p className="mt-5 max-w-xl text-base leading-8 text-slate-600 md:text-lg">{copy.subtitle}</p>
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
              <div className="mt-8 grid gap-3 sm:grid-cols-3">
                {heroStats.map(({ label, value, icon: Icon }) => (
                  <div key={label} className="rounded-2xl border border-slate-200/80 bg-white/85 p-4 shadow-sm backdrop-blur-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">{label}</span>
                      <Icon className="h-4 w-4 text-blue-600" />
                    </div>
                    <p className="mt-3 text-2xl font-semibold text-slate-900">{value}</p>
                  </div>
                ))}
              </div>
            </div>
          </Reveal>

          <Reveal delay={120}>
            <div className="relative rounded-[2rem] border border-slate-200/90 bg-white/95 p-4 shadow-[0_24px_70px_-28px_rgba(37,99,235,0.35)] backdrop-blur md:p-5">
              <div className="mb-4 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
              </div>
              <div className="grid gap-4 lg:grid-cols-[1.3fr_0.9fr]">
                <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-semibold text-slate-900">{copy.boardTitle}</p>
                      <p className="mt-1 text-xs text-slate-500">{copy.updated}</p>
                    </div>
                    <div className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
                      3 līnijas aktīvas
                    </div>
                  </div>
                  <div className="space-y-3">
                    {heroOrders.map((order) => (
                      <article key={order.id} className="rounded-2xl border border-white bg-white p-4 shadow-sm">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-semibold text-slate-900">{order.id}</p>
                            <p className="mt-1 text-xs text-slate-500">{order.client}</p>
                          </div>
                          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                            {order.status}
                          </span>
                        </div>
                        <div className="mt-4 flex items-center justify-between text-xs text-slate-500">
                          <span>Izpilde {order.progress}%</span>
                          <span>{order.eta}</span>
                        </div>
                        <div className="mt-2 h-2 rounded-full bg-slate-200">
                          <div className={`h-full rounded-full ${order.tone}`} style={{ width: `${order.progress}%` }} />
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4">
                  <div className="rounded-[1.5rem] border border-slate-200 bg-slate-950 p-4 text-white shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold">Operatora skats</p>
                        <p className="mt-1 text-xs text-slate-400">Darba centrs: Metināšana</p>
                      </div>
                      <QrCodeIcon className="h-5 w-5 text-cyan-300" />
                    </div>
                    <div className="mt-4 rounded-2xl bg-white/8 p-3">
                      <div className="flex items-center justify-between text-sm">
                        <span>Batch B-210</span>
                        <span className="text-emerald-300">Scan active</span>
                      </div>
                      <div className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                        <Clock3Icon className="h-4 w-4" />
                        <span>Nākamais checkpoints pēc 12 min</span>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-[1.5rem] border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">Plūsma no order līdz piegādei</p>
                      <ArrowRightIcon className="h-4 w-4 text-slate-400" />
                    </div>
                    <div className="mt-4 space-y-3">
                      {[
                        "Order importēts no Excel",
                        "Partijas sadalītas pa darba centriem",
                        "QR atjaunina statusus reāllaikā",
                      ].map((item) => (
                        <div key={item} className="flex items-center gap-3 rounded-2xl bg-slate-50 px-3 py-3 text-sm text-slate-700">
                          <CheckCircle2Icon className="h-4 w-4 text-emerald-600" />
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
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
