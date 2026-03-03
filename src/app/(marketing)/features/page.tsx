import { getMarketingLocale, type MarketingLocale } from "@/components/marketing/content";

const content: Record<MarketingLocale, { title: string; subtitle: string; groups: { title: string; items: string[] }[] }> = {
  lv: {
    title: "Iespējas",
    subtitle: "Praktiskas funkcijas ikdienas ražošanai un komandas sadarbībai.",
    groups: [
      { title: "Core Capabilities", items: ["Order-to-Batch linking", "Reāllaika statusa izsekošana", "Production timeline", "Bottleneck redzamība", "Lomu piekļuves kontrole", "ERP/noliktavas integrācijas"] },
      { title: "Team Execution", items: ["QR skenēšana", "Operator dashboard", "Brīdinājumi par termiņiem", "Komentāri un uzdevumi", "Mobilā pieeja", "Audit trail"] },
    ],
  },
  en: {
    title: "Features",
    subtitle: "Practical capabilities for daily production and team execution.",
    groups: [
      { title: "Core Capabilities", items: ["Order-to-Batch linking", "Real-time status tracking", "Production timeline", "Bottleneck visibility", "Role-based access", "ERP/warehouse integrations"] },
      { title: "Team Execution", items: ["QR scanning", "Operator dashboard", "Deadline alerts", "Comments and tasks", "Mobile-first usage", "Full audit trail"] },
    ],
  },
  ru: {
    title: "Возможности",
    subtitle: "Практичные функции для ежедневной работы производства.",
    groups: [
      { title: "Core Capabilities", items: ["Связка заказа и партии", "Статус в реальном времени", "Таймлайн производства", "Видимость узких мест", "Ролевой доступ", "Интеграции ERP/склад"] },
      { title: "Team Execution", items: ["QR-сканирование", "Панель оператора", "Оповещения о сроках", "Комментарии и задачи", "Mobile-first", "Полный audit trail"] },
    ],
  },
};

export default async function MarketingFeaturesPage({ searchParams }: { searchParams: Promise<{ lang?: string }> }) {
  const params = await searchParams;
  const locale = getMarketingLocale(params.lang);
  const copy = content[locale];

  return (
    <main className="mx-auto max-w-6xl px-6 py-14 md:px-10 md:py-16">
      <h1 className="text-4xl font-semibold text-slate-900 md:text-5xl">{copy.title}</h1>
      <p className="mt-4 max-w-3xl text-slate-600">{copy.subtitle}</p>
      <section className="mt-10 grid gap-4 md:grid-cols-2">
        {copy.groups.map((group) => (
          <article key={group.title} className="rounded-2xl border border-slate-200 bg-white p-6">
            <h2 className="text-xl font-semibold text-slate-900">{group.title}</h2>
            <ul className="mt-4 space-y-3 text-slate-700">
              {group.items.map((item) => (
                <li key={item} className="rounded-lg bg-slate-50 px-3 py-2">{item}</li>
              ))}
            </ul>
          </article>
        ))}
      </section>
    </main>
  );
}
